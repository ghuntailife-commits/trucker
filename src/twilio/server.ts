// Server only: reading Twilio's webhooks and finding who a call belongs to (George, 2026-11-27).
import type { SupabaseClient } from '@supabase/supabase-js';
import { validTwilio, twilioEnv } from './twilio';
import type { TeamSettings } from '../team/agents';
import { quoNumbers } from '../team/agents';

/** The public address Twilio used to reach us (what it signed). */
export function publicUrl(req: Request): { base: string; full: string } {
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  const base = `https://${host}`;
  return { base, full: `${base}${u.pathname}${u.search}` };
}

/** Twilio's form fields, or null when the request isn't really from Twilio. */
export async function readTwilio(req: Request): Promise<{ p: Record<string, string>; base: string; q: URLSearchParams } | null> {
  const env = twilioEnv(); if (!env) return null;
  const { base, full } = publicUrl(req);
  const form = new URLSearchParams(await req.text());
  const p: Record<string, string> = {}; for (const [k, v] of form) p[k] = v;
  // Twilio signs the exact URL it was given; behind Vercel the host can differ (www, the vercel.app name), so try each
  const u = new URL(req.url); const path = `${u.pathname}${u.search}`;
  const hosts = [...new Set([new URL(full).host, req.headers.get('host') ?? '', u.host, 'dispatchdialer.com', 'www.dispatchdialer.com'].filter(Boolean))];
  const sig = req.headers.get('x-twilio-signature');
  if (!hosts.some(h => validTwilio(env.authToken, `https://${h}${path}`, p, sig))) { console.error('twilio: bad signature for', full, 'tried', hosts.join(', ')); return null; }
  return { p, base, q: new URL(req.url).searchParams };
}

/** The team's Twilio numbers (Settings > Team: shared caller IDs). */
export const teamTwilioNumbers = (t: TeamSettings | null): string[] => quoNumbers(t?.twilioNumbers ?? '');

/** Who an incoming call should ring: the Dispatch agent who last called or texted this number, if they use Twilio. */
export async function lastAgentFor(db: SupabaseClient, t: TeamSettings | null, phone: string): Promise<string | null> {
  const d = phone.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return null;
  const { data } = await db.from('quo_events').select('agent_id,phone').like('phone', `%${d}`).not('agent_id', 'is', null).order('at', { ascending: false }).limit(5);
  const on = new Set((t?.agents ?? []).filter(a => a.twilio).map(a => a.id));
  const last = ((data ?? []) as { agent_id: string }[]).map(r => r.agent_id).find(a => on.has(a));
  if (last) return last;
  // never reached through Dispatch (called from Quo or a cell): ring the agent whose contact list has them (George, 2026-11-28)
  for (const a of on) if (await contactName(db, a, phone).catch(() => '')) return a;
  return null;
}

export const xml = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/xml' } });

/** Default calls per number per day before it rests (spam watch, George 2026-11-27). */
export const DAILY_CAP = 100;

/** Midnight Eastern today, as an ISO time (the team's day). */
export function etDayStart(now = Date.now()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  for (const off of ['-05:00', '-04:00']) { const t = Date.parse(`${day}T00:00:00${off}`);
    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(t) === '00') return new Date(t).toISOString(); }
  return new Date(Date.parse(`${day}T05:00:00Z`)).toISOString();
}

/** Calls each team number has placed today, by its 10 digits. */
export async function dialsToday(db: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await db.from('quo_events').select('payload').eq('type', 'call.dialed').gte('at', etDayStart()).range(0, 9999);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { payload: { from?: string } }[]) { const d = String(r.payload?.from ?? '').replace(/\D/g, '').slice(-10); if (d) out[d] = (out[d] ?? 0) + 1; }
  return out;
}

/** Twilio REST with the team's API key. */
export async function twilioApi<T = Record<string, unknown>>(url: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const env = twilioEnv(); if (!env) throw new Error('Twilio is not set up on Vercel yet.');
  const full = url.startsWith('http') ? url : `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}${url}`;
  const r = await fetch(full, { method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers: { Authorization: `Basic ${Buffer.from(`${env.apiKey}:${env.apiSecret}`).toString('base64')}`, ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined });
  const j = await r.json().catch(() => ({})) as T & { message?: string };
  if (!r.ok) throw new Error(j.message ?? `Twilio said ${r.status}`);
  return j;
}

/** The agent's "ring my cell" choice (kv dispatch-cell-<agent>, saved from their profile menu). */
export async function readCell(db: SupabaseClient, agent: string): Promise<import('./cell').CellPref | null> {
  const { data } = await db.from('kv').select('value').eq('key', `dispatch-cell-${agent}`).eq('part', 'all').maybeSingle();
  return (data?.value as import('./cell').CellPref | undefined) ?? null;
}

/** A contact's name from the agent's saved list, for what the cell hears. Empty when not found. */
export async function contactName(db: SupabaseClient, agent: string, phone: string): Promise<string> {
  const { nameFor } = await import('./cell');
  const { data } = await db.from('kv').select('value').eq('key', `dispatch-agent-${agent}`).like('part', 'c:%').range(0, 199);
  return nameFor(((data ?? []) as { value: unknown }[]).map(r => r.value), phone);
}

/** The number this contact already knows us by (a past Dispatch call or text). */
export async function lastFromFor(db: SupabaseClient, phone: string): Promise<string | null> {
  const d = phone.replace(/\D/g, '').slice(-10); if (d.length !== 10) return null;
  const { data } = await db.from('quo_events').select('payload').in('type', ['call.dialed', 'message.sent']).like('phone', `%${d}`).order('at', { ascending: false }).limit(1);
  return (data?.[0] as { payload?: { from?: string } } | undefined)?.payload?.from ?? null;
}

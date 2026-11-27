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
  if (!validTwilio(env.authToken, full, p, req.headers.get('x-twilio-signature'))) { console.error('twilio: bad signature for', full); return null; }
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
  return ((data ?? []) as { agent_id: string }[]).map(r => r.agent_id).find(a => on.has(a)) ?? null;
}

export const xml = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/xml' } });

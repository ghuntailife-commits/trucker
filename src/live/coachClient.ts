// The Coaching tab's side of the database, live only. The database itself limits an agent to their own calls (admin: all).
import { db } from './supabase';
import type { CallTags, CoachCall } from '../quo/coach';
import type { Playbook } from '../quo/playbook';
import { saveState } from '../app-store/store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Transcribed calls since a time, for one agent or (admin) everyone, with each call's recording link when there is one. */
export async function loadCoachCalls(agent: string | null, since: number): Promise<CoachCall[]> {
  let q = db().from('quo_events').select('id,agent_id,call_id,at,phone,ai_note,ai_tags').eq('type', 'call.transcript.completed')
    .gte('at', new Date(since).toISOString()).order('at', { ascending: false }).limit(1000);
  if (agent) q = q.eq('agent_id', agent);
  let { data, error } = await q;
  if (error && /ai_tags/.test(error.message)) {     // the coaching column isn't added yet: show the calls without tags
    let q2 = db().from('quo_events').select('id,agent_id,call_id,at,phone,ai_note').eq('type', 'call.transcript.completed').gte('at', new Date(since).toISOString()).order('at', { ascending: false }).limit(1000);
    if (agent) q2 = q2.eq('agent_id', agent);
    ({ data, error } = await q2 as Any);
  }
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Any[];
  const ids = rows.map(r => r.call_id).filter(Boolean);
  const rec = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: rs } = await db().from('quo_events').select('call_id,payload').eq('type', 'call.recording.completed').in('call_id', ids.slice(i, i + 100));
    for (const r of (rs ?? []) as Any[]) {
      const o = r.payload?.data?.resource ?? r.payload?.data?.object ?? {};
      const url = [...(o.recordings ?? []), ...(o.media ?? [])].map((m: Any) => m?.url).find(Boolean) ?? o.recordingUrl;
      if (url) rec.set(r.call_id, url);
    }
  }
  return rows.map(r => ({ id: r.id, agentId: r.agent_id ?? '', callId: r.call_id, at: Date.parse(r.at), phone: r.phone ?? '', note: r.ai_note ?? '',
    tags: (r.ai_tags as CallTags | null) ?? null, recording: r.call_id ? rec.get(r.call_id) : undefined }));
}

export interface WeeklyNote { at: number; text: string; calls: number }

export async function loadWeekly(agent: string): Promise<WeeklyNote | null> {
  const { data } = await db().from('kv').select('value').eq('key', `dispatch-coach-${agent}`).eq('part', 'all').maybeSingle();
  return (data?.value as WeeklyNote) ?? null;
}

/** Asks the server to write this week's note ("week") or tag older calls ("tag"). Returns an error message, or the result. */
export async function askCoach(agent: string, action: 'week' | 'tag'): Promise<{ error?: string; text?: string; at?: number; calls?: number; tagged?: number }> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Your sign-in ran out. Sign out and back in, then try again.' };
  try {
    const r = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent, action }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error ?? `Could not reach coaching (${r.status})` };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Re-reads older calls for "What we know" in the call brief, a few at a time. */
export async function profileBackfill(agent: string): Promise<{ error?: string; found?: { phone: string; at: number; facts: unknown; note?: string }[]; more?: boolean }> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'signed out' };
  try {
    const r = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ agent, action: 'profile' }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error ?? `status ${r.status}` };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- team Playbook (everyone reads; George teaches and can run the learning by hand) ----------
export interface TeachItem { id: string; title: string; text: string; at: number }

export async function loadPlaybook(): Promise<Playbook | null> {
  const { data } = await db().from('kv').select('value').eq('key', 'dispatch-team-playbook').eq('part', 'all').maybeSingle();
  return (data?.value as Playbook) ?? null;
}
export async function loadTeach(): Promise<TeachItem[]> {
  const { data } = await db().from('kv').select('value').eq('key', 'dispatch-team-teach').eq('part', 'all').maybeSingle();
  return ((data?.value as { items?: TeachItem[] } | null)?.items) ?? [];
}
export const saveTeach = (items: TeachItem[]) => saveState('dispatch-team-teach', { items });

async function post(path: string, body: unknown): Promise<Record<string, unknown> & { error?: string }> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Your sign-in ran out. Sign out and back in, then try again.' };
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error ?? `Could not reach the coach (${r.status})` };
  } catch (e) { return { error: (e as Error).message }; }
}
export const learnNow = () => post('/api/coach/learn', {}) as Promise<{ error?: string; studied?: number; retagged?: number; more?: boolean; message?: string }>;
export const askTheCoach = (agent: string, question: string, history: { q: string; a: string }[]) =>
  post('/api/coach', { agent, action: 'ask', question, history }) as Promise<{ error?: string; text?: string }>;

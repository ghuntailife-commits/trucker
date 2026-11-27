// The screen's side of Quo, live only: send a text through the website's server, and pick up Quo events
// (calls, texts, recordings, AI call notes) to put on the contacts' notes.
import { db } from './supabase';
import { quoNote } from '../quo/events';
import { readFacts, type Topic } from '../brief/profile';

export async function sendQuoText(to: string, content: string): Promise<string | null> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'Your sign-in ran out. Sign out and back in, then try again.';
  try {
    const r = await fetch('/api/quo/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, content }) });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error ?? `Could not send (${r.status})`;
  } catch (e) { return (e as Error).message; }
}

export interface QuoNew { id: string; phone: string; note: string; at: number; facts: { topic: Topic; fact: string }[] }

/** Events for this agent not yet put on a contact. Waits for a call's AI notes a little before giving up on them. */
export async function newQuoEvents(agent: string): Promise<QuoNew[]> {
  const q = (cols: string) => db().from('quo_events').select(cols).eq('agent_id', agent).eq('applied', false).order('at', { ascending: true }).limit(100);
  let { data, error } = await q('id,type,phone,at,payload,ai_note,ai_tags');
  if (error && /ai_tags/.test(error.message)) ({ data, error } = await q('id,type,phone,at,payload,ai_note'));   // before the coaching column exists
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(e => ({ id: e.id as string, phone: (e.phone as string) ?? '', at: Date.parse(e.at as string),
    note: quoNote(e as Parameters<typeof quoNote>[0]), facts: readFacts((e.ai_tags as { facts?: unknown } | null)?.facts) }));
}

export async function markQuoApplied(ids: string[]) {
  if (ids.length) await db().from('quo_events').update({ applied: true }).in('id', ids);
}

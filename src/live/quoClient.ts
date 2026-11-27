// The screen's side of Quo, live only: send a text through the website's server, and pick up Quo events
// (calls, texts, recordings, AI call notes) to put on the contacts' notes.
import { db } from './supabase';
import { quoNote } from '../quo/events';

export async function sendQuoText(to: string, content: string): Promise<string | null> {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return 'Please sign in again.';
  try {
    const r = await fetch('/api/quo/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, content }) });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error ?? `Could not send (${r.status})`;
  } catch (e) { return (e as Error).message; }
}

export interface QuoNew { id: string; phone: string; note: string; at: number }

/** Events for this agent not yet put on a contact. Waits for a call's AI notes a little before giving up on them. */
export async function newQuoEvents(agent: string): Promise<QuoNew[]> {
  const { data, error } = await db().from('quo_events').select('id,type,phone,at,payload,ai_note').eq('agent_id', agent).eq('applied', false)
    .order('at', { ascending: true }).limit(100);
  if (error || !data) return [];
  return data.map(e => ({ id: e.id as string, phone: (e.phone as string) ?? '', at: Date.parse(e.at as string), note: quoNote(e) }));
}

export async function markQuoApplied(ids: string[]) {
  if (ids.length) await db().from('quo_events').update({ applied: true }).in('id', ids);
}

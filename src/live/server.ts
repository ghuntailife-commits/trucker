// Server-only helpers for the website's API routes (Quo). Never imported by the screens.
// SUPABASE_SECRET_KEY lets the server add Quo events, which nobody signed in can do.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { digits10 } from '../contacts/phones';
import { quoNumbers, type TeamSettings, type AgentSetting } from '../team/agents';

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/(rest\/v1\/?)?$/, '').replace(/\/+$/, '');

export function adminDb(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!URL || !key) throw new Error('SUPABASE_SECRET_KEY is not set on Vercel');
  return createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The team settings George saves (goals, Quo on/off, Quo numbers). */
export async function teamSettings(db: SupabaseClient): Promise<TeamSettings | null> {
  const { data } = await db.from('kv').select('value').eq('key', 'trucker-team-v1').eq('part', 'all').maybeSingle();
  return (data?.value as TeamSettings | undefined) ?? null;
}

/** Which agent owns a Quo number. */
export function agentByNumber(t: TeamSettings | null, phone: string): AgentSetting | undefined {
  const d = digits10(phone);
  return d.length === 10 ? t?.agents.find(a => a.quo && quoNumbers(a.quoNumber).some(n => digits10(n) === d)) : undefined;
}

/** The signed-in person behind a request (from the Supabase access token the screen sends). Says why when it can't tell. */
export async function whoIsCalling(db: SupabaseClient, auth: string | null): Promise<{ agentId: string; role: string } | { error: string }> {
  const token = auth?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'No sign-in was sent with the request.' };
  const { data, error } = await db.auth.getUser(token);
  if (error) return { error: `Sign-in check failed: ${error.message}` };
  const email = data.user?.email?.toLowerCase();
  if (!email) return { error: 'Your sign-in has no email.' };
  const { data: rows, error: e2 } = await db.from('people').select('agent_id,role,email');
  if (e2) return { error: `Could not read the team list: ${e2.message}` };
  const p = (rows ?? []).find((r: { email: string | null }) => r.email?.toLowerCase() === email);
  return p ? { agentId: p.agent_id, role: p.role } : { error: `${email} is not on the team list.` };
}

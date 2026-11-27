// Server-only helpers for the website's API routes (Quo). Never imported by the screens.
// SUPABASE_SECRET_KEY lets the server add Quo events, which nobody signed in can do.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { digits10 } from '../contacts/phones';
import type { TeamSettings, AgentSetting } from '../team/agents';

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
  return d.length === 10 ? t?.agents.find(a => a.quo && digits10(a.quoNumber ?? '') === d) : undefined;
}

/** The signed-in person behind a request (from the Supabase access token the screen sends). */
export async function whoIsCalling(db: SupabaseClient, auth: string | null): Promise<{ agentId: string; role: string } | null> {
  const token = auth?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: p } = await db.from('people').select('agent_id,role').ilike('email', email).maybeSingle();
  return p ? { agentId: p.agent_id, role: p.role } : null;
}

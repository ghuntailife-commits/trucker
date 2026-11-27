// The live database connection. In the demo build these settings are empty, so LIVE is false and nothing here runs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// tolerate a pasted address with a path or trailing slash (e.g. .../rest/v1/)
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/(rest\/v1\/?)?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const LIVE = !!(URL && ANON);

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!LIVE) throw new Error('Dispatch is not connected to a database');
  if (!client) client = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export interface Person { agent_id: string; name: string; email: string | null; role: 'admin' | 'lead' | 'agent' | 'boss'; lead_id: string | null }

/** Google sign-in. `sheets` also asks to read Google Sheets (read only), for the switch-over. */
export async function signInGoogle(sheets = false) {
  return db().auth.signInWithOAuth({ provider: 'google', options: {
    redirectTo: location.origin + location.pathname,
    scopes: sheets ? 'https://www.googleapis.com/auth/spreadsheets.readonly' : undefined,
    queryParams: sheets ? { prompt: 'consent' } : undefined,
  } });
}

/** A sign-in link by email (works with any email: Gmail, iCloud, Outlook...). */
export async function signInEmail(email: string) {
  return db().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
}

export async function signOut() { await db().auth.signOut(); }

/** The signed-in person, or null when signed in with an email that is not on the team. */
export async function whoAmI(): Promise<Person | null> {
  const { data } = await db().auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: rows } = await db().from('people').select('agent_id,name,email,role,lead_id');
  return (rows as Person[] | null)?.find(p => p.email?.toLowerCase() === email) ?? null;
}

export async function people(): Promise<Person[]> {
  const { data } = await db().from('people').select('agent_id,name,email,role,lead_id');
  return (data as Person[] | null) ?? [];
}

// Loads every agent's contacts for the admin search: live from the server (admin only), demo from this browser.
import { db } from './supabase';
import { LIVE } from './supabase';
import { loadState } from '../app-store/store';
import { storageKey } from '../app-store/agentSeeds';
import { toSlim, type SlimContact } from '../admin/allSearch';
import type { Contact } from '../rules/types';

let cache: { at: number; rows: SlimContact[] } | null = null;

export async function loadAllContacts(agents: string[], fresh = false): Promise<SlimContact[]> {
  if (cache && !fresh && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  let rows: SlimContact[] = [];
  if (LIVE) {
    const { data } = await db().auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch('/api/admin/contacts', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const j = await r.json() as { contacts?: SlimContact[]; error?: string };
    if (!r.ok || !j.contacts) throw new Error(j.error ?? `Search failed (${r.status})`);
    rows = j.contacts;
  } else {
    for (const a of agents) {
      const s = await loadState<{ contacts?: Contact[] }>(storageKey(a as never)).catch(() => null);
      for (const c of s?.contacts ?? []) rows.push(toSlim(c, a));
    }
  }
  cache = { at: Date.now(), rows };
  return rows;
}

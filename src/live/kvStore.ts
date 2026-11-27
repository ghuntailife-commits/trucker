// Live storage: the same load/save calls the demo uses, but kept in the database, in parts (see parts.ts).
// Saves wait a moment so a burst of clicks becomes one save, and only parts that changed are sent.
import { db } from './supabase';
import { split, join, ownerOf } from './parts';

const lastSaved = new Map<string, Map<string, string>>();   // key → part → JSON as last saved or loaded
const pending = new Map<string, unknown>(), timers = new Map<string, ReturnType<typeof setTimeout>>();

export type SaveStatus = { state: 'saved' | 'saving' | 'failed'; at: number; error?: string };
let status: SaveStatus = { state: 'saved', at: Date.now() };
const listeners = new Set<(s: SaveStatus) => void>();
export function onSaveStatus(f: (s: SaveStatus) => void) { listeners.add(f); f(status); return () => { listeners.delete(f); }; }
function setStatus(s: SaveStatus) { status = s; listeners.forEach(f => f(s)); }

export async function liveLoad<T>(key: string): Promise<T | null> {
  const rows: { part: string; value: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('kv').select('part,value').eq('key', key).range(from, from + 999);
    if (error) throw new Error(`Could not load ${key}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (!rows.length) { lastSaved.set(key, new Map()); return null; }
  const parts = Object.fromEntries(rows.map(r => [r.part, r.value]));
  lastSaved.set(key, new Map(rows.map(r => [r.part, JSON.stringify(r.value)])));
  return join(parts) as T;
}

/** Writes now and reports how it went. `owner` defaults to the person the key belongs to. */
export async function writeNow(key: string, value: unknown, owner = ownerOf(key)): Promise<{ sent: number; removed: number }> {
  const parts = split(value);
  const before = lastSaved.get(key) ?? new Map<string, string>();
  const now = new Map(Object.entries(parts).map(([p, v]) => [p, JSON.stringify(v)]));
  const changed = [...now].filter(([p, j]) => before.get(p) !== j);
  const gone = [...before.keys()].filter(p => !now.has(p));
  const stamp = new Date().toISOString();
  // send in batches so no single request is too big
  let batch: { key: string; part: string; owner: string; value: unknown; updated_at: string }[] = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await db().from('kv').upsert(batch, { onConflict: 'key,part' });
    if (error) throw new Error(error.message);
    batch = []; size = 0;
  };
  for (const [p, j] of changed) {
    batch.push({ key, part: p, owner, value: parts[p], updated_at: stamp }); size += j.length;
    if (size > 2_000_000) await flush();
  }
  await flush();
  if (gone.length) {
    const { error } = await db().from('kv').delete().eq('key', key).in('part', gone);
    if (error) throw new Error(error.message);
  }
  lastSaved.set(key, now);
  return { sent: changed.length, removed: gone.length };
}

let me: { id: string; admin: boolean } | null = null;
/** Who is signed in: saves to someone else's data are skipped unless the admin is signed in. */
export function setMe(id: string, admin: boolean) { me = { id, admin }; }
/** The signed-in person's agent id (live), or null in the demo. */
export const signedInAs = () => me?.id ?? null;

export function liveSave(key: string, value: unknown) {
  if (!me || (!me.admin && ownerOf(key) !== me.id)) return;
  pending.set(key, value);
  if (timers.has(key)) return;
  setStatus({ state: 'saving', at: Date.now() });
  timers.set(key, setTimeout(async function run() {
    timers.delete(key);
    const v = pending.get(key);
    pending.delete(key);
    try {
      await writeNow(key, v);
      if (!timers.size) setStatus({ state: 'saved', at: Date.now() });
    } catch (e) {
      // keep the latest copy and try again shortly
      if (!pending.has(key)) pending.set(key, v);
      setStatus({ state: 'failed', at: Date.now(), error: (e as Error).message });
      if (!timers.has(key)) timers.set(key, setTimeout(run, 5000));
    }
  }, 1200));
}

/** True while something is still waiting to be saved (the page warns before closing). */
export const unsaved = () => timers.size > 0 || pending.size > 0;
if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => { if (unsaved()) e.preventDefault(); });

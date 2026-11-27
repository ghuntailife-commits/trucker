// Where the demo keeps its data in this browser. A real sheet's worth of contacts is too big for localStorage
// (about 5 MB), so it goes in IndexedDB, with localStorage as the fallback. Every call fails quietly: a private
// window or blocked storage just means the demo starts fresh next time.
import { LIVE } from '../live/supabase';
import { liveLoad, liveSave } from '../live/kvStore';

const DB = 'trucker-demo', STORE = 'state';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadState<T>(key: string): Promise<T | null> {
  if (LIVE) return liveLoad<T>(key);
  try {
    const db = await open();
    const v = await new Promise<T | undefined>((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result as T | undefined); q.onerror = () => rej(q.error);
    });
    if (v != null) return v;
  } catch { /* fall through */ }
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}

const pending = new Map<string, unknown>(), timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Saves each key at most twice a second; the latest state wins. */
export function saveState(key: string, value: unknown) {
  if (LIVE) return liveSave(key, value);
  pending.set(key, value);
  if (timers.has(key)) return;
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    const v = pending.get(key);
    pending.delete(key);
    try {
      const db = await open();
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, key);
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
      return;
    } catch { /* fall back */ }
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* full or blocked */ }
  }, 500));
}

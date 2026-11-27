'use client';
// Asks the server for Claude's call brief and keeps it until the contact changes (George, 2026-11-27).
// Remembered per computer so the same brief isn't written twice; the rules draft shows meanwhile.
import { useEffect, useState } from 'react';
import { db, LIVE } from './supabase';
import type { Contact } from '../rules/types';
import type { Brief } from '../brief/brief';
import { briefKey, contactForClaude } from '../brief/text';

export type AiBrief = Omit<Brief, 'kind'>;
type Kind = 'callback' | 'followUp' | 'noshow' | 'appt' | 'retry';
const mem = new Map<string, AiBrief>();
const inflight = new Map<string, Promise<AiBrief | null>>();
const LS = 'dispatch-ai-briefs';
const read = (): Record<string, AiBrief> => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } };
const keep = (k: string, b: AiBrief) => {
  mem.set(k, b);
  try { const all = read(); all[k] = b; const keys = Object.keys(all); for (const x of keys.slice(0, Math.max(0, keys.length - 300))) delete all[x]; localStorage.setItem(LS, JSON.stringify(all)); } catch { /* */ }
};

export function fetchAiBrief(c: Contact, kind: Kind, agent: string, now: number, tz: string, draft?: Brief | null): Promise<AiBrief | null> {
  const k = briefKey(c, kind);
  const have = mem.get(k) ?? read()[k];
  if (have) { mem.set(k, have); return Promise.resolve(have); }
  if (inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    const { data } = await db().auth.getSession();
    const token = data.session?.access_token; if (!token) return null;
    try {
      const r = await fetch('/api/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, agent, contactText: contactForClaude(c, now, tz), draft }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.brief) { keep(k, j.brief); return j.brief as AiBrief; }
      return null;
    } catch { return null; } finally { inflight.delete(k); }
  })();
  inflight.set(k, p);
  return p;
}

/** Claude's brief for this contact, or null while it is being written (or when the AI is off). */
export function useAiBrief(c: Contact | undefined, kind: Kind | null, agent: string, now: number, tz: string, draft?: Brief | null, next?: { c: Contact; kind: Kind } | null) {
  const k = c && kind ? briefKey(c, kind) : '';
  const [got, setGot] = useState<{ k: string; b: AiBrief | null; busy: boolean }>({ k: '', b: null, busy: false });
  useEffect(() => {
    if (!LIVE || !c || !kind) return;
    let live = true;
    const cached = mem.get(k);
    setGot({ k, b: cached ?? null, busy: !cached });
    fetchAiBrief(c, kind, agent, now, tz, draft).then(b => { if (live) setGot({ k, b, busy: false }); });
    if (next) void fetchAiBrief(next.c, next.kind, agent, now, tz);   // get the next one ready
    return () => { live = false; };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return got.k === k ? got : { k, b: null, busy: !!k && LIVE };
}

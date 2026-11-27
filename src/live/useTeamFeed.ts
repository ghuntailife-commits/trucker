'use client';
// The team feed on screen (George, 2026-11-27). Posts this agent's new results (see src/team/feed.ts) and reads
// everyone's news every 45 seconds. New items become sage-green notes in the bottom left.
// Posting happens on the agent's own screen, and on the admin's screen while they view that agent (both post the
// same ids, so nothing is doubled). The demo keeps the feed in this browser only.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LIVE, db } from './supabase';
import { signedInAs } from './kvStore';
import { newItems, seenOf, type FeedItem, type Seen, type Snap } from '../team/feed';

const KEY = 'dispatch-team-feed';
const LS_SEEN = 'dispatch-feed-seen';
const local: FeedItem[] = [];          // the demo's feed
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } };

async function post(items: FeedItem[], agent: string) {
  if (!LIVE) { local.unshift(...items); return; }
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch('/api/feed', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ items, agent }) }).catch(() => null);
}

export function useTeamFeed(agent: { id: string; name: string }, snap: Snap, ready: boolean, admin: boolean) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [toasts, setToasts] = useState<FeedItem[]>([]);
  const seen = useRef<Seen | null>(null);
  const seenFor = useRef('');

  // notice this agent's new results
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    if (!seen.current || seenFor.current !== agent.id) {
      // contacts that arrived since this screen last looked still count as new, so a delivery made while it was closed is announced
      const mark = Number(get(`dispatch-feed-added-${agent.id}`)) || now;
      const s = seenOf(snap);
      for (const c of snap.contacts) if (c.addedAt && c.addedAt > mark) s.contacts.delete(c.id);
      seen.current = s; seenFor.current = agent.id;
    }
    const mine = signedInAs() === agent.id || admin || !LIVE;
    const fresh = newItems(seen.current, snap, agent, now);
    seen.current = seenOf(snap);
    put(`dispatch-feed-added-${agent.id}`, String(now));
    if (fresh.length && mine) { void post(fresh, agent.id).then(() => { void pull(); }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.contacts, snap.log, snap.sales, snap.noSales, ready, agent.id]);

  // read everyone's news; new ones since this browser last looked become notes
  const pull = useCallback(async () => {
    let all: FeedItem[];
    if (LIVE) {
      const { data } = await db().from('kv').select('value').eq('key', KEY);
      all = ((data ?? []) as { value: FeedItem[] }[]).flatMap(r => r.value ?? []);
    } else all = [...local];
    all.sort((a, b) => b.at - a.at);
    setItems(all);
    const last = Number(get(LS_SEEN)) || 0;
    const now = Date.now();
    if (!last) { put(LS_SEEN, String(now)); return; }          // first visit: no backlog of notes
    const fresh = all.filter(f => f.at > last).slice(0, 4);
    if (fresh.length) { put(LS_SEEN, String(Math.max(...fresh.map(f => f.at)))); setToasts(t => [...fresh.filter(f => !t.some(x => x.id === f.id)), ...t].slice(0, 4)); }
  }, []);
  useEffect(() => {
    void pull();
    const t = setInterval(() => void pull(), 45_000);
    return () => clearInterval(t);
  }, [pull]);

  const dismiss = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);
  return { items, toasts, dismiss };
}

'use client';
// Top dialers today on Home (George, 2026-11-28). This screen posts its agent's numbers when they change (at most
// every 20 seconds) and reads the whole team's every 30 seconds. The demo shows made-up teammates.
import { useEffect, useRef, useState } from 'react';
import { LIVE, db } from './supabase';
import { signedInAs } from './kvStore';
import type { BoardRow } from '../team/board';

const DEMO = [['Avery Calloway', 61, 9, 2], ['Jordan Pike', 48, 7, 1], ['Riley Banks', 37, 4, 1], ['Casey Monroe', 22, 3, 0]] as const;

export function useDialBoard(me: { id: string; name: string }, mine: { dials: number; connects: number; booked: number; last: number | null }, day: number, ready: boolean) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const sent = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // post my numbers (only from my own screen, not the admin's "View as")
  useEffect(() => {
    if (!ready || !LIVE || signedInAs() !== me.id) return;
    const k = `${day}|${mine.dials}|${mine.connects}|${mine.booked}`;
    if (k === sent.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      sent.current = k;
      const { data } = await db().auth.getSession();
      const token = data.session?.access_token; if (!token) return;
      await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ day, dials: mine.dials, connects: mine.connects, booked: mine.booked, last: mine.last ?? Date.now() }) }).catch(() => { sent.current = ''; });
      void pull();
    }, sent.current ? 20_000 : 1_500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me.id, day, mine.dials, mine.connects, mine.booked]);

  const pull = async () => {
    if (!LIVE) {
      const now = Date.now();
      setRows([...DEMO.map(([name, dials, connects, booked], i) => ({ agent: `demo${i}`, name, day, dials, connects, booked, at: now - i * 9 * 60_000 })),
        { agent: me.id, name: me.name, day, dials: mine.dials, connects: mine.connects, booked: mine.booked, at: mine.last ?? 0 }]);
      return;
    }
    const { data } = await db().from('kv').select('value').eq('key', 'dispatch-team-board');
    setRows(((data ?? []) as { value: BoardRow }[]).map(r => r.value).filter(Boolean));
  };
  useEffect(() => {
    void pull();
    const t = setInterval(() => void pull(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, me.id, LIVE ? 0 : mine.dials]);
  return rows;
}

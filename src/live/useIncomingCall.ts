'use client';
// Incoming calls on screen (George, 2026-11-27): when someone calls the agent's Quo number, Quo sends "call.ringing"
// to the webhook and Dispatch shows who it is. Checks every 4 seconds; the note goes away when the call ends,
// after a minute, or when the agent closes it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LIVE, db } from './supabase';

export interface Ringing { id: string; callId: string; phone: string; at: number }

export function useIncomingCall(agent: string, on: boolean) {
  const [ring, setRing] = useState<Ringing | null>(null);
  const closed = useRef(new Set<string>());
  useEffect(() => {
    if (!LIVE || !on) return;
    let stop = false;
    const check = async () => {
      if (document.hidden && !ring) { /* still check: the agent may be in another tab */ }
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data } = await db().from('quo_events').select('id,call_id,phone,at,payload').eq('agent_id', agent).eq('type', 'call.ringing').gte('at', since).order('at', { ascending: false }).limit(3);
      if (stop) return;
      const rows = ((data ?? []) as { id: string; call_id: string | null; phone: string; at: string; payload: { data?: { object?: { direction?: string }; resource?: { direction?: string } } } }[])
        .filter(r => !/^out/i.test(String(r.payload?.data?.resource?.direction ?? r.payload?.data?.object?.direction ?? '')) && !closed.current.has(r.id));
      const top = rows[0];
      if (!top) { setRing(null); return; }
      if (top.call_id) {   // the call already ended (answered or not): nothing to show
        const { data: done } = await db().from('quo_events').select('id').eq('call_id', top.call_id).eq('type', 'call.completed').limit(1);
        if (stop) return;
        if (done?.length) { closed.current.add(top.id); setRing(null); return; }
      }
      setRing(r => (r?.id === top.id ? r : { id: top.id, callId: top.call_id ?? '', phone: top.phone, at: Date.parse(top.at) }));
    };
    void check();
    const t = setInterval(() => void check(), 4000);
    return () => { stop = true; clearInterval(t); };
  }, [agent, on]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => { setRing(r => { if (r) closed.current.add(r.id); return null; }); }, []);
  return { ring, close };
}

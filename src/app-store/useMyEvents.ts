'use client';
// Loads and saves the agent's own calendar events (src/calendar/myEvents.ts).
import { useCallback, useEffect, useState } from 'react';
import { loadState, saveState } from './store';
import { addEvent, moveEvent, removeEvent, updateEvent, type MyEvent } from '../calendar/myEvents';

export function useMyEvents(agent: string) {
  const key = `dispatch-events-${agent}`;
  const [list, setList] = useState<MyEvent[] | null>(null);
  useEffect(() => {
    let live = true; setList(null);
    loadState<{ events: MyEvent[] }>(key).then(v => { if (live) setList(v?.events ?? []); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [key]);
  const change = useCallback((f: (l: MyEvent[]) => MyEvent[]) => setList(l => {
    const next = f(l ?? []); saveState(key, { events: next }); return next;
  }, ), [key]);
  return {
    events: list ?? [], ready: list != null,
    add: (e: Omit<MyEvent, 'id'>) => change(l => addEvent(l, e, `e-${Date.now().toString(36)}`)),
    move: (id: string, start: number) => change(l => moveEvent(l, id, start)),
    update: (id: string, c: Partial<Omit<MyEvent, 'id'>>) => change(l => updateEvent(l, id, c)),
    remove: (id: string) => change(l => removeEvent(l, id)),
  };
}

'use client';
// Loads and saves the agent's own calendar events and working hours (src/calendar/myEvents.ts, grid.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadState, saveState } from './store';
import { addEvent, moveEvent, removeEvent, updateEvent, skipOne, type MyEvent, type Occurrence } from '../calendar/myEvents';
import { DEFAULT_HOURS, type WorkHours } from '../calendar/grid';

type Box = { events: MyEvent[]; hours?: WorkHours };

export function useMyEvents(agent: string) {
  const key = `dispatch-events-${agent}`;
  const [box, setBox] = useState<Box | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    let live = true; setBox(null);
    loadState<Box>(key).then(v => { if (live) setBox({ events: v?.events ?? [], hours: v?.hours }); }).catch(() => { if (live) setBox({ events: [] }); });
    return () => { live = false; };
  }, [key]);
  const change = useCallback((f: (b: Box) => Box) => setBox(b => {
    const next = f(b ?? { events: [] }); saveState(key, next); return next;
  }), [key]);
  const ev = (f: (l: MyEvent[]) => MyEvent[]) => change(b => ({ ...b, events: f(b.events) }));
  const newId = () => `e-${Date.now().toString(36)}${(seq.current++).toString(36)}`;
  /** A change to one showing of a repeating event: that showing comes out of the series and becomes its own event. */
  const detach = (o: Occurrence, c: Partial<MyEvent>) => ev(l => {
    const s = l.find(e => e.id === o.seriesId);
    if (!s?.repeat) return updateEvent(l, o.seriesId, c);
    const { repeat: _r, skip: _s, ...one } = s;
    return addEvent(skipOne(l, s.id, o.start), { ...one, start: o.start, ...c }, newId());
  });
  return {
    events: box?.events ?? [], hours: box?.hours ?? DEFAULT_HOURS, hoursSet: !!box?.hours, ready: box != null,
    add: (e: Omit<MyEvent, 'id'>) => ev(l => addEvent(l, e, newId())),
    move: (id: string, start: number) => ev(l => moveEvent(l, id, start)),
    update: (id: string, c: Partial<Omit<MyEvent, 'id'>>) => ev(l => updateEvent(l, id, c)),
    remove: (id: string) => ev(l => removeEvent(l, id)),
    moveOne: (o: Occurrence, start: number) => detach(o, { start }),
    resizeOne: (o: Occurrence, mins: number) => detach(o, { mins }),
    skipOne: (o: Occurrence) => ev(l => skipOne(l, o.seriesId, o.start)),
    unskip: (o: Occurrence) => ev(l => l.map(e => e.id === o.seriesId ? { ...e, skip: (e.skip ?? []).filter(t => t !== o.start) } : e)),
    setHours: (h: WorkHours) => change(b => ({ ...b, hours: h })),
  };
}

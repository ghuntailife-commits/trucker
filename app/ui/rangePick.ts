'use client';
import { useEffect, useRef } from 'react';
import { rangePick } from '../../src/contacts/rangePick';

// Was Shift held on the click that is ticking a box? A checkbox's change event does not say, so the click is watched first.
let shiftOnClick = false;
let watchers = 0;
const watch = (e: MouseEvent) => { shiftOnClick = e.shiftKey; };

/** Tick handler with shift-click ranges. `order` is the rows as shown on screen. */
export function useRangePick(setPicked: (f: (p: Set<string>) => Set<string>) => void, order: readonly string[], canPick?: (id: string) => boolean) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (watchers++ === 0) window.addEventListener('click', watch, true);
    return () => { if (--watchers === 0) window.removeEventListener('click', watch, true); };
  }, []);
  return (id: string, on: boolean, _e?: unknown) => {
    const shift = shiftOnClick, from = last.current; shiftOnClick = false;
    setPicked(p => rangePick(p, order, from, id, on, shift, canPick));
    last.current = id;
  };
}

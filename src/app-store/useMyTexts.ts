'use client';
// The agent's own text templates (George, 2026-11-27), saved per agent under dispatch-texts-<agent>.
import { useCallback, useEffect, useState } from 'react';
import { loadState, saveState } from './store';
import type { MyTexts } from '../quo/quo';

const cache = new Map<string, MyTexts>();
const subs = new Map<string, Set<(t: MyTexts) => void>>();

export function useMyTexts(agent: string) {
  const key = `dispatch-texts-${agent}`;
  const [texts, setTexts] = useState<MyTexts>(() => cache.get(key) ?? {});
  useEffect(() => {
    let live = true;
    const set = subs.get(key) ?? new Set(); subs.set(key, set);
    const on = (t: MyTexts) => { if (live) setTexts(t); }; set.add(on);
    if (cache.has(key)) setTexts(cache.get(key)!);
    else loadState<MyTexts>(key).then(v => { const t = v ?? {}; cache.set(key, t); if (live) setTexts(t); }).catch(() => { /* defaults */ });
    return () => { live = false; set.delete(on); };
  }, [key]);
  const save = useCallback((t: MyTexts) => {
    cache.set(key, t); saveState(key, t);
    for (const s of subs.get(key) ?? []) s(t);
  }, [key]);
  return { texts, save };
}

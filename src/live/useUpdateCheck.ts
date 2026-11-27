// An open Dispatch screen left running an old build can save over newer data. Check every 2 minutes; when a new
// build is live, reload as soon as nothing is waiting to save and the agent isn't mid-click (idle 20 s or tab hidden).
import { useEffect, useState } from 'react';
import { LIVE } from './supabase';
import { unsaved } from './kvStore';

export function useUpdateCheck(busy: () => boolean): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!LIVE) return;
    let first: string | null = null, idleAt = Date.now(), dead = false;
    const touch = () => { idleAt = Date.now(); };
    ['keydown', 'pointerdown'].forEach(e => window.addEventListener(e, touch, true));
    const tick = async () => {
      try {
        const j = await (await fetch('/api/version', { cache: 'no-store' })).json() as { build?: string };
        if (!j.build || j.build === 'dev') return;
        if (first == null) { first = j.build; return; }
        if (j.build !== first) setStale(true);
      } catch { /* offline: try later */ }
    };
    const reloadIfQuiet = () => {
      if (dead || !first) return;
      if (!document.body.dataset.stale) return;
      if (unsaved() || busy()) return;
      if (document.visibilityState === 'hidden' || Date.now() - idleAt > 20_000) window.location.reload();
    };
    void tick();
    const a = setInterval(() => void tick(), 120_000), b = setInterval(reloadIfQuiet, 5_000);
    return () => { dead = true; clearInterval(a); clearInterval(b); ['keydown', 'pointerdown'].forEach(e => window.removeEventListener(e, touch, true)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stale) document.body.dataset.stale = '1'; }, [stale]);
  return stale;
}

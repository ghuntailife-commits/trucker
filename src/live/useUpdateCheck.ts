// An open Dispatch screen left running an old build can save over newer data. Check every 2 minutes; when a new
// build is live, show a banner. Reload by itself only when it can't get in the way (George, 2026-11-27: screens were
// reloading too often): the build has been out 3 minutes (several quick updates = one reload), nothing is waiting to
// save, no call is on, and the tab has been in the background a minute or nobody has touched it for 10 minutes.
import { useEffect, useState } from 'react';
import { LIVE } from './supabase';
import { unsaved, onSaveStatus, type SaveStatus } from './kvStore';
import { db } from './supabase';

const SCREEN = Math.random().toString(36).slice(2, 10);   // this tab, for System status
let BOOT: string | null = null;                             // the build this tab loaded (kept when the screen remounts)

export function useUpdateCheck(busy: () => boolean, info: () => { viewing: string; page: string }): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!LIVE) return;
    let idleAt = Date.now(), hiddenAt = 0, staleAt = 0, dead = false, save: SaveStatus | null = null;
    const off = onSaveStatus(x => { save = x; });
    // check in for the admin's System status page
    const ping = async (build: string) => {
      try {
        const { data } = await db().auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const i = info();
        await fetch('/api/status/ping', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ screen: SCREEN, build, viewing: i.viewing, page: i.page, save: save?.state ?? '', saveError: save?.state === 'failed' ? save.error : undefined }) });
      } catch { /* status only */ }
    };
    const touch = () => { idleAt = Date.now(); };
    const vis = () => { hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0; };
    document.addEventListener('visibilitychange', vis);
    ['keydown', 'pointerdown', 'wheel', 'input'].forEach(e => window.addEventListener(e, touch, true));
    const tick = async () => {
      try {
        const j = await (await fetch('/api/version', { cache: 'no-store' })).json() as { build?: string };
        if (!j.build || j.build === 'dev') return;
        if (BOOT == null) BOOT = j.build;
        void ping(BOOT);
        if (j.build !== BOOT) { if (!staleAt) staleAt = Date.now(); setStale(true); }
      } catch { /* offline: try later */ }
    };
    const reloadIfQuiet = () => {
      if (dead || !BOOT) return;
      if (!document.body.dataset.stale) return;
      if (unsaved() || busy()) return;
      const now = Date.now();
      if (!staleAt || now - staleAt < 3 * 60_000) return;
      const hiddenLong = document.visibilityState === 'hidden' && hiddenAt && now - hiddenAt > 60_000;
      if (hiddenLong || now - idleAt > 10 * 60_000) window.location.reload();
    };
    void tick();
    const a = setInterval(() => void tick(), 120_000), b = setInterval(reloadIfQuiet, 5_000);
    return () => { dead = true; off(); document.removeEventListener('visibilitychange', vis); clearInterval(a); clearInterval(b); ['keydown', 'pointerdown', 'wheel', 'input'].forEach(e => window.removeEventListener(e, touch, true)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stale) document.body.dataset.stale = '1'; }, [stale]);
  return stale;
}

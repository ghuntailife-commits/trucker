// An open Dispatch screen left running an old build can save over newer data. Check every 2 minutes; when a new
// build is live, reload as soon as nothing is waiting to save and the agent isn't mid-click (idle 20 s or tab hidden).
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
    let idleAt = Date.now(), dead = false, save: SaveStatus | null = null;
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
    ['keydown', 'pointerdown'].forEach(e => window.addEventListener(e, touch, true));
    const tick = async () => {
      try {
        const j = await (await fetch('/api/version', { cache: 'no-store' })).json() as { build?: string };
        if (!j.build || j.build === 'dev') return;
        if (BOOT == null) BOOT = j.build;
        void ping(BOOT);
        if (j.build !== BOOT) setStale(true);
      } catch { /* offline: try later */ }
    };
    const reloadIfQuiet = () => {
      if (dead || !BOOT) return;
      if (!document.body.dataset.stale) return;
      if (unsaved() || busy()) return;
      if (document.visibilityState === 'hidden' || Date.now() - idleAt > 20_000) window.location.reload();
    };
    void tick();
    const a = setInterval(() => void tick(), 120_000), b = setInterval(reloadIfQuiet, 5_000);
    return () => { dead = true; off(); clearInterval(a); clearInterval(b); ['keydown', 'pointerdown'].forEach(e => window.removeEventListener(e, touch, true)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stale) document.body.dataset.stale = '1'; }, [stale]);
  return stale;
}

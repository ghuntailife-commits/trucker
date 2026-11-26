'use client';
// The demo's stand-in for each agent's Google number sheet. The rows live in this browser; at go-live the same
// rules (src/numbers/sheet.ts) read and write the real Google Sheet every few minutes (src/numbers/google.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contact } from '../rules/types';
import { loadState, saveState } from './store';
import { isOpen, newlyBad, planSend, readSheet, undoUpload, withStatus, type SheetRow, type Upload } from '../numbers/sheet';
import { mdTime } from '../rules/time';

export interface NumberSheetState { v: 2; rows: SheetRow[]; uploads: Upload[]; autoBad: boolean; lastCheck: number | null }
const empty = (): NumberSheetState => ({ v: 2, rows: [], uploads: [], autoBad: false, lastCheck: null });
/** How often the app reads the sheet. */
export const CHECK_EVERY_MIN = 2;

type Batch = (label: string, change: { changed?: Contact[] }, message: string) => void;

export function useNumberSheet(agent: string, contacts: Contact[], now: number, tz: string, batch: Batch, say: (m: string) => void, ready: boolean) {
  const key = `trucker-numsheet-${agent}`;
  const [s, setS] = useState<NumberSheetState | null>(null);
  useEffect(() => { setS(null); loadState<NumberSheetState>(key).then(v => setS(v?.v === 2 ? v : empty())); }, [key]);
  const put = useCallback((f: (x: NumberSheetState) => NumberSheetState) => setS(x => { if (!x) return x; const n = f(x); saveState(key, n); return n; }), [key]);

  const send = useCallback((rows: SheetRow[]) => put(x => ({ ...x, rows: [...x.rows, ...rows] })), [put]);
  const remove = useCallback((i: number) => put(x => ({ ...x, rows: x.rows.map((r, k) => k === i ? { ...r, status: `Removed ${mdTime(Date.now(), tz)}` } : r) })), [put, tz]);
  const setAutoBad = useCallback((on: boolean) => put(x => ({ ...x, autoBad: on })), [put]);

  // reads the sheet: adds numbers that pass the checks, writes Status back, and (if on) sends new bad numbers
  const live = useRef({ contacts, now, s }); live.current = { contacts, now, s };
  const check = useCallback((quiet = false) => {
    const { contacts, now, s } = live.current;
    if (!s) return;
    const r = readSheet(s.rows, contacts, now, tz);
    let rows = withStatus(s.rows, r.status);
    const after = r.changed.length ? contacts.map(c => r.changed.find(x => x.id === c.id) ?? c) : contacts;
    let sentBad = 0;
    if (s.autoBad) { const p = planSend(newlyBad(after, rows), after, rows, now, tz); rows = [...rows, ...p.send]; sentBad = p.send.length; }
    put(x => ({ ...x, rows, lastCheck: now, uploads: r.upload ? [...x.uploads.slice(-9), r.upload] : x.uploads }));
    const added = r.lines.filter(l => l.ok).length, look = r.lines.filter(l => !l.ok && r.status.has(l.row)).length;
    const msg = [added && `${added} from the number sheet saved to contacts`, look && `${look} need a look`, sentBad && `${sentBad} new bad number${sentBad === 1 ? '' : 's'} sent to the sheet`].filter(Boolean).join(' · ');
    if (r.changed.length) batch('Number sheet', { changed: r.changed }, msg + '.');
    else if (!quiet) say(msg ? msg + '.' : 'Checked the number sheet. Nothing new.');
  }, [put, tz, batch, say]);

  // checks on its own every couple of minutes (in the demo, only while the app is open)
  useEffect(() => {
    if (!ready || !s) return;
    const t = setInterval(() => check(true), CHECK_EVERY_MIN * 60_000);
    return () => clearInterval(t);
  }, [ready, !s, check]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback((u: Upload) => {
    const { contacts, now } = live.current;
    const r = undoUpload(u, contacts, now, tz);
    put(x => ({ ...x, rows: withStatus(x.rows, r.status), uploads: x.uploads.filter(y => y !== u) }));
    batch('Undo number sheet upload', { changed: r.restore },
      `Undid ${r.restore.length}.${r.kept.length ? ` Kept ${r.kept.join(', ')}: changed since.` : ''}`);
  }, [put, tz, batch]);

  /** Demo only: plays the number finder, filling some waiting rows (fictional 555-01xx numbers). */
  const demoFill = useCallback(() => {
    const { contacts } = live.current;
    put(x => {
      const open = x.rows.map((r, i) => [r, i] as const).filter(([r]) => isOpen(r)).slice(0, 6);
      const dupe = contacts.find(c => c.phone && !x.rows.some(r => r.id === c.id))?.phone ?? '';
      const rows = [...x.rows];
      open.forEach(([r, i], k) => {
        const ac = (r.old.match(/\d{3}/) ?? ['205'])[0];
        if (k === 3) rows[i] = { ...r, finder: 'Cannot find - LinkedIn and city search, 4 results, none fit' };
        else if (k === 4 && dupe) rows[i] = { ...r, phone: dupe, finder: 'People search' };
        else rows[i] = { ...r, phone: `(${ac}) 555-01${String(10 + ((i * 7 + k) % 90)).padStart(2, '0')}`, finder: k % 2 ? 'People search, top mobile' : 'LinkedIn match, sole result' };
      });
      return { ...x, rows };
    });
  }, [put]);

  /** Demo only: typing in a yellow cell of the pretend sheet. */
  const edit = useCallback((i: number, patch: Partial<Pick<SheetRow, 'phone' | 'backup' | 'finder'>>) =>
    put(x => ({ ...x, rows: x.rows.map((r, k) => k === i ? { ...r, ...patch } : r) })), [put]);

  return { sheet: s, send, remove, check, undo, setAutoBad, demoFill, edit };
}
export type NumberSheet = ReturnType<typeof useNumberSheet>;

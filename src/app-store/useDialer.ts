'use client';
// The dialer's state on the agent's screen. Every click is applied here first with the same rules the server uses,
// so the screen changes instantly. In the demo the data lives in this browser only; with the database connected,
// each change is also sent to the server in the background.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Contact, LogEvent } from '../rules/types';
import { DEFAULT_CONFIG as CFG } from '../rules/config';
import { dialerAction, disposition, quickNote, type DialerKey, type DialerOpts } from '../rules/engine';
import { buildToday, buildAppointments, type TodayRow, type ApptRow } from '../rules/today';
import { TAGS } from '../rules/tags';
import { sameDay } from '../rules/time';
import { demoContacts } from './demoData';

export interface Sale { at: number; contactId: string; trialAlp: number; standardAlp: number; monthly: number; note: string; calledInto: boolean }
export interface NoSale { at: number; contactId: string; objection: string; note: string; calledInto: boolean }

interface Snapshot { label: string; contact: Contact; logLen: number; salesLen: number; noSalesLen: number }
interface Saved {
  v: 1;
  contacts: Contact[];
  log: LogEvent[];
  sales: Sale[];
  noSales: NoSale[];
  snap: number;
  savedOrder: string[];
  savedAppts: string[];
  skips: string[];
  undo: Snapshot[];
  lastBackupTry: Record<string, number>;
  calls?: { at: number; contactId: string; seconds: number }[];
}

const KEY = 'trucker-demo-v1';

function fresh(now: number): Saved {
  return { v: 1, contacts: demoContacts(now, CFG.tz), log: [], sales: [], noSales: [], snap: 0, savedOrder: [], savedAppts: [],
    skips: [], undo: [], lastBackupTry: {} };
}

function resort(s: Saved, now: number): Saved {
  const base = { now, snap: now, savedOrder: [], savedAppts: [], dialTimes: dialTimes(s.log) };
  const today = buildToday(s.contacts.filter(c => c.list !== 'Hardcards'), base, CFG);
  const appts = buildAppointments(s.contacts, base, CFG);
  return { ...s, snap: now, savedOrder: today.map(r => r.contact.id), savedAppts: appts.map(r => r.contact.id), skips: [] };
}

function dialTimes(log: LogEvent[]) {
  const m = new Map<string, number[]>();
  for (const e of log) if (e.kind === 'Dial') { const a = m.get(e.contactId); a ? a.push(e.at) : m.set(e.contactId, [e.at]); }
  return m;
}

export interface Stats { calls: number; avgTalk: number; left: number; total: number; done: number; dials: number; connects: number; scheduled: number; presented: number; sold: number }

export function useDialer() {
  const [s, setS] = useState<Saved | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load once (and re-sort on the first open of each day, like the sheet)
  useEffect(() => {
    const t = Date.now();
    let loaded: Saved | null = null;
    try { const raw = localStorage.getItem(KEY); if (raw) loaded = JSON.parse(raw); } catch { /* private window */ }
    if (!loaded || loaded.v !== 1) loaded = fresh(t);
    if (!sameDay(loaded.snap, t, CFG.tz)) loaded = resort(loaded, t);
    setS(loaded);
    const id = setInterval(() => setNow(Date.now()), 30_000);   // the list clock (was Order!H2)
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (s) try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }, [s]);

  const say = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const byId = useMemo(() => new Map((s?.contacts ?? []).map(c => [c.id, c])), [s?.contacts]);
  const ctx = useMemo(() => s && { now, snap: s.snap, savedOrder: s.savedOrder, savedAppts: s.savedAppts, dialTimes: dialTimes(s.log) },
    [s, now]);
  const today: TodayRow[] = useMemo(() => (s && ctx ? buildToday(s.contacts.filter(c => c.list !== 'Hardcards'), ctx, CFG) : []), [s, ctx]);
  const appts: ApptRow[] = useMemo(() => (s && ctx ? buildAppointments(s.contacts, ctx, CFG) : []), [s, ctx]);
  const queue = useMemo(() => today.filter(r => !r.done && !(s?.skips ?? []).includes(r.contact.id)), [today, s?.skips]);

  const stats: Stats = useMemo(() => {
    const ev = (s?.log ?? []).filter(e => sameDay(e.at, now, CFG.tz));
    const tags = ev.filter(e => e.kind === 'Tag');
    const presented = new Set(tags.filter(e => /^(PRESENTED|SOLD)/.test(e.tag)).map(e => e.contactId));
    const sold = (s?.sales ?? []).filter(x => sameDay(x.at, now, CFG.tz)).length;
    const done = today.filter(r => r.done).length;
    const calls = (s?.calls ?? []).filter(x => sameDay(x.at, now, CFG.tz));
    const avgTalk = calls.length ? Math.round(calls.reduce((a, x) => a + x.seconds, 0) / calls.length) : 0;
    return { calls: calls.length, avgTalk, left: today.length - done, total: today.length, done,
      dials: ev.filter(e => e.kind === 'Dial').reduce((a, e) => a + e.count, 0),
      connects: tags.filter(e => e.reach).length,
      scheduled: tags.filter(e => e.tag.startsWith('SCHEDULED')).length,
      presented: presented.size, sold };
  }, [s, now, today]);

  /** Apply a change to one contact, keeping an undo snapshot. */
  const commit = useCallback((id: string, label: string, fn: (c: Contact, t: number) => { contact: Contact; events: LogEvent[]; message: string; refused?: string; ignored?: boolean },
                              extra?: (st: Saved) => Partial<Saved>) => {
    setS(prev => {
      if (!prev) return prev;
      const c = prev.contacts.find(x => x.id === id);
      if (!c) { say('That contact is gone. The list was refreshed.', 'warn'); return prev; }
      const t = Date.now();
      const r = fn(c, t);
      if (r.refused) { say(r.refused, 'warn'); return prev; }
      if (r.ignored) { say(r.message, 'warn'); return prev; }
      say(r.message);
      const snap: Snapshot = { label, contact: c, logLen: prev.log.length, salesLen: prev.sales.length, noSalesLen: prev.noSales.length };
      const next: Saved = { ...prev, contacts: prev.contacts.map(x => (x.id === id ? r.contact : x)), log: [...prev.log, ...r.events],
        undo: [...prev.undo.slice(-19), snap] };
      return { ...next, ...(extra ? extra(next) : {}) };
    });
    setNow(Date.now());
  }, [say]);

  const press = useCallback((id: string, key: DialerKey, opts: DialerOpts = {}) => {
    commit(id, key, (c, t) => {
      const r = dialerAction(c, key, t, CFG, { ...opts, lastBackupTryAt: s?.lastBackupTry[id] ?? null });
      return r;
    }, opts.backupMode && (key === 'noanswer' || key === 'voicemail' || key === 'bad')
      ? st => ({ lastBackupTry: { ...st.lastBackupTry, [id]: Date.now() } }) : undefined);
  }, [commit, s?.lastBackupTry]);

  const note = useCallback((id: string, text: string) => commit(id, 'note', (c, t) => quickNote(c, text, t, CFG)), [commit]);

  const outcome = useCallback((id: string, key: 'sold' | 'presented' | 'noshow' | 'reschedule', form?: Partial<Sale & NoSale> & { when?: number }) => {
    const tag = key === 'sold' ? TAGS.sold : key === 'presented' ? TAGS.presented : key === 'noshow' ? TAGS.noshow : TAGS.scheduled;
    const ci = byId.get(id)?.tag.startsWith('CALLED INTO') ?? false;
    commit(id, key, (c, t) => disposition(c, tag, t, CFG, { when: form?.when ?? null }), st => {
      const at = Date.now();
      if (key === 'sold') return { sales: [...st.sales, { at, contactId: id, trialAlp: form?.trialAlp ?? 0, standardAlp: form?.standardAlp ?? 0,
        monthly: form?.monthly ?? 0, note: form?.note ?? '', calledInto: ci }] };
      if (key === 'presented') return { noSales: [...st.noSales, { at, contactId: id, objection: form?.objection ?? 'Other', note: form?.note ?? '', calledInto: ci }] };
      return {};
    });
  }, [commit, byId]);

  /** A finished call (Call pressed until a result was picked), for talk-time stats. */
  const logCall = useCallback((id: string, seconds: number) => {
    setS(p => (p ? { ...p, calls: [...(p.calls ?? []), { at: Date.now(), contactId: id, seconds }] } : p));
  }, []);

  const skip = useCallback((id: string) => { setS(p => (p ? { ...p, skips: [...p.skips, id] } : p)); say('Skipped for today.'); }, [say]);

  const undo = useCallback(() => {
    setS(prev => {
      if (!prev || !prev.undo.length) { say('Nothing to undo.', 'warn'); return prev; }
      const u = prev.undo[prev.undo.length - 1];
      say(`Undid ${u.contact.first} ${u.contact.last} (${u.label}).`);
      return { ...prev, contacts: prev.contacts.map(x => (x.id === u.contact.id ? u.contact : x)), log: prev.log.slice(0, u.logLen),
        sales: prev.sales.slice(0, u.salesLen), noSales: prev.noSales.slice(0, u.noSalesLen), undo: prev.undo.slice(0, -1) };
    });
  }, [say]);

  const reSort = useCallback(() => { setS(p => (p ? resort(p, Date.now()) : p)); setNow(Date.now()); say('Today re-sorted: a fresh pass.'); }, [say]);
  const resetDemo = useCallback(() => { const t = Date.now(); setS(resort(fresh(t), t)); say('Demo data reset.'); }, [say]);

  const recent = useMemo(() => {
    const seen = new Set<string>(), out: { contact: Contact; at: number; tag: string }[] = [];
    for (let i = (s?.log.length ?? 0) - 1; i >= 0 && out.length < 12; i--) {
      const e = s!.log[i];
      if (seen.has(e.contactId)) continue;
      const c = byId.get(e.contactId);
      if (c) { seen.add(e.contactId); out.push({ contact: c, at: e.at, tag: c.tag }); }
    }
    return out;
  }, [s, byId]);

  const find = useCallback((q: string) => {
    const n = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const d = q.replace(/\D/g, '');
    if (!n) return [];
    return (s?.contacts ?? []).filter(c => {
      const name = `${c.first} ${c.last}`.toLowerCase();
      return name.includes(n) || c.company.toLowerCase().includes(n) || (d.length >= 4 && (c.phone + c.backup).replace(/\D/g, '').includes(d));
    }).slice(0, 25);
  }, [s?.contacts]);

  return { ready: !!s, now, today, appts, queue, stats, toast, byId, recent, log: s?.log ?? [], canUndo: !!s?.undo.length,
    undoLabel: s?.undo.at(-1)?.label, press, note, outcome, skip, logCall, undo, reSort, resetDemo, find, sales: s?.sales ?? [] };
}

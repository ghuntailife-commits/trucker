'use client';
// The dialer's state on the agent's screen. Every click is applied here first with the same rules the server uses,
// so the screen changes instantly. In the demo the data lives in this browser only; with the database connected,
// each change is also sent to the server in the background.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Contact, LogEvent } from '../rules/types';
import { DEFAULT_CONFIG as CFG } from '../rules/config';
import { dialerAction, disposition, quickNote, confirmAppt, toggleQual, type DialerKey, type DialerOpts } from '../rules/engine';
import { learnFreshScores } from '../rules/score';
import { buildToday, buildAppointments, type TodayRow, type ApptRow } from '../rules/today';
import { TAGS } from '../rules/tags';
import { sameDay, zoned } from '../rules/time';
import { addNote } from '../rules/engine';
import { saleNote, noSaleNote, saleDate, type SaleRecord, type NoSaleRecord } from '../rules/results';
import { demoContacts, demoHistory } from './demoData';
import { demoMonth } from './demoLog';
import { amendResult, type AmendTarget, type AmendTo, type AmendForm } from '../rules/amend';
import { REAL_SEED } from './realSeed';
import { loadState, saveState } from './store';

export type Sale = SaleRecord;
export type NoSale = NoSaleRecord;

/** Older demo data stored a trial and a standard ALP and one objection: bring it up to the form's fields. */
function normalize(st: Saved): Saved {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sales = (st.sales ?? []).map((x: any) => x.alpType ? x : ({ at: x.at, contactId: x.contactId,
    alpType: x.standardAlp ? 'Standard' : 'Trial', alp: (x.standardAlp || x.trialAlp || 0), monthly: x.monthly ?? 0, wholeLife: 0, adb: 0,
    email: '', note: x.note ?? '', calledInto: !!x.calledInto }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noSales = (st.noSales ?? []).map((x: any) => x.objections ? x : ({ at: x.at, contactId: x.contactId,
    objections: x.objection ? [x.objection] : [], reason: x.note ?? '', followUp: '', followUpNote: '', calledInto: !!x.calledInto }));
  return { ...st, sales, noSales };
}

/** What Undo puts back: earlier copies of changed or deleted contacts, and the IDs of contacts that were added. */
interface Snapshot { label: string; contact?: Contact; before?: Contact[]; added?: string[]; logLen: number; salesLen: number; noSalesLen: number;
  /** A changed result edits the middle of the lists, so Undo puts the whole lists back. */
  lists?: { log: LogEvent[]; sales: Sale[]; noSales: NoSale[] } }
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
  pass?: number;
  /** Monthly ALP goal (the old goal cell on the Sales tab). */
  goal?: number;
}

// v2: adds a month of made-up history. The real-data build keeps its own copy, tied to when its seed was made.
const KEY = REAL_SEED ? `trucker-real-${REAL_SEED.builtAt}` : 'trucker-demo-v2';

function fresh(now: number): Saved {
  if (REAL_SEED) {
    const r = structuredClone(REAL_SEED);
    return { v: 1, contacts: r.contacts, log: r.log, sales: r.sales, noSales: r.noSales, snap: 0, savedOrder: [], savedAppts: [],
      skips: [], undo: [], lastBackupTry: {}, goal: r.goal };
  }
  const contacts = demoContacts(now, CFG.tz);
  const h = demoHistory(contacts, now, CFG.tz), m = demoMonth(now, CFG.tz);
  const log = [...m.log, ...h.log].sort((a, b) => a.at - b.at);
  return { v: 1, contacts, log, sales: [...m.sales, ...h.sales].sort((a, b) => a.at - b.at), noSales: [...m.noSales, ...h.noSales].sort((a, b) => a.at - b.at), snap: 0, savedOrder: [], savedAppts: [],
    skips: [], undo: [], lastBackupTry: {} };
}

function resort(s: Saved, now: number): Saved {
  const sc = learnFreshScores(s.contacts, CFG.freshScoreMinResults);
  const base = { now, snap: now, savedOrder: [], savedAppts: [], dialTimes: dialTimes(s.log), freshScore: sc.ready ? sc.score : undefined, followUps: followUps(s.noSales) };
  const today = buildToday(s.contacts.filter(c => c.list !== 'Hardcards'), base, CFG);
  const appts = buildAppointments(s.contacts, base, CFG);
  return { ...s, pass: sameDay(s.snap, now, CFG.tz) ? (s.pass ?? 1) + 1 : 1, snap: now, savedOrder: today.map(r => r.contact.id), savedAppts: appts.map(r => r.contact.id), skips: [] };
}

/** Follow-up day per contact, from its latest no-sale form that set one (start of that day, Eastern). */
function followUps(noSales: NoSale[]) {
  const m = new Map<string, number>(), at = new Map<string, number>();
  for (const n of noSales) {
    if ((at.get(n.contactId) ?? -1) > n.at) continue;
    at.set(n.contactId, n.at);
    if (!n.followUp) { m.delete(n.contactId); continue; }
    const [y, mo, d] = n.followUp.split('-').map(Number);
    m.set(n.contactId, zoned(y, mo, d, 0, 0, CFG.tz));
  }
  return m;
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
    let live = true;
    loadState<Saved>(KEY).then(got => {
      if (!live) return;
      const t = Date.now();
      let loaded = got && got.v === 1 ? got : fresh(t);
      loaded = normalize(loaded);
      if (!sameDay(loaded.snap, t, CFG.tz)) loaded = resort(loaded, t);
      setS(loaded);
    });
    const id = setInterval(() => setNow(Date.now()), 30_000);   // the list clock (was Order!H2)
    return () => { live = false; clearInterval(id); };
  }, []);
  useEffect(() => { if (s) saveState(KEY, s); }, [s]);

  const say = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const byId = useMemo(() => new Map((s?.contacts ?? []).map(c => [c.id, c])), [s?.contacts]);
  const scorer = useMemo(() => learnFreshScores(s?.contacts ?? [], CFG.freshScoreMinResults), [s?.contacts]);
  const ctx = useMemo(() => s && { now, snap: s.snap, savedOrder: s.savedOrder, savedAppts: s.savedAppts, dialTimes: dialTimes(s.log), followUps: followUps(s.noSales),
    freshScore: scorer.ready ? scorer.score : undefined }, [s, now, scorer]);
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
  const confirm = useCallback((id: string) => commit(id, 'confirm', (c, t) => confirmAppt(c, t, CFG)), [commit]);
  const qual = useCallback((id: string, q: string) => commit(id, 'tag', c => toggleQual(c, q)), [commit]);

  type SaleIn = Omit<SaleRecord, 'at' | 'contactId' | 'calledInto'>;
  type NoSaleIn = Omit<NoSaleRecord, 'at' | 'contactId' | 'calledInto'>;
  /** Closes out an appointment or a called-into presentation. Sold and Presented come with their checked form. */
  const outcome = useCallback((id: string, key: 'sold' | 'presented' | 'noshow' | 'reschedule',
                               form?: { sale?: SaleIn; noSale?: NoSaleIn; when?: number }) => {
    const tag = key === 'sold' ? TAGS.sold : key === 'presented' ? TAGS.presented : key === 'noshow' ? TAGS.noshow : TAGS.scheduled;
    const before = byId.get(id);
    const ci = before?.tag.startsWith('CALLED INTO') ?? false;
    const apptAt = before?.callAt ?? null;
    commit(id, key, (c, t) => {
      const r = disposition(c, tag, t, CFG, { when: form?.when ?? null });
      const line = key === 'sold' && form?.sale ? saleNote(form.sale, t, CFG.tz)
        : key === 'presented' && form?.noSale ? noSaleNote(form.noSale, t, CFG.tz) : '';
      let contact = line ? { ...r.contact, notes: addNote(r.contact.notes, line) } : r.contact;
      if (form?.sale?.email) contact = { ...contact, email: form.sale.email };
      const who = `${c.first} ${c.last}`;
      const message = key === 'sold' && form?.sale ? `${who}: sale saved, ${form.sale.alpType} ALP $${form.sale.alp.toLocaleString('en-US')}.`
        : key === 'presented' ? `${who}: no-sale saved.` : key === 'noshow' ? `${who}: no-show saved.` : `${who}: appointment moved.`;
      return { ...r, contact, message };
    }, st => {
      const at = Date.now();
      const who = before ? { first: before.first, last: before.last, phone: before.phone || before.backup, company: before.company, list: before.list } : undefined;
      if (key === 'sold' && form?.sale) return { sales: [...st.sales, { ...form.sale, at: saleDate(apptAt, at), contactId: id, calledInto: ci, who }] };
      if (key === 'presented' && form?.noSale) return { noSales: [...st.noSales, { ...form.noSale, at, contactId: id, calledInto: ci, who }] };
      return {};
    });
  }, [commit, byId]);

  /** Change a result that was already saved (Appointments page): sold, presented, no-show, or booked again. */
  const amend = useCallback((target: AmendTarget, to: AmendTo, form: AmendForm = {}) => {
    setS(prev => {
      if (!prev) return prev;
      const r = amendResult(prev, target, to, form, Date.now(), CFG.tz);
      if ('error' in r) { say(r.error, 'warn'); return prev; }
      say(r.message);
      const changed = prev.contacts.find(c => !r.state.contacts.includes(c));
      const snap: Snapshot = { label: 'change result', before: changed ? [changed] : [], logLen: prev.log.length, salesLen: prev.sales.length,
        noSalesLen: prev.noSales.length, lists: { log: prev.log, sales: prev.sales, noSales: prev.noSales } };
      return { ...prev, ...r.state, undo: [...prev.undo.slice(-19), snap] };
    });
  }, [say]);

  /** A finished call (Call pressed until a result was picked), for talk-time stats. */
  const logCall = useCallback((id: string, seconds: number) => {
    setS(p => (p ? { ...p, calls: [...(p.calls ?? []), { at: Date.now(), contactId: id, seconds }] } : p));
  }, []);

  const skip = useCallback((id: string) => { setS(p => (p ? { ...p, skips: [...p.skips, id] } : p)); say('Skipped for today.'); }, [say]);

  const undo = useCallback(() => {
    setS(prev => {
      if (!prev || !prev.undo.length) { say('Nothing to undo.', 'warn'); return prev; }
      const u = prev.undo[prev.undo.length - 1];
      const before = u.before ?? (u.contact ? [u.contact] : []);
      const back = new Map(before.map(c => [c.id, c])), added = new Set(u.added ?? []);
      let contacts = prev.contacts.filter(x => !added.has(x.id)).map(x => back.get(x.id) ?? x);
      const missing = before.filter(c => !contacts.some(x => x.id === c.id));
      contacts = [...contacts, ...missing];
      say(before.length === 1 && !added.size ? `Undid ${before[0].first} ${before[0].last} (${u.label}).` : `Undid ${u.label}.`);
      if (u.lists) return { ...prev, contacts, ...u.lists, undo: prev.undo.slice(0, -1) };
      return { ...prev, contacts, log: prev.log.slice(0, u.logLen),
        sales: prev.sales.slice(0, u.salesLen), noSales: prev.noSales.slice(0, u.noSalesLen), undo: prev.undo.slice(0, -1) };
    });
  }, [say]);

  /** Change, add or delete several contacts as one step (Needs Number save, import, edits). One Undo puts it all back. */
  const batch = useCallback((label: string, change: { changed?: Contact[]; added?: Contact[]; removed?: string[]; events?: LogEvent[] }, message: string) => {
    setS(prev => {
      if (!prev) return prev;
      const changed = new Map((change.changed ?? []).map(c => [c.id, c]));
      const removed = new Set(change.removed ?? []);
      const before = prev.contacts.filter(c => changed.has(c.id) || removed.has(c.id));
      const snap: Snapshot = { label, before, added: (change.added ?? []).map(c => c.id), logLen: prev.log.length,
        salesLen: prev.sales.length, noSalesLen: prev.noSales.length };
      const contacts = [...prev.contacts.filter(c => !removed.has(c.id)).map(c => changed.get(c.id) ?? c), ...(change.added ?? [])];
      // contacts added today join the end of today's saved order, like the sheet's import
      const savedOrder = change.added?.length ? [...prev.savedOrder, ...change.added.map(c => c.id)] : prev.savedOrder;
      return { ...prev, contacts, savedOrder, log: [...prev.log, ...(change.events ?? [])], undo: [...prev.undo.slice(-19), snap] };
    });
    say(message);
    setNow(Date.now());
  }, [say]);

  const setGoal = useCallback((g: number) => {
    setS(p => (p ? { ...p, goal: g } : p));
    say(`Monthly goal set to $${g.toLocaleString('en-US')}.`);
  }, [say]);

  const reSort = useCallback(() => { setS(p => (p ? resort(p, Date.now()) : p)); setNow(Date.now()); say('Today re-sorted: a fresh pass.'); }, [say]);
  const say2 = say;
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

  return { ready: !!s, now, today, appts, queue, stats, toast, byId, recent, log: s?.log ?? [], canUndo: !!s?.undo.length, batch, confirm, qual, scorer, cfg: CFG, say: say2, contacts: s?.contacts ?? [], pass: s?.pass ?? 1, noSales: s?.noSales ?? [],
    undoLabel: s?.undo.at(-1)?.label, press, note, outcome, amend, skip, logCall, undo, reSort, resetDemo, find, sales: s?.sales ?? [], goal: s?.goal ?? 25000, setGoal, calls: s?.calls ?? [] };
}

// Catch up from a sheet (George, 2026-11-27): an agent worked in their old Truckers sheet for a few hours after the
// switch-over. This brings that work into Dispatch without wiping anything done in Dispatch: only contacts the sheet
// touched since a chosen time, only activity rows, sales and no-sales from then on, and never over a contact
// Dispatch dialed more recently. The sheet is read only. Pure, tested in test/catchUp.test.ts.
import type { Contact, LogEvent } from '../rules/types';
import type { NoSaleRecord, SaleRecord } from '../rules/results';
import type { AgentData } from './agentSheet';
import { addNote } from '../rules/engine';

const d10 = (p: string) => String(p ?? '').replace(/\D/g, '').slice(-10);
const nk = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const notesOf = (n: string) => String(n ?? '').split(' | ').map(x => x.trim()).filter(Boolean);

export interface CatchUp {
  changed: Contact[]; events: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[];
  touched: number; newerInDispatch: string[]; unmatched: string[];
}

/** Which Dispatch contact a sheet contact is: same id with the same name, else a shared phone, else same name (+ company). */
function matcher(mine: Contact[]) {
  const byId = new Map(mine.map(c => [c.id, c]));
  const byPhone = new Map<string, Contact>();
  for (const c of mine) for (const p of [c.phone, c.backup]) { const d = d10(p); if (d.length === 10 && !byPhone.has(d)) byPhone.set(d, c); }
  const byName = new Map<string, Contact[]>();
  for (const c of mine) { const k = `${nk(c.first)}|${nk(c.last)}`; byName.set(k, [...(byName.get(k) ?? []), c]); }
  return (s: Contact): Contact | undefined => {
    const same = byId.get(s.id);
    if (same && nk(same.first) === nk(s.first) && nk(same.last) === nk(s.last)) return same;
    for (const p of [s.phone, s.backup]) { const hit = byPhone.get(d10(p)); if (d10(p).length === 10 && hit) return hit; }
    const named = byName.get(`${nk(s.first)}|${nk(s.last)}`) ?? [];
    return named.length === 1 ? named[0] : named.find(c => nk(c.company) === nk(s.company) && nk(c.list) === nk(s.list));
  };
}

export function catchUp(dispatch: AgentData, sheet: AgentData, since: number): CatchUp {
  const find = matcher(dispatch.contacts);
  const out: CatchUp = { changed: [], events: [], sales: [], noSales: [], touched: 0, newerInDispatch: [], unmatched: [] };
  const sheetById = new Map(sheet.contacts.map(c => [c.id, c]));
  const recentLog = sheet.log.filter(e => e.at >= since);
  const touchedIds = new Set([...recentLog.map(e => e.contactId), ...sheet.contacts.filter(c => (c.lastDialed ?? 0) >= since).map(c => c.id)]);
  const idMap = new Map<string, string>();     // sheet id -> Dispatch id
  for (const sid of touchedIds) {
    const s = sheetById.get(sid);
    if (!s) continue;
    out.touched++;
    const m = find(s);
    if (!m) { out.unmatched.push(`${s.first} ${s.last}`.trim() || s.phone); continue; }
    idMap.set(sid, m.id);
    // Dispatch already has later work on this person: keep Dispatch, but still add the sheet's activity rows
    if ((m.lastDialed ?? 0) > (s.lastDialed ?? 0)) { out.newerInDispatch.push(`${m.first} ${m.last}`.trim()); continue; }
    const have = new Set(notesOf(m.notes));
    let notes = m.notes;
    for (const n of notesOf(s.notes)) if (!have.has(n)) notes = addNote(notes, n);
    out.changed.push({ ...m, tag: s.tag, dials: Math.max(s.dials, m.dials), lastDialed: s.lastDialed ?? m.lastDialed, callAt: s.callAt, status: s.status || m.status,
      phone: s.phone || m.phone, backup: s.backup || m.backup, newNumberMark: s.newNumberMark ?? m.newNumberMark, notes,
      callbackTries: Math.max(s.callbackTries ?? 0, m.callbackTries ?? 0), noShowTries: Math.max(s.noShowTries ?? 0, m.noShowTries ?? 0) });
  }
  const seenEv = new Set(dispatch.log.map(e => `${e.at}|${e.contactId}|${e.kind}`));
  for (const e of recentLog) {
    const id = e.contactId ? idMap.get(e.contactId) : '';
    if (e.contactId && !id) continue;
    const x = { ...e, contactId: id ?? '' };
    const k = `${x.at}|${x.contactId}|${x.kind}`;
    if (!seenEv.has(k)) { seenEv.add(k); out.events.push(x); }
  }
  const has = (xs: { at: number; contactId: string }[], x: { at: number; contactId: string }) => xs.some(y => y.contactId === x.contactId && Math.abs(y.at - x.at) < 60_000);
  for (const x of sheet.sales) {
    const id = idMap.get(x.contactId) ?? find(sheetById.get(x.contactId) ?? ({} as Contact))?.id;
    if (!id || x.at < since - 86_400_000 || !touchedIds.has(x.contactId)) continue;
    const r = { ...x, contactId: id };
    if (!has(dispatch.sales, r)) out.sales.push(r);
  }
  for (const x of sheet.noSales) {
    const id = idMap.get(x.contactId);
    if (!id || !touchedIds.has(x.contactId)) continue;
    const r = { ...x, contactId: id };
    if (!has(dispatch.noSales, r)) out.noSales.push(r);
  }
  return out;
}

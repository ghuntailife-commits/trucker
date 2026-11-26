// The number sheet: each agent's own Google Sheet for finding numbers (George, 2026-11-26).
// 1. On Needs Number the agent ticks contacts and sends them to the sheet (with a preview).
// 2. Whoever finds numbers (or Muse) fills the yellow Phone / Backup / Finder Notes columns, like the old Needs Number tab.
// 3. The app reads the sheet every few minutes. Each filled row goes through the same checks as typing it on
//    Needs Number (10 digits, not already marked bad, not on another contact). Rows that pass go straight into
//    the contact; rows that don't stay on the sheet with the reason and show under "Needs a look".
// 4. The app writes what happened in the Status column, and each upload can be undone.
// Every row carries the contact's permanent ID, so sorting or editing the sheet can't put a number on the wrong person.
import type { Contact } from '../rules/types';
import { notesNewestFirst } from '../rules/notes';
import { mdTime } from '../rules/time';
import { needsGroup, planNeeds, type NeedsEntry } from '../contacts/needs';
import { splitPhones } from '../contacts/phones';

/** Laid out exactly like the Needs Number tab on George Truckers (George, 2026-11-26): two sections side by side,
 *  banner in rows 1-2, section titles in row 3, headers in row 4, contacts from row 5, yellow columns for the finder.
 *  Hidden columns Y-AB hold each row's contact ID and what the app did with it. */
export const BANNER = [
  'Contacts Needing a Number - type or paste numbers and notes in the yellow columns. The app checks this sheet every few minutes and saves good numbers to the contact on its own.',
  'Type a number in Phone (Backup is optional), or start Finder Notes with "Cannot find". Green rows are saved, red rows need a look (hover for why), grey rows are done.',
] as const;
export const LEFT_TITLE = 'NEEDS A NUMBER - in the order you sent them';
export const RIGHT_TITLE = 'NEEDS A NEW NUMBER - contacts marked bad number';
export const LEFT_HEAD = ['Phone (type here)', 'Backup (type here)', 'First Name', 'Last Name', 'Job Title', 'Company', 'City', 'State', 'LinkedIn', 'Tab', 'Row', 'Finder Notes (type here)'] as const;
export const RIGHT_HEAD = ['New Phone (type here)', 'First Name', 'Last Name', 'Old Number', 'Job Title', 'Company', 'City', 'State', 'Notes', 'Tab', 'Row', 'Finder Notes (type here)'] as const;
/** Which of the 12 columns in each section are yellow (the finder types there). */
export const LEFT_TYPE = [0, 1, 11], RIGHT_TYPE = [0, 11];
/** Column widths in pixels, copied from the Needs Number tab. */
export const WIDTHS = [130, 130, 110, 110, 190, 190, 100, 100, 100, 110, 110, 220, 130, 110, 110, 110, 170, 170, 100, 100, 260, 110, 110, 220];
export const FIRST_DATA_ROW = 5;

export type Side = 'needs' | 'newNumber';
export interface SheetRow {
  side: Side; id: string; first: string; last: string; job: string; company: string; city: string; state: string; linkedin: string;
  tab: string; rowNo: string; old: string; notes: string;
  /** Typed by the finder. */
  phone: string; backup: string; finder: string;
  /** Written by the app (hidden column). */
  status: string;
}

/** "Cannot find" in Finder Notes (or in the Phone cell) with no number typed. */
export const cannotFind = (r: SheetRow) => !/\d{3}/.test(r.phone + r.backup) && /^\s*can'?not\s*find/i.test(r.finder || r.phone);
const typedNumber = (r: SheetRow) => /\d/.test(r.phone + r.backup);

export function leftValues(r: SheetRow): string[] { return [r.phone, r.backup, r.first, r.last, r.job, r.company, r.city, r.state, r.linkedin, r.tab, r.rowNo, r.finder]; }
export function rightValues(r: SheetRow): string[] { return [r.phone, r.first, r.last, r.old, r.job, r.company, r.city, r.state, r.notes, r.tab, r.rowNo, r.finder]; }
export function fromLeft(v: string[], id: string, status: string): SheetRow {
  const s = (i: number) => String(v[i] ?? '').trim();
  return { side: 'needs', id, status, phone: s(0), backup: s(1), first: s(2), last: s(3), job: s(4), company: s(5), city: s(6), state: s(7),
    linkedin: s(8), tab: s(9), rowNo: s(10), finder: s(11), old: '', notes: '' };
}
export function fromRight(v: string[], id: string, status: string): SheetRow {
  const s = (i: number) => String(v[i] ?? '').trim();
  return { side: 'newNumber', id, status, phone: s(0), first: s(1), last: s(2), old: s(3), job: s(4), company: s(5), city: s(6), state: s(7),
    notes: s(8), tab: s(9), rowNo: s(10), finder: s(11), backup: '', linkedin: '' };
}
/** Where each row sits on the sheet: which section and its row number. */
export interface Place { side: Side; sheetRow: number }
/** The sheet's rows A5:AB as one list (left section first, then right), with where each one sits. */
export function fromGrid(grid: (string | undefined)[][]): { rows: SheetRow[]; places: Place[] } {
  const L: [SheetRow, Place][] = [], R: [SheetRow, Place][] = [];
  grid.forEach((raw, k) => {
    const v = Array.from({ length: 28 }, (_, i) => String(raw[i] ?? ''));
    const sheetRow = FIRST_DATA_ROW + k;
    if (v.slice(0, 12).some(Boolean) || v[24]) L.push([fromLeft(v.slice(0, 12), v[24].trim(), v[26].trim()), { side: 'needs', sheetRow }]);
    if (v.slice(12, 24).some(Boolean) || v[25]) R.push([fromRight(v.slice(12, 24), v[25].trim(), v[27].trim()), { side: 'newNumber', sheetRow }]);
  });
  const all = [...L, ...R];
  return { rows: all.map(x => x[0]), places: all.map(x => x[1]) };
}
/** The rows laid out as the sheet holds them, A5 onward (28 columns, A-AB). */
export function toGrid(rows: SheetRow[]): string[][] {
  const L = rows.filter(r => r.side === 'needs'), R = rows.filter(r => r.side === 'newNumber');
  return Array.from({ length: Math.max(L.length, R.length) }, (_, k) => {
    const l = L[k], r = R[k];
    return [...(l ? leftValues(l) : Array(12).fill('')), ...(r ? rightValues(r) : Array(12).fill('')), l?.id ?? '', r?.id ?? '', l?.status ?? '', r?.status ?? ''];
  });
}

/** A row is done once the app has added its number, marked it Cannot Find, or it was undone or removed. */
export const isDone = (r: SheetRow) => /^(Added|Marked Cannot Find|Undone|Removed)/.test(r.status);
export const needsLook = (r: SheetRow) => /^Not added/.test(r.status);
/** Rows still waiting on the number finder. */
export const isOpen = (r: SheetRow) => !isDone(r) && !needsLook(r) && !typedNumber(r) && !cannotFind(r);
/** The colour the row gets on the sheet. */
export const tone = (r: SheetRow): 'added' | 'look' | 'done' | 'filled' | 'wait' =>
  /^Added/.test(r.status) ? 'added' : needsLook(r) ? 'look' : isDone(r) ? 'done' : typedNumber(r) || cannotFind(r) ? 'filled' : 'wait';

/** The sheet row for a contact being sent. */
export function rowFor(c: Contact): SheetRow {
  const side: Side = needsGroup(c) === 'newNumber' ? 'newNumber' : 'needs';
  return { side, id: c.id, first: c.first, last: c.last, job: c.job, company: c.company, city: c.city, state: c.state,
    linkedin: /^https:\/\//.test(c.linkedin) ? c.linkedin : '', tab: c.list, rowNo: String(c.seq),
    old: side === 'newNumber' ? [c.phone, c.backup].filter(Boolean).join(' / ') : '',
    notes: side === 'newNumber' ? (notesNewestFirst(c.notes)[0] ?? '').slice(0, 300) : '',
    phone: '', backup: '', finder: '', status: '' };
}

export interface SendPlan { send: SheetRow[]; skip: { name: string; reason: string }[] }
/** Works out what "Send to number sheet" will add, without adding anything. */
export function planSend(ids: string[], contacts: Contact[], sheet: SheetRow[], now: number, tz: string): SendPlan {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const waiting = new Set(sheet.filter(r => !isDone(r)).map(r => r.id));
  const out: SendPlan = { send: [], skip: [] };
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) { out.skip.push({ name: '?', reason: 'That contact was deleted.' }); continue; }
    const name = `${c.first} ${c.last}`;
    if (waiting.has(id)) out.skip.push({ name, reason: 'Already on the sheet.' });
    else if (!needsGroup(c) || needsGroup(c) === 'cannotFind') out.skip.push({ name, reason: 'Has a number now.' });
    else { out.send.push(rowFor(c)); waiting.add(id); }
  }
  return out;
}

/** Contacts whose number just went bad and aren't on the sheet yet (for the optional "send bad numbers" switch). */
export function newlyBad(contacts: Contact[], sheet: SheetRow[]): string[] {
  const waiting = new Set(sheet.filter(r => !isDone(r)).map(r => r.id));
  return contacts.filter(c => needsGroup(c) === 'newNumber' && !waiting.has(c.id)).map(c => c.id);
}

export interface SyncLine { row: number; name: string; ok: boolean; status: string }
export interface Upload { at: number; rows: number[]; before: Contact[]; after: Contact[] }
export interface SyncResult {
  /** Contacts to save. */
  changed: Contact[];
  /** New Status text per sheet row (0-based row index into the sheet, header not counted). Only rows that change. */
  status: Map<number, string>;
  lines: SyncLine[];
  /** For undo. Null when nothing was added. */
  upload: Upload | null;
}

/** Reads the filled rows and works out what to save and what to write back in Status. Saves nothing itself. */
export function readSheet(sheet: SheetRow[], contacts: Contact[], now: number, tz: string): SyncResult {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const status = new Map<number, string>(), lines: SyncLine[] = [];
  const todo: { i: number; e: NeedsEntry }[] = [];
  const seen = new Map<string, number>();
  sheet.forEach((r, i) => {
    const cf = cannotFind(r);
    if (isDone(r) || !(typedNumber(r) || cf)) return;
    const set = (s: string) => { if (r.status !== s) status.set(i, s); lines.push({ row: i, name: `${r.first} ${r.last}`.trim() || '?', ok: false, status: s }); };
    if (!r.id) return set('Not added: the Contact ID cell is empty. Send the contact again from the app.');
    const c = byId.get(r.id);
    if (!c) return set('Not added: no contact has this ID. Was the ID cell changed?');
    if (`${c.first} ${c.last}`.toLowerCase() !== `${r.first} ${r.last}`.toLowerCase() && r.first + r.last)
      return set(`Not added: the name on this row doesn't match ${c.first} ${c.last}. Was the row edited?`);
    if (seen.has(r.id)) return set('Not added: this contact is on another filled row too.');
    if (!cf && r.phone && !splitPhones(r.phone).length) return set('Not added: the phone is not 10 digits.');
    if (r.backup && !splitPhones(r.backup).length) return set('Not added: the backup is not 10 digits.');
    seen.set(r.id, i);
    const finder = r.finder.replace(/^\s*can'?not\s*find\s*[-:.,]?\s*/i, '');
    todo.push({ i, e: { id: r.id, phone: cf ? '' : r.phone, backup: cf ? '' : r.backup, cannotFind: cf,
      note: cf ? `Number sheet: ${finder || 'no number found'}` : `Number from number sheet${r.finder ? ': ' + r.finder : ''}` } });
  });
  const plan = planNeeds(todo.map(t => t.e), contacts, now, tz);
  const changed: Contact[] = [], before: Contact[] = [], rows: number[] = [];
  plan.forEach((p, k) => {
    const { i } = todo[k], r = sheet[i];
    const s = p.ok ? (todo[k].e.cannotFind ? `Marked Cannot Find ${mdTime(now, tz)}` : `Added ${mdTime(now, tz)}`)
      : `Not added: ${p.result}`;
    if (r.status !== s) status.set(i, s);
    lines.push({ row: i, name: p.name, ok: p.ok, status: s });
    if (p.ok && p.contact) { changed.push(p.contact); before.push(byId.get(p.id)!); rows.push(i); }
  });
  lines.sort((a, b) => a.row - b.row);
  return { changed, status, lines, upload: changed.length ? { at: now, rows, before, after: changed } : null };
}

/** Undo an upload: puts back contacts that haven't been touched since. Ones changed since stay as they are. */
export function undoUpload(u: Upload, contacts: Contact[], now: number, tz: string) {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const restore: Contact[] = [], kept: string[] = [], status = new Map<number, string>();
  u.after.forEach((a, k) => {
    const cur = byId.get(a.id);
    if (cur && JSON.stringify(cur) === JSON.stringify(a)) { restore.push(u.before[k]); status.set(u.rows[k], `Undone ${mdTime(now, tz)}. Send again to retry.`); }
    else kept.push(`${a.first} ${a.last}`);
  });
  return { restore, kept, status };
}

/** Applies Status updates to a copy of the sheet (the demo's stand-in for writing the Status column). */
export function withStatus(sheet: SheetRow[], status: Map<number, string>): SheetRow[] {
  return sheet.map((r, i) => (status.has(i) ? { ...r, status: status.get(i)! } : r));
}

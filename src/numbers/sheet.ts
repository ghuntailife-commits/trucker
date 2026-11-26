// The number sheet: each agent's own Google Sheet for finding numbers (George, 2026-11-26).
// 1. On Needs Number the agent ticks contacts and sends them to the sheet (with a preview).
// 2. Whoever finds numbers (or Muse) fills Phone / Backup / Where found / Cannot find on the sheet.
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

export const HEAD = ['Contact ID', 'First', 'Last', 'City', 'State', 'Company', 'Job', 'LinkedIn', 'Old or bad numbers', 'Latest note',
  'Sent', 'Phone', 'Backup', 'Where found', 'Cannot find', 'Status (the app fills this)'] as const;
/** Columns the number finder fills in. Everything else is written by the app. */
export const FINDER_COLS = ['Phone', 'Backup', 'Where found', 'Cannot find'] as const;

export interface SheetRow {
  id: string; first: string; last: string; city: string; state: string; company: string; job: string; linkedin: string;
  bad: string; note: string; sent: string; phone: string; backup: string; found: string; cannotFind: boolean; status: string;
}

const yes = (v: string) => /^(x|y|yes|true|✓|✔|1)$/i.test(v.trim());
export function toValues(r: SheetRow): string[] {
  return [r.id, r.first, r.last, r.city, r.state, r.company, r.job, r.linkedin, r.bad, r.note, r.sent, r.phone, r.backup, r.found, r.cannotFind ? 'Yes' : '', r.status];
}
export function fromValues(v: (string | undefined)[]): SheetRow {
  const s = (i: number) => String(v[i] ?? '').trim();
  return { id: s(0), first: s(1), last: s(2), city: s(3), state: s(4), company: s(5), job: s(6), linkedin: s(7), bad: s(8), note: s(9),
    sent: s(10), phone: s(11), backup: s(12), found: s(13), cannotFind: yes(s(14)), status: s(15) };
}

/** A row is done once the app has added its number, marked it Cannot Find, or it was undone. */
export const isDone = (r: SheetRow) => /^(Added|Marked Cannot Find|Undone|Removed)/.test(r.status);
export const needsLook = (r: SheetRow) => /^Not added/.test(r.status);
/** Rows still waiting on the number finder. */
export const isOpen = (r: SheetRow) => !isDone(r) && !needsLook(r) && !r.phone && !r.backup && !r.cannotFind;

/** The sheet row for a contact being sent. */
export function rowFor(c: Contact, now: number, tz: string): SheetRow {
  const bad = needsGroup(c) === 'newNumber' ? [c.phone, c.backup].filter(Boolean).join(' / ') : '';
  const note = (notesNewestFirst(c.notes)[0] ?? '').slice(0, 300);
  return { id: c.id, first: c.first, last: c.last, city: c.city, state: c.state, company: c.company, job: c.job,
    linkedin: /^https:\/\//.test(c.linkedin) ? c.linkedin : '', bad, note, sent: mdTime(now, tz),
    phone: '', backup: '', found: '', cannotFind: false, status: '' };
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
    else { out.send.push(rowFor(c, now, tz)); waiting.add(id); }
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
    if (isDone(r) || !(r.phone || r.backup || r.cannotFind)) return;
    const set = (s: string) => { if (r.status !== s) status.set(i, s); lines.push({ row: i, name: `${r.first} ${r.last}`.trim() || '?', ok: false, status: s }); };
    if (!r.id) return set('Not added: the Contact ID cell is empty. Send the contact again from the app.');
    const c = byId.get(r.id);
    if (!c) return set('Not added: no contact has this ID. Was the ID cell changed?');
    if (`${c.first} ${c.last}`.toLowerCase() !== `${r.first} ${r.last}`.toLowerCase() && r.first + r.last)
      return set(`Not added: the name on this row doesn't match ${c.first} ${c.last}. Was the row edited?`);
    if (seen.has(r.id)) return set('Not added: this contact is on another filled row too.');
    if (r.phone && !splitPhones(r.phone).length) return set('Not added: the phone is not 10 digits.');
    if (r.backup && !splitPhones(r.backup).length) return set('Not added: the backup is not 10 digits.');
    seen.set(r.id, i);
    todo.push({ i, e: { id: r.id, phone: r.phone, backup: r.backup, cannotFind: r.cannotFind && !r.phone && !r.backup,
      note: r.cannotFind && !r.phone && !r.backup ? (r.found ? `Number sheet: ${r.found}` : 'Number sheet') : `Number from number sheet${r.found ? ': ' + r.found : ''}` } });
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

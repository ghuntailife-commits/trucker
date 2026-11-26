// Moves contacts and the Activity Log from a v27 sheet into the app's shape.
// Read-only on the sheet side: it takes the cell values (as the Sheets API returns them) and never writes back.
import { withZone } from '../contacts/zones';
import type { Contact, LogEvent, NumberStatus, Zone } from '../rules/types';
import { tagKind, TAGS } from '../rules/tags';
import { parts, zoned } from '../rules/time';

const TZ = 'America/New_York';
type Cell = string | number | boolean | null | undefined;

/** A Sheets date: a serial number (days since 12/30/1899, Eastern wall time) or a date string. */
export function sheetDate(v: Cell): number | null {
  if (v === '' || v == null || v === false) return null;
  if (typeof v === 'number') {
    if (!isFinite(v) || v <= 0) return null;
    const days = Math.floor(v), frac = v - days;
    const base = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
    const mins = Math.round(frac * 1440);
    return zoned(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), Math.floor(mins / 60), mins % 60, TZ);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    let h = m[4] ? +m[4] : 0;
    if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0);
    return zoned(y, +m[1], +m[2], h, m[5] ? +m[5] : 0, TZ);
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

export const dialsOf = (v: Cell) => { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };
export const norm = (s: Cell) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const str = (v: Cell) => (v == null ? '' : String(v)).trim();

const STATUS: Record<string, NumberStatus> = {
  good: 'Good', backup: 'Backup', bad: 'Bad', 'do not call': 'Do Not Call', 'cannot find': 'Cannot Find', unverified: '',
};
const ZONES = new Set(['ET', 'CT', 'MT', 'PT', 'AKT', 'HT']);

export interface SheetRowIssue { list: string; row: number; problem: string }

/**
 * One state-tab row (columns A..W, data from sheet row 3) → a contact. Returns null for a blank row.
 * Ids are assigned by the caller (the database makes them).
 */
export function rowToContact(list: string, sheetRow: number, r: Cell[], issues: SheetRowIssue[] = []): Contact | null {
  const g = (i: number) => r[i];
  const first = str(g(3)), last = str(g(4)), phone = str(g(5)), backup = str(g(10)), notes = str(g(11));
  if (!first && !last && !phone && !backup && !notes && !str(g(0))) return null;

  const tag = str(g(0));
  if (tag && tagKind(tag) === 'other') issues.push({ list, row: sheetRow, problem: `Unknown tag "${tag}" kept as is` });
  const stRaw = str(g(14)).toLowerCase();
  const status = STATUS[stRaw] ?? '';
  if (stRaw && !(stRaw in STATUS)) issues.push({ list, row: sheetRow, problem: `Unknown number status "${g(14)}" cleared` });
  const markRaw = g(22);
  const mark = markRaw === '' || markRaw == null || isNaN(Number(markRaw)) ? null : Number(markRaw);
  const zone = str(g(17)).toUpperCase();
  if (!first && !last) issues.push({ list, row: sheetRow, problem: 'No name' });

  return withZone({
    id: '', list, tag, dials: dialsOf(g(1)), first, last, phone, job: str(g(6)), company: str(g(7)), city: str(g(8)),
    state: str(g(9)), backup, notes, lastDialed: sheetDate(g(12)), status, callAt: sheetDate(g(15)),
    linkedin: str(g(16)), zone: (ZONES.has(zone) ? zone : '') as Zone, newNumberMark: mark,
    callbackTries: 0, noShowTries: 0, swapMemo: null, seq: sheetRow,
  });
}

/** One Activity Log row (A..K): Timestamp, Tab, First, Last, Phone, Action, Count, Tag, Dials after, Row, Reach. */
export interface OldLogRow { at: number; list: string; first: string; last: string; phone: string; kind: string;
  count: number; tag: string; dials: number; row: number }

export function logRow(r: Cell[]): OldLogRow | null {
  const at = sheetDate(r[0]);
  if (at == null) return null;
  return { at, list: str(r[1]), first: str(r[2]), last: str(r[3]), phone: str(r[4]), kind: str(r[5]),
    count: Number(r[6]) || 0, tag: str(r[7]), dials: dialsOf(r[8]), row: dialsOf(r[9]) };
}

/**
 * Finds the contact a log row belongs to: same list and same name. When two contacts on a list share a name,
 * the row number decides. Returns the index into `contacts`, or -1.
 */
export function matchLog(contacts: Contact[], byKey: Map<string, number[]>, l: OldLogRow): number {
  const hits = byKey.get(l.list + '|' + norm(l.first) + '|' + norm(l.last)) ?? [];
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits.find(i => contacts[i].seq === l.row) ?? hits[0];
  return -1;
}

/**
 * The callback and no-show try counts lived in the old script's hidden storage, which can't be read from outside.
 * They are rebuilt from the Activity Log the same way the old catch-up (nsBackfill) did:
 * dials since the most recent tag, counting callback dials only once the callback day had come.
 */
export function deriveTries(c: Contact, log: OldLogRow[]): { callbackTries: number; noShowTries: number } {
  const kind = tagKind(c.tag);
  if (kind !== 'callback' && kind !== 'noshow') return { callbackTries: 0, noShowTries: 0 };
  const sorted = [...log].sort((a, b) => a.at - b.at);
  let tagAt = -Infinity;
  for (const l of sorted) if (l.kind === 'Tag' && tagKind(l.tag) === kind) tagAt = l.at;
  if (tagAt === -Infinity && kind === 'noshow') {
    const m = c.notes.match(/(?:.*[^0-9])?([0-9]{1,2})\/([0-9]{1,2}): No-showed/);
    if (m) {
      const y = parts(c.lastDialed ?? Date.now(), TZ).y;
      tagAt = zoned(y, +m[1], +m[2], 23, 59, TZ);
    }
  }
  if (tagAt === -Infinity) return { callbackTries: 0, noShowTries: 0 };
  // a disposition writes a Dial row in the same instant as its Tag row; those are not tries
  let dials = sorted.filter(l => l.kind === 'Dial' && l.at > tagAt + 5_000);
  if (kind === 'callback') {
    const due = c.callAt;
    if (due != null) {
      const dueDay = parts(due, TZ);
      const dayStart = zoned(dueDay.y, dueDay.m, dueDay.d, 0, 0, TZ);
      dials = dials.filter(l => l.at >= dayStart);
    }
    return { callbackTries: Math.min(dials.length, 2), noShowTries: 0 };
  }
  return { callbackTries: 0, noShowTries: Math.min(dials.length, 3) };
}

export interface TabInput { list: string; rows: Cell[][] /* sheet rows 3.. as A..W */ }
export interface MigrationReport {
  perList: { list: string; sheetRows: number; contacts: number; withPhone: number; tagged: number; needsNumber: number }[];
  logRows: number; logMatched: number; logUnmatched: number;
  duplicatePhones: { phone: string; who: string[] }[];
  issues: SheetRowIssue[];
}

/** Turns one agent's sheet into contacts + log rows, and a report to check before anything is saved. */
export function migrateSheet(tabs: TabInput[], logRows: Cell[][]) {
  const issues: SheetRowIssue[] = [];
  const contacts: Contact[] = [];
  const perList: MigrationReport['perList'] = [];
  for (const t of tabs) {
    let n = 0, withPhone = 0, tagged = 0, needs = 0;
    t.rows.forEach((r, i) => {
      const c = rowToContact(t.list, i + 3, r, issues);
      if (!c) return;
      contacts.push(c); n++;
      if (c.phone || c.backup) withPhone++;
      if (c.tag) tagged++;
      if (!c.phone && !c.backup && !c.tag && c.status !== 'Cannot Find') needs++;
    });
    perList.push({ list: t.list, sheetRows: t.rows.length, contacts: n, withPhone, tagged, needsNumber: needs });
  }
  const byKey = new Map<string, number[]>();
  contacts.forEach((c, i) => {
    const k = c.list + '|' + norm(c.first) + '|' + norm(c.last);
    byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  const parsed = logRows.map(logRow).filter((x): x is OldLogRow => x != null);
  const perContact = new Map<number, OldLogRow[]>();
  const events: { index: number; row: OldLogRow }[] = [];
  let unmatched = 0;
  for (const l of parsed) {
    const i = matchLog(contacts, byKey, l);
    if (i < 0) unmatched++;
    else perContact.set(i, [...(perContact.get(i) ?? []), l]);
    events.push({ index: i, row: l });
  }
  contacts.forEach((c, i) => Object.assign(c, deriveTries(c, perContact.get(i) ?? [])));

  const phones = new Map<string, string[]>();
  for (const c of contacts) for (const p of [c.phone, c.backup]) {
    const d = p.replace(/\D/g, '');
    if (d.length >= 10) phones.set(d, [...(phones.get(d) ?? []), `${c.first} ${c.last} (${c.list} row ${c.seq})`]);
  }
  const duplicatePhones = [...phones].filter(([, w]) => w.length > 1).map(([phone, who]) => ({ phone, who }));
  const report: MigrationReport = {
    perList, logRows: parsed.length, logMatched: parsed.length - unmatched, logUnmatched: unmatched, duplicatePhones, issues,
  };
  return { contacts, events, report };
}

/** Old log row → new log event for a contact (contact id filled in after the contact is saved). */
export function toEvent(l: OldLogRow, contactId: string): LogEvent {
  const kind = (['Dial', 'Tag', 'Swap', 'Import'].includes(l.kind) ? l.kind : 'Note') as LogEvent['kind'];
  return { at: l.at, contactId, list: l.list, first: l.first, last: l.last, phone: l.phone, kind, count: l.count || 1,
    tag: l.tag, dials: l.dials,
    ...(kind === 'Tag' ? { reach: !['bad', 'noshow', 'presented', 'sold', 'given'].includes(tagKind(l.tag)) } : {}) };
}

export { TAGS };

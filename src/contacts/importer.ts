// Import: the same columns and duplicate check as the sheet's Import tab.
// Columns: First, Last, Phone, Job, Company, City, State, LinkedIn, Backup, Notes.
import { zoneFor } from './zones';
import type { Contact } from '../rules/types';
import { tagKind, TAGS, tagShort } from '../rules/tags';
import { digits10, norm, splitPhones } from './phones';
import { parseState } from './states';

export const IMPORT_COLUMNS = ['First', 'Last', 'Phone', 'Job', 'Company', 'City', 'State', 'LinkedIn', 'Backup', 'Notes'] as const;

/** Optional columns after Notes, for bringing in contacts someone already worked elsewhere (George, 2026-11-28):
 *  Result, Dials, Last dialed, Call at. Dates are ISO times (2026-11-30T14:00:00-06:00). */
export const WORKED_COLUMNS = ['Result', 'Dials', 'Last dialed', 'Call at'] as const;
const RESULTS: Record<string, string> = {
  '': '', 'no answer': '', 'voicemail': '', 'hung up': TAGS.notInterested, 'not interested': TAGS.notInterested, 'bad number': TAGS.bad,
  'callback': TAGS.callback, 'scheduled': TAGS.scheduled, 'no-show': TAGS.noshow, 'no show': TAGS.noshow, 'do not call': TAGS.dnc,
};
const isoTime = (v: string) => { const t = v ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };

export interface ImportLine { line: number; name: string; result: string; ok: boolean; contact?: Contact }

interface Hit { where: string; tag: string }

/** Who already has each phone number and name, across every list. */
/** Someone on another agent's Dispatch, for the admin's import check (George, 2026-11-27). */
export interface OtherHolder { first: string; last: string; company: string; phone: string; backup: string; tag: string; where: string }

export function buildIndex(contacts: Contact[], others: OtherHolder[] = []) {
  const phones = new Map<string, Hit>(), names = new Map<string, Hit>();
  for (const o of others) {
    const hit = { where: o.where, tag: o.tag };
    for (const p of [o.phone, o.backup]) { const d = digits10(p); if (d.length === 10) phones.set(d, hit); }
    names.set(`${norm(o.first)}|${norm(o.last)}|${norm(o.company)}`, hit);
  }
  for (const c of contacts) {
    const hit = { where: `${c.first} ${c.last} (${c.list})`, tag: c.tag };
    for (const p of [c.phone, c.backup]) { const d = digits10(p); if (d.length === 10) phones.set(d, hit); }
    names.set(`${norm(c.first)}|${norm(c.last)}|${norm(c.company)}`, hit);
  }
  return { phones, names };
}

/** Drops a header row if the first row looks like one. */
export function dropHeader(rows: string[][]): string[][] {
  const h = (rows[0] ?? []).map(norm);
  return h[0] === 'first' || h[0] === 'firstname' || (h.includes('last') && h.includes('phone')) ? rows.slice(1) : rows;
}

/**
 * Plans an import without changing anything: each line gets a result ("Will import to Texas", "Skipped - duplicate of ...").
 * `hardcards` sends every contact to the Hardcards list (Job goes in as Union, Company as Beneficiary, like the sheet).
 */
export function planImport(rows: string[][], existing: Contact[], opts: { now: number; nextId: (i: number) => string; hardcards?: boolean; others?: OtherHolder[] }): ImportLine[] {
  const idx = buildIndex(existing, opts.others);
  const seqBy = new Map<string, number>();
  for (const c of existing) seqBy.set(c.list, Math.max(seqBy.get(c.list) ?? 0, c.seq));
  return dropHeader(rows).map((r, i): ImportLine => {
    const g = (k: number) => String(r[k] ?? '').trim();
    const first = g(0), last = g(1), name = `${first} ${last}`.trim();
    if (!first && !last) return { line: i + 1, name: '', result: 'Skipped - no name', ok: false };
    const st = parseState(g(6));
    if (!st) return { line: i + 1, name, result: `Skipped - unknown state "${g(6)}"`, ok: false };
    const phones = splitPhones(g(2)), backup = splitPhones(g(8));
    let notes = g(9);
    if (g(2) && !phones.length) notes = (notes ? notes + ' | ' : '') + 'Phone on list: ' + g(2);
    const key = `${norm(first)}|${norm(last)}|${norm(g(4))}`;
    let hit: Hit | undefined;
    for (const p of [...phones, ...backup]) { hit = idx.phones.get(digits10(p)); if (hit) break; }
    hit ??= idx.names.get(key);
    if (hit) {
      const k = tagKind(hit.tag);
      return { line: i + 1, name, ok: false,
        result: k === 'dnc' ? `Skipped - on the Do Not Call list (${hit.where})` : k === 'given' ? `Skipped - given to another agent (${hit.where})` : `Skipped - duplicate of ${hit.where}` };
    }
    const list = opts.hardcards ? 'Hardcards' : st.name;
    const seq = (seqBy.get(list) ?? 2) + 1; seqBy.set(list, seq);
    const contact: Contact = {
      id: opts.nextId(i), list, tag: '', dials: 0, first, last, phone: phones[0] ?? '', job: g(3), company: g(4), city: g(5), state: st.abbr,
      backup: phones[1] ?? backup[0] ?? '', notes, lastDialed: null, status: '', callAt: null, linkedin: g(7),
      zone: zoneFor({ city: g(5), state: st.abbr, phone: phones[0] ?? '', backup: phones[1] ?? backup[0] ?? '' }).zone || st.zone,
      newNumberMark: null, callbackTries: 0, noShowTries: 0, swapMemo: null, seq,
    };
    // already worked: result, dial count and times come along
    const res = g(10).toLowerCase();
    if (res in RESULTS) {
      contact.tag = RESULTS[res];
      contact.dials = Math.max(0, parseInt(g(11), 10) || 0);
      contact.lastDialed = contact.dials ? isoTime(g(12)) : null;
      contact.callAt = isoTime(g(13));
      if ((tagKind(contact.tag) === 'scheduled' || tagKind(contact.tag) === 'callback') && contact.callAt == null)
        return { line: i + 1, name, ok: false, result: `Skipped - ${tagShort(contact.tag)} needs a Call at time` };
    } else if (g(10)) return { line: i + 1, name, ok: false, result: `Skipped - unknown result "${g(10)}"` };
    const rec = { where: `${name} (this import)`, tag: '' };
    for (const p of [...phones, ...backup]) idx.phones.set(digits10(p), rec);
    idx.names.set(key, rec);
    return { line: i + 1, name, ok: true, contact,
      result: `Will import to ${list}${contact.phone ? '' : ' (no number yet: goes to Needs Number)'}${contact.dials ? ` · ${contact.tag ? tagShort(contact.tag) : 'No answer'}, ${contact.dials} dial${contact.dials === 1 ? '' : 's'}` : ''}` };
  });
}

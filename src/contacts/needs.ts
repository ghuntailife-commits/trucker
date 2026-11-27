// Needs Number: contacts without a number, contacts whose number went bad, and ones nobody could find a number for.
// Entries are tied to the contact's permanent ID, so a list that changes while someone types can't misplace them.
import type { Contact } from '../rules/types';
import { tagKind } from '../rules/tags';
import { addNote, knownBad } from '../rules/engine';
import { md } from '../rules/time';
import { buildIndex } from './importer';
import { digits10, splitPhones } from './phones';
import { withZone } from './zones';

export type NeedsGroup = 'needs' | 'newNumber' | 'cannotFind';

/** Which Needs Number list a contact belongs on, or null. */
export function needsGroup(c: Contact): NeedsGroup | null {
  if (c.status === 'Cannot Find') return 'cannotFind';
  if (tagKind(c.tag) === 'bad') return 'newNumber';
  const k = tagKind(c.tag);
  if (!c.phone.trim() && !c.backup.trim() && k !== 'dnc' && k !== 'given' && (c.first || c.last)) return 'needs';
  return null;
}

export interface NeedsEntry { id: string; phone: string; backup: string; note: string; cannotFind: boolean }
export interface NeedsPlanLine { id: string; name: string; ok: boolean; result: string; contact?: Contact }

/** Checks every typed entry and works out the change, without saving anything. */
export function planNeeds(entries: NeedsEntry[], contacts: Contact[], now: number, tz: string): NeedsPlanLine[] {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const idx = buildIndex(contacts);
  const taken = new Map<string, string>();      // numbers claimed earlier in this same batch
  return entries.map((e): NeedsPlanLine => {
    const c = byId.get(e.id);
    if (!c) return { id: e.id, name: '?', ok: false, result: 'That contact was deleted.' };
    const name = `${c.first} ${c.last}`;
    const group = needsGroup(c);
    if (!group) return { id: e.id, name, ok: false, result: 'Already has a number now. Nothing saved.' };
    const note = e.note.trim();
    if (e.cannotFind) {
      if (group === 'cannotFind') return { id: e.id, name, ok: false, result: 'Already on the Cannot Find list.' };
      const x = { ...c, status: 'Cannot Find' as const, notes: addNote(c.notes, `CANNOT FIND ${md(now, tz)}${note ? ' - ' + note : ''}`) };
      return { id: e.id, name, ok: true, contact: x, result: 'Mark Cannot Find' };
    }
    const phones = e.phone.trim() ? splitPhones(e.phone) : [], bk = e.backup.trim() ? splitPhones(e.backup) : [];
    const problems: string[] = [];
    if (e.phone.trim() && !phones.length) problems.push('main number is not 10 digits');
    if (e.backup.trim() && !bk.length) problems.push('backup is not 10 digits');
    const all = [...phones, ...bk];
    const bad = all.find(p => knownBad(c.notes, p));
    if (bad) return { id: e.id, name, ok: false, result: `${bad} was already marked a bad number for this contact.` };
    for (const p of all) {
      const d = digits10(p), hit = idx.phones.get(d), mine = digits10(c.phone) === d || digits10(c.backup) === d;
      if (hit && !mine) return { id: e.id, name, ok: false, result: `${p} is already on ${hit.where}.` };
      const t = taken.get(d);
      if (t && t !== c.id) return { id: e.id, name, ok: false, result: `${p} was also typed for another contact in this batch.` };
    }
    if (!phones.length && !bk.length && !note) return { id: e.id, name, ok: false, result: problems.join('; ') || 'Nothing typed.' };
    const x: Contact = { ...c };
    const did: string[] = [];
    if (phones.length) {
      x.phone = phones[0];
      if (phones[1] && !x.backup) x.backup = phones[1];
      if (group === 'newNumber') x.tag = '';
      x.status = '';
      x.newNumberMark = c.dials;                 // a new number gets priority for its next two dials
      did.push(group === 'newNumber' ? 'New number, back in the working lists' : 'Number saved, now in the working lists');
    }
    if (bk.length) { x.backup = bk[0]; did.push('backup saved'); }
    if (note && !c.notes.includes(note)) { x.notes = addNote(x.notes, note); did.push('note added'); }
    if (!x.phone && x.backup) { x.phone = x.backup; x.backup = ''; x.newNumberMark = c.dials; }
    for (const p of all) taken.set(digits10(p), c.id);
    const z = withZone(x);
    return { id: e.id, name, ok: true, contact: z, result: did.join(', ') + (problems.length ? ` (${problems.join('; ')})` : '') };
  });
}

/** Cannot Find back to Needs Number: only the status is cleared, notes stay. */
export function returnCannotFind(c: Contact): Contact {
  return c.status === 'Cannot Find' ? { ...c, status: '' } : c;
}


// ---------- CSV out and back in (George, 2026-11-26) ----------
// Export the contacts you want numbers for, have them filled in anywhere, import the file back:
// numbers land in the Needs Number boxes for the usual review and save. Nothing is saved by the import itself.

export const NEEDS_CSV_HEAD = ['Dispatch ID', 'First', 'Last', 'Company', 'Job', 'City', 'State', 'LinkedIn', 'List', 'Phone', 'Backup', 'Note'];

export function needsCsvRows(cs: Contact[]): string[][] {
  return [NEEDS_CSV_HEAD, ...cs.map(c => [c.id, c.first, c.last, c.company, c.job, c.city, c.state, c.linkedin, c.list, '', '', ''])];
}

const hk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (head: string[], ...names: string[]) => head.findIndex(h => names.includes(hk(h)));

export interface NeedsCsvMatch { entries: NeedsEntry[]; matched: number; noNumber: number; unmatched: string[] }

/**
 * Reads a filled-in file back. Rows match their contact by Dispatch ID, or else by first + last name (+ company when
 * it's there). Only contacts still on Needs Number are filled; rows with no number are counted, not used.
 */
export function matchNeedsCsv(rows: string[][], waiting: Contact[]): NeedsCsvMatch {
  const head = rows[0] ?? [];
  const col = { id: pick(head, 'dispatchid', 'id'), first: pick(head, 'first', 'firstname'), last: pick(head, 'last', 'lastname'), co: pick(head, 'company', 'employer'),
    phone: pick(head, 'phone', 'phonenumber', 'number', 'mobile', 'cell', 'newnumber'), backup: pick(head, 'backup', 'backupphone', 'phone2'), note: pick(head, 'note', 'notes', 'source', 'wherefound') };
  const byId = new Map(waiting.map(c => [c.id, c]));
  const byName = new Map<string, Contact[]>();
  for (const c of waiting) { const k = `${hk(c.first)}|${hk(c.last)}`; byName.set(k, [...(byName.get(k) ?? []), c]); }
  const out: NeedsCsvMatch = { entries: [], matched: 0, noNumber: 0, unmatched: [] };
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const g = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    const name = `${g(col.first)} ${g(col.last)}`.trim();
    let c = byId.get(g(col.id));
    if (!c) { const list = byName.get(`${hk(g(col.first))}|${hk(g(col.last))}`) ?? []; c = list.length === 1 ? list[0] : list.find(x => g(col.co) && hk(x.company) === hk(g(col.co))); }
    if (!c) { if (name) out.unmatched.push(name); continue; }
    if (seen.has(c.id)) continue;
    const phone = g(col.phone), backup = g(col.backup);
    if (!phone && !backup) { out.noNumber++; continue; }
    seen.add(c.id);
    out.entries.push({ id: c.id, phone, backup, note: g(col.note) || 'From CSV', cannotFind: false });
    out.matched++;
  }
  return out;
}

/** The Needs Number search: name, company, job, city, state or list. */
export function needsSearch(c: Contact, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${c.first} ${c.last} ${c.company} ${c.job} ${c.city} ${c.state} ${c.list}`.toLowerCase();
  return words.every(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay));
}

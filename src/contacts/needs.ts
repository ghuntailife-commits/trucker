// Needs Number: contacts without a number, contacts whose number went bad, and ones nobody could find a number for.
// Entries are tied to the contact's permanent ID, so a list that changes while someone types can't misplace them.
import type { Contact } from '../rules/types';
import { tagKind } from '../rules/tags';
import { addNote, knownBad } from '../rules/engine';
import { md } from '../rules/time';
import { buildIndex } from './importer';
import { digits10, splitPhones } from './phones';

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
    return { id: e.id, name, ok: true, contact: x, result: did.join(', ') + (problems.length ? ` (${problems.join('; ')})` : '') };
  });
}

/** Cannot Find back to Needs Number: only the status is cleared, notes stay. */
export function returnCannotFind(c: Contact): Contact {
  return c.status === 'Cannot Find' ? { ...c, status: '' } : c;
}


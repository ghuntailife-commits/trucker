// Moving contacts from one agent to another (George, 2026-11-26). The admin opens an agent's contacts, ticks some
// (or a shift-click range), picks who gets them, reviews, and moves. History, notes and tags go with the contact.
import type { Contact } from '../rules/types';
import { digits10, norm } from '../contacts/phones';
import { parseState } from '../contacts/states';
import { md } from '../rules/time';
import { addNote } from '../rules/engine';

export interface MoveLine { id: string; name: string; ok: boolean; result: string; contact?: Contact }
const licensedIn = (states: string[], st: string) => { const n = parseState(st)?.name; return !!n && states.includes(n); };

export function planTransfer(picked: Contact[], from: { name: string }, to: { name: string; states: string[] }, theirs: Contact[],
  opts: { now: number; tz: string; nextId: (i: number) => string }): MoveLine[] {
  const phones = new Set<string>(), names = new Set<string>(), seq = new Map<string, number>();
  for (const c of theirs) {
    for (const p of [c.phone, c.backup]) { const d = digits10(p); if (d.length === 10) phones.add(d); }
    names.add(`${norm(c.first)}|${norm(c.last)}|${norm(c.company)}`);
    seq.set(c.list, Math.max(seq.get(c.list) ?? 0, c.seq));
  }
  return picked.map((c, i): MoveLine => {
    const name = `${c.first} ${c.last}`.trim();
    if (!licensedIn(to.states, c.state)) return { id: c.id, name, ok: false, result: `Skipped - ${to.name} is not licensed in ${parseState(c.state)?.name ?? (c.state || 'that state')}` };
    const dup = [c.phone, c.backup].some(p => { const d = digits10(p); return d.length === 10 && phones.has(d); }) || names.has(`${norm(c.first)}|${norm(c.last)}|${norm(c.company)}`);
    if (dup) return { id: c.id, name, ok: false, result: `Skipped - ${to.name} already has this contact` };
    const s = (seq.get(c.list) ?? 2) + 1; seq.set(c.list, s);
    const note = `${md(opts.now, opts.tz)}: Moved from ${from.name} to ${to.name}`;
    return { id: c.id, name, ok: true, result: `Will move to ${to.name}${c.tag ? ' (tag and history go with it)' : ''}`,
      contact: { ...c, id: opts.nextId(i), seq: s, notes: addNote(c.notes, note) } };
  });
}

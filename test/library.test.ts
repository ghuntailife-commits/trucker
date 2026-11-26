// The contact library and sending contacts to agents. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { applyHandout, fromSheet, givenCounts, licensed, parseDay, planHandout, stateCounts, undoHandout, type LibraryContact, type LibraryState } from '../src/library/library';

const lib = (over: Partial<LibraryContact>): LibraryContact => ({ id: 'L' + Math.random().toString(36).slice(2, 8), first: 'Avery', last: 'Test', phone: '(214) 555-0150',
  job: 'Driver', company: 'Acme Freight', city: 'Dallas', state: 'TX', linkedin: '', backup: '', notes: '', givenTo: '', givenAt: null, ...over });
const sam = { id: 'sam', name: 'Sam', states: ['Texas', 'Florida'] };

describe('contact library', () => {
  it('reads a Lead Library tab, with or without a header, and keeps Given to as written', () => {
    const rows = [['First Name', 'Last Name', 'Phone', 'Job Title', 'Company', 'City', 'State', 'LinkedIn URL', 'Backup Number', 'Notes', 'Given to', 'Date given'],
      ['Avery', 'Test', '214-555-0101', 'Driver', 'Acme', 'Dallas', 'Texas', '', '', '', 'Marshall', '11/20/2026'],
      ['Blake', 'Test', '', 'Driver', 'Acme', 'Austin', '', '', '', '', '', '']];
    const got = fromSheet('TX', rows, i => 'x' + i, TZ);
    expect(got.map(c => [c.first, c.state, c.givenTo])).toEqual([['Avery', 'TX', 'Marshall'], ['Blake', 'TX', '']]);
    expect(got[0].givenAt).toBe(et(20, 12));
    expect(fromSheet('WV', rows.slice(1), i => 'x' + i, TZ)).toHaveLength(2);
    expect(parseDay('nope')).toBeNull();
  });

  it('checks licensed states by name or abbreviation', () => {
    expect(licensed(['Texas', 'Florida'], 'TX')).toBe(true);
    expect(licensed(['Texas'], 'PA')).toBe(false);
  });

  it('counts what is left per state and who has what', () => {
    const l = [lib({ state: 'TX' }), lib({ state: 'TX', givenTo: 'Sam' }), lib({ state: 'PA', givenTo: 'sam' }), lib({ state: 'PA' }), lib({ state: 'PA' })];
    expect(stateCounts(l).map(s => [s.state, s.open, s.total])).toEqual([['PA', 2, 3], ['TX', 1, 2]]);
    expect(givenCounts(l)).toEqual([{ name: 'Sam', n: 2 }]);
  });

  it('only sends contacts that are free, in a licensed state, and not duplicates', () => {
    const a = lib({ first: 'Avery' }), b = lib({ first: 'Blake', state: 'PA', city: 'Erie' }), c = lib({ first: 'Casey', givenTo: 'Marshall' });
    const d = lib({ first: 'Drew', phone: '(214) 555-0177' }), e = lib({ first: 'Emery', phone: '', state: 'FL', city: 'Tampa' });
    const theirs = [contact({ first: 'Other', phone: '(214) 555-0177' })];
    const plan = planHandout([a.id, b.id, c.id, d.id, e.id], [a, b, c, d, e], sam, theirs, { now: et(26, 12), nextId: i => 'new' + i });
    expect(plan.map(l => [l.name.split(' ')[0], l.ok])).toEqual([['Avery', true], ['Blake', false], ['Casey', false], ['Drew', false], ['Emery', true]]);
    expect(plan[1].result).toBe('Skipped - Sam is not licensed in Pennsylvania');
    expect(plan[2].result).toBe('Skipped - already given to Marshall');
    expect(plan[3].result).toMatch(/^Skipped - duplicate of Other Person/);
    expect(plan[0].result).toBe('Will add to Texas');
    expect(plan[4].result).toBe('Will add to Florida (no number yet: goes to Needs Number)');
    expect(plan[4].contact).toMatchObject({ first: 'Emery', list: 'Florida', state: 'FL', zone: 'ET' });
  });

  it('marks them given, and undo brings back only the ones not worked yet', () => {
    const a = lib({ first: 'Avery' }), b = lib({ first: 'Blake', phone: '(214) 555-0161' });
    const st: LibraryState = { v: 1, contacts: [a, b], handouts: [] };
    const plan = planHandout([a.id, b.id], st.contacts, sam, [], { now: et(26, 12), nextId: i => 'n' + i });
    const r = applyHandout(st, plan, sam, et(26, 12), 'h1');
    expect(r.state.contacts.map(c => [c.givenTo, c.givenAt])).toEqual([['Sam', et(26, 12)], ['Sam', et(26, 12)]]);
    expect(r.added.map(c => c.id)).toEqual(['n0', 'n1']);
    const worked = { ...r.added[1], dials: 1, tag: 'NO ANSWER' };
    const u = undoHandout(r.state, 'h1', [r.added[0], worked], et(26, 13));
    expect(u.remove).toEqual(['n0']);
    expect(u.kept).toEqual(['Blake Test']);
    expect(u.state.contacts.map(c => c.givenTo)).toEqual(['', 'Sam']);
    expect(u.state.handouts[0].undoneAt).toBe(et(26, 13));
    expect(undoHandout(u.state, 'h1', [], et(26, 14)).remove).toEqual([]);
  });
});

// Shift-click ranges and moving contacts between agents. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { rangePick } from '../src/contacts/rangePick';
import { planTransfer } from '../src/library/transfer';

describe('shift-click range', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  it('ticks everything between the last click and a shift-click, in either direction', () => {
    expect([...rangePick(new Set(['b']), order, 'b', 'e', true, true)].sort()).toEqual(['b', 'c', 'd', 'e']);
    expect([...rangePick(new Set(['e']), order, 'e', 'b', true, true)].sort()).toEqual(['b', 'c', 'd', 'e']);
  });
  it('unticks a range, passes over rows that cannot be picked, and acts normally without shift', () => {
    expect([...rangePick(new Set(order), order, 'b', 'd', false, true)].sort()).toEqual(['a', 'e', 'f']);
    expect([...rangePick(new Set(['a']), order, 'a', 'd', true, true, id => id !== 'c')].sort()).toEqual(['a', 'b', 'd']);
    expect([...rangePick(new Set(['a']), order, 'a', 'd', true, false)].sort()).toEqual(['a', 'd']);
  });
});

describe('move contacts between agents', () => {
  it('moves licensed contacts with their history, skips duplicates and unlicensed states', () => {
    const a = contact({ id: 'a', first: 'Avery', last: 'Test', state: 'TX', list: 'Texas', phone: '2145550150', dials: 2, tag: '', seq: 4 });
    const b = contact({ id: 'b', first: 'Blake', last: 'Sample', state: 'OH', list: 'Ohio', phone: '6145550151' });
    const c = contact({ id: 'c', first: 'Casey', last: 'Demo', state: 'TX', list: 'Texas', phone: '2145550152' });
    const theirs = [contact({ id: 'z', first: 'Other', last: 'Person', state: 'TX', list: 'Texas', phone: '2145550152', seq: 9 })];
    const out = planTransfer([a, b, c], { name: 'Lee' }, { name: 'Sam', states: ['Texas'] }, theirs, { now: et(26, 12), tz: TZ, nextId: i => 'n' + i });
    expect(out[0].ok).toBe(true); expect(out[0].contact!.id).toBe('n0'); expect(out[0].contact!.dials).toBe(2); expect(out[0].contact!.seq).toBe(10);
    expect(out[0].contact!.notes).toContain('Moved from Lee to Sam');
    expect(out[1]).toMatchObject({ ok: false, result: 'Skipped - Sam is not licensed in Ohio' });
    expect(out[2]).toMatchObject({ ok: false, result: 'Skipped - Sam already has this contact' });
  });
});

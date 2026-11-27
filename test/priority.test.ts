import { describe, it, expect } from 'vitest';
import { bestFirst, companyKey } from '../src/contacts/priority';
import { sortRows } from '../src/contacts/sortRows';
import type { Contact } from '../src/rules/types';

const mk = (id: string, p: Partial<Contact> = {}): Contact => ({ id, list: 'Texas', tag: '', dials: 0, first: 'Pat', last: id, phone: '', job: 'Driver', company: 'Acme Freight',
  city: 'Austin', state: 'TX', backup: '', notes: '', lastDialed: null, status: '' as never, callAt: null, linkedin: '', zone: 'CT', newNumberMark: null,
  callbackTries: 0, noShowTries: 0, swapMemo: null, seq: 0, ...p });

describe('Needs Number best first', () => {
  const base = { log: [], sales: [], noSales: [], contacts: [] as Contact[] };
  it('puts unlicensed states last and people you talked to first', () => {
    const a = mk('a'), b = mk('b', { state: 'OH' }), c = mk('c');
    const log = [{ at: 1, contactId: 'c', reach: true } as never];
    const out = bestFirst([a, b, c], { ...base, states: ['TX'], log, contacts: [a, b, c] }).map(x => x.c.id);
    expect(out).toEqual(['c', 'a', 'b']);
  });
  it('lifts companies that bought before', () => {
    const a = mk('a', { company: 'Made Up Logistics' }), b = mk('b', { company: 'Sample Trucking Co' }), sold = mk('s', { company: 'Sample Trucking' });
    const sales = [{ at: 1, contactId: 's' } as never];
    const out = bestFirst([a, b], { ...base, states: [], sales, contacts: [a, b, sold] });
    expect(out[0].c.id).toBe('b');
    expect(out[0].p.why.join()).toMatch(/1 sale/);
  });
  it('reads company names loosely', () => expect(companyKey('The UPS, Inc.')).toBe(companyKey('ups')));
});

describe('column sorting', () => {
  it('sorts numbers and words, blanks last either way', () => {
    const rows = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }];
    expect(sortRows(rows, r => r.v, 1).map(r => r.v)).toEqual([1, 3, 10, null]);
    expect(sortRows(rows, r => r.v, -1).map(r => r.v)).toEqual([10, 3, 1, null]);
    expect(sortRows([{ v: 'b' }, { v: 'A' }, { v: '' }], r => r.v, 1).map(r => r.v)).toEqual(['A', 'b', '']);
  });
});

describe('mixing companies', () => {
  it('lets a second company in before the first one repeats too much', async () => {
    const { mixOrder } = await import('../src/contacts/priority');
    const items = [{ id: 'a1', co: 'A', s: 80 }, { id: 'a2', co: 'A', s: 80 }, { id: 'a3', co: 'A', s: 80 }, { id: 'b1', co: 'B', s: 85 }, { id: 'c1', co: 'C', s: 60 }];
    expect(mixOrder(items, x => x.s, x => x.co).map(x => x.id)).toEqual(['b1', 'a1', 'a2', 'a3', 'c1']);
  });
  it('never drops a strong contact below a weaker tier', async () => {
    const { mixOrder } = await import('../src/contacts/priority');
    const items = [...Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, co: 'UPS', s: 90 })), ...Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, co: `Co${i}`, s: 70 }))];
    const out = mixOrder(items, x => x.s, x => x.co).map(x => x.id);
    expect(out.slice(0, 50).every(id => id.startsWith('u'))).toBe(true);
  });
});

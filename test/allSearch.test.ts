// Admin search across every agent (George, 2026-11-27). Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { searchAll, type SlimContact } from '../src/admin/allSearch';

const r = (a: string, n: string, p: string, over: Partial<SlimContact> = {}): SlimContact => ({ a, id: a + n, n, p, b: '', co: 'Acme Freight', j: 'Driver',
  ci: 'Dallas', st: 'TX', l: 'Texas', t: '', d: 0, ld: null, ca: null, ...over });
const rows = [r('austin', 'Avery Test', '(214) 555-0150'), r('gracie', 'Blake Sample', '(615) 555-0199', { b: '(615) 555-0100', ci: 'Nashville', st: 'TN', l: 'Tennessee' }),
  r('george', 'Casey Example', '(512) 555-0142', { co: 'UPS', e: 'casey@example.com' })];

describe('search every agent', () => {
  it('finds by name across agents', () => { expect(searchAll(rows, 'blake').hits.map(x => x.a)).toEqual(['gracie']); });
  it('finds by main or backup number', () => {
    expect(searchAll(rows, '555-0142').hits[0].n).toBe('Casey Example');
    expect(searchAll(rows, '6155550100').hits[0].n).toBe('Blake Sample');
  });
  it('every word must match (name + place, company, email)', () => {
    expect(searchAll(rows, 'acme nashville').hits.map(x => x.n)).toEqual(['Blake Sample']);
    expect(searchAll(rows, 'casey@example.com').total).toBe(1);
  });
  it('can be narrowed to one agent, and needs 2 letters or 4 digits', () => {
    expect(searchAll(rows, 'acme', 'austin').total).toBe(1);
    expect(searchAll(rows, '55').total).toBe(0);
  });
});

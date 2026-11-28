// Local match for texts (George, 2026-11-27). Made-up numbers; area codes only matter.
import { describe, expect, it } from 'vitest';
import { lineIn, pickFrom } from '../src/quo/localMatch';

const mine = ['+17865550100', '+16155550101', '+15155550102'];   // FL (Miami), TN (Nashville), IA
describe('local match', () => {
  it('same state first', () => { expect(pickFrom(mine, '(931) 555-0199').from).toBe('+16155550101'); });
  it('then same time zone', () => { expect(pickFrom(mine, '(214) 555-0199').from).toBe('+16155550101'); }); // TX is CT like Nashville
  it('then the main number', () => { expect(pickFrom(mine, '(206) 555-0199').from).toBe('+17865550100'); });
  it('an ongoing conversation keeps its line', () => {
    expect(pickFrom(mine, '(931) 555-0199', '+1 (515) 555-0102').from).toBe('+15155550102');
    expect(lineIn({ data: { object: { from: '+19315550199', to: ['+15155550102'] } } }, mine)).toBe('+15155550102');
  });
});

describe('pickFrom: exact area code first', () => {
  it('prefers a number with the same area code over another in the same state', () => {
    const r = pickFrom(['+13055550100', '+17865550100'], '(786) 555-0199');
    expect(r.from).toBe('+17865550100');
    expect(r.why).toContain('786');
  });
});

describe('pickFrom: daily limit per number', () => {
  const pool = ['+17865550100', '+16155550101', '+16155550102', '+15155550103'];
  it('spreads calls over numbers in the same state, least used first', () => {
    expect(pickFrom(pool, '615-555-0199', null, { used: { '6155550101': 40, '6155550102': 10 }, cap: 100 }).from).toBe('+16155550102');
  });
  it('a number at the limit rests; the next-best takes the call', () => {
    const r = pickFrom(pool, '515-555-0199', null, { used: { '5155550103': 100 }, cap: 100 });
    expect(r.from).not.toBe('+15155550103');
  });
  it('if every number is at the limit it still calls', () => {
    const used = Object.fromEntries(pool.map(p => [p.slice(-10), 200]));
    expect(pickFrom(pool, '515-555-0199', null, { used, cap: 100 }).from).toBe('+15155550103');
  });
});

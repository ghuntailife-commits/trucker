// Get local numbers planner (George, 2026-11-27). Made-up numbers; only area codes matter.
import { describe, expect, it } from 'vitest';
import { exactShare, planNumbers } from '../src/twilio/plan';

const phones = [
  '615-555-0101', '615-555-0102', '615-555-0103', '901-555-0104',   // TN: 615 busiest
  '214-555-0105', '214-555-0106', '713-555-0107',                   // TX: 214 busiest
  '786-555-0108',                                                   // FL: already owned
  '555-0109', '000-555-0110',                                       // bad numbers are skipped
];

describe('planNumbers', () => {
  it('suggests one number per state without one, in its busiest area code, busiest state first', () => {
    const p = planNumbers(phones, ['+17863848908'], 0);
    expect(p.states.map(s => `${s.state}:${s.areaCode}`)).toEqual(['TN:615', 'TX:214']);
    expect(p.total).toBe(8);
    expect(p.coveredByState).toBe(8);
  });
  it('adds the busiest other area codes, skipping owned and state picks', () => {
    const p = planNumbers(phones, ['+17863848908'], 5);
    expect(p.areas.map(a => a.areaCode).sort()).toEqual(['713', '901']);
  });
  it('owning a number in a state means no state pick there', () => {
    const p = planNumbers(phones, ['+16155550000'], 0);
    expect(p.states.map(s => s.state)).toEqual(['TX', 'FL']);
  });
  it('exactShare counts contacts whose area code would match', () => {
    const p = planNumbers(phones, ['+17863848908'], 0);
    expect(exactShare(phones, ['+17863848908'], p.states)).toBeCloseTo(6 / 8);
  });
});

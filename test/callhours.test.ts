// Calling hours in the contact's own time zone (George, 2026-11-26). Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et } from './helpers';
import { buildToday } from '../src/rules/today';
import { DEFAULT_CONFIG, V27_CONFIG } from '../src/rules/config';

const names = (now: number, cs = people(), cfg = DEFAULT_CONFIG) => buildToday(cs, { now, snap: now - 3_600_000, savedOrder: [] }, cfg).map(r => r.contact.first).sort();
const people = () => [contact({ first: 'East', zone: 'ET', state: 'GA' }), contact({ first: 'Central', zone: 'CT', state: 'TX' }),
  contact({ first: 'Mountain', zone: 'MT', state: 'CO' }), contact({ first: 'Arizona', zone: 'MT', state: 'AZ' }),
  contact({ first: 'Pacific', zone: 'PT', state: 'CA' }), contact({ first: 'Unknown', zone: '', state: '' })];

describe('calling hours', () => {
  it('after 9 PM Eastern, only states where it is still before 9 PM', () => {
    expect(names(et(26, 21, 30))).toEqual(['Arizona', 'Central', 'Mountain', 'Pacific']);
    expect(names(et(26, 22, 30))).toEqual(['Arizona', 'Mountain', 'Pacific']);
    // Arizona has no daylight saving: in November it is two hours behind Eastern, like Denver
    expect(names(et(26, 23, 30))).toEqual(['Pacific']);
  });
  it('before 8 AM their time they wait', () => {
    expect(names(et(26, 9, 30))).toEqual(['Central', 'East', 'Unknown']);
    expect(names(et(26, 11, 30))).toEqual(['Arizona', 'Central', 'East', 'Mountain', 'Pacific', 'Unknown']);
  });
  it('v27 had no calling hours', () => {
    expect(names(et(26, 22, 30), people(), V27_CONFIG)).toHaveLength(6);
  });
});

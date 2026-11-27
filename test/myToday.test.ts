// My Today (George, 2026-11-27): more than 200, companies first.
import { describe, expect, it } from 'vitest';
import { contact, et } from './helpers';
import { buildToday } from '../src/rules/today';
import { DEFAULT_CONFIG } from '../src/rules/config';

describe('my Today', () => {
  const ctx = { now: et(27, 10), snap: et(27, 8), savedOrder: [] };
  const many = Array.from({ length: 320 }, (_, i) => contact({ id: `c${i}`, seq: i, company: i % 2 ? 'UPS' : 'Acme Freight', phone: `555555${String(1000 + i).slice(-4)}` }));
  it('goes past 200 when the agent asks', () => {
    expect(buildToday(many, ctx, { ...DEFAULT_CONFIG, listSize: 300 })).toHaveLength(300);
  });
  it('puts the chosen companies first among fresh contacts', () => {
    const rows = buildToday(many, ctx, { ...DEFAULT_CONFIG, listSize: 50, focusCompanies: ['acme'] });
    expect(rows.slice(0, 20).every(r => r.contact.company === 'Acme Freight')).toBe(true);
  });
});

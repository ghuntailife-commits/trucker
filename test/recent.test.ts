// Home's Recent feed (George, 2026-11-27). Made-up contacts.
import { describe, expect, it } from 'vitest';
import { recentEvents, ago } from '../src/home/recent';
import { TAGS } from '../src/rules/tags';
import type { Contact, LogEvent } from '../src/rules/types';

const now = Date.UTC(2026, 10, 27, 20);
const c = (id: string, addedAt: number | null, list = 'Ohio') => ({ id, first: 'Sam', last: 'Test' + id, list, addedAt } as unknown as Contact);
const ev = (at: number, id: string, tag: string): LogEvent => ({ at, contactId: id, list: 'Ohio', first: 'Sam', last: 'Test', phone: '', kind: 'Tag', count: 1, tag, dials: 1 });

describe('recent feed', () => {
  it('groups a delivery into one line', () => {
    const cs = [...Array.from({ length: 11 }, (_, i) => c(`a${i}`, now - 3_600_000 + i * 1000)), c('old', null), c('b', now - 3 * 86_400_000, 'Texas')];
    const r = recentEvents(cs, [], [], now);
    expect(r.map(x => x.text)).toEqual(['11 new contacts delivered!', '1 new contact delivered!']);
    expect(r[0].sub).toBe('Ohio');
  });
  it('groups bookings by day and lists sales', () => {
    const log = [ev(now - 60_000, 'x', TAGS.scheduled), ev(now - 120_000, 'y', TAGS.scheduled), ev(now - 2 * 86_400_000, 'z', TAGS.scheduled)];
    const r = recentEvents([], log, [{ at: now - 30_000, contactId: 'q', alp: 1200 }], now);
    expect(r.map(x => x.text)).toEqual(['Sale! a contact · $1,200', '2 appointments booked', 'Appointment booked with Sam T.']);
  });
  it('says how long ago', () => {
    expect(ago(now - 30 * 60_000, now, 'America/New_York')).toBe('30m ago');
    expect(ago(now - 26 * 3_600_000, now, 'America/New_York')).toBe('Yesterday');
  });
});

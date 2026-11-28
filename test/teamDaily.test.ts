// Team daily history (George, 2026-11-27). Made-up contacts.
import { describe, expect, it } from 'vitest';
import { dayStats, liveState, spanHours } from '../src/team/daily';
import type { LogEvent } from '../src/rules/types';

const ev = (at: number, kind: string, extra: Partial<LogEvent> = {}): LogEvent =>
  ({ at, contactId: 'c1', list: '', first: 'Sam', last: 'Sample', phone: '', kind, count: 1, tag: '', dials: 1, ...extra } as LogEvent);
const H = 3_600_000, day = Date.UTC(2026, 10, 27, 5);   // midnight ET

describe('dayStats', () => {
  it('counts the day only, with the first and last dial', () => {
    const log = [ev(day - H, 'Dial'), ev(day + 10 * H, 'Dial'), ev(day + 12.5 * H, 'Dial', { count: 2 })];
    const s = dayStats(log, [{ at: day + 13 * H, alp: 900 } as never], day, day + 24 * H);
    expect(s.dials).toBe(3); expect(s.alp).toBe(900); expect(s.sold).toBe(1);
    expect(s.first).toBe(day + 10 * H); expect(s.last).toBe(day + 12.5 * H);
    expect(spanHours(s)).toBe('2.5 h');
  });
  it('live state', () => {
    const s = dayStats([ev(day + 10 * H, 'Dial')], [], day, day + 24 * H);
    expect(liveState(s, day + 10 * H + 5 * 60_000)).toBe('dialing');
    expect(liveState(s, day + 11 * H)).toBe('break');
    expect(liveState(dayStats([], [], day, day + 24 * H), day)).toBe('none');
    expect(spanHours(s)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { addEvent, moveEvent, removeEvent, eventsBetween } from '../src/calendar/myEvents';
import { lanes } from '../src/calendar/grid';

describe('my own calendar events', () => {
  it('adds, moves and removes, kept in time order', () => {
    let l = addEvent([], { title: ' Lunch ', start: 2000, mins: 60 }, 'a');
    l = addEvent(l, { title: '', start: 1000, mins: 30 }, 'b');
    expect(l.map(e => [e.id, e.title])).toEqual([['b', 'Busy'], ['a', 'Lunch']]);
    l = moveEvent(l, 'b', 5000); expect(l.map(e => e.id)).toEqual(['a', 'b']);
    expect(removeEvent(l, 'a').map(e => e.id)).toEqual(['b']);
  });
  it('finds events touching a range', () => {
    const l = addEvent([], { title: 'x', start: 0, mins: 60 }, 'a');
    expect(eventsBetween(l, 30 * 60_000, 90 * 60_000).length).toBe(1); expect(eventsBetween(l, 60 * 60_000, 99 * 60_000).length).toBe(0);
  });
  it('lays a long event beside the half hours it covers', () => {
    const m = lanes([{ key: 'e', start: 0, len: 2 * 3_600_000 }, { key: 'a', start: 3_600_000 }]);
    expect(m.get('e')).toEqual({ lane: 0, of: 2 }); expect(m.get('a')).toEqual({ lane: 1, of: 2 });
  });
});

import { occurrencesBetween, skipOne } from '../src/calendar/myEvents';
import { nextOpenings, DEFAULT_HOURS } from '../src/calendar/grid';
import { zoned, startOfDay, parts } from '../src/rules/time';
describe('repeating events and openings', () => {
  const tz = 'America/New_York';
  const mon = zoned(2026, 11, 23, 9, 0, tz);            // Monday 11/23 9:00 AM ET
  const week = [mon - 9 * 3_600_000, zoned(2026, 11, 30, 0, 0, tz)];
  it('expands weekly, weekdays and daily, and skips deleted ones', () => {
    const l = [{ id: 'w', title: 'Team call', start: zoned(2026, 11, 2, 9, 0, tz), mins: 60, repeat: 'weekly' as const },
      { id: 'd', title: 'Lunch', start: zoned(2026, 11, 20, 12, 0, tz), mins: 30, repeat: 'weekdays' as const }];
    const o = occurrencesBetween(l, week[0], week[1], tz);
    expect(o.filter(x => x.seriesId === 'w').map(x => x.start)).toEqual([mon]);
    expect(o.filter(x => x.seriesId === 'd')).toHaveLength(5);
    const tue = zoned(2026, 11, 24, 12, 0, tz);
    expect(occurrencesBetween(skipOne(l, 'd', tue), week[0], week[1], tz).filter(x => x.seriesId === 'd')).toHaveLength(4);
    expect(o.find(x => x.seriesId === 'd')!.id).toBe(`d@${zoned(2026, 11, 23, 12, 0, tz)}`);
  });
  it('keeps the same clock time across the daylight saving change', () => {
    const l = [{ id: 'x', title: 'x', start: zoned(2026, 10, 26, 9, 0, tz), mins: 30, repeat: 'weekly' as const }];
    const o = occurrencesBetween(l, zoned(2026, 11, 2, 0, 0, tz), zoned(2026, 11, 3, 0, 0, tz), tz);
    expect(parts(o[0].start, tz).h).toBe(9);
  });
  it('finds the next open half hours inside working hours', () => {
    const now = zoned(2026, 11, 27, 19, 10, tz);         // Fri 7:10 PM
    const got = nextOpenings(3, now, DEFAULT_HOURS, [zoned(2026, 11, 28, 9, 0, tz)], [{ start: zoned(2026, 11, 28, 9, 30, tz), len: 3_600_000 }],
      t => startOfDay(t, tz), t => parts(t, tz).wd);
    expect(got).toEqual([zoned(2026, 11, 27, 19, 30, tz), zoned(2026, 11, 28, 10, 30, tz), zoned(2026, 11, 28, 11, 0, tz)]);
  });
});

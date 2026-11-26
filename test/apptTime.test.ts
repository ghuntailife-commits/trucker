// Results sit at the appointment time, not when they were recorded. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { apptFor, calendarItems } from '../src/calendar/events';
import { TAGS } from '../src/rules/tags';

describe('appointment times on the calendar', () => {
  const c = contact({ first: 'Quinn', tag: TAGS.noshow,
    notes: '11/11: Scheduled Fri 11/13 11:00 AM | 11/13: No-showed (appt 11/13 11:00 AM) | 11/20: Scheduled Sat 11/21 2:00 PM | 11/21: No-showed (appt 11/21 2:00 PM)' });
  it('finds the appointment a result belongs to', () => {
    expect(apptFor(c, et(23, 9, 21), TZ)).toBe(et(21, 14));
    expect(apptFor(c, et(13, 15, 12), TZ)).toBe(et(13, 11));
    expect(apptFor(contact({ notes: '' }), et(23, 9), TZ)).toBeNull();
  });
  it('a no-show recorded two days late shows at 2:00 PM on the day of the appointment', () => {
    const log = [{ at: et(23, 9, 21), contactId: c.id, kind: 'Tag', tag: TAGS.noshow } as never];
    const items = calendarItems([c], [], [], log, et(16, 0), et(30, 0), et(26, 18), TZ);
    expect(items.filter(x => x.kind === 'noshow').map(x => x.at)).toEqual([et(21, 14)]);
  });
});

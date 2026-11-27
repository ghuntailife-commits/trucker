// Sheet catch-up (George, 2026-11-27): bring an agent's sheet work into Dispatch without undoing Dispatch work. Made-up contacts.
import { describe, expect, it } from 'vitest';
import { contact, et } from './helpers';
import { catchUp } from '../src/migrate/catchUp';
import type { Contact, LogEvent } from '../src/rules/types';

const evOf = (c: Contact, at: number, tag: string): LogEvent => ({ at, contactId: c.id, list: c.list, first: c.first, last: c.last, phone: c.phone, tag, kind: 'Dial' } as unknown as LogEvent);
const data = (contacts: Contact[], log: LogEvent[] = []) => ({ contacts, log, sales: [], noSales: [] });

describe('catch up from the sheet', () => {
  const since = et(27, 12);
  const before = et(26, 15);
  it('copies the sheet result for contacts worked since, and leaves the rest alone', () => {
    const a = contact({ first: 'Ann', last: 'Example', dials: 2, lastDialed: before, notes: '11/26: No answer' });
    const b = contact({ first: 'Ben', last: 'Sample', dials: 1, lastDialed: before });
    const aSheet = { ...a, tag: 'CALL BACK', dials: 3, lastDialed: since + 3_600_000, callAt: since + 86_400_000, notes: '11/26: No answer | 11/27: Call back tomorrow' };
    const r = catchUp(data([a, b]), data([aSheet, b], [evOf(aSheet, since + 3_600_000, 'CALL BACK')]), since);
    expect(r.touched).toBe(1);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]).toMatchObject({ id: a.id, tag: 'CALL BACK', dials: 3, callAt: since + 86_400_000 });
    expect(r.changed[0].notes).toContain('Call back tomorrow');
    expect(r.changed[0].notes.match(/11\/26: No answer/g)).toHaveLength(1);
    expect(r.events).toHaveLength(1);
  });
  it('keeps Dispatch when Dispatch dialed later, and matches by phone when ids differ', () => {
    const a = contact({ first: 'Cal', last: 'Demo', lastDialed: since + 7_200_000, tag: 'APPT' });
    const b = contact({ id: 'Texas|9', first: 'Dee', last: 'Mock', phone: '(214) 555-0199' });
    const aSheet = { ...a, tag: 'NO ANSWER', lastDialed: since + 3_600_000 };
    const bSheet = { ...b, id: 'Texas|40', first: 'Dee', last: 'Mock', lastDialed: since + 60_000, tag: 'VM', dials: 1 };
    const stranger = contact({ first: 'Eve', last: 'Nobody', phone: '(214) 555-0777', lastDialed: since + 1 });
    const r = catchUp(data([a, b]), data([aSheet, bSheet, stranger]), since);
    expect(r.newerInDispatch).toEqual(['Cal Demo']);
    expect(r.changed.map(c => c.id)).toEqual(['Texas|9']);
    expect(r.unmatched).toEqual(['Eve Nobody']);
  });
});

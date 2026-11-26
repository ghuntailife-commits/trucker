// Stage 5: result forms and the appointments calendar. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { money, checkSale, saleNote, saleDate, checkNoSale, noSaleNote, saleAlp } from '../src/rules/results';
import { eventFor, matchEvents, calendarItems, weekStart, toIcs } from '../src/calendar/events';
import { dialerAction } from '../src/rules/engine';
import { TAGS } from '../src/rules/tags';
import { DAY_MS } from '../src/rules/time';

const now = et(26, 10);
const sale = { type: 'Standard', alp: '$1,200', monthly: '100', wholeLife: '25000', adb: '', email: '', note: '' };

describe('sale form', () => {
  it('reads dollar amounts like the sheet', () => {
    expect(money('$1,200.50')).toBe(1200.5);
    expect(money('12.345')).toBeNull();
    expect(money('abc')).toBeNull();
  });
  it('needs the ALP type, ALP, monthly and whole life; ADB may be blank', () => {
    expect(checkSale({ ...sale, type: '' })).toEqual({ error: 'Pick Trial or Standard for the ALP.' });
    expect(checkSale({ ...sale, monthly: '' })).toMatchObject({ error: expect.stringContaining('monthly premium') });
    expect(checkSale({ ...sale, wholeLife: '0' })).toMatchObject({ error: expect.stringContaining('whole life') });
    expect(checkSale({ ...sale, email: 'nope' })).toEqual({ error: 'That email does not look right.' });
    const r = checkSale(sale);
    expect(r).toMatchObject({ ok: { alpType: 'Standard', alp: 1200, monthly: 100, wholeLife: 25000, adb: 0 } });
  });
  it('writes the same note as the sheet', () => {
    const r = checkSale({ ...sale, adb: '25000' });
    if (!('ok' in r)) throw new Error('should pass');
    expect(saleNote(r.ok, now, TZ)).toBe('11/26: Sold - Standard ALP $1200.00, monthly premium $100.00, whole life $25000, ADB $25000');
    expect(saleNote({ ...r.ok, adb: 0 }, now, TZ)).toMatch(/, no ADB$/);
  });
  it('dates a sale at its appointment when that was in the last 7 days', () => {
    expect(saleDate(et(25, 18), now)).toBe(et(25, 18));
    expect(saleDate(et(10, 18), now)).toBe(now);
    expect(saleDate(null, now)).toBe(now);
    expect(saleDate(et(27, 18), now)).toBe(now);   // a future appointment: dated now
  });
  it('totals one ALP per sale, old demo records too', () => {
    expect(saleAlp({ alp: 900 })).toBe(900);
    expect(saleAlp({ trialAlp: 0, standardAlp: 1100 })).toBe(1100);
  });
});

describe('no-sale form', () => {
  it('needs an objection or a reason', () => {
    expect(checkNoSale({ objections: [], reason: ' ', followUp: '', followUpNote: '' })).toMatchObject({ error: expect.any(String) });
    expect(checkNoSale({ objections: ['Price'], reason: '', followUp: 'next week', followUpNote: '' }))
      .toEqual({ error: 'Pick the follow-up date from the calendar.' });
  });
  it('keeps only known objections, in list order, and writes the sheet note', () => {
    const r = checkNoSale({ objections: ['Timing', 'Made up', 'Price'], reason: 'Wants to wait for open enrollment', followUp: '2026-12-02', followUpNote: 'after 6' });
    if (!('ok' in r)) throw new Error('should pass');
    expect(r.ok.objections).toEqual(['Price', 'Timing']);
    expect(noSaleNote(r.ok, now, TZ)).toBe('11/26: Presented, no sale - Price, Timing - Wants to wait for open enrollment - follow up 12/2 (after 6)');
  });
});

describe('booking', () => {
  it('saves the email with an appointment and refuses a bad one', () => {
    const c = contact();
    const ok = dialerAction(c, 'appt', now, undefined, { when: 'tomorrow 6pm', email: 'pat@example.com' });
    expect(ok.contact.email).toBe('pat@example.com');
    expect(ok.contact.tag).toBe(TAGS.scheduled);
    const bad = dialerAction(c, 'appt', now, undefined, { when: 'tomorrow 6pm', email: 'pat@' });
    expect(bad.refused).toBe('That email does not look right.');
  });
  it('builds the calendar event like the sheet', () => {
    const c = contact({ first: 'Pat', last: 'Rivers', company: 'Acme Freight', phone: '214-555-0177', state: 'TX', city: 'Dallas', zone: 'CT' });
    const e = eventFor(c, 'appt', et(27, 18), { email: 'pat@example.com', note: 'Wife joins' });
    expect(e.title).toBe('Pat Rivers - Acme Freight - (214) 555-0177 - TX');
    expect(e.end - e.start).toBe(30 * 60_000);
    expect(e.description).toBe('Phone: (214) 555-0177\nUnion / Company: Acme Freight\nContact time zone: CT\n\nWife joins');
    expect(e.location).toBe('Dallas, TX');
    expect(e.guests).toEqual(['pat@example.com']);
    const cb = eventFor(c, 'callback', et(27, 9));
    expect(cb.title.startsWith('CALL BACK - Pat Rivers')).toBe(true);
    expect(cb.end - cb.start).toBe(10 * 60_000);
  });
  it('writes a valid .ics file with a 1 hour alarm on appointments', () => {
    const c = contact({ first: 'Pat', last: 'Rivers', company: 'Acme, Inc' });
    const ics = toIcs([{ ...eventFor(c, 'appt', et(27, 18)), uid: 'x1' }], now);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261127T230000Z');
    expect(ics).toContain('Acme\\, Inc');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(ics.split('\r\n').at(-2)).toBe('END:VCALENDAR');
  });
});

describe('calendar sync back to contacts', () => {
  const sch = contact({ tag: TAGS.scheduled, phone: '(214) 555-0188', callAt: et(27, 18) });
  const done = contact({ tag: TAGS.sold, phone: '(214) 555-0189' });
  it('takes the soonest upcoming event for a scheduled contact', () => {
    const r = matchEvents([
      { id: 'a', title: 'X - 214.555.0188', description: '', start: et(28, 19) },
      { id: 'b', title: 'X', description: 'Phone: (214) 555-0188', start: et(28, 12) },
      { id: 'c', title: 'Old', description: '214-555-0188', start: et(20, 12) },
    ], [sch, done], now);
    expect(r.updates).toEqual([{ contactId: sch.id, callAt: et(28, 12) }]);
    expect(r.matched).toBe(1);
  });
  it('never writes back to a contact that is not Scheduled, and reports it', () => {
    const r = matchEvents([{ id: 'a', title: 'Y - (214) 555-0189', description: '', start: et(28, 12) }], [sch, done], now);
    expect(r.updates).toEqual([]);
    expect(r.notTagged).toEqual(['Y - (214) 555-0189']);
  });
  it('skips all-day and callback events, and lists events with no matching phone', () => {
    const r = matchEvents([
      { id: 'a', title: 'CALL BACK - Z - (214) 555-0188', description: '', start: et(28, 9) },
      { id: 'b', title: 'Holiday', description: '', start: et(28, 0), allDay: true },
      { id: 'c', title: 'Lunch', description: '', start: et(28, 12) },
    ], [sch], now);
    expect(r.matched).toBe(0);
    expect(r.unmatched).toEqual(['Lunch']);
  });
  it('no update when the time already matches', () => {
    expect(matchEvents([{ id: 'a', title: '(214) 555-0188', description: '', start: et(27, 18) }], [sch], now).updates).toEqual([]);
  });
});

describe('week view', () => {
  it('weeks start on Monday', () => {
    expect(weekStart(now, TZ)).toBe(et(23, 0));     // Thu 11/26 → Mon 11/23
    expect(weekStart(et(29, 22), TZ)).toBe(et(23, 0));
  });
  it('shows appointments with their confirm state, callbacks, follow-ups and results', () => {
    const a = contact({ tag: TAGS.scheduled, callAt: et(26, 18), confirmedAt: et(26, 9) });
    const b = contact({ tag: TAGS.scheduled, callAt: et(27, 19) });
    const f = contact({ tag: TAGS.scheduled, callAt: et(29, 19) });
    const p = contact({ tag: TAGS.scheduled, callAt: et(25, 19) });
    const cb = contact({ tag: TAGS.callback, callAt: et(27, 11) });
    const s = contact({ tag: TAGS.sold });
    const items = calendarItems([a, b, f, p, cb, s],
      [{ at: et(24, 18), contactId: s.id, alpType: 'Trial', alp: 800, monthly: 70, wholeLife: 20000, adb: 0, email: '', note: '', calledInto: false }],
      [{ at: et(25, 20), contactId: 'n1', objections: ['Price'], reason: '', followUp: '2026-11-28', followUpNote: '', calledInto: false }],
      [{ at: et(25, 21), contactId: 'x', list: 'Texas', first: '', last: '', phone: '', kind: 'Tag', count: 1, tag: TAGS.noshow, dials: 2 }],
      et(23, 0), et(23, 0) + 7 * DAY_MS, now, TZ);
    const lab = Object.fromEntries(items.map(i => [i.contactId + i.kind, i.label]));
    expect(lab[a.id + 'appt']).toBe('Confirmed');
    expect(lab[b.id + 'appt']).toBe('Confirm');
    expect(lab[f.id + 'appt']).toBe('Booked');
    expect(lab[p.id + 'appt']).toBe('Did they show?');
    expect(lab[cb.id + 'callback']).toBe('Callback');
    expect(lab[s.id + 'sold']).toBe('Sold');
    expect(lab['n1presented']).toBe('Presented');
    expect(lab['n1followup']).toBe('Follow up');
    expect(lab['xnoshow']).toBe('No-show');
    expect(items.map(i => i.at)).toEqual([...items].map(i => i.at).sort((x, y) => x - y));
  });
});

// Google Calendar sync plan (George, 2026-11-26). Made-up events only.
import { describe, expect, it } from 'vitest';
import { adoptOriginals, hashOf, planSync, strayCopies, type Row, type WantedEvent } from '../src/calendar/google';

const now = Date.UTC(2026, 10, 27, 15);
const ev = (uid: string, start: number, kind: 'appt' | 'callback' = 'appt'): WantedEvent => ({ uid, contactId: uid.split(':')[0], kind, title: 'Avery Test - Acme', start, end: start + 1_800_000,
  description: 'Phone: (214) 555-0150', location: 'Dallas, TX', guests: [] });
const row = (w: WantedEvent, over: Partial<Row> = {}): Row => ({ uid: w.uid, google_id: 'g-' + w.uid, contact_id: w.contactId, start_at: w.start, hash: hashOf(w), ...over });

describe('calendar sync plan', () => {
  it('adds new appointments, skips unchanged ones, updates changed ones', () => {
    const a = ev('a:appt', now + 3_600_000), b = ev('b:appt', now + 7_200_000), b2 = { ...b, start: b.start + 3_600_000 };
    const p = planSync([a, b2], [row(b)], new Map([['g-b:appt', { start: b.start, cancelled: false }]]), now);
    expect(p.upsert.map(x => x.uid)).toEqual(['a:appt', 'b:appt']);
    const same = planSync([b], [row(b)], new Map([['g-b:appt', { start: b.start, cancelled: false }]]), now);
    expect(same.upsert).toEqual([]);
  });
  it('removes future events Dispatch no longer has, and forgets past ones without deleting them', () => {
    const f = ev('f:appt', now + 3_600_000), p0 = ev('p:appt', now - 3_600_000);
    const p = planSync([], [row(f), row(p0)], new Map(), now);
    expect(p.remove.map(r => r.uid)).toEqual(['f:appt']); expect(p.forget.map(r => r.uid)).toEqual(['p:appt']);
  });
  it('follows an appointment moved in Google Calendar, unless Dispatch moved it too', () => {
    const a = ev('a:appt', now + 3_600_000), later = now + 5 * 3_600_000;
    const g = new Map([['g-a:appt', { start: later, cancelled: false }]]);
    const p = planSync([a], [row(a)], g, now);
    expect(p.moves).toEqual([{ contactId: 'a', start: later }]); expect(p.upsert).toEqual([]);
    const both = planSync([{ ...a, start: now + 2 * 3_600_000 }], [row(a)], g, now);
    expect(both.moves).toEqual([]); expect(both.upsert.length).toBe(1);
  });
  it('leaves an event deleted in Google Calendar deleted while nothing changes in Dispatch', () => {
    const a = ev('a:appt', now + 3_600_000);
    expect(planSync([a], [row(a)], new Map([['g-a:appt', { start: a.start, cancelled: true }]]), now).upsert).toEqual([]);
  });
});

describe('taking over events the old sheet made (no doubles)', () => {
  const w = { ...ev('a:appt', now + 3_600_000), title: 'Avery Test - Acme - (214) 555-0150 - TX' };
  const old = { id: 'sheet-1', title: 'Avery Test - Acme - (214) 555-0150- TX (CT)', start: w.start, allDay: false };
  it('points a new booking at the existing event instead of adding one', () => {
    const r = adoptOriginals([w], [], [old]);
    expect(r.rows).toEqual([{ uid: 'a:appt', google_id: 'sheet-1', contact_id: 'a', start_at: w.start, hash: '' }]);
    expect(r.copies).toEqual([]);
  });
  it('moves a booking Dispatch already copied onto the original and lists the copy', () => {
    const r = adoptOriginals([w], [row(w)], [old]);
    expect(r.rows[0].google_id).toBe('sheet-1'); expect(r.rows[0].hash).toBe('');
    expect(r.copies).toEqual(['g-a:appt']);
  });
  it('leaves other times and other people alone', () => {
    expect(adoptOriginals([w], [], [{ ...old, start: w.start + 1_800_000 }]).rows).toEqual([]);
    expect(adoptOriginals([w], [], [{ ...old, title: 'Blake Sample - (615) 555-0199' }]).rows).toEqual([]);
  });
  it('finds leftover Dispatch copies for a contact whose row points elsewhere', () => {
    const g = new Map([['sheet-1', { start: w.start, cancelled: false, uid: 'a:appt' }], ['g-a:appt', { start: w.start, cancelled: false, uid: 'a:appt' }],
      ['old', { start: now - 2 * 86_400_000, cancelled: false, uid: 'a:appt' }]]);
    expect(strayCopies([{ ...row(w), google_id: 'sheet-1' }], g, now)).toEqual(['g-a:appt']);
  });
});

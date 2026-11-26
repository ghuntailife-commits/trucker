// The Today working list and the appointments list (old Today!C5 and Today!T5 formulas).
import { describe, it, expect } from 'vitest';
import { buildToday, buildAppointments } from '../src/rules/today';
import { dial } from '../src/rules/engine';
import { TAGS } from '../src/rules/tags';
import { DEFAULT_CONFIG as CFG } from '../src/rules/config';
import { contact, et } from './helpers';

const now = et(10, 11);       // Tue 11/10/2026 11:00 AM
const snap = et(10, 8);       // re-sorted at 8 AM
const ctx = { now, snap, savedOrder: [] as string[] };
const names = (rows: { contact: { first: string } }[]) => rows.map(r => r.contact.first);

describe('Who is on the list', () => {
  it('leaves out bad numbers, do not call, given away, sold, presented and scheduled', () => {
    const tags = [TAGS.bad, TAGS.dnc, TAGS.given, TAGS.sold, TAGS.presented, TAGS.scheduled, TAGS.calledInto];
    const out = tags.map(tag => contact({ tag, dials: 2, lastDialed: et(1, 9) }));
    const keep = contact({ dials: 2, lastDialed: et(8, 9), first: 'Due' });
    expect(names(buildToday([...out, keep], ctx))).toEqual(['Due']);
  });
  it('leaves out contacts with no number to call', () => {
    expect(buildToday([contact({ phone: '' })], ctx)).toHaveLength(0);
  });
  it('a resting contact is not due until the rest ends', () => {
    const resting = contact({ dials: 14, lastDialed: et(8, 9), callAt: et(15, 9), newNumberMark: 14.5 });
    expect(buildToday([resting], ctx)).toHaveLength(0);
    expect(buildToday([resting], { ...ctx, now: et(15, 10), snap: et(15, 8) })).toHaveLength(1);
  });
  it('a not-interested contact comes back after 75 days as Re-approach', () => {
    const c = contact({ tag: TAGS.notInterested, dials: 3, lastDialed: et(1, 9, 0, 8), first: 'Later' });
    const rows = buildToday([c], { ...ctx, now: et(16, 11), snap: et(16, 8) });
    expect(rows.map(r => r.why)).toEqual(['Re-approach']);
  });
});

describe('Order', () => {
  it('confirms, callbacks and no-shows first, then new numbers, then retries and fresh contacts', () => {
    const fresh = contact({ first: 'Fresh' });
    const retry = contact({ first: 'Retry', dials: 2, lastDialed: et(8, 9) });
    const newNum = contact({ first: 'NewNum', dials: 3, lastDialed: et(8, 9), newNumberMark: 3 });
    const cb = contact({ first: 'Callback', tag: TAGS.callback, dials: 1, lastDialed: et(9, 9), callAt: et(10, 10), status: 'Good' });
    const ns = contact({ first: 'NoShow', tag: TAGS.noshow, dials: 2, lastDialed: et(9, 9), status: 'Good' });
    const rows = buildToday([fresh, retry, newNum, ns, cb], ctx);
    expect(names(rows).slice(0, 3)).toEqual(['Callback', 'NoShow', 'NewNum']);
    expect(rows.map(r => r.why).slice(0, 3)).toEqual(['Callback', 'No-show', 'New number']);
    expect(new Set(names(rows).slice(3))).toEqual(new Set(['Retry', 'Fresh']));
  });
  it('mixes in about 3 fresh contacts for every 7 retries', () => {
    const retries = Array.from({ length: 14 }, (_, i) => contact({ first: 'R' + i, dials: 2, lastDialed: et(8, 9) }));
    const fresh = Array.from({ length: 6 }, (_, i) => contact({ first: 'F' + i }));
    const rows = buildToday([...retries, ...fresh], ctx);
    const firstTen = names(rows).slice(0, 10);
    expect(firstTen.filter(n => n.startsWith('F')).length).toBe(3);
  });
  it('fresh contacts take turns between states', () => {
    const tx = Array.from({ length: 3 }, (_, i) => contact({ first: 'TX' + i, list: 'Texas' }));
    const ga = Array.from({ length: 3 }, (_, i) => contact({ first: 'GA' + i, list: 'Georgia' }));
    expect(names(buildToday([...tx, ...ga], ctx))).toEqual(['TX0', 'GA0', 'TX1', 'GA1', 'TX2', 'GA2']);
  });
  it('fewer dials come first among retries', () => {
    const a = contact({ first: 'Five', dials: 5, lastDialed: et(7, 9) });
    const b = contact({ first: 'Two', dials: 2, lastDialed: et(8, 9) });
    expect(names(buildToday([a, b], ctx))).toEqual(['Two', 'Five']);
  });
  it('a new number keeps priority for 2 dials only', () => {
    const c = contact({ dials: 3, lastDialed: et(8, 9), newNumberMark: 3 });
    expect(buildToday([c], ctx)[0].why).toBe('New number');
    const after2 = { ...c, dials: 5 };
    expect(buildToday([after2], ctx)[0]?.why).not.toBe('New number');
  });
  it('the backup in the main spot is labeled New Number-backup', () => {
    const c = contact({ dials: 7, lastDialed: et(8, 9), status: 'Backup', newNumberMark: 7, backup: '(214) 555-0909' });
    expect(buildToday([c], ctx)[0].why).toBe('New Number-backup');
  });
});

describe('Saved order and DONE TODAY', () => {
  it('a contact dialed today stays in place, marked DONE TODAY', () => {
    const a = contact({ first: 'A', dials: 2, lastDialed: et(8, 9) });
    const b = contact({ first: 'B', dials: 2, lastDialed: et(8, 9) });
    const saved = [a.id, b.id];
    const a2 = dial(a, et(10, 10)).contact;
    const rows = buildToday([a2, b], { ...ctx, savedOrder: saved });
    expect(names(rows)).toEqual(['A', 'B']);
    expect(rows[0].why).toBe('DONE TODAY - Dialed');
    expect(rows[0].done).toBe(true);
  });
  it('contacts that become due later in the day go after the saved order', () => {
    const a = contact({ first: 'A', dials: 2, lastDialed: et(8, 9) });
    const cb = contact({ first: 'LateCallback', tag: TAGS.callback, dials: 1, lastDialed: et(9, 9), callAt: et(10, 10), status: 'Good' });
    expect(names(buildToday([cb, a], { ...ctx, savedOrder: [a.id] }))).toEqual(['A', 'LateCallback']);
  });
  it('after a 3 PM re-sort, morning no-answers come back as PM retries', () => {
    const m = contact({ first: 'Morning', dials: 2, lastDialed: et(10, 9) });
    const rows = buildToday([m], { now: et(10, 15, 30), snap: et(10, 15, 5), savedOrder: [] });
    expect(rows.map(r => r.why)).toEqual(['PM retry']);
  });
});

describe('Appointments list', () => {
  it('shows called-into first, then appointments by time, with the right status', () => {
    const ci = contact({ first: 'CalledIn', tag: TAGS.calledInto, status: 'Good' });
    const today = contact({ first: 'Today', tag: TAGS.scheduled, callAt: et(10, 18), status: 'Good' });
    const tomorrow = contact({ first: 'Tomorrow', tag: TAGS.scheduled, callAt: et(11, 18), status: 'Good' });
    const past = contact({ first: 'Past', tag: TAGS.scheduled, callAt: et(9, 18), status: 'Good' });
    const later = contact({ first: 'NextWeek', tag: TAGS.scheduled, callAt: et(17, 18), status: 'Good' });
    const rows = buildAppointments([tomorrow, later, today, past, ci], ctx);
    expect(names(rows)).toEqual(['CalledIn', 'Past', 'Today', 'Tomorrow']);
    expect(rows.map(r => r.status)).toEqual([
      'How did it go? Mark Presented or Sold', 'Did they show?', 'Confirm today', 'Confirm for tomorrow']);
  });
});

it('the list never holds more than the list size', () => {
  const many = Array.from({ length: 260 }, () => contact());
  expect(buildToday(many, ctx, CFG)).toHaveLength(200);
});

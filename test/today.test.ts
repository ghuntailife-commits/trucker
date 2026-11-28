// The Today working list and the appointments list (old Today!C5 and Today!T5 formulas).
import { describe, it, expect } from 'vitest';
import { buildToday, buildAppointments } from '../src/rules/today';
import { dial } from '../src/rules/engine';
import { TAGS } from '../src/rules/tags';
import { V27_CONFIG as V27 } from '../src/rules/config';
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
    expect(names(buildToday([...out, keep], ctx, V27))).toEqual(['Due']);
  });
  it('drops a contact booked from Today right away, even though it was dialed today and is in the saved order', () => {
    const booked = contact({ first: 'Booked', tag: TAGS.scheduled, callAt: et(12, 18), dials: 1, lastDialed: et(10, 10) });
    expect(buildToday([booked], { ...ctx, savedOrder: [booked.id] }, V27)).toHaveLength(0);
  });
  it('leaves out contacts with no number to call', () => {
    expect(buildToday([contact({ phone: '' })], ctx, V27)).toHaveLength(0);
  });
  it('a resting contact is not due until the rest ends', () => {
    const resting = contact({ dials: 14, lastDialed: et(8, 9), callAt: et(15, 9), newNumberMark: 14.5 });
    expect(buildToday([resting], ctx, V27)).toHaveLength(0);
    expect(buildToday([resting], { ...ctx, now: et(15, 10), snap: et(15, 8) }, V27)).toHaveLength(1);
  });
  it('a not-interested contact comes back after 75 days as Re-approach', () => {
    const c = contact({ tag: TAGS.notInterested, dials: 3, lastDialed: et(1, 9, 0, 8), first: 'Later' });
    const rows = buildToday([c], { ...ctx, now: et(16, 11), snap: et(16, 8) }, V27);
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
    const rows = buildToday([fresh, retry, newNum, ns, cb], ctx, V27);
    expect(names(rows).slice(0, 3)).toEqual(['Callback', 'NoShow', 'NewNum']);
    expect(rows.map(r => r.why).slice(0, 3)).toEqual(['Callback', 'No-show', 'New number']);
    expect(new Set(names(rows).slice(3))).toEqual(new Set(['Retry', 'Fresh']));
  });
  it('mixes in about 3 fresh contacts for every 7 retries', () => {
    const retries = Array.from({ length: 14 }, (_, i) => contact({ first: 'R' + i, dials: 2, lastDialed: et(8, 9) }));
    const fresh = Array.from({ length: 6 }, (_, i) => contact({ first: 'F' + i }));
    const rows = buildToday([...retries, ...fresh], ctx, V27);
    const firstTen = names(rows).slice(0, 10);
    expect(firstTen.filter(n => n.startsWith('F')).length).toBe(3);
  });
  it('fresh contacts take turns between states', () => {
    const tx = Array.from({ length: 3 }, (_, i) => contact({ first: 'TX' + i, list: 'Texas' }));
    const ga = Array.from({ length: 3 }, (_, i) => contact({ first: 'GA' + i, list: 'Georgia' }));
    expect(names(buildToday([...tx, ...ga], ctx, V27))).toEqual(['TX0', 'GA0', 'TX1', 'GA1', 'TX2', 'GA2']);
  });
  it('fewer dials come first among retries', () => {
    const a = contact({ first: 'Five', dials: 5, lastDialed: et(7, 9) });
    const b = contact({ first: 'Two', dials: 2, lastDialed: et(8, 9) });
    expect(names(buildToday([a, b], ctx, V27))).toEqual(['Two', 'Five']);
  });
  it('a new number keeps priority for 2 dials only', () => {
    const c = contact({ dials: 3, lastDialed: et(8, 9), newNumberMark: 3 });
    expect(buildToday([c], ctx, V27)[0].why).toBe('New number');
    const after2 = { ...c, dials: 5 };
    expect(buildToday([after2], ctx, V27)[0]?.why).not.toBe('New number');
  });
  it('a number found for someone never dialed is Fresh, not New number (George, 2026-11-27)', () => {
    const c = contact({ dials: 0, lastDialed: null, newNumberMark: 0 });
    expect(buildToday([c], ctx, V27)[0].why).toBe('Fresh');
  });
  it('the backup in the main spot is labeled New Number-backup', () => {
    const c = contact({ dials: 7, lastDialed: et(8, 9), status: 'Backup', newNumberMark: 7, backup: '(214) 555-0909' });
    expect(buildToday([c], ctx, V27)[0].why).toBe('New Number-backup');
  });
});

describe('Saved order and DONE TODAY', () => {
  it('a contact dialed today stays in place, marked DONE TODAY', () => {
    const a = contact({ first: 'A', dials: 2, lastDialed: et(8, 9) });
    const b = contact({ first: 'B', dials: 2, lastDialed: et(8, 9) });
    const saved = [a.id, b.id];
    const a2 = dial(a, et(10, 10)).contact;
    const rows = buildToday([a2, b], { ...ctx, savedOrder: saved }, V27);
    expect(names(rows)).toEqual(['A', 'B']);
    expect(rows[0].why).toBe('DONE TODAY - Dialed');
    expect(rows[0].done).toBe(true);
  });
  it('contacts that become due later in the day go after the saved order', () => {
    const a = contact({ first: 'A', dials: 2, lastDialed: et(8, 9) });
    const cb = contact({ first: 'LateCallback', tag: TAGS.callback, dials: 1, lastDialed: et(9, 9), callAt: et(10, 10), status: 'Good' });
    expect(names(buildToday([cb, a], { ...ctx, savedOrder: [a.id] }, V27))).toEqual(['A', 'LateCallback']);
  });
  it('after a 3 PM re-sort, morning no-answers come back as PM retries', () => {
    const m = contact({ first: 'Morning', dials: 2, lastDialed: et(10, 9) });
    const rows = buildToday([m], { now: et(10, 15, 30), snap: et(10, 15, 5), savedOrder: [] }, V27);
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
    const rows = buildAppointments([tomorrow, later, today, past, ci], ctx, V27);
    expect(names(rows)).toEqual(['CalledIn', 'Past', 'Today', 'Tomorrow']);
    expect(rows.map(r => r.status)).toEqual([
      'How did it go? Mark Presented or Sold', 'Did they show?', 'Confirm today', 'Confirm for tomorrow']);
  });
});

it('the list never holds more than the list size', () => {
  const many = Array.from({ length: 260 }, () => contact());
  expect(buildToday(many, ctx, V27)).toHaveLength(200);
});

// ---------- v2 changes George approved on 2026-11-26 ----------
import { DEFAULT_CONFIG as V2 } from '../src/rules/config';
import { learnFreshScores } from '../src/rules/score';
import { reachByDial } from '../src/rules/stats';
import { confirmAppt, disposition, toggleQual } from '../src/rules/engine';

describe('v2 list order', () => {
  it('a morning no-answer comes back after 3 PM by itself, next up, with no re-sort', () => {
    const a = contact({ first: 'A', dials: 2, lastDialed: et(8, 9) });
    const b = contact({ first: 'B', dials: 2, lastDialed: et(8, 9) });
    const m = contact({ first: 'Morning', dials: 3, lastDialed: et(10, 10) });       // no answer at 10 AM today
    const saved = [m.id, a.id, b.id];
    const morning = buildToday([m, a, b], { now: et(10, 11), snap: et(10, 8), savedOrder: saved }, V2);
    expect(morning[0]).toMatchObject({ done: true });
    const later = buildToday([m, a, b], { now: et(10, 15, 30), snap: et(10, 8), savedOrder: saved }, V2);
    expect(names(later)).toEqual(['Morning', 'A', 'B']);
    expect(later[0]).toMatchObject({ done: false, why: 'PM retry' });
    // once dialed again after 3 PM it is done for the day
    const m2 = { ...m, dials: 4, lastDialed: et(10, 15, 40) };
    expect(buildToday([m2, a, b], { now: et(10, 16), snap: et(10, 8), savedOrder: saved }, V2)[0]).toMatchObject({ done: true });
  });
  it('fresh share follows the time of day: fewer fresh contacts in the evening', () => {
    const retries = Array.from({ length: 20 }, (_, i) => contact({ first: 'R' + i, dials: 2, lastDialed: et(8, 9) }));
    const fresh = Array.from({ length: 10 }, (_, i) => contact({ first: 'F' + i }));
    const countFresh = (h: number) => names(buildToday([...retries, ...fresh], { now: et(10, h), snap: et(10, h), savedOrder: [] }, V2))
      .slice(0, 20).filter(n => n.startsWith('F')).length;
    expect(countFresh(10)).toBe(5);    // 25% in the morning
    expect(countFresh(19)).toBe(2);    // 10% in the evening
  });
  it('fresh contacts like the ones that booked come first, still taking turns by state', () => {
    const history = [
      ...Array.from({ length: 10 }, () => contact({ company: 'Big Rig Co', dials: 2, tag: TAGS.scheduled, callAt: et(20, 18) })),
      ...Array.from({ length: 30 }, () => contact({ company: 'Slow Haul', dials: 3, lastDialed: et(8, 9) })),
    ];
    const s = learnFreshScores(history, 20);
    expect(s.ready).toBe(true);
    const f1 = contact({ first: 'Slow', company: 'Slow Haul', list: 'Texas' });
    const f2 = contact({ first: 'Big', company: 'Big Rig Co', list: 'Texas' });
    const g1 = contact({ first: 'GA', company: 'Other', list: 'Georgia' });
    const rows = buildToday([f1, f2, g1], { ...ctx, freshScore: s.score }, V2);
    expect(names(rows)).toEqual(['Big', 'GA', 'Slow']);
    expect(s.reason(f2)).toMatch(/Big Rig Co: .*x the average/);
    expect(learnFreshScores(history, 500).ready).toBe(false);
  });
});

describe('v2 appointments', () => {
  it('a confirm the day before shows Confirmed for tomorrow; the morning of asks again', () => {
    const c = contact({ first: 'Appt', tag: TAGS.scheduled, callAt: et(11, 18), status: 'Good' });
    const c2 = confirmAppt(c, et(10, 10)).contact;
    expect(buildAppointments([c2], ctx, V2)[0].status).toBe('Confirmed for tomorrow');
    const nextDay = { now: et(11, 9), snap: et(11, 8), savedOrder: [] };
    expect(buildAppointments([c2], nextDay, V2)[0].status).toBe('Confirm today');
    expect(buildAppointments([confirmAppt(c2, et(11, 9, 5)).contact], nextDay, V2)[0].status).toBe('Confirmed today');
  });
  it('moving the appointment clears the confirm', () => {
    const c = confirmAppt(contact({ tag: TAGS.scheduled, callAt: et(11, 18) }), et(10, 10)).contact;
    expect(disposition(c, TAGS.scheduled, et(10, 11), V2, { when: et(12, 18) }).contact.confirmedAt).toBeNull();
  });
  it('qualifier tags toggle, with one age range at a time', () => {
    let c = toggleQual(contact(), 'Married').contact;
    c = toggleQual(c, 'Age 25-40').contact;
    c = toggleQual(c, 'Age 40-55').contact;
    expect(c.quals).toEqual(['Married', 'Age 40-55']);
    expect(toggleQual(c, 'Married').contact.quals).toEqual(['Age 40-55']);
  });
});

it('reach by dial number keeps dials 1 to 10 apart', () => {
  let c = contact();
  const log = [];
  for (let i = 0; i < 6; i++) { const r = dial(c, et(1 + i, 10)); c = r.contact; log.push(...r.events); }
  const r = disposition(c, TAGS.callback, et(8, 10), V2, { when: et(9, 10) });
  log.push(...r.events);
  const b = reachByDial(log);
  expect(b.slice(0, 7).map(x => x.dials)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  expect(b[6].reached).toBe(1);
  expect(b[10].label).toBe('11+');
});

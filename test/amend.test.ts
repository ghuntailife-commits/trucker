// Changing a saved result from the Appointments page. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { amendResult, type AmendState } from '../src/rules/amend';
import { TAGS } from '../src/rules/tags';
import type { LogEvent } from '../src/rules/types';

const now = et(26, 16);
const tagRow = (id: string, at: number, tag: string): LogEvent => ({ at, contactId: id, list: 'Texas', first: 'A', last: 'B', phone: '', kind: 'Tag', count: 1, tag, dials: 2, reach: false });
const sale = { alpType: 'Standard' as const, alp: 1200, monthly: 100, wholeLife: 25000, adb: 0, email: '', note: '' };
const noSale = { objections: ['Price'], reason: 'Too much', followUp: '', followUpNote: '' };

function presentedState(): AmendState {
  const c = contact({ tag: TAGS.presented, notes: '11/24: Presented, no sale - Price' });
  return { contacts: [c], log: [tagRow(c.id, et(24, 19, 40), TAGS.presented)],
    sales: [], noSales: [{ ...noSale, at: et(24, 19), contactId: c.id, calledInto: false }] };
}

describe('changing a result', () => {
  it('turns a no-sale into a sale on the same day, everywhere', () => {
    const st = presentedState();
    const r = amendResult(st, { from: 'presented', index: 0 }, 'sold', { sale }, now, TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.state.noSales).toHaveLength(0);
    expect(r.state.sales).toEqual([expect.objectContaining({ alp: 1200, at: et(24, 19), contactId: st.contacts[0].id })]);
    expect(r.state.log.map(e => e.tag)).toEqual([TAGS.sold]);
    expect(r.state.log[0].at).toBe(et(24, 19, 40));
    const c = r.state.contacts[0];
    expect(c.tag).toBe(TAGS.sold);
    expect(c.notes).toContain('11/26: Result changed from Presented, no sale to Sold (11/24)');
    expect(c.notes).toContain('11/24: Sold - Standard ALP $1200.00');
    expect(st.noSales).toHaveLength(1);   // the old state is untouched (Undo)
  });

  it('edits a sale in place', () => {
    const c = contact({ tag: TAGS.sold });
    const st: AmendState = { contacts: [c], log: [tagRow(c.id, et(23, 12), TAGS.sold)], noSales: [],
      sales: [{ ...sale, at: et(23, 12), contactId: c.id, calledInto: true }] };
    const r = amendResult(st, { from: 'sold', index: 0 }, 'sold', { sale: { ...sale, alp: 2100 } }, now, TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.state.sales).toEqual([expect.objectContaining({ alp: 2100, calledInto: true, at: et(23, 12) })]);
    expect(r.state.log).toHaveLength(1);
    expect(r.message).toMatch(/updated/);
  });

  it('turns a no-show into a presentation, and leaves a later tag alone', () => {
    const c = contact({ tag: TAGS.callback, callAt: et(28, 12) });
    const st: AmendState = { contacts: [c], sales: [], noSales: [],
      log: [tagRow(c.id, et(21, 23), TAGS.noshow), tagRow(c.id, et(24, 18), TAGS.callback)] };
    const r = amendResult(st, { from: 'noshow', index: 0 }, 'presented', { noSale }, now, TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.state.log.map(e => e.tag)).toEqual([TAGS.presented, TAGS.callback]);
    expect(r.state.noSales).toHaveLength(1);
    expect(r.state.contacts[0].tag).toBe(TAGS.callback);
    expect(r.state.contacts[0].callAt).toBe(et(28, 12));
  });

  it('books a presented contact again', () => {
    const st = presentedState();
    const r = amendResult(st, { from: 'presented', index: 0 }, 'scheduled', { when: et(30, 19) }, now, TZ);
    if ('error' in r) throw new Error(r.error);
    expect(r.state.noSales).toHaveLength(0);
    expect(r.state.log).toHaveLength(0);
    expect(r.state.contacts[0]).toMatchObject({ tag: TAGS.scheduled, callAt: et(30, 19), confirmedAt: null });
  });

  it('refuses without the form, or when the record is gone', () => {
    const st = presentedState();
    expect(amendResult(st, { from: 'presented', index: 0 }, 'sold', {}, now, TZ)).toEqual({ error: 'Fill in the sale first.' });
    expect(amendResult(st, { from: 'sold', index: 3 }, 'presented', { noSale }, now, TZ)).toEqual({ error: 'That sale is no longer there.' });
  });
});

import { buildToday } from '../src/rules/today';
import { zoned } from '../src/rules/time';
describe('follow-ups on Today', () => {
  const day = (d: number) => zoned(2026, 11, d, 0, 0, TZ);
  const ctx = (fu: Map<string, number>) => ({ now: et(27, 10), snap: et(27, 8), savedOrder: [], followUps: fu });
  it('a presented contact shows up as Follow-up on its day, after callbacks', () => {
    const p = contact({ tag: TAGS.presented, dials: 2, lastDialed: et(24, 19) });
    const cb = contact({ tag: TAGS.callback, dials: 1, lastDialed: et(25, 10), callAt: et(27, 9) });
    const rows = buildToday([p, cb], ctx(new Map([[p.id, day(27)]])));
    expect(rows.map(r => r.why)).toEqual(['Callback', 'Follow-up']);
  });
  it('not before the day, carried over if missed, gone once dialed', () => {
    const p = contact({ tag: TAGS.presented, dials: 2, lastDialed: et(24, 19) });
    expect(buildToday([p], ctx(new Map([[p.id, day(28)]])))).toHaveLength(0);
    expect(buildToday([p], ctx(new Map([[p.id, day(26)]])))[0].why).toBe('Follow-up · 11/26');
    const dialed = { ...p, lastDialed: et(26, 15) };
    expect(buildToday([dialed], ctx(new Map([[p.id, day(26)]])))).toHaveLength(0);
  });
});

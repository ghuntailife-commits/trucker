// Results reports. Made-up data only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { demoMonth } from '../src/app-store/demoLog';
import { funnel, rangeFor, reachByHour, reachByDialNo, freshVsRetry, heatmap, dialOutcomes, daily, lastSeven, salesSummary,
  cumulative, presentedByWeek, objections, followUps, insights, salesBySource, pct } from '../src/reports/results';
import type { LogEvent } from '../src/rules/types';
import { TAGS } from '../src/rules/tags';

const now = et(26, 12);
const h = demoMonth(now, TZ);

describe('demo month looks like a real month', () => {
  const f = funnel(h.log, h.sales, rangeFor('all', now, TZ, h.log[0].at));
  it('has realistic rates', () => {
    expect(f.dials).toBeGreaterThan(1500);
    expect(pct(f.connects, f.dials)).toBeGreaterThan(.1);
    expect(pct(f.connects, f.dials)).toBeLessThan(.3);
    expect(f.sold).toBeGreaterThan(5);
    expect(f.sold).toBeLessThanOrEqual(f.presented);
  });
  it('2nd dial reaches more than the 1st', () => {
    const b = reachByDialNo(h.log, rangeFor('all', now, TZ, h.log[0].at));
    expect(pct(b[1].reached, b[1].dials)).toBeGreaterThan(pct(b[0].reached, b[0].dials));
  });
});

const mk = (at: number, kind: LogEvent['kind'], tag = '', dials = 1, reach?: boolean): LogEvent =>
  ({ at, contactId: 'x' + at, list: 'Texas', first: 'A', last: 'B', phone: '', kind, count: 1, tag, dials, ...(kind === 'Tag' ? { reach: !!reach } : {}) });

describe('report math', () => {
  const log = [
    mk(et(24, 10), 'Dial'), mk(et(24, 10, 1), 'Tag', TAGS.scheduled, 1, true),
    mk(et(24, 15), 'Dial', '', 2), mk(et(24, 15, 1), 'Tag', TAGS.notInterested, 2, true),
    mk(et(25, 10), 'Dial'), mk(et(25, 10, 5), 'Dial', '', 3),
    mk(et(25, 19), 'Tag', TAGS.presented, 1), mk(et(25, 20), 'Tag', TAGS.noshow, 1),
    mk(et(26, 9), 'Tag', TAGS.sold, 1),
  ];
  const sale = { at: et(26, 9), contactId: 's1', alpType: 'Standard' as const, alp: 1200, monthly: 100, wholeLife: 25000, adb: 0, email: '', note: '', calledInto: false };
  const R = rangeFor('month', now, TZ);
  it('funnel counts presented with sold included', () => {
    expect(funnel(log, [sale], R)).toMatchObject({ dials: 4, connects: 2, scheduled: 1, presented: 2, sold: 1, noShows: 1 });
  });
  it('reach by hour, dial number and fresh vs retry', () => {
    const hr = reachByHour(log, R, TZ);
    expect(hr.find(b => b.key === '10')).toMatchObject({ dials: 3, reached: 1 });
    expect(hr.find(b => b.key === '15')).toMatchObject({ dials: 1, reached: 1, label: '3 PM' });
    expect(freshVsRetry(log, R).map(b => [b.dials, b.reached])).toEqual([[2, 1], [2, 1]]);
    expect(heatmap(log, R, TZ)[3][1]).toMatchObject({ dials: 1, reached: 1 });   // Tue 10 AM
  });
  it('every dial is accounted for once', () => {
    const o = dialOutcomes(log, R);
    expect(o.dials).toBe(4);
    expect(o.rows.reduce((a, r) => a + r.count, 0)).toBe(4);
    expect(o.rows.find(r => r.key === 'noanswer')!.count).toBe(2);
  });
  it('daily rows and last 7 days', () => {
    const d = daily(log, [sale], R, TZ);
    expect(d.find(r => r.day === et(24, 0))).toMatchObject({ dials: 2, connects: 2, scheduled: 1, hungUp: 1 });
    expect(d.find(r => r.day === et(26, 0))).toMatchObject({ sold: 1, alp: 1200, presented: 1 });
    expect(lastSeven(log, [sale], now, TZ).now.alp).toBe(1200);
  });
  it('sales pace against the goal', () => {
    const s = salesSummary([sale], log, now, TZ, 20000);
    expect(s).toMatchObject({ alp: 1200, toGo: 18800, count: 1, avg: 1200, daysIn: 30, dayNo: 26 });
    expect(Math.round(s.perDayNeeded)).toBe(Math.round(18800 / 5));
    const c = cumulative([sale], now, TZ, 20000);
    expect(c[25].total).toBe(1200);
    expect(c[26].total).toBeNull();
    expect(c[29].goalPace).toBe(20000);
  });
  it('presentations by week, objections, follow-ups', () => {
    const w = presentedByWeek(log, [sale], R, TZ);
    expect(w.at(-1)).toMatchObject({ presented: 2, sold: 1 });
    const ns = [{ at: et(25, 19), contactId: 'n', objections: ['Price', 'Timing'], reason: '', followUp: '2026-11-28', followUpNote: '', calledInto: false }];
    expect(objections(ns, R).rows.find(r => r.label === 'Timing')!.count).toBe(1);
    expect(followUps(ns, now, TZ)[0].due).toBe(et(28, 0));
  });
  it('sources and insights read from the data', () => {
    const c = contact({ list: 'Iowa' });
    expect(salesBySource([{ ...sale, contactId: c.id }], id => ({ first: '', last: '', phone: '', company: '', list: id === c.id ? 'Iowa' : '' }))[0]).toMatchObject({ label: 'Iowa', count: 1, alp: 1200 });
    const tips = insights(h.log, h.sales, now, TZ, 20000);
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips[0]).toMatch(/^Best hour is/);
  });
});

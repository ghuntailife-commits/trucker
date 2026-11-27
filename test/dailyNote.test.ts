// The Home screen's daily note. Made-up numbers only.
import { describe, expect, it } from 'vitest';
import { et, TZ } from './helpers';
import { dailyNote, waitingCounts } from '../src/home/dailyNote';

const sale = (at: number, alp: number) => ({ at, contactId: 'x', alpType: 'Standard' as const, alp, monthly: 0, wholeLife: 0, adb: 0, email: '', note: '', calledInto: false });
const base = { name: 'Sam', tz: TZ, goal: 10000, stats: { dials: 0, connects: 0, scheduled: 0, presented: 0, sold: 0 }, apptsLeft: [], apptsTomorrow: 0, waiting: { callbacks: 0, followUps: 0, noShows: 0 } };

describe('daily note', () => {
  it('says where the month stands and what it takes a day', () => {
    const n = dailyNote({ ...base, now: et(26, 18), sales: [sale(et(3, 12), 4000), sale(et(24, 12), 2000), sale(et(17, 12), 1000), sale(et(1, 12, 0, 10), 9999)] });
    expect(n.hello).toBe('Good evening, Sam.');
    expect(n.lines[0]).toBe('November is at $7,000, 70% of your $10,000 goal, with 5 days left.');
    expect(n.lines[1]).toBe('$3,000 to go. At your average sale of $4,250, that is about 1 more sale, or $600 a day.');
    expect(n.lines[2]).toBe('That is $2,999 behind October at this point ($9,999 by the 26th).');
    expect(n.lines[3]).toBe('No dials yet today.');
    expect(n.week).toEqual({ alp: 2000, sales: 1, prevAlp: 1000 });
  });
  it('today, appointments and what is waiting', () => {
    const n = dailyNote({ ...base, now: et(26, 10), sales: [sale(et(26, 9), 12000)], stats: { dials: 40, connects: 6, scheduled: 2, presented: 1, sold: 1 },
      apptsLeft: [{ name: 'Avery Test', at: et(26, 19) }], waiting: { callbacks: 3, followUps: 0, noShows: 2 } });
    expect(n.lines[0]).toBe('November is at $12,000. You passed your $10,000 goal by $2,000.');
    expect(n.lines[1]).toBe('Today so far: 40 dials, 6 connects, 2 booked, 1 presented, 1 sold for $12,000.');
    expect(n.lines[2]).toBe('1 appointment still to run today. Next is Avery Test at 7:00 PM.');
    expect(n.lines[3]).toBe('Waiting on Today: 3 callbacks and 2 no-shows.');
  });
  it('splits standard and trial, and names who to call first', () => {
    const n = dailyNote({ ...base, now: et(26, 10), sales: [sale(et(5, 12), 3000), { ...sale(et(6, 12), 1000), alpType: 'Trial' as const }],
      waiting: { callbacks: 1, followUps: 0, noShows: 0 }, callFirst: { name: 'Avery Test', why: 'Callback', at: et(26, 11, 30) } });
    expect(n.month).toMatchObject({ alp: 4000, std: 3000, trial: 1000, lastMonth: null, salesToGo: 3 });
    expect(n.lines[0]).toBe('November is at $4,000 ($3,000 standard, $1,000 trial), 40% of your $10,000 goal, with 5 days left.');
    expect(n.lines.find(l => l.startsWith('Waiting'))).toBe('Waiting on Today: 1 callback. Call Avery Test first (callback, 11:30 AM).');
  });
  it('counts what is waiting on Today', () => {
    expect(waitingCounts([{ why: 'Callback', done: false }, { why: 'Follow-up · 11/20', done: false }, { why: 'No-show · 11/25', done: true }, { why: 'Fresh', done: false }]))
      .toEqual({ callbacks: 1, followUps: 1, noShows: 0 });
  });
});

describe('message of the day', () => {
  it('has a theme every day, Thanksgiving on Thanksgiving, and keeps the same line all day', async () => {
    const { dayTheme } = await import('../src/home/dayTheme');
    expect(dayTheme({ y: 2026, m: 11, d: 26, wd: 4 }, true).name).toBe('Happy Thanksgiving');
    const a = dayTheme({ y: 2026, m: 11, d: 30, wd: 1 }, false);
    expect(a.name).toBe('Fresh Start Monday');
    expect(dayTheme({ y: 2026, m: 11, d: 30, wd: 1 }, false)).toEqual(a);
  });
});

describe('quote of the day', () => {
  it('changes daily, cycles through every quote, and differs by agent', async () => {
    const { quoteOfDay, QUOTES } = await import('../src/home/quotes');
    const seen = new Set<string>(), themes = new Set<string>();
    for (let i = 0; i < QUOTES.length * 5; i++) { const q = quoteOfDay(2026, 12, 1 + i, 'George'); seen.add(q.text); themes.add(q.theme); }
    expect(seen.size).toBe(QUOTES.length);
    expect(themes.size).toBe(5);
    expect(quoteOfDay(2026, 11, 26, 'George')).toEqual(quoteOfDay(2026, 11, 26, 'George'));
  });
});

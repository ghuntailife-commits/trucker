// A month of made-up dialing history for the demo, so the Results pages have real-looking numbers to show.
// Shaped after the team's real rates (about 16% reached, 2nd dial best, half of appointments no-show, 4 in 10
// presentations close) but every person, number and sale here is invented. 555-01xx numbers are reserved for fiction.
import type { LogEvent } from '../rules/types';
import { TAGS } from '../rules/tags';
import { OBJECTIONS, type SaleRecord, type NoSaleRecord } from '../rules/results';
import type { Who } from '../reports/results';
import { addDays, parts, startOfDay } from '../rules/time';

const FIRST = ['Avery', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Rowan', 'Skyler', 'Parker', 'Reese', 'Emerson', 'Hayden',
  'Kendall', 'Logan', 'Peyton', 'Sawyer', 'Taylor', 'Blake', 'Cameron', 'Drew', 'Elliot', 'Finley', 'Harper', 'Jamie', 'Kai', 'Lane'];
const LAST = ['Calloway', 'Brightwater', 'Hollins', 'Pembrook', 'Ashford', 'Whitlock', 'Danvers', 'Kingsley', 'Merriweather', 'Thornton',
  'Fairbanks', 'Holloway', 'Langford', 'Redmond', 'Sterling', 'Winslow', 'Bramble', 'Cartwright', 'Dunmore', 'Everly', 'Galloway', 'Huxley'];
const COS = ['Lonestar Freight', 'Peachtree Logistics', 'Magnolia Rail', 'Red River Haulers', 'Bluegrass Parcel', 'UPS - Package Handler',
  'Teamsters Local 745', 'IBEW Local 175', 'Gulf Coast Cartage', 'Ironhorse Rail', 'Summit Warehousing', 'UA Local 572'];
const DEFAULT_LISTS: [string, string[]][] = [['Texas', ['214', '817', '713']], ['Georgia', ['404', '478']], ['Alabama', ['205', '251']],
  ['Tennessee', ['865', '901', '615']], ['Iowa', ['515', '319']], ['Hardcards', ['270', '386']]];
const DEFAULT_W = [26, 22, 12, 18, 10, 6];
const HOUR_W: Record<number, number> = { 9: 5, 10: 12, 11: 10, 12: 2, 13: 3, 14: 9, 15: 8, 16: 13, 17: 19, 18: 9, 19: 11, 20: 24 };
const HOUR_F: Record<number, number> = { 9: .8, 10: 1.05, 11: .95, 12: .9, 13: 1.6, 14: .8, 15: 1.35, 16: 1, 17: 1.05, 18: 1.25, 19: 1.05, 20: .8 };
const DAY_BASE = [60, 130, 85, 105, 165, 95, 0];       // Mon..Sun dials on a typical day
const DAY_F = [1.55, 1.05, .8, .72, .72, .5, 1];
const REACH = [.12, .46, .33, .21, .15];
const REASONS = ['Wants to talk it over with family', 'Needs to look at the budget first', 'Already has coverage through work',
  'Wants to wait until after the holidays', 'Asked for time to research', 'Not sure about the monthly cost'];

function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

export interface DemoHistory { log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[] }

/** seed: a different made-up month; lists: [list, area codes][] and weights; scale: how busy (1 = George's pace). */
export interface MonthOpts { seed?: number; lists?: [string, string[]][]; weights?: number[]; scale?: number; idPrefix?: string }

export function demoMonth(now: number, tz: string, days = 30, opts: MonthOpts = {}): DemoHistory {
  const r = rng(opts.seed ?? 42);
  const LISTS = opts.lists ?? DEFAULT_LISTS, LIST_W = opts.weights ?? DEFAULT_W, scale = opts.scale ?? 1;
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const weighted = (w: number[]) => { let x = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return w.length - 1; };
  const hours = Object.keys(HOUR_W).map(Number), hourW = hours.map(h => HOUR_W[h]);
  const log: LogEvent[] = [], sales: SaleRecord[] = [], noSales: NoSaleRecord[] = [];
  type P = Who & { id: string; dials: number; done: boolean };
  const open: P[] = [];
  let n = 0;
  const person = (): P => {
    const li = weighted(LIST_W), [list, acs] = LISTS[li];
    n++;
    return { id: `${opts.idPrefix ?? 'hist'}-${n}`, first: pick(FIRST), last: pick(LAST), phone: `(${pick(acs)}) 555-01${String(n % 100).padStart(2, '0')}`,
      company: pick(COS), list, dials: 0, done: false };
  };
  const ev = (p: P, at: number, kind: LogEvent['kind'], tag = '', reach?: boolean): LogEvent => ({
    at, contactId: p.id, list: p.list, first: p.first, last: p.last, phone: p.phone, kind, count: 1, tag, dials: p.dials,
    ...(kind === 'Tag' ? { reach: !!reach } : {}) });
  const who = (p: P): Who => ({ first: p.first, last: p.last, phone: p.phone, company: p.company, list: p.list });
  const iso = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t);

  const present = (p: P, at: number, calledInto: boolean) => {
    if (r() < .38) {
      const alp = Math.round(320 + r() * 1500), std = r() < .73;
      log.push(ev(p, at, 'Tag', TAGS.sold));
      sales.push({ at, contactId: p.id, alpType: std ? 'Standard' : 'Trial', alp, monthly: Math.round(alp / 12 * 100) / 100,
        wholeLife: pick([20000, 25000, 50000, 100000, 125000, 140000]), adb: pick([0, 25000, 50000, 100000, 150000]),
        email: '', note: '', calledInto, who: who(p) });
    } else {
      log.push(ev(p, at, 'Tag', TAGS.presented));
      const obj = [pick(OBJECTIONS.slice(0, 7))]; if (r() < .35) obj.push(pick(OBJECTIONS.slice(0, 7)));
      noSales.push({ at, contactId: p.id, objections: OBJECTIONS.filter(o => obj.includes(o)), reason: pick(REASONS),
        followUp: r() < .4 ? iso(addDays(at, 3 + Math.floor(r() * 8), tz)) : '', followUpNote: r() < .5 ? 'Call after 6' : '', calledInto, who: who(p) });
    }
  };

  const today = startOfDay(now, tz);
  for (let d = days; d >= 1; d--) {
    const day = addDays(today, -d, tz), wd = (parts(day, tz).wd + 6) % 7;
    const target = wd === 6 ? 0 : Math.round(DAY_BASE[wd] * scale * (.45 + r() * .9));
    const times = Array.from({ length: target }, () => day + (hours[weighted(hourW)] * 60 + Math.floor(r() * 60)) * 60_000).sort((a, b) => a - b);
    for (const t of times) {
      const retry = open.filter(p => !p.done && p.dials < 9 && p.dials > 0);
      const p = retry.length && r() < .2 ? pick(retry) : (open.push(person()), open[open.length - 1]);
      p.dials++;
      log.push(ev(p, t, 'Dial'));
      const h = parts(t, tz).h;
      const chance = REACH[Math.min(p.dials, 5) - 1] * (HOUR_F[h] ?? 1) * DAY_F[wd];
      const at = t + 60_000;
      if (r() < chance) {
        p.done = true;
        const o = weighted([44, 14, 30, 3, 5, 4]);
        if (o === 0) {
          log.push(ev(p, at, 'Tag', TAGS.scheduled, true));
          const appt = addDays(startOfDay(t, tz), 1 + Math.floor(r() * 2), tz) + (18 + Math.floor(r() * 3)) * 3_600_000;
          const res = r();   // about half no-show, a fifth cancel or move, the rest are presented
          if (appt < today) { if (res < .49) log.push(ev(p, appt, 'Tag', TAGS.noshow)); else if (res > .66) present(p, appt, false); }
        } else if (o === 1) { log.push(ev(p, at, 'Tag', TAGS.callback, true)); p.done = false; }
        else if (o === 2) log.push(ev(p, at, 'Tag', TAGS.notInterested, true));
        else if (o === 3) { log.push(ev(p, at, 'Tag', TAGS.calledInto, true)); present(p, at + 40 * 60_000, true); }
        else if (o === 4) log.push(ev(p, at, 'Tag', TAGS.dnc, true));
        else log.push(ev(p, at, 'Tag', 'LEFT A MESSAGE WITH FAMILY', true));
      } else if (r() < .02) { p.done = true; log.push(ev(p, at, 'Tag', TAGS.bad, false)); }
    }
    if (wd === 0 || wd === 3) log.push({ at: day + 8 * 3_600_000, contactId: '', list: LISTS[0][0], first: '', last: '', phone: '', kind: 'Import', count: 40 + Math.floor(r() * 120), tag: '', dials: 0 });
  }
  log.sort((a, b) => a.at - b.at);
  return { log, sales: sales.sort((a, b) => a.at - b.at), noSales: noSales.sort((a, b) => a.at - b.at) };
}

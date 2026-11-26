// The daily note on the Home screen (George, 2026-11-26): where production stands for the month, what it takes to
// hit the goal, what today looks like and who to call first. Rules-based; at go-live Claude can rewrite it in a
// warmer voice from the same numbers.
import { saleAlp, type SaleRecord } from '../rules/results';
import { addDays, parts, sameDay, startOfDay, zoned } from '../rules/time';

export interface NoteInput {
  name: string; now: number; tz: string; goal: number;
  sales: SaleRecord[];
  stats: { dials: number; connects: number; scheduled: number; presented: number; sold: number };
  /** Booked appointments still to come today, earliest first. */
  apptsLeft: { name: string; at: number }[];
  apptsTomorrow: number;
  waiting: { callbacks: number; followUps: number; noShows: number };
  /** The first priority contact on Today (callback, follow-up or no-show), if any. */
  callFirst?: { name: string; why: string; at?: number | null };
}
export interface DailyNote {
  hello: string;
  lines: string[];
  month: { label: string; alp: number; std: number; trial: number; goal: number; pct: number; toGo: number; daysLeft: number; perDay: number;
    /** Last month's ALP by the same day of the month, or null when last month had no sales. */
    lastMonth: number | null; avgSale: number; salesToGo: number };
  week: { alp: number; sales: number; prevAlp: number };
  todayAlp: number;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const time = (ms: number, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);
const sum = (xs: SaleRecord[]) => xs.reduce((a, s) => a + saleAlp(s), 0);

export function dailyNote(x: NoteInput): DailyNote {
  const { now, tz } = x, p = parts(now, tz);
  const monthStart = zoned(p.y, p.m, 1, 0, 0, tz), nextMonth = p.m === 12 ? zoned(p.y + 1, 1, 1, 0, 0, tz) : zoned(p.y, p.m + 1, 1, 0, 0, tz);
  const prevStart = p.m === 1 ? zoned(p.y - 1, 12, 1, 0, 0, tz) : zoned(p.y, p.m - 1, 1, 0, 0, tz);
  const daysLeft = Math.round((nextMonth - startOfDay(now, tz)) / 86_400_000);   // including today
  const inMonth = x.sales.filter(s => s.at >= monthStart && s.at < nextMonth);
  const alp = sum(inMonth), trial = sum(inMonth.filter(s => s.alpType === 'Trial')), std = alp - trial;
  const toGo = Math.max(0, x.goal - alp), perDay = daysLeft ? toGo / daysLeft : toGo;
  const pct = x.goal ? Math.round((alp / x.goal) * 100) : 0;
  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(now);
  const prevLabel = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(prevStart);
  // last month by the same day of the month (end of that day)
  const prevMonthSales = x.sales.filter(s => s.at >= prevStart && s.at < monthStart);
  const prevCut = Math.min(monthStart, addDays(prevStart, p.d, tz));
  const lastMonth = prevMonthSales.length ? sum(prevMonthSales.filter(s => s.at < prevCut)) : null;
  // average sale over the last 90 days
  const recent = x.sales.filter(s => s.at > now - 90 * 86_400_000 && s.at <= now);
  const avgSale = recent.length ? sum(recent) / recent.length : 0;
  const salesToGo = avgSale && toGo ? Math.ceil(toGo / avgSale) : 0;
  // this week so far (Monday on) against the same days last week
  const monday = addDays(startOfDay(now, tz), -((p.wd + 6) % 7), tz);
  const wk = x.sales.filter(s => s.at >= monday && s.at <= now);
  const prev = x.sales.filter(s => s.at >= addDays(monday, -7, tz) && s.at <= now - 7 * 86_400_000);
  const week = { alp: sum(wk), sales: wk.length, prevAlp: sum(prev) };
  const todayAlp = sum(x.sales.filter(s => sameDay(s.at, now, tz)));

  const hello = `Good ${p.h < 12 ? 'morning' : p.h < 17 ? 'afternoon' : 'evening'}, ${x.name}.`;
  const lines: string[] = [];
  const split = trial ? ` (${money(std)} standard, ${money(trial)} trial)` : '';
  if (alp >= x.goal && x.goal) lines.push(`${label} is at ${money(alp)}${split}. You passed your ${money(x.goal)} goal by ${money(alp - x.goal)}.`);
  else {
    lines.push(`${label} is at ${money(alp)}${split}, ${pct}% of your ${money(x.goal)} goal, with ${plural(daysLeft, 'day')} left.`);
    lines.push(salesToGo ? `${money(toGo)} to go. At your average sale of ${money(avgSale)}, that is about ${plural(salesToGo, 'more sale')}, or ${money(perDay)} a day.`
      : `${money(toGo)} to go is about ${money(perDay)} a day.`);
  }
  if (lastMonth != null) {
    const diff = alp - lastMonth;
    lines.push(Math.abs(diff) < 1 ? `That is even with ${prevLabel} at this point.`
      : `That is ${money(Math.abs(diff))} ${diff > 0 ? 'ahead of' : 'behind'} ${prevLabel} at this point (${money(lastMonth)} by the ${ordinal(p.d)}).`);
  }
  const s = x.stats;
  lines.push(s.dials ? `Today so far: ${plural(s.dials, 'dial')}, ${plural(s.connects, 'connect')}, ${s.scheduled} booked${s.presented ? `, ${s.presented} presented` : ''}${s.sold ? `, ${s.sold} sold for ${money(todayAlp)}` : ''}.`
    : 'No dials yet today.');
  const next = x.apptsLeft[0];
  lines.push(next ? `${plural(x.apptsLeft.length, 'appointment')} still to run today. Next is ${next.name} at ${time(next.at, tz)}.`
    : `No more appointments today${x.apptsTomorrow ? `. ${plural(x.apptsTomorrow, 'appointment')} booked for tomorrow` : ''}.`);
  const w = x.waiting, parts2 = [w.callbacks && plural(w.callbacks, 'callback'), w.followUps && plural(w.followUps, 'follow-up'), w.noShows && plural(w.noShows, 'no-show')].filter(Boolean) as string[];
  if (parts2.length) {
    const list = parts2.length > 1 ? parts2.slice(0, -1).join(', ') + ' and ' + parts2.at(-1) : parts2[0];
    const f = x.callFirst;
    lines.push(`Waiting on Today: ${list}.` + (f ? ` Call ${f.name} first (${f.why.toLowerCase()}${f.at && f.at > now && sameDay(f.at, now, tz) ? `, ${time(f.at, tz)}` : ''}).` : ''));
  }
  lines.push(week.sales || week.prevAlp ? `This week: ${money(week.alp)} from ${plural(week.sales, 'sale')}, against ${money(week.prevAlp)} by this point last week.` : 'No sales yet this week.');
  return { hello, lines, month: { label, alp, std, trial, goal: x.goal, pct, toGo, daysLeft, perDay, lastMonth, avgSale, salesToGo }, week, todayAlp };
}

function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/** Today's waiting counts from the Today list's "why" labels. */
export function waitingCounts(rows: { why: string; done: boolean }[]) {
  const open = rows.filter(r => !r.done);
  return { callbacks: open.filter(r => /^Callback/.test(r.why)).length, followUps: open.filter(r => /^Follow-up/.test(r.why)).length,
    noShows: open.filter(r => /^No-show/.test(r.why)).length };
}

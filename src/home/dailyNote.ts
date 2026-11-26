// The daily note on the Home screen (George, 2026-11-26): where production stands for the month, what today
// looks like, and what is waiting. Rules-based; at go-live Claude can rewrite it in a warmer voice from the same numbers.
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
}
export interface DailyNote {
  hello: string;
  lines: string[];
  month: { label: string; alp: number; goal: number; pct: number; toGo: number; daysLeft: number; perDay: number };
  week: { alp: number; sales: number; prevAlp: number };
  todayAlp: number;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const time = (ms: number, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);

export function dailyNote(x: NoteInput): DailyNote {
  const { now, tz } = x, p = parts(now, tz);
  const monthStart = zoned(p.y, p.m, 1, 0, 0, tz), nextMonth = p.m === 12 ? zoned(p.y + 1, 1, 1, 0, 0, tz) : zoned(p.y, p.m + 1, 1, 0, 0, tz);
  const daysLeft = Math.round((nextMonth - startOfDay(now, tz)) / 86_400_000);   // including today
  const inRange = (s: SaleRecord, a: number, b: number) => s.at >= a && s.at < b;
  const alp = x.sales.filter(s => inRange(s, monthStart, nextMonth)).reduce((a, s) => a + saleAlp(s), 0);
  const toGo = Math.max(0, x.goal - alp), perDay = daysLeft ? toGo / daysLeft : toGo;
  const pct = x.goal ? Math.round((alp / x.goal) * 100) : 0;
  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(now);
  // this week so far (Monday on) against the same days last week
  const monday = addDays(startOfDay(now, tz), -((p.wd + 6) % 7), tz);
  const wk = x.sales.filter(s => s.at >= monday && s.at <= now);
  const prev = x.sales.filter(s => s.at >= addDays(monday, -7, tz) && s.at <= now - 7 * 86_400_000);
  const week = { alp: wk.reduce((a, s) => a + saleAlp(s), 0), sales: wk.length, prevAlp: prev.reduce((a, s) => a + saleAlp(s), 0) };
  const todayAlp = x.sales.filter(s => sameDay(s.at, now, tz)).reduce((a, s) => a + saleAlp(s), 0);

  const hello = `Good ${p.h < 12 ? 'morning' : p.h < 17 ? 'afternoon' : 'evening'}, ${x.name}.`;
  const lines: string[] = [];
  if (alp >= x.goal && x.goal) lines.push(`${label} is at ${money(alp)}. You passed your ${money(x.goal)} goal by ${money(alp - x.goal)}.`);
  else lines.push(`${label} is at ${money(alp)}, ${pct}% of your ${money(x.goal)} goal, with ${plural(daysLeft, 'day')} left. ${money(toGo)} to go is about ${money(perDay)} a day.`);
  const s = x.stats;
  lines.push(s.dials ? `Today so far: ${plural(s.dials, 'dial')}, ${plural(s.connects, 'connect')}, ${s.scheduled} booked${s.presented ? `, ${s.presented} presented` : ''}${s.sold ? `, ${s.sold} sold for ${money(todayAlp)}` : ''}.`
    : 'No dials yet today.');
  const next = x.apptsLeft[0];
  lines.push(next ? `${plural(x.apptsLeft.length, 'appointment')} still to run today. Next is ${next.name} at ${time(next.at, tz)}.`
    : `No more appointments today${x.apptsTomorrow ? `. ${plural(x.apptsTomorrow, 'appointment')} booked for tomorrow` : ''}.`);
  const w = x.waiting, parts2 = [w.callbacks && plural(w.callbacks, 'callback'), w.followUps && plural(w.followUps, 'follow-up'), w.noShows && plural(w.noShows, 'no-show')].filter(Boolean) as string[];
  if (parts2.length) lines.push(`Waiting on Today: ${parts2.length > 1 ? parts2.slice(0, -1).join(', ') + ' and ' + parts2.at(-1) : parts2[0]}.`);
  lines.push(week.sales || week.prevAlp ? `This week: ${money(week.alp)} from ${plural(week.sales, 'sale')}, against ${money(week.prevAlp)} by this point last week.` : 'No sales yet this week.');
  return { hello, lines, month: { label, alp, goal: x.goal, pct, toGo, daysLeft, perDay }, week, todayAlp };
}

/** Today's waiting counts from the Today list's "why" labels. */
export function waitingCounts(rows: { why: string; done: boolean }[]) {
  const open = rows.filter(r => !r.done);
  return { callbacks: open.filter(r => /^Callback/.test(r.why)).length, followUps: open.filter(r => /^Follow-up/.test(r.why)).length,
    noShows: open.filter(r => /^No-show/.test(r.why)).length };
}

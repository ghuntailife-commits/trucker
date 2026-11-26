// Results and Sales reports (the old Results, Sales, No Sales, Best Times and Daily Summary tabs), computed from the
// Activity Log and the sale / no-sale records. Pure functions: the same code runs in the browser and on the server.
import type { LogEvent } from '../rules/types';
import { tagKind, type TagKind } from '../rules/tags';
import { addDays, dayKey, parts, startOfDay, zoned, DAY_MS } from '../rules/time';
import type { SaleRecord, NoSaleRecord } from '../rules/results';
import { OBJECTIONS } from '../rules/results';

export interface Who { first: string; last: string; phone: string; company: string; list: string }
export interface Range { from: number; to: number; label: string }

export const isDial = (e: LogEvent) => e.kind === 'Dial';
const isTag = (e: LogEvent, ...k: TagKind[]) => e.kind === 'Tag' && k.includes(tagKind(e.tag));
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const inR = (t: number, r: Range) => t >= r.from && t < r.to;
export const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

/** This month so far, last 30 days, or everything. */
export function rangeFor(kind: 'month' | '30d' | 'all', now: number, tz: string, firstAt = 0): Range {
  const end = addDays(startOfDay(now, tz), 1, tz);
  if (kind === 'month') { const p = parts(now, tz); return { from: zoned(p.y, p.m, 1, 0, 0, tz), to: end, label: new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(now) }; }
  if (kind === '30d') return { from: addDays(startOfDay(now, tz), -29, tz), to: end, label: 'Last 30 days' };
  return { from: Math.min(firstAt || now, now), to: end, label: 'All time' };
}

// ---------- the funnel ----------
export interface Funnel { dials: number; connects: number; scheduled: number; presented: number; sold: number; noShows: number; calledInto: number }
export function funnel(log: LogEvent[], sales: SaleRecord[], r: Range): Funnel {
  const ev = log.filter(e => inR(e.at, r));
  return {
    dials: sum(ev.filter(isDial).map(e => e.count)),
    connects: ev.filter(e => e.kind === 'Tag' && e.reach).length,
    scheduled: ev.filter(e => isTag(e, 'scheduled')).length,
    presented: ev.filter(e => isTag(e, 'presented', 'sold')).length,
    sold: sales.filter(s => inR(s.at, r)).length,
    noShows: ev.filter(e => isTag(e, 'noshow')).length,
    calledInto: ev.filter(e => isTag(e, 'calledInto')).length,
  };
}

// ---------- reach rates ----------
export interface Bucket { key: string; label: string; dials: number; reached: number }
const bucket = (key: string, label = key): Bucket => ({ key, label, dials: 0, reached: 0 });

function reachBy(log: LogEvent[], r: Range, keyOf: (e: LogEvent) => string | null, order: Bucket[]): Bucket[] {
  const m = new Map(order.map(b => [b.key, b]));
  for (const e of log) {
    if (!inR(e.at, r)) continue;
    const k = keyOf(e); if (k == null) continue;
    let b = m.get(k);
    if (!b) { b = bucket(k); m.set(k, b); order.push(b); }
    if (isDial(e)) b.dials += e.count;
    else if (e.kind === 'Tag' && e.reach) b.reached++;
  }
  return order;
}

export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
export function reachByHour(log: LogEvent[], r: Range, tz: string, from = 7, to = 21): Bucket[] {
  const order = Array.from({ length: to - from + 1 }, (_, i) => bucket(String(from + i), hourLabel(from + i)));
  return reachBy(log, r, e => { const h = parts(e.at, tz).h; return h < from || h > to ? null : String(h); }, order);
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wdIdx = (ms: number, tz: string) => (parts(ms, tz).wd + 6) % 7;
export function reachByWeekday(log: LogEvent[], r: Range, tz: string): Bucket[] {
  return reachBy(log, r, e => WEEKDAYS[wdIdx(e.at, tz)], WEEKDAYS.map(d => bucket(d)));
}
export function reachByList(log: LogEvent[], r: Range): Bucket[] {
  return reachBy(log, r, e => e.list || '(none)', []).sort((a, b) => a.key.localeCompare(b.key));
}
/** 1st, 2nd ... dial on a contact (5th and later together, like the sheet). */
export function reachByDialNo(log: LogEvent[], r: Range, cap = 5): Bucket[] {
  const lab = (n: number) => (n >= cap ? `${cap}th dial+` : ['1st', '2nd', '3rd', '4th'][n - 1] + ' dial');
  const order = Array.from({ length: cap }, (_, i) => bucket(String(i + 1), lab(i + 1)));
  return reachBy(log, r, e => (e.dials > 0 ? String(Math.min(e.dials, cap)) : null), order);
}
export function freshVsRetry(log: LogEvent[], r: Range): Bucket[] {
  return reachBy(log, r, e => (e.dials > 0 ? (e.dials === 1 ? 'fresh' : 'retry') : null),
    [bucket('fresh', 'Fresh · 1st dial'), bucket('retry', 'Retry · 2nd dial or later')]);
}
/** Weekday × hour grid of reach rates (the "When to dial" heat map). */
export function heatmap(log: LogEvent[], r: Range, tz: string, from = 7, to = 20): Bucket[][] {
  const g = Array.from({ length: to - from + 1 }, (_, i) => WEEKDAYS.map(d => bucket(`${d}|${from + i}`, `${d} ${hourLabel(from + i)}`)));
  for (const e of log) {
    if (!inR(e.at, r)) continue;
    const h = parts(e.at, tz).h; if (h < from || h > to) continue;
    const b = g[h - from][wdIdx(e.at, tz)];
    if (isDial(e)) b.dials += e.count; else if (e.kind === 'Tag' && e.reach) b.reached++;
  }
  return g;
}

/** Where every dial ended: booked, callback, hung up, other answer, do not call, bad number, no answer. */
export function dialOutcomes(log: LogEvent[], r: Range) {
  const ev = log.filter(e => inR(e.at, r) && e.kind === 'Tag' && tagKind(e.tag) !== 'noshow' && tagKind(e.tag) !== 'presented' && tagKind(e.tag) !== 'sold');
  const dials = sum(log.filter(e => inR(e.at, r) && isDial(e)).map(e => e.count));
  const n = (...k: TagKind[]) => ev.filter(e => k.includes(tagKind(e.tag))).length;
  const rows = [
    { key: 'scheduled', label: 'Scheduled', count: n('scheduled') },
    { key: 'calledInto', label: 'Called into', count: n('calledInto') },
    { key: 'callback', label: 'Callback', count: n('callback') },
    { key: 'other', label: 'Other answered', count: n('other', 'given') },
    { key: 'hungup', label: 'Hung up', count: n('notInterested') },
    { key: 'dnc', label: 'Do not call', count: n('dnc') },
    { key: 'bad', label: 'Bad number', count: n('bad') },
  ];
  const tagged = sum(rows.map(x => x.count));
  rows.push({ key: 'noanswer', label: 'No answer', count: Math.max(dials - tagged, 0) });
  return { dials, rows };
}

// ---------- per day ----------
export interface DayRow {
  day: number; dials: number; connects: number; scheduled: number; presented: number; sold: number; alp: number; monthly: number;
  callbacks: number; noShows: number; hungUp: number; bad: number; dnc: number; imported: number;
}
export function daily(log: LogEvent[], sales: SaleRecord[], r: Range, tz: string): DayRow[] {
  const rows: DayRow[] = [];
  const idx = new Map<number, DayRow>();
  for (let d = startOfDay(r.from, tz); d < r.to; d = addDays(d, 1, tz)) {
    const row: DayRow = { day: d, dials: 0, connects: 0, scheduled: 0, presented: 0, sold: 0, alp: 0, monthly: 0, callbacks: 0, noShows: 0, hungUp: 0, bad: 0, dnc: 0, imported: 0 };
    rows.push(row); idx.set(dayKey(d, tz), row);
  }
  for (const e of log) {
    const row = idx.get(dayKey(e.at, tz)); if (!row || !inR(e.at, r)) continue;
    if (isDial(e)) row.dials += e.count;
    else if (e.kind === 'Import') row.imported += e.count;
    else if (e.kind === 'Tag') {
      if (e.reach) row.connects++;
      const k = tagKind(e.tag);
      if (k === 'scheduled') row.scheduled++;
      else if (k === 'presented' || k === 'sold') row.presented++;
      else if (k === 'callback') row.callbacks++;
      else if (k === 'noshow') row.noShows++;
      else if (k === 'notInterested') row.hungUp++;
      else if (k === 'bad') row.bad++;
      else if (k === 'dnc') row.dnc++;
    }
  }
  for (const s of sales) { const row = idx.get(dayKey(s.at, tz)); if (row && inR(s.at, r)) { row.sold++; row.alp += s.alp; row.monthly += s.monthly; } }
  return rows;
}

/** Rolling 7 days ending today against the 7 days before. */
export function lastSeven(log: LogEvent[], sales: SaleRecord[], now: number, tz: string) {
  const end = addDays(startOfDay(now, tz), 1, tz);
  const a: Range = { from: addDays(end, -7, tz), to: end, label: '' }, b: Range = { from: addDays(end, -14, tz), to: a.from, label: '' };
  const f = (r: Range) => ({ ...funnel(log, sales, r), alp: sum(sales.filter(s => inR(s.at, r)).map(s => s.alp)) });
  return { now: f(a), before: f(b), from: a.from, to: end - 1 };
}

// ---------- sales ----------
export interface SaleView extends SaleRecord { who: Who }
export function salesIn(sales: SaleRecord[], r: Range, who: (id: string) => Who): SaleView[] {
  return sales.filter(s => inR(s.at, r)).map(s => ({ ...s, who: who(s.contactId) })).sort((x, y) => y.at - x.at);
}

export function salesSummary(sales: SaleRecord[], log: LogEvent[], now: number, tz: string, goal: number) {
  const month = rangeFor('month', now, tz);
  const ms = sales.filter(s => inR(s.at, month));
  const alp = sum(ms.map(s => s.alp));
  const p = parts(now, tz);
  const daysIn = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  const dayNo = p.d, left = daysIn - dayNo + 1;
  const trial = ms.filter(s => s.alpType === 'Trial'), std = ms.filter(s => s.alpType === 'Standard');
  const f = funnel(log, sales, month);
  const todays = ms.filter(s => dayKey(s.at, tz) === dayKey(now, tz));
  return {
    month, alp, goal, toGo: Math.max(goal - alp, 0), perDayNeeded: left > 0 ? Math.max(goal - alp, 0) / left : 0,
    pace: dayNo > 0 ? alp / dayNo * daysIn : 0, aheadOfPace: alp - goal * dayNo / daysIn, daysIn, dayNo,
    count: ms.length, avg: ms.length ? alp / ms.length : 0, biggest: Math.max(0, ...ms.map(s => s.alp)),
    trial: { count: trial.length, alp: sum(trial.map(s => s.alp)) }, standard: { count: std.length, alp: sum(std.map(s => s.alp)) },
    monthly: sum(ms.map(s => s.monthly)), closeRate: pct(f.sold, f.presented), presented: f.presented,
    today: { count: todays.length, alp: sum(todays.map(s => s.alp)) }, allTime: sales.length,
  };
}

/** Running ALP total for each day of the month, with the even-pace goal line. */
export function cumulative(sales: SaleRecord[], now: number, tz: string, goal: number) {
  const m = rangeFor('month', now, tz), p = parts(now, tz);
  const daysIn = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  const out: { day: number; total: number | null; std: number; trial: number; goalPace: number }[] = [];
  let run = 0;
  for (let d = 1; d <= daysIn; d++) {
    const from = zoned(p.y, p.m, d, 0, 0, tz), to = addDays(from, 1, tz);
    const ds = sales.filter(s => s.at >= from && s.at < to && s.at >= m.from);
    const std = sum(ds.filter(s => s.alpType === 'Standard').map(s => s.alp)), trial = sum(ds.filter(s => s.alpType === 'Trial').map(s => s.alp));
    run += std + trial;
    out.push({ day: d, total: d <= p.d ? run : null, std, trial, goalPace: goal * d / daysIn });
  }
  return out;
}

export const TIME_BLOCKS = [[0, 10, '< 10A'], [10, 12, '10A–12P'], [12, 14, '12–2P'], [14, 16, '2–4P'], [16, 18, '4–6P'], [18, 20, '6–8P'], [20, 24, '8P +']] as const;
export function salesByWeekday(sales: SaleRecord[], tz: string) {
  return WEEKDAYS.map((d, i) => { const s = sales.filter(x => wdIdx(x.at, tz) === i); return { label: d, count: s.length, alp: sum(s.map(x => x.alp)) }; });
}
export function salesByTime(sales: SaleRecord[], tz: string) {
  return TIME_BLOCKS.map(([a, b, label]) => { const s = sales.filter(x => { const h = parts(x.at, tz).h; return h >= a && h < b; }); return { label, count: s.length, alp: sum(s.map(x => x.alp)) }; });
}
export function salesBySource(sales: SaleRecord[], who: (id: string) => Who) {
  const m = new Map<string, { label: string; count: number; alp: number }>();
  for (const s of sales) { const k = who(s.contactId).list || '(none)'; const v = m.get(k) ?? { label: k, count: 0, alp: 0 }; v.count++; v.alp += s.alp; m.set(k, v); }
  return [...m.values()].sort((a, b) => b.alp - a.alp);
}

// ---------- presentations ----------
/** Mon–Sun weeks that touch the range, with presented (sold included) and sold counts. */
export function presentedByWeek(log: LogEvent[], sales: SaleRecord[], r: Range, tz: string) {
  const out: { from: number; to: number; presented: number; sold: number }[] = [];
  let w = addDays(startOfDay(r.from, tz), -wdIdx(r.from, tz), tz);
  while (w < r.to) {
    const to = addDays(w, 7, tz), wr: Range = { from: Math.max(w, r.from), to: Math.min(to, r.to), label: '' };
    out.push({ from: wr.from, to: wr.to, presented: log.filter(e => inR(e.at, wr) && isTag(e, 'presented', 'sold')).length, sold: sales.filter(s => inR(s.at, wr)).length });
    w = to;
  }
  return out;
}
export function objections(noSales: NoSaleRecord[], r: Range) {
  const ns = noSales.filter(n => inR(n.at, r));
  const rows = OBJECTIONS.map(o => ({ label: o as string, count: ns.filter(n => n.objections.includes(o)).length }));
  return { logged: ns.length, rows, share: (c: number) => pct(c, ns.length) };
}
export function followUps(noSales: NoSaleRecord[], now: number, tz: string) {
  const today = startOfDay(now, tz);
  return noSales.filter(n => n.followUp).map(n => { const [y, m, d] = n.followUp.split('-').map(Number); return { ...n, due: zoned(y, m, d, 0, 0, tz) }; })
    .filter(n => n.due >= addDays(today, -7, tz)).sort((a, b) => a.due - b.due);
}

// ---------- plain-English findings ("What the numbers say") ----------
export function insights(log: LogEvent[], sales: SaleRecord[], now: number, tz: string, goal: number, minDials = 30): string[] {
  const all = rangeFor('all', now, tz, log[0]?.at ?? now), month = rangeFor('month', now, tz);
  const out: string[] = [];
  const hours = reachByHour(log, all, tz).filter(b => b.dials >= minDials);
  const days = reachByWeekday(log, all, tz).filter(b => b.dials >= minDials);
  const best = <T extends Bucket>(a: T[]) => a.reduce<T | null>((m, b) => (!m || pct(b.reached, b.dials) > pct(m.reached, m.dials) ? b : m), null);
  const bh = best(hours), bd = best(days);
  if (bh && bd) out.push(`Best hour is ${bh.label} (${Math.round(100 * pct(bh.reached, bh.dials))}% reached) and best day is ${bd.label} (${Math.round(100 * pct(bd.reached, bd.dials))}%). Stack your dialing there.`);
  const [fr, rt] = freshVsRetry(log, all);
  if (fr.dials >= minDials && rt.dials >= minDials) {
    const a = pct(fr.reached, fr.dials), b = pct(rt.reached, rt.dials);
    out.push(b > a * 1.2 ? `Retries are reaching noticeably more people (${Math.round(100 * b)}% vs ${Math.round(100 * a)}% for fresh contacts). Work retries before fresh.`
      : `Fresh contacts and retries reach about the same share (${Math.round(100 * a)}% vs ${Math.round(100 * b)}%).`);
  }
  const f = funnel(log, sales, month);
  const answered = f.presented + f.noShows;
  if (f.noShows) out.push(`${f.noShows} booked appointments did not show this month (${Math.round(100 * pct(f.noShows, answered))}%). Each one that shows is worth about $${Math.round(pct(sum(sales.filter(s => inR(s.at, month)).map(s => s.alp)), f.presented)).toLocaleString('en-US')} in ALP, so confirm them.`);
  const s = salesSummary(sales, log, now, tz, goal);
  if (s.toGo > 0 && s.avg > 0) {
    const need = Math.ceil(s.toGo / s.avg), perSale = pct(f.dials, f.sold);
    out.push(`$${Math.round(s.toGo).toLocaleString('en-US')} to go to hit $${goal.toLocaleString('en-US')}. At your numbers that is about ${need} more sale${need === 1 ? '' : 's'}` + (perSale ? `, or ${Math.round(need * perSale).toLocaleString('en-US')} dials (${Math.round(need * perSale / Math.max(s.daysIn - s.dayNo + 1, 1))} a day).` : '.'));
  } else if (s.alp >= goal && goal > 0) out.push(`Goal reached: $${Math.round(s.alp).toLocaleString('en-US')} of $${goal.toLocaleString('en-US')}.`);
  return out;
}

export { DAY_MS };

// The Monday coaching note: one short email per agent about last week (Mon–Sun), written from their own numbers.
// It picks ONE thing to work on this week, so the note stays useful instead of becoming a report.
// Every agent gets one (George, 2026-11-26). It is built here from the numbers; it goes out at go-live.
import type { LogEvent } from '../rules/types';
import type { SaleRecord, NoSaleRecord } from '../rules/results';
import { addDays, startOfDay, parts, md } from '../rules/time';
import { funnel, pct, reachByDialNo, heatmap, objections, salesSummary, type Range, type Funnel } from '../reports/results';

export interface CoachInput { name: string; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[]; now: number; tz: string; goal: number }
export interface CoachLine { label: string; now: string; before: string; trend: 'up' | 'down' | 'same' }
export interface CoachNote {
  agent: string;
  week: Range;
  subject: string;
  hello: string;
  lines: CoachLine[];
  wins: string[];
  focus: { key: string; title: string; why: string; how: string[] };
  pace: string;
  bestTime: string;
  /** The whole note as plain text, as it would be emailed. */
  text: string;
  quiet: boolean;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const p100 = (a: number, b: number) => Math.round(100 * pct(a, b)) + '%';
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Last Monday to Sunday before `now` (on a Monday morning: the week that just ended). */
export function lastWeek(now: number, tz: string): Range {
  const today = startOfDay(now, tz), wd = (parts(now, tz).wd + 6) % 7;     // 0 = Monday
  const from = addDays(today, -wd - 7, tz), to = addDays(from, 7, tz);
  return { from, to, label: `${md(from, tz)}–${md(to - 1, tz)}` };
}

function trend(a: number, b: number): CoachLine['trend'] { return a > b * 1.05 ? 'up' : a < b * 0.95 ? 'down' : 'same'; }

export function mondayNote({ name, log, sales, noSales, now, tz, goal }: CoachInput): CoachNote {
  const week = lastWeek(now, tz), prev: Range = { from: addDays(week.from, -7, tz), to: week.from, label: '' };
  const f = funnel(log, sales, week), b = funnel(log, sales, prev);
  const alp = sum(sales.filter(s => s.at >= week.from && s.at < week.to).map(s => s.alp));
  const alpB = sum(sales.filter(s => s.at >= prev.from && s.at < prev.to).map(s => s.alp));
  const shows = (x: Funnel) => x.presented - x.calledInto;   // booked presentations that happened
  const lines: CoachLine[] = [
    { label: 'Dials', now: f.dials.toLocaleString('en-US'), before: b.dials.toLocaleString('en-US'), trend: trend(f.dials, b.dials) },
    { label: 'Reached', now: `${f.connects} (${p100(f.connects, f.dials)})`, before: `${b.connects} (${p100(b.connects, b.dials)})`, trend: trend(pct(f.connects, f.dials), pct(b.connects, b.dials)) },
    { label: 'Booked', now: String(f.scheduled), before: String(b.scheduled), trend: trend(f.scheduled, b.scheduled) },
    { label: 'Presented', now: String(f.presented), before: String(b.presented), trend: trend(f.presented, b.presented) },
    { label: 'Sold', now: String(f.sold), before: String(b.sold), trend: trend(f.sold, b.sold) },
    { label: 'ALP', now: money(alp), before: money(alpB), trend: trend(alp, alpB) },
  ];
  const quiet = f.dials < 20;

  // what went well
  const wins: string[] = [];
  if (alp > 0) wins.push(`${f.sold} sale${f.sold === 1 ? '' : 's'} for ${money(alp)} ALP.`);
  if (f.dials > b.dials * 1.1 && b.dials) wins.push(`${Math.round(100 * (f.dials / b.dials - 1))}% more dials than the week before.`);
  if (pct(f.connects, f.dials) > pct(b.connects, b.dials) * 1.1 && f.dials >= 50) wins.push(`You reached ${p100(f.connects, f.dials)} of the people you dialed, up from ${p100(b.connects, b.dials)}.`);
  if (f.scheduled >= 3 && f.scheduled > b.scheduled) wins.push(`${f.scheduled} appointments booked, up from ${b.scheduled}.`);
  if (f.calledInto) wins.push(`${f.calledInto} presented on the first call.`);

  // the best time to dial, from the last 6 weeks
  const six: Range = { from: addDays(week.to, -42, tz), to: week.to, label: '' };
  let best: { label: string; rate: number; dials: number } | null = null;
  for (const row of heatmap(log, six, tz)) for (const c of row) {
    if (c.dials < 25) continue;
    const r = pct(c.reached, c.dials);
    if (!best || r > best.rate) best = { label: c.label, rate: r, dials: c.dials };
  }
  const bestTime = best ? `Your best hour over the last 6 weeks is ${best.label.replace(' ', ' at ')} (${Math.round(100 * best.rate)}% reached on ${best.dials} dials). Block it off.` : '';

  // the 2nd dial: how often a 1st-dial no-answer got its 2nd dial within a week
  const dialNo = reachByDialNo(log, six);
  const r1 = pct(dialNo[0].reached, dialNo[0].dials), r2 = pct(dialNo[1].reached, dialNo[1].dials);
  const firstDialed = new Map<string, number>(), reached = new Set<string>();
  for (const e of log) {
    if (e.kind === 'Tag' && e.reach) reached.add(e.contactId);
    if (e.kind === 'Dial' && e.dials === 1 && e.at >= prev.from && e.at < week.from) firstDialed.set(e.contactId, e.at);
  }
  let owed = 0, got = 0;
  for (const [id, at] of firstDialed) {
    if (reached.has(id) && log.some(e => e.contactId === id && e.kind === 'Tag' && e.reach && e.at < at + 3_600_000)) continue;
    owed++;
    if (log.some(e => e.contactId === id && e.kind === 'Dial' && e.dials === 2 && e.at > at && e.at < at + 7 * 86_400_000)) got++;
  }

  // the one thing to work on
  const showRate = pct(shows(f), shows(f) + f.noShows), closeRate = pct(f.sold, f.presented);
  const ob = objections(noSales, { from: addDays(week.to, -28, tz), to: week.to, label: '' });
  const topOb = [...ob.rows].sort((x, y) => y.count - x.count)[0];
  // what one presentation is worth, from the last 6 weeks (one week is too few to go on)
  const f6 = funnel(log, sales, six), perShow = pct(sum(sales.filter(x => x.at >= six.from && x.at < six.to).map(x => x.alp)), f6.presented);
  let focus: CoachNote['focus'];
  if (quiet) {
    focus = { key: 'volume', title: 'Get a full week of dials in', why: `Only ${f.dials} dials went in last week, so there is not much to learn from yet.`,
      how: ['Pick your 3 best hours and put them on the calendar like appointments.', 'Aim for 100 dials a day; Today keeps the list ready.'] };
  } else if (b.dials && f.dials < b.dials * 0.7) {
    focus = { key: 'volume', title: 'Get the dials back up', why: `Dials fell from ${b.dials} to ${f.dials}. Everything else comes from dials.`,
      how: ['Start each day with a 1-hour block before anything else.', `Your list has the callbacks and retries first, so the first hour pays the most.`] };
  } else if (f.noShows >= 3 && showRate < 0.6) {
    focus = { key: 'shows', title: 'Turn more bookings into shows', why: `${f.noShows} of ${shows(f) + f.noShows} appointments did not show (${Math.round(100 * (1 - showRate))}%). Each presentation is worth about ${money(perShow)} in ALP to you.`,
      how: ['Confirm every appointment the day before and again the morning of (the Today list asks you).', 'Send the reminder text with your number so they can text back.', 'Book within 48 hours; appointments further out show less.'] };
  } else if (owed >= 10 && got / owed < 0.6 && r2 > r1 * 1.3) {
    focus = { key: 'second', title: 'Give every contact a 2nd dial', why: `Your 2nd dial reaches ${Math.round(100 * r2)}% against ${Math.round(100 * r1)}% on the 1st, but only ${got} of ${owed} first-dial no-answers got a 2nd dial within a week.`,
      how: ['Work the Retry tab before Fresh in the afternoon.', 'Leave Re-sort to the morning so retries come back in order.'] };
  } else if (f.presented >= 3 && closeRate < 0.35 && topOb && topOb.count) {
    focus = { key: 'close', title: `Get ahead of "${topOb.label}"`, why: `You closed ${f.sold} of ${f.presented} presentations. "${topOb.label}" came up most in the last 4 weeks (${topOb.count} times).`,
      how: [`Bring it up yourself before they do, early in the presentation.`, 'Book the follow-up on the call with a date, not "I will call you".'] };
  } else {
    focus = { key: 'time', title: 'Dial in your best hours', why: best ? `${best.label} reaches ${Math.round(100 * best.rate)}% of people for you.` : 'Your numbers are steady; protect your best hours.',
      how: ['Keep your callbacks and confirms out of that hour; save it for dials.', 'Use the slow hours for Needs Number and notes.'] };
  }

  const s = salesSummary(sales, log, now, tz, goal);
  const pace = goal > 0 ? (s.alp >= goal ? `Goal reached: ${money(s.alp)} of ${money(goal)} this month.`
    : `${money(s.alp)} of ${money(goal)} this month, ${money(s.toGo)} to go${s.perDayNeeded ? ` (about ${money(s.perDayNeeded)} a day)` : ''}.`) : '';

  const hello = `Good morning ${name},`;
  const subject = `Your week, ${week.label}: ${f.sold ? `${f.sold} sold, ${money(alp)}` : `${f.dials} dials, ${f.scheduled} booked`}`;
  const text = [
    hello, '',
    `Here is last week (${week.label}) next to the week before.`, '',
    ...lines.map(l => `- ${l.label}: ${l.now} (was ${l.before})`), '',
    ...(wins.length ? ['What went well:', ...wins.map(w => `- ${w}`), ''] : []),
    `This week, one thing: ${focus.title}.`, focus.why, ...focus.how.map(h => `- ${h}`), '',
    ...(bestTime ? [bestTime, ''] : []),
    ...(pace ? [pace, ''] : []),
    'Have a good week.',
  ].join('\n');
  return { agent: name, week, subject, hello, lines, wins, focus, pace, bestTime, text, quiet };
}

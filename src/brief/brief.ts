// The call brief: a 5-second read above the Call button for callbacks, follow-ups and no-shows (George, 2026-11-26).
// Who the person is, where it stands, what to open with, what to watch for. Built from the contact's own notes,
// its no-sale form and the agent's results. At go-live Claude rewrites it in plain words (src/brief/ai.ts); this
// version is the fallback when the AI is off or slow, so the brief never blocks a dial.
import type { Contact } from '../rules/types';
import type { NoSaleRecord } from '../rules/results';
import type { Config } from '../rules/config';
import { notesNewestFirst, isHistoryNote } from '../rules/notes';
import { parts, md, DAY_MS, startOfDay, zoned } from '../rules/time';

export type BriefKind = 'callback' | 'followUp' | 'noshow';
export interface Brief { kind: BriefKind; who: string; stands: string; openWith: string; watch: string[] }
export interface BriefInput {
  c: Contact; kind: BriefKind; agent: string; now: number; tz: string; cfg: Pick<Config, 'callbackTries' | 'noShowTries'>;
  /** The contact's latest no-sale form, if any. */
  noSale?: NoSaleRecord;
  /** The agent's no-show rate (0-1), for the no-show brief. */
  noShowRate?: number;
}

/** Which brief a Today row gets, from its "why" label. Fresh contacts and retries get none. */
export function briefKind(why: string): BriefKind | null {
  const w = why.replace(/^DONE TODAY - /, '');
  if (w.startsWith('Callback')) return 'callback';
  if (w.startsWith('Follow-up')) return 'followUp';
  if (w.startsWith('No-show') || w.startsWith('Did they')) return 'noshow';
  return null;
}

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
/** What the research notes say: age, how long at the job, whether the backup number is old. */
export function readResearch(notes: string) {
  const r = notesNewestFirst(notes).filter(l => !isHistoryNote(l)).join(' ');
  const age = r.match(/\b[A-Z][a-z]+(?: [A-Z][a-z.]+)*(?: [A-Z][a-z]+)*, (\d{2}),/)?.[1] ?? r.match(/\bage (\d{2})\b/i)?.[1] ?? null;
  const since = r.match(new RegExp(`since (?:(${MONTHS})[a-z]* )?(\\d{4})`))?.slice(1).filter(Boolean).join(' ') ?? null;
  const oldBackup = r.match(/[Bb]ackup[^.]*?dated \(?((?:[A-Z][a-z]{2} )?\d{4})\)?/)?.[1] ?? null;
  return { age: age ? Number(age) : null, since, oldBackup };
}

const hist = (c: Contact) => notesNewestFirst(c.notes).filter(isHistoryNote);
const hourOf = (t: number, tz: string) => parts(t, tz).h;
const timeTxt = (t: number, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(t).replace(':00', '');
const yearsSince = (since: string | null, now: number) => { const y = Number(since?.match(/\d{4}/)?.[0]); return y ? new Date(now).getUTCFullYear() - y : null; };

/** Callback and appointment times written in the notes ("Callback Sat 11/21 3:30 PM"), newest first. */
function askedTimes(c: Contact, re: RegExp): { day: string; h: number }[] {
  const out: { day: string; h: number }[] = [];
  for (const l of hist(c)) {
    const m = l.match(re); if (!m) continue;
    let h = Number(m[2]) % 12; if (/PM/i.test(m[4] ?? '')) h += 12;
    out.push({ day: m[1], h });
  }
  return out;
}
const TIME_RE = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\w* \\d{1,2}\\/\\d{1,2},? (\\d{1,2})(:\\d{2})? ?(AM|PM)';
const offHours = (x: { day: string; h: number }) => x.day === 'Sat' || x.day === 'Sun' || x.h >= 17 || x.h < 8;

const OPENERS: [RegExp, string][] = [
  [/account|bank|card|routing/i, 'Last time you just needed your {thing} to get started. Do you have it handy now? It takes about two minutes.'],
  [/^Price$|Affordab|budget|cost/i, 'I went back over the numbers for you. I think there is a way to fit it in the budget. Do you have five minutes?'],
  [/Spouse|Family|wife|husband/i, 'Did you get a chance to talk it over with your family? I am happy to walk them through it too.'],
  [/Existing Coverage|coverage through work/i, 'Last time you mentioned the coverage through work. I can show you side by side what happens to it if you leave or retire.'],
  [/Timing|Needs to Think|research|wait/i, 'Last time the timing was not right. Is now a better week to finish getting you set up?'],
  [/Trust|Skeptic/i, 'I wanted to follow up and answer anything that did not sit right last time. What questions came up?'],
];

export function buildBrief({ c, kind, agent, now, tz, cfg, noSale, noShowRate }: BriefInput): Brief {
  const r = readResearch(c.notes);
  const yrs = yearsSince(r.since, now);
  const place = [c.city, c.state].filter(Boolean).join(' ');
  const work = [c.job, c.company].filter(Boolean).join(' at ');
  const who = `${c.first}${r.age ? `, ${r.age}` : ''}${place ? `, ${place}` : ''}. ${work || 'Job not known'}${r.since ? ` since ${r.since}` : ''}${yrs != null && yrs >= 8 ? `, ${yrs} years in` : ''}.`;
  const watch: string[] = [];
  let stands = '', openWith = '';
  const today = startOfDay(now, tz);

  if (kind === 'callback') {
    const asked = askedTimes(c, new RegExp('Callback ' + TIME_RE));
    const tries = c.callbackTries ?? 0;
    stands = `${asked.length > 1 ? `Asked for a callback ${asked.length} times` : 'Asked for a callback'}${c.callAt ? `, for ${timeTxt(c.callAt, tz)}` : ''}. This is try ${tries + 1} of ${cfg.callbackTries}${tries + 1 >= cfg.callbackTries ? '; after this one they go back on the regular list' : ''}.`;
    openWith = `"${c.first}, it's ${agent}, calling back like you asked. I'll keep it short."`;
    if (asked.length && asked.every(offHours)) watch.push('Every time they picked a time outside work hours (evenings or weekends). Call then, not midday.');
    if (asked.length > 1) watch.push('They have asked more than once, so they are interested, just hard to catch.');
  } else if (kind === 'followUp') {
    const n = noSale;
    const due = n?.followUp ? (() => { const [y, m, d] = n.followUp.split('-').map(Number); return zoned(y, m, d, 0, 0, tz); })() : null;
    const late = due != null ? Math.round((today - due) / DAY_MS) : 0;
    const why = n ? [n.objections.join(', '), n.reason].filter(Boolean).join(': ') : '';
    stands = n ? `Presented ${md(n.at, tz)}, no sale${why ? ` (${why})` : ''}. Follow-up was set for ${due ? md(due, tz) : 'no date'}${late > 0 ? `, ${late} day${late === 1 ? '' : 's'} ago` : ''}.` : 'Presented, no sale. A follow-up is due.';
    if (n?.followUpNote) stands += ` Your note: "${n.followUpNote}"`;
    const text = `${n?.reason ?? ''} ${(n?.objections ?? []).join(' ')}`;
    const hit = OPENERS.find(([re]) => re.test(text));
    const thing = n?.reason.match(/account number|bank info|card/i)?.[0]?.toLowerCase() ?? 'information';
    openWith = `"${c.first}, it's ${agent}. ${(hit?.[1] ?? 'Following up on our talk. Is now still a good time to finish getting you set up?').replace('{thing}', thing)}"`;
    if (/account|bank|card/i.test(text)) watch.push('This was a yes waiting on paperwork, not a no. Every day it sits, it cools.');
    if (late >= 3) watch.push(`It is ${late} days past the date you set. Call first thing.`);
  } else {
    const missed = askedTimes(c, new RegExp('(?:Scheduled|appt) ' + TIME_RE.replace('(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\w* ', '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\\w* ?')));
    const lastNo = hist(c).find(l => /No-showed/i.test(l));
    const tries = c.noShowTries ?? 0;
    stands = `${lastNo ? lastNo.replace(/^(\d{1,2}\/\d{1,2}): No-showed/, 'Missed the appointment on $1') : 'Missed the appointment'}. No-show try ${tries + 1} of ${cfg.noShowTries}.`;
    const wasDay = missed[0] && !offHours(missed[0]);
    openWith = `"${c.first}, ${agent} here. Looks like ${wasDay ? 'that time' : 'the other day'} got away from us. ${wasDay ? 'Is evening better with your schedule?' : 'When is a better time this week?'}"`;
    if (wasDay) watch.push(`They booked ${missed[0].h < 12 ? 'a morning' : 'a midday'} slot, likely during a shift. Offer after 6 PM.`);
    if (noShowRate && noShowRate > 0.3) watch.push(`About ${Math.round(noShowRate * 100)}% of your appointments no-show. Send the reminder text the morning of the new time.`);
  }
  if (r.oldBackup) watch.push(`The backup number is old (${r.oldBackup}). Use the main number.`);
  if (c.quals?.length) watch.push(`Tagged: ${c.quals.join(', ')}.`);
  return { kind, who, stands, openWith, watch: watch.slice(0, 3) };
}

/** Hour helper re-exported for tests. */
export const _hourOf = hourOf;

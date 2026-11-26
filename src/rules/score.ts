// Ranks fresh contacts by how often contacts like them have booked an appointment before.
// "Like them" = same employer, same job title, same state. Each is smoothed toward the overall rate, so a company
// with 2 contacts can't jump to the top on luck. Off until enough contacts have been dialed to learn from.
import type { Contact } from './types';
import { tagKind } from './tags';

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Booked = an appointment was set at some point (scheduled, no-showed, presented, sold or called into). */
export const booked = (c: Contact) => ['scheduled', 'noshow', 'presented', 'sold', 'calledInto'].includes(tagKind(c.tag)) || c.noShowTries > 0;

export interface FreshScorer {
  ready: boolean;
  /** Contacts dialed so far, and how many are needed before ranking starts. */
  results: number;
  need: number;
  /** 1 = average. 1.5 = contacts like this booked 50% more often than average. */
  score: (c: Contact) => number;
  /** The strongest reason a contact scores high, e.g. "UPS: 2.1x the average booking rate". */
  reason: (c: Contact) => string;
}

export function learnFreshScores(contacts: Contact[], minResults: number | null, k = 10): FreshScorer {
  const dialed = contacts.filter(c => c.dials > 0 || c.tag);
  const need = minResults ?? Infinity;
  const total = dialed.length, wins = dialed.filter(booked).length;
  const base = total ? wins / total : 0;
  const ready = minResults != null && total >= need && wins >= 5;
  type Tally = { n: number; w: number; label: string };
  const keys: [string, (c: Contact) => string, (c: Contact) => string][] = [
    ['company', c => norm(c.company), c => c.company],
    ['job', c => norm(c.job), c => c.job],
    ['state', c => c.state, c => c.state],
  ];
  const tallies = keys.map(() => new Map<string, Tally>());
  for (const c of dialed) keys.forEach(([, key, label], i) => {
    const kk = key(c); if (!kk) return;
    const t = tallies[i].get(kk) ?? { n: 0, w: 0, label: label(c) };
    t.n++; if (booked(c)) t.w++; tallies[i].set(kk, t);
  });
  const lifts = (c: Contact) => keys.map(([, key], i) => {
    const t = tallies[i].get(key(c));
    const rate = t ? (t.w + k * base) / (t.n + k) : base;
    return { lift: base ? rate / base : 1, t };
  });
  const score = (c: Contact) => {
    if (!ready) return 1;
    const l = lifts(c);
    return Math.exp(l.reduce((a, x) => a + Math.log(x.lift), 0) / l.length);   // geometric mean of the three
  };
  const reason = (c: Contact) => {
    if (!ready) return '';
    const best = lifts(c).filter(x => x.t && x.t.n >= 5).sort((a, b) => b.lift - a.lift)[0];
    return best && best.lift >= 1.2 ? `${best.t!.label}: ${best.lift.toFixed(1)}x the average booking rate` : '';
  };
  return { ready, results: total, need: minResults ?? 0, score, reason };
}

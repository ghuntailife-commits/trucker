// What each agent did each day (George, 2026-11-27: "see what everyone is doing daily and how many dials").
// Pure, tested in test/teamDaily.test.ts.
import type { LogEvent } from '../rules/types';
import type { SaleRecord } from '../rules/results';
import { funnel } from '../reports/results';

export interface DayStats { dials: number; connects: number; booked: number; presented: number; sold: number; noShows: number; alp: number;
  first: number | null; last: number | null }

export function dayStats(log: LogEvent[], sales: SaleRecord[], from: number, to: number): DayStats {
  const f = funnel(log, sales, { from, to, label: '' });
  const dialTimes = log.filter(e => e.kind === 'Dial' && e.at >= from && e.at < to).map(e => e.at);
  return { dials: f.dials, connects: f.connects, booked: f.scheduled, presented: f.presented, sold: f.sold, noShows: f.noShows,
    alp: sales.filter(s => s.at >= from && s.at < to).reduce((t, s) => t + s.alp, 0),
    first: dialTimes.length ? Math.min(...dialTimes) : null, last: dialTimes.length ? Math.max(...dialTimes) : null };
}

/** Right now: dialing (a dial in the last 15 minutes), on a break (dialed today), or not started. */
export function liveState(s: DayStats, now: number): 'dialing' | 'break' | 'none' {
  if (s.last == null) return 'none';
  return now - s.last <= 15 * 60_000 ? 'dialing' : 'break';
}

/** Hours between the first and last dial, to one decimal ("2.5 h"), or '' for one dial or none. */
export function spanHours(s: DayStats): string {
  if (s.first == null || s.last == null || s.last - s.first < 6 * 60_000) return '';
  return `${Math.round((s.last - s.first) / 360_000) / 10} h`;
}

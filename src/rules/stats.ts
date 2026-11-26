// Numbers for the charts, computed from the Activity Log.
import type { LogEvent } from './types';

export interface DialBucket { label: string; dials: number; reached: number }

/** Reach rate by which dial it was: 1st to 10th separately, then 11th and later together. */
export function reachByDial(log: LogEvent[]): DialBucket[] {
  const b: DialBucket[] = Array.from({ length: 11 }, (_, i) => ({ label: i < 10 ? String(i + 1) : '11+', dials: 0, reached: 0 }));
  const at = (n: number) => b[Math.min(Math.max(n, 1), 11) - 1];
  for (const e of log) {
    if (e.kind === 'Dial' && e.dials > 0) at(e.dials).dials += e.count;
    if (e.kind === 'Tag' && e.reach && e.dials > 0) at(e.dials).reached++;
  }
  return b;
}

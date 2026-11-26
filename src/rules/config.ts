// Settings that used to live on the Rules tab. Defaults are the values on George Truckers as of 2026-11-26.
import type { TagKind } from './tags';

export interface Config {
  tz: string;
  /** Days until the next try for untagged contacts, by dials so far: index 0 = 1 dial ... index 7 = 8 or more. */
  retryDays: number[];
  /** Days until next contact for tagged contacts. null = no follow-up (never comes back on its own). */
  tagDays: Partial<Record<TagKind, number | null>>;
  /** Call order: 1 = first. Tags without an order never appear on the working list. */
  callOrder: Partial<Record<TagKind, number>>;
  /** Rest after the backup number also had its dials (was Rules G11, which doubled as the "8 or more" spacing). */
  restDays: number;
  backupDials: number;        // dials on one number, nobody reached, before switching (7)
  callbackTries: number;      // 3
  noShowTries: number;        // 4
  newNumberPriorityDials: number; // 2
  doubleClickMs: number;      // 2 minutes
  swapUndoMs: number;         // a disposition within 20 minutes of an automatic swap puts the numbers back
  pmStartHour: number;        // 15 (Rules B19)
  pmRetryMaxDials: number;    // 6 (Rules B20)
  freshShare: number;         // 0.3 (Rules B21)
  listSize: number;           // 200 (Rules B22)
  catchUpHours: number | null;// 1 (Rules B23); null = catch-up off
  catchUpMaxDials: number;    // 10 (Rules B24)
  timeOfDayNudge: number;     // 1 (Rules B25)
}

export const DEFAULT_CONFIG: Config = {
  tz: 'America/New_York',
  retryDays: [1, 1, 1, 1, 2, 2, 3, 7],
  tagDays: { none: null, callback: 1, noshow: 0, scheduled: 1, notInterested: 75, bad: null, dnc: null, given: null },
  callOrder: { scheduled: 1, callback: 2, noshow: 3, none: 4, notInterested: 5 },
  restDays: 7,
  backupDials: 7,
  callbackTries: 3,
  noShowTries: 4,
  newNumberPriorityDials: 2,
  doubleClickMs: 120_000,
  swapUndoMs: 1_200_000,
  pmStartHour: 15,
  pmRetryMaxDials: 6,
  freshShare: 0.3,
  listSize: 200,
  catchUpHours: 1,
  catchUpMaxDials: 10,
  timeOfDayNudge: 1,
};

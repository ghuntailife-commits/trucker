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
  /** Follow-up calls after a presentation with no answer before it drops off Today (George, 2026-11-26). */
  followUpTries: number;      // 3
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
  // ---- v2 additions (George approved 2026-11-26). The V27 settings below turn them all off. ----
  /** Fresh share by time block (Eastern): before 12, 12-3, 3-6, after 6. null = always use freshShare. */
  freshShareByBlock: [number, number, number, number] | null;
  /** No answer before the PM start hour today -> back on the list after it, next up, with no re-sort. */
  autoPmRetry: boolean;
  /** Rank fresh contacts by what has booked before, once this many contacts have been dialed. null = off. */
  freshScoreMinResults: number | null;
  /** Ask for a second confirm on the morning of the appointment. */
  confirmMorningOf: boolean;
  /** Warn when an appointment is booked further out than this. */
  apptSoonHours: number;
  /** Calling hours in the contact's own time zone, [start, end) in whole hours: [8, 21] = 8 AM to 9 PM. Outside them a
   *  contact stays off Today, so after 9 PM Eastern the list fills from states where it is earlier. null = off (v27). */
  callHours: [number, number] | null;
}

/** Exactly the v27 sheet: used by the tests that prove the new app orders calls the same way. */
export const V27_CONFIG: Config = {
  tz: 'America/New_York',
  retryDays: [1, 1, 1, 1, 2, 2, 3, 7],
  tagDays: { none: null, callback: 1, noshow: 0, scheduled: 1, notInterested: 75, bad: null, dnc: null, given: null },
  callOrder: { scheduled: 1, callback: 2, noshow: 3, none: 4, notInterested: 5 },
  restDays: 7,
  backupDials: 7,
  callbackTries: 3,
  noShowTries: 4,
  followUpTries: 3,
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
  freshShareByBlock: null,
  autoPmRetry: false,
  freshScoreMinResults: null,
  confirmMorningOf: false,
  apptSoonHours: 48,
  callHours: null,
};

/**
 * The new app's settings: v27 plus George's 2026-11-26 changes. Retries beat fresh contacts at every hour on his
 * Best Times tab, and by the most in the afternoon and evening (2.8x and 4x), so fresh contacts lean to the morning
 * and midday and the evening is kept mostly for retries and callbacks.
 */
export const DEFAULT_CONFIG: Config = {
  ...V27_CONFIG,
  freshShare: 0.2,
  freshShareByBlock: [0.25, 0.25, 0.2, 0.1],
  autoPmRetry: true,
  freshScoreMinResults: 200,
  confirmMorningOf: true,
  callHours: [8, 21],   // George 2026-11-26: every state can be called until 9 PM its own time
};

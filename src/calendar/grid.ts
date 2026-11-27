// Time grid for the Appointments week (George, 2026-11-26): every appointment takes a 30-minute block,
// so open time shows as empty space, and dragging snaps to the half hour.
export const SLOT_MIN = 30;
export const BLOCK_MS = SLOT_MIN * 60_000;

/** First and last hour shown: 8 AM to 9 PM, stretched to fit anything earlier or later that week. */
export function hourRange(minutes: number[], from = 8, to = 21): [number, number] {
  let a = from, b = to;
  for (const m of minutes) { a = Math.min(a, Math.floor(m / 60)); b = Math.max(b, Math.ceil((m + SLOT_MIN) / 60)); }
  return [Math.max(0, a), Math.min(24, b)];
}

/** Side-by-side lanes for blocks that overlap (like a calendar app). Returns lane and lane count per key. */
export function lanes<T extends { key: string; start: number; len?: number }>(items: T[], len = BLOCK_MS): Map<string, { lane: number; of: number }> {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...items].sort((x, y) => x.start - y.start || x.key.localeCompare(y.key));
  let group: { key: string; lane: number }[] = [], ends: number[] = [], groupEnd = -Infinity;
  const close = () => { const of = Math.max(1, ends.length); for (const g of group) out.set(g.key, { lane: g.lane, of }); group = []; ends = []; };
  for (const it of sorted) {
    if (it.start >= groupEnd) close();
    let lane = ends.findIndex(e => e <= it.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.start + (it.len ?? len);
    group.push({ key: it.key, lane });
    groupEnd = Math.max(groupEnd, it.start + (it.len ?? len));
  }
  close();
  return out;
}

/** The half-hour slot a drop lands in, kept inside the hours shown. */
export function snapSlot(minutesFromTop: number, firstHour: number, lastHour: number): number {
  const slots = (lastHour - firstHour) * (60 / SLOT_MIN);
  return Math.min(slots - 1, Math.max(0, Math.round(minutesFromTop / SLOT_MIN)));
}

/** Is a half hour on this day free of every timed block (other than the one being moved)? */
export function isOpen(starts: number[], at: number, busy: { start: number; len: number }[] = []): boolean {
  return !starts.some(s => s < at + BLOCK_MS && s + BLOCK_MS > at) && !busy.some(b => b.start < at + BLOCK_MS && b.start + b.len > at);
}

/** The agent's working hours: minutes from midnight (Eastern) and the weekdays (0 = Sunday). */
export interface WorkHours { start: number; end: number; days: number[] }
export const DEFAULT_HOURS: WorkHours = { start: 9 * 60, end: 20 * 60, days: [1, 2, 3, 4, 5, 6] };

/** The next `n` open half hours inside working hours, at least 15 minutes from now, within two weeks. */
export function nextOpenings(n: number, now: number, hours: WorkHours, taken: number[], busy: { start: number; len: number }[],
  dayStart: (t: number) => number, weekday: (t: number) => number): number[] {
  const out: number[] = [];
  let t = Math.ceil((now + 15 * 60_000) / BLOCK_MS) * BLOCK_MS;
  for (let i = 0; i < 48 * 14 && out.length < n; i++, t += BLOCK_MS) {
    const m = (t - dayStart(t)) / 60_000;
    if (!hours.days.includes(weekday(t)) || m < hours.start || m + SLOT_MIN > hours.end) continue;
    if (isOpen(taken, t, busy)) out.push(t);
  }
  return out;
}

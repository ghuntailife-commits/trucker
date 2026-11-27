// The agent's own calendar events (lunch, team meeting, a personal errand): blocked time on the Appointments
// calendar that isn't a contact (George, 2026-11-26). Saved per agent under dispatch-events-<agent>.
import { addDays, parts, DAY_MS } from '../rules/time';

export type Repeat = 'daily' | 'weekdays' | 'weekly';
export interface MyEvent { id: string; title: string; start: number; mins: number; note?: string;
  /** Repeats from `start` on (George, 2026-11-27). `skip` = occurrences deleted one at a time (their start times). */
  repeat?: Repeat; skip?: number[] }
/** One showing of an event in a week: for a repeating one, `id` is "<series id>@<start>". */
export interface Occurrence extends MyEvent { seriesId: string }
export const REPEAT_LABEL: Record<Repeat, string> = { daily: 'Every day', weekdays: 'Every weekday (Mon–Fri)', weekly: 'Every week' };

/** Every showing of the events that touch [from, to), repeats expanded at the same wall-clock time. */
export function occurrencesBetween(list: MyEvent[], from: number, to: number, tz: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of list) {
    const len = e.mins * 60_000;
    if (!e.repeat) { if (e.start < to && e.start + len > from) out.push({ ...e, seriesId: e.id }); continue; }
    const step = e.repeat === 'weekly' ? 7 : 1;
    let k = Math.max(0, Math.floor((from - e.start) / DAY_MS / step) - 1);
    for (let guard = 0; guard < 400; guard++, k++) {
      const at = addDays(e.start, k * step, tz);
      if (at >= to) break;
      if (at + len <= from || e.skip?.includes(at)) continue;
      if (e.repeat === 'weekdays') { const wd = parts(at, tz).wd; if (wd === 0 || wd === 6) continue; }
      out.push({ ...e, id: `${e.id}@${at}`, start: at, seriesId: e.id });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
/** Takes one showing out of a repeating event. */
export const skipOne = (list: MyEvent[], seriesId: string, at: number) =>
  list.map(e => e.id === seriesId ? { ...e, skip: [...(e.skip ?? []), at] } : e);

export const EVENT_LENGTHS = [30, 60, 90, 120, 180, 240];

export function addEvent(list: MyEvent[], e: Omit<MyEvent, 'id'>, id: string): MyEvent[] {
  const title = e.title.trim() || 'Busy';
  return [...list, { ...e, title, id, mins: Math.max(15, Math.round(e.mins)) }].sort((a, b) => a.start - b.start);
}
export const moveEvent = (list: MyEvent[], id: string, start: number) =>
  list.map(e => e.id === id ? { ...e, start } : e).sort((a, b) => a.start - b.start);
export const updateEvent = (list: MyEvent[], id: string, change: Partial<Omit<MyEvent, 'id'>>) =>
  list.map(e => e.id === id ? { ...e, ...change } : e).sort((a, b) => a.start - b.start);
export const removeEvent = (list: MyEvent[], id: string) => list.filter(e => e.id !== id);
/** Events that touch [from, to). */
export const eventsBetween = (list: MyEvent[], from: number, to: number) => list.filter(e => e.start < to && e.start + e.mins * 60_000 > from);

// The agent's own calendar events (lunch, team meeting, a personal errand): blocked time on the Appointments
// calendar that isn't a contact (George, 2026-11-26). Saved per agent under dispatch-events-<agent>.
export interface MyEvent { id: string; title: string; start: number; mins: number; note?: string }

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

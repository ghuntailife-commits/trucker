// The agent's own say over Today (George, 2026-11-26): pause a contact until they resume it, rest one for 75 days
// (a long-time no-show that should drop off sooner), and resume either one from anywhere the contact shows.
import type { Contact } from './types';
import { addNote } from './engine';
import { md, DAY_MS } from './time';

export const REST_DAYS = 75;
export const PAUSED_UNTIL = 8.64e15;   // "until I resume"

export function hold(c: Contact, kind: 'pause' | 'rest', now: number, tz: string, days = REST_DAYS): Contact {
  const until = kind === 'pause' ? PAUSED_UNTIL : now + days * DAY_MS;
  const line = kind === 'pause' ? `${md(now, tz)}: Paused by you (off Today until you resume)` : `${md(now, tz)}: Rested by you for ${days} days, back ${md(until, tz)}`;
  return { ...c, holdUntil: until, holdKind: kind, notes: addNote(c.notes, line) };
}
export function resume(c: Contact, now: number, tz: string): Contact {
  if (!isHeld(c, now)) return c;
  return { ...c, holdUntil: null, holdKind: undefined, notes: addNote(c.notes, `${md(now, tz)}: ${c.holdKind === 'rest' ? 'Rest' : 'Pause'} ended by you, back on Today`) };
}
export const isHeld = (c: Contact, now: number) => c.holdUntil != null && c.holdUntil > now;
export const holdLabel = (c: Contact, now: number, tz: string) =>
  !isHeld(c, now) ? '' : c.holdKind === 'pause' || c.holdUntil! >= PAUSED_UNTIL ? 'Paused' : `Resting until ${md(c.holdUntil!, tz)}`;

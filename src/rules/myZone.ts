// The agent's own time zone (George, 2026-11-27): every time on their screens (Today, appointments, calendar,
// results) shows in it, and their day starts at their midnight. Saved on this computer and with their account.
// Contacts' calling hours still follow each contact's own zone.
export const TZ_CHOICES: { tz: string; abbr: string; name: string }[] = [
  { tz: 'America/New_York', abbr: 'ET', name: 'Eastern' },
  { tz: 'America/Chicago', abbr: 'CT', name: 'Central' },
  { tz: 'America/Denver', abbr: 'MT', name: 'Mountain' },
  { tz: 'America/Phoenix', abbr: 'MST', name: 'Arizona' },
  { tz: 'America/Los_Angeles', abbr: 'PT', name: 'Pacific' },
  { tz: 'America/Anchorage', abbr: 'AKT', name: 'Alaska' },
  { tz: 'Pacific/Honolulu', abbr: 'HT', name: 'Hawaii' },
];
export const DEFAULT_TZ = 'America/New_York';
const LS = 'dispatch-my-tz';
const known = (tz: unknown): tz is string => typeof tz === 'string' && TZ_CHOICES.some(c => c.tz === tz);

/** The time zone saved on this computer, else Eastern. */
export function myTz(): string {
  try { if (typeof window !== 'undefined') { const v = localStorage.getItem(LS); if (known(v)) return v; } } catch { /* */ }
  return DEFAULT_TZ;
}
export function saveMyTz(tz: string): boolean {
  if (!known(tz)) return false;
  try { localStorage.setItem(LS, tz); return true; } catch { return false; }
}
export const zoneOf = (tz: string) => TZ_CHOICES.find(c => c.tz === tz) ?? TZ_CHOICES[0];

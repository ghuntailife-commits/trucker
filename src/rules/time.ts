// Time helpers. The whole team works on Eastern time, but the server may run in any zone,
// so every calendar question ("is this today?", "what hour is it?") is asked in an explicit zone.

export const DAY_MS = 86_400_000;

export interface Parts { y: number; m: number; d: number; h: number; mi: number; wd: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function parts(ms: number, tz: string): Parts {
  const o: Record<string, string> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: WD[o.weekday] };
}

/** yyyymmdd as a number, for same-day comparisons. */
export function dayKey(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return p.y * 10000 + p.m * 100 + p.d;
}

export function sameDay(a: number | null | undefined, b: number, tz: string): boolean {
  return a != null && dayKey(a, tz) === dayKey(b, tz);
}

/** The instant of a wall-clock time in a zone (handles daylight saving). */
export function zoned(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    const diff = asUtc - Date.UTC(y, m - 1, d, h, mi);
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

/** Midnight (start of the day) in the zone. */
export function startOfDay(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return zoned(p.y, p.m, p.d, 0, 0, tz);
}

/** Add whole calendar days, keeping the wall-clock time. */
export function addDays(ms: number, days: number, tz: string): number {
  const p = parts(ms, tz);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return zoned(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), p.h, p.mi, tz);
}

/** "11/25" */
export function md(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.m}/${p.d}`;
}

/** "11/25 2:30 PM" */
export function mdTime(ms: number, tz: string): string {
  const p = parts(ms, tz);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${p.m}/${p.d} ${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

/** "Fri 11/28 2:30 PM" */
export function wdMdTime(ms: number, tz: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[parts(ms, tz).wd]} ${mdTime(ms, tz)}`;
}

/** The clock each time zone code runs on. Blank or unknown counts as Eastern, the earliest to reach 9 PM. */
export const ZONE_IANA: Record<string, string> = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles',
  AKT: 'America/Anchorage', HT: 'Pacific/Honolulu' };
export function contactTz(c: { zone: string; state: string }): string {
  if (c.zone === 'MT' && /^(AZ|ARIZONA)$/i.test(c.state.trim())) return 'America/Phoenix';   // no daylight saving
  return ZONE_IANA[c.zone] ?? 'America/New_York';
}
/** The contact's own clock, as hours (19.5 = 7:30 PM). */
export function localHour(ms: number, c: { zone: string; state: string }): number { const p = parts(ms, contactTz(c)); return p.h + p.mi / 60; }

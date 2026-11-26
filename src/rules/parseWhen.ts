// Reads plain-English times: "tomorrow 2pm", "fri 10:30am", "11/6 2pm", "in 2 days", "3pm", "noon".
// Same behavior as the current sheet's quick note box.
import { parts, zoned, wdMdTime } from './time';

export type When = { date: number; label: string } | { error: string } | null;

const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * @param whole true = the text must be only a time (leftover words mean it is a plain note, so null is returned)
 */
export function parseWhen(txt: string, now: number, tz: string, whole: boolean): When {
  let s = ' ' + String(txt).toLowerCase().replace(/,/g, ' ') + ' ';
  let hh: number | null = null, mm = 0, dayOff: number | null = null, ymd: [number, number, number] | null = null;
  let m: RegExpMatchArray | null;
  const today = parts(now, tz);

  if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    let y = m[3] ? parseInt(m[3], 10) : today.y;
    if (y < 100) y += 2000;
    ymd = [y, parseInt(m[1], 10), parseInt(m[2], 10)];
    s = s.replace(m[0], ' ');
  }
  if ((m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\b\.?/))) {
    const h = parseInt(m[1], 10);
    if (h < 1 || h > 12) return null;
    hh = (h % 12) + (m[3] === 'p' ? 12 : 0);
    mm = m[2] ? parseInt(m[2], 10) : 0;
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) {
    hh = parseInt(m[1], 10); mm = parseInt(m[2], 10); s = s.replace(m[0], ' ');
  } else if (/\bnoon\b/.test(s)) { hh = 12; s = s.replace(/\bnoon\b/, ' '); }
  else if (/\bmorning\b/.test(s)) { hh = 9; s = s.replace(/\bmorning\b/, ' '); }
  else if (/\bafternoon\b/.test(s)) { hh = 14; s = s.replace(/\bafternoon\b/, ' '); }
  else if (/\b(evening|tonight)\b/.test(s)) {
    hh = 18; if (/\btonight\b/.test(s)) dayOff = 0; s = s.replace(/\b(evening|tonight)\b/, ' ');
  }
  if (/\b(tomorrow|tmrw|tmr)\b/.test(s)) { dayOff = 1; s = s.replace(/\b(tomorrow|tmrw|tmr)\b/, ' '); }
  else if ((m = s.match(/\bin (\d+) days?\b/))) { dayOff = parseInt(m[1], 10); s = s.replace(m[0], ' '); }
  else if (/\btoday\b/.test(s)) { dayOff = 0; s = s.replace(/\btoday\b/, ' '); }
  else if ((m = s.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/))) {
    const wd = DAYS[m[1].slice(0, 3)];
    dayOff = ((wd - today.wd + 7) % 7) || 7;
    s = s.replace(m[0], ' ');
  }
  if (hh === null && dayOff === null && ymd === null) return null;
  if (whole) {
    const left = s.replace(/\b(at|on|for|around|about|by|after|the|a|call|back|me|please|him|her|them|callback|next)\b/g, ' ')
      .replace(/[^a-z0-9]/g, '');
    if (left) return null;
  }
  const useH = hh === null ? 10 : hh;
  const build = (y: number, mo: number, d: number) => {
    const b = new Date(Date.UTC(y, mo - 1, d));
    return zoned(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), useH, mm, tz);
  };
  let d: number;
  if (ymd) d = build(ymd[0], ymd[1], ymd[2]);
  else {
    d = build(today.y, today.m, today.d + (dayOff || 0));
    if (dayOff === null && d < now) d = build(today.y, today.m, today.d + 1); // time only and already passed: tomorrow
  }
  if (d < now - 60_000) return { error: `That time has already passed (${wdMdTime(d, tz)}).` };
  return { date: d, label: wdMdTime(d, tz) };
}

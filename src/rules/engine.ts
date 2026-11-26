// The follow-up rules (brief section 6). Every function is pure: it takes a contact and returns the changed copy
// plus the Activity Log rows to add. Nothing here touches the database, so every rule can be tested on its own,
// and Undo is simply "put the old copy back and remove the log rows it added".
import type { Config } from './config';
import { DEFAULT_CONFIG } from './config';
import type { Contact, LogEvent, Result, EventKind } from './types';
import { TAGS, tagKind, countsAsDial } from './tags';
import { DAY_MS, md, mdTime, sameDay, dayKey } from './time';
import { parseWhen } from './parseWhen';

// ---------- small helpers ----------
export const addNote = (notes: string, line: string): string => {
  const cur = String(notes || '').trim();
  return cur ? `${cur} | ${line}` : line;
};

/** Removes `line` from the end of the notes (used when an automatic swap is undone). */
export function stripNote(notes: string, line: string): string {
  const cur = String(notes || '');
  if (!line) return cur;
  if (cur === line) return '';
  const i = cur.lastIndexOf(' | ' + line);
  return i >= 0 && i + 3 + line.length === cur.length ? cur.slice(0, i) : cur;
}

export const digits = (s: string) => String(s || '').replace(/\D/g, '');

/** Has this number already been recorded as bad on this contact? */
export function knownBad(notes: string, num: string): boolean {
  const n = String(num || '').trim();
  if (!n) return false;
  const d = digits(n).slice(-10);
  if (d.length < 10) return String(notes || '').indexOf('Bad number: ' + n) >= 0;
  // compare digits, so "214-555-0101" and "(214) 555-0101" are the same number (like the sheet)
  return (String(notes || '').match(/Bad number:[^|]*/gi) ?? []).some(q => digits(q).includes(d));
}

/** A connect: somebody real was reached (v27 Activity Log column K). */
export const isReach = (tag: string) => !['bad', 'noshow', 'presented', 'sold', 'given'].includes(tagKind(tag));

const clone = (c: Contact): Contact => ({ ...c, swapMemo: c.swapMemo ? { ...c.swapMemo } : null });

function ev(c: Contact, at: number, kind: EventKind, opts: { tag?: string; phone?: string } = {}): LogEvent {
  return {
    at, contactId: c.id, list: c.list, first: c.first, last: c.last,
    phone: opts.phone ?? (c.phone || c.backup), kind, count: 1, tag: opts.tag ?? '', dials: c.dials,
    ...(kind === 'Tag' ? { reach: isReach(opts.tag ?? '') } : {}),
  };
}

/** Positions go back to the original main/backup and the contact rests. n = dial count now. */
function rest(x: Contact, n: number, why: string, now: number, cfg: Config, record: boolean): void {
  const tz = cfg.tz;
  const before = { status: x.status, mark: x.newNumberMark };
  const until = now + cfg.restDays * DAY_MS;
  let line = `${md(now, tz)}: ${why}`;
  const back = x.backup.trim() !== '' && !knownBad(x.notes, x.backup);
  if (back) {
    [x.phone, x.backup] = [x.backup, x.phone];
    line += ' - numbers back in their original positions';
  }
  line += `, resting until ${md(until, tz)}`;
  x.status = '';                 // was "Unverified" in v27; dropped by George 2026-11-26
  x.newNumberMark = n + 0.5;     // a new turn for this number, without new-number priority
  x.callAt = until;              // rest: next action is the rest end date
  x.notes = addNote(x.notes, line);
  if (record && back) x.swapMemo = { at: now, status: before.status, mark: before.mark, cancelRest: true, noteLine: line };
}

// ---------- Dial +1 (no answer / voicemail) ----------
export function dial(c: Contact, now: number, cfg: Config = DEFAULT_CONFIG): Result {
  const tz = cfg.tz;
  if (c.lastDialed != null && now - c.lastDialed < cfg.doubleClickMs && now >= c.lastDialed) {
    return { contact: c, events: [], ignored: true,
      message: `${c.first} ${c.last}: already logged a moment ago, extra click ignored (still ${c.dials} dials).` };
  }
  const x = clone(c);
  const n = c.dials + 1;
  x.dials = n;
  x.lastDialed = now;
  x.swapMemo = null;
  const events: LogEvent[] = [ev(x, now, 'Dial')];
  const kind = tagKind(c.tag);
  const stamp = `${md(now, tz)}: `;

  // Callback: 3 tries once the callback day has come, then back to normal retries.
  if (kind === 'callback') {
    const future = c.callAt != null && dayKey(c.callAt, tz) > dayKey(now, tz);
    if (!future) {
      const k = c.callbackTries + 1;
      if (k >= cfg.callbackTries) {
        x.tag = ''; x.callAt = null; x.callbackTries = 0;
        x.notes = addNote(x.notes, `${stamp}Callback try ${k} of ${cfg.callbackTries}, no answer - back to normal retries`);
      } else {
        x.callbackTries = k;
        x.notes = addNote(x.notes, `${stamp}Callback try ${k} of ${cfg.callbackTries}, no answer`);
      }
    }
  }
  // No-show: 4 tries after the most recent no-show, then back to normal retries.
  if (kind === 'noshow') {
    const k = c.noShowTries + 1;
    if (k >= cfg.noShowTries) {
      x.tag = ''; x.callAt = null; x.noShowTries = 0;
      x.notes = addNote(x.notes, `${stamp}No-show try ${k} of ${cfg.noShowTries}, no answer - back to normal retries`);
    } else {
      x.noShowTries = k;
      x.notes = addNote(x.notes, `${stamp}No-show try ${k} of ${cfg.noShowTries}, no answer`);
    }
  }
  // Main / backup: 7 dials on a number with nobody reached. Only for contacts that had no tag.
  let message = `${c.first} ${c.last}: dial logged (${n} total).`;
  if (kind === 'none') {
    if (c.callAt != null) x.callAt = null;  // a rest is over once the contact is dialed again
    const main = c.phone.trim(), bk = c.backup.trim(), st = c.status;
    if (main && bk && st !== 'Good') {
      const w = c.newNumberMark == null || isNaN(c.newNumberMark) ? 0 : Math.floor(c.newNumberMark);
      if (n - w >= cfg.backupDials) {
        if (st === 'Backup') {
          rest(x, n, `Backup number had ${cfg.backupDials} dials, no one reached`, now, cfg, true);
          events.push(ev(x, now, 'Swap', { phone: x.phone }));
          message += ' Both numbers tried: resting.';
        } else if (!knownBad(c.notes, bk)) {
          const line = `${md(now, tz)}: Main number had ${n - w} dials, no one reached - now dialing the backup`;
          x.phone = bk; x.backup = main; x.status = 'Backup'; x.newNumberMark = n;
          x.notes = addNote(x.notes, line);
          x.swapMemo = { at: now, status: st, mark: c.newNumberMark, cancelRest: false, noteLine: line };
          events.push(ev(x, now, 'Swap', { phone: bk }));
          message += ' Now dialing the backup number.';
        }
      }
    }
  }
  return { contact: x, events, message };
}

// ---------- Disposition (choosing a tag) ----------
export interface DispositionOpts {
  apptAt?: number | null;   // real appointment time from the calendar, for no-show notes
  when?: number | null;     // callback / appointment time
}

export function disposition(c: Contact, tag: string, now: number, cfg: Config = DEFAULT_CONFIG,
                            opts: DispositionOpts = {}): Result {
  const tz = cfg.tz;
  const x = clone(c);
  const kind = tagKind(tag);
  if (kind === 'scheduled') x.confirmedAt = null;   // a new or moved appointment needs confirming again
  x.callbackTries = 0;   // a new tag restarts the callback count
  x.noShowTries = 0;     // and the no-show count

  // The Dial +1 just before this disposition swapped the numbers: put them back,
  // so this result applies to the number that was actually dialed.
  const memo = x.swapMemo;
  x.swapMemo = null;
  if (memo && now - memo.at < cfg.swapUndoMs) {
    [x.phone, x.backup] = [x.backup, x.phone];
    x.status = memo.status;
    x.newNumberMark = memo.mark;
    if (memo.cancelRest) x.callAt = null;
    if (memo.noteLine) x.notes = stripNote(x.notes, memo.noteLine);
  }

  const wasToday = sameDay(x.lastDialed, now, tz);
  let n = x.dials;
  const events: LogEvent[] = [];
  x.tag = tag;

  if (kind === 'noshow') {   // dated note so the no-show date shows in Notes, Why and the dialer
    const at = opts.apptAt ?? x.callAt;
    const line = `${md(at ?? now, tz)}: No-showed` + (at != null ? ` (appt ${mdTime(at, tz)})` : '');
    x.notes = addNote(x.notes, line);
  }
  if (!wasToday && countsAsDial(tag)) {   // a disposition counts as the day's dial, once per contact per day
    n++;
    x.dials = n;
    events.push(ev(x, now, 'Dial'));
  }
  x.lastDialed = now;
  if (kind !== 'scheduled') x.callAt = null;   // the appointment is over

  let promoted = false, dropped = false;
  const main = x.phone.trim(), bk = x.backup.trim(), both = main !== '' && bk !== '';
  const notesNow = x.notes;
  const bothBad = (badLine: string) => {
    x.phone = ''; x.backup = ''; x.status = ''; x.newNumberMark = null; x.tag = '';
    x.notes = addNote(addNote(notesNow, badLine), `${md(now, tz)}: Both numbers bad - needs a new number`);
    dropped = true;
  };
  if (kind === 'bad' && both && x.status === 'Backup') {
    // the backup (sitting in the main position) is bad: put the original back and rest, or both are bad
    if (knownBad(notesNow, bk)) bothBad('Bad number: ' + main);
    else {
      x.notes = addNote(notesNow, 'Bad number: ' + main);
      x.tag = '';
      rest(x, n, 'Backup number marked bad', now, cfg, false);
      dropped = true;
    }
  } else if (kind === 'bad' && both && !knownBad(notesNow, bk)) {
    // bad main number, good backup: the backup becomes the main number, with new-number priority
    x.phone = bk; x.backup = main; x.status = 'Backup'; x.tag = ''; x.newNumberMark = n;
    x.notes = addNote(notesNow, 'Bad number: ' + main);
    promoted = true;
  } else if (kind === 'bad' && both) {
    // bad main number and the backup is already known bad (brief section 6): both cleared, goes to Needs Number
    bothBad('Bad number: ' + main);
  } else if (kind === 'bad') x.status = 'Bad';
  else if (kind === 'dnc' || kind === 'given') x.status = 'Do Not Call';
  else x.status = 'Good';

  if (opts.when != null && (kind === 'callback' || kind === 'scheduled')) x.callAt = opts.when;
  events.push(ev(x, now, 'Tag', { tag, phone: main || bk }));
  const extra = promoted ? ' Backup number is now the main number.'
    : dropped && x.phone === '' ? ' Both numbers bad: moved to Needs Number.'
    : dropped ? ' Bad backup removed; the main number stays in the queue.' : '';
  return { contact: x, events, promoted, dropped, message: `${c.first} ${c.last}: saved (${n} dials).${extra}` };
}

// ---------- Backup-number mode (dialer) ----------
/** A try on the backup number: counts on the daily stats, but not toward the main number's dial count. */
export function backupTry(c: Contact, key: 'noanswer' | 'voicemail' | 'bad', now: number,
                          cfg: Config = DEFAULT_CONFIG, lastBackupTryAt: number | null = null): Result {
  const bk = c.backup.trim();
  if (!bk || !c.phone.trim()) return { contact: c, events: [], refused: 'This contact has no backup number.', message: '' };
  if (lastBackupTryAt != null && now - lastBackupTryAt < 90_000)
    return { contact: c, events: [], ignored: true, message: 'Already logged a moment ago. Extra press ignored.' };
  const x = clone(c);
  x.lastDialed = now;
  const events: LogEvent[] = [ev(x, now, 'Dial', { phone: bk })];
  let message: string;
  if (key === 'bad') {
    x.backup = '';
    x.notes = addNote(x.notes, `${md(now, cfg.tz)}: Bad number: ${bk}`);
    events.push(ev(x, now, 'Tag', { phone: bk, tag: TAGS.bad }));
    message = 'Bad backup removed; the main number stays.';
  } else {
    x.notes = addNote(x.notes, `${md(now, cfg.tz)}: ` +
      (key === 'voicemail' ? `Left voicemail on backup ${bk}` : `Backup tried, no answer: ${bk}`));
    message = key === 'voicemail' ? 'Backup voicemail logged.' : 'Backup no answer logged.';
  }
  return { contact: x, events, message };
}

/** Somebody answered on the backup: it becomes the main number (with new-number priority). */
export function promoteBackup(c: Contact): Contact {
  const x = clone(c);
  [x.phone, x.backup] = [c.backup, c.phone];
  x.status = '';
  x.newNumberMark = c.dials;
  return x;
}

// ---------- Typing a new number ----------
export function setPhone(c: Contact, num: string, now: number): Result {
  const n = String(num || '').trim();
  if (n && knownBad(c.notes, n)) return { contact: c, events: [], refused: `${n} was already marked bad for this contact.`, message: '' };
  const x = clone(c);
  x.phone = n;
  x.status = '';
  if (n) x.newNumberMark = c.dials;   // a new number gets priority for its next two dials
  return { contact: x, events: [], message: `${c.first} ${c.last}: number saved.` };
}

// ---------- Quick note / callback box ----------
// "left vm" -> dated note · "tomorrow 2pm" -> callback · "wife answered @ fri 10am" -> note + callback
export function quickNote(c: Contact, text: string, now: number, cfg: Config = DEFAULT_CONFIG): Result {
  const tz = cfg.tz;
  const val = String(text || '').trim();
  if (!val) return { contact: c, events: [], message: '' };
  let note = val;
  let when: { date: number; label: string } | null = null;
  const whole = parseWhen(val, now, tz, true);
  if (whole && 'error' in whole) return { contact: c, events: [], refused: `${whole.error} Nothing saved.`, message: '' };
  if (whole) { when = whole; note = ''; }
  else {
    const at = val.indexOf('@');
    if (at >= 0) {
      const p = parseWhen(val.slice(at + 1), now, tz, false);
      if (!p || 'error' in p) return { contact: c, events: [], message: '',
        refused: `${p && 'error' in p ? p.error : 'Could not read the time after @ (try "tomorrow 2pm" or "fri 10am").'} Nothing saved.` };
      when = p; note = val.slice(0, at).trim();
    }
  }
  let x = clone(c);
  let events: LogEvent[] = [];
  const parts: string[] = [];
  let msg = '';
  if (when) {
    const kind = tagKind(c.tag);
    if (kind === 'none' || kind === 'callback' || kind === 'noshow' || kind === 'scheduled') {
      if (kind !== 'callback') {
        const r = disposition(x, TAGS.callback, now, cfg);
        x = r.contact; events = r.events;
      } else x.callbackTries = 0;   // a new callback time restarts the try count
      x.callAt = when.date;
      parts.push('Callback ' + when.label);
      msg = 'callback set for ' + when.label;
    } else msg = `callback time NOT set (contact is already tagged ${c.tag.slice(0, 25)}...)`;
  }
  if (note) { parts.push(note); msg = (msg ? msg + ', ' : '') + 'note added'; }
  if (parts.length) x.notes = addNote(x.notes, `${md(now, tz)}: ${parts.join(' - ')}`);
  return { contact: x, events, message: `${c.first} ${c.last}: ${msg}.` };
}

// ---------- Dialer buttons 1-6 ----------
export type DialerKey = 'noanswer' | 'voicemail' | 'callback' | 'notint' | 'bad' | 'appt';
export const DIALER_TAG: Partial<Record<DialerKey, string>> = {
  callback: TAGS.callback, notint: TAGS.notInterested, bad: TAGS.bad, appt: TAGS.scheduled,
};

export interface DialerOpts { when?: string; note?: string; email?: string; backupMode?: boolean; lastBackupTryAt?: number | null }

export function dialerAction(c: Contact, key: DialerKey, now: number, cfg: Config = DEFAULT_CONFIG,
                             opts: DialerOpts = {}): Result {
  const tz = cfg.tz;
  const who = `${c.first} ${c.last}`;
  const note = String(opts.note || '').trim();
  let when: { date: number; label: string } | null = null;
  if (String(opts.when || '').trim()) {
    const w = parseWhen(String(opts.when), now, tz, false);
    if (!w || 'error' in w) return { contact: c, events: [], message: '',
      refused: w && 'error' in w ? w.error : 'Could not read that time. Try tomorrow 2pm or fri 10am.' };
    when = w;
  }
  if (key === 'callback' && !when) return { contact: c, events: [], refused: 'Enter a callback time first.', message: '' };
  if (key === 'appt' && !when) return { contact: c, events: [], refused: 'Enter the appointment time first.', message: '' };
  const email = String(opts.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { contact: c, events: [], refused: 'That email does not look right.', message: '' };
  const k0 = tagKind(c.tag);
  if (key === 'callback' && !['none', 'callback', 'noshow', 'scheduled'].includes(k0))
    return { contact: c, events: [], refused: `${who} is already tagged (${c.tag.slice(0, 25)}...). Callback not set.`, message: '' };

  const parts: string[] = [];
  let r: Result;
  if (opts.backupMode && (key === 'noanswer' || key === 'voicemail' || key === 'bad')) {
    r = backupTry(c, key, now, cfg, opts.lastBackupTryAt ?? null);
    if (r.refused || r.ignored) return r;
  } else if (key === 'noanswer' || key === 'voicemail') {
    r = dial(c, now, cfg);
    if (r.ignored) return { ...r, message: 'Already logged a moment ago. Extra press ignored.' };
    if (key === 'voicemail') parts.push('Left voicemail');
  } else {
    const start = opts.backupMode ? promoteBackup(c) : c;
    r = disposition(start, DIALER_TAG[key]!, now, cfg, { when: when?.date ?? null });
    if (key === 'callback') parts.push('Callback ' + when!.label);
    if (key === 'appt') parts.push('Scheduled ' + when!.label);
    if (opts.backupMode) r.message += ' Backup number is now the main number.';
  }
  if (note) parts.push(note);
  if (parts.length) r.contact = { ...r.contact, notes: addNote(r.contact.notes, `${md(now, tz)}: ${parts.join(' - ')}`) };
  if (email && (key === 'appt' || key === 'callback')) r.contact = { ...r.contact, email };
  return r;
}

// ---------- v2: appointment confirms and qualifier tags ----------
/** The appointment was confirmed (day before, or the morning of). Not a dial. */
export function confirmAppt(c: Contact, now: number, cfg: Config = DEFAULT_CONFIG): Result {
  const x = clone(c);
  x.confirmedAt = now;
  x.notes = addNote(c.notes, `${md(now, cfg.tz)}: Confirmed appt${c.callAt != null ? ' (' + mdTime(c.callAt, cfg.tz) + ')' : ''}`);
  return { contact: x, events: [], message: `${c.first} ${c.last}: appointment confirmed.` };
}

export const QUALIFIERS = ['Married', 'Kids', 'Age 25-40', 'Age 40-55', 'Age 55+', 'Union', 'Has coverage', 'Homeowner'] as const;

/** Turns one quick qualifier tag on or off. */
export function toggleQual(c: Contact, q: string): Result {
  const cur = c.quals ?? [];
  const on = !cur.includes(q);
  const x = clone(c);
  x.quals = on ? [...cur.filter(v => !(q.startsWith('Age') && v.startsWith('Age'))), q] : cur.filter(v => v !== q);
  return { contact: x, events: [], message: `${c.first} ${c.last}: ${q} ${on ? 'added' : 'removed'}.` };
}


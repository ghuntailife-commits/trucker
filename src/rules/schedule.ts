// Next action date, call order and the "Why" label (the old state-tab helper columns N, T and V).
import type { Config } from './config';
import { DEFAULT_CONFIG } from './config';
import type { Contact } from './types';
import { tagKind } from './tags';
import { DAY_MS, addDays, startOfDay, md } from './time';

/** Start of the day the contact is next due, or null when no follow-up is scheduled. */
export function nextAction(c: Contact, now: number, cfg: Config = DEFAULT_CONFIG): number | null {
  const kind = tagKind(c.tag);
  if (c.lastDialed == null && kind === 'none' && c.dials === 0) return null;   // never contacted: "fresh"
  if (c.callAt != null) return startOfDay(c.callAt, cfg.tz);
  const base = startOfDay(c.lastDialed ?? now - 60 * DAY_MS, cfg.tz);
  if (kind === 'none') {
    const i = Math.min(Math.max(c.dials, 1), cfg.retryDays.length) - 1;
    return addDays(base, cfg.retryDays[i], cfg.tz);
  }
  const d = cfg.tagDays[kind];
  return d == null ? null : addDays(base, d, cfg.tz);
}

/** 1 = first. null = never on the working list (bad number, do not call, given away, sold, presented, called into). */
export function callOrder(c: Contact, cfg: Config = DEFAULT_CONFIG): number | null {
  return cfg.callOrder[tagKind(c.tag)] ?? null;
}

export function phoneToCall(c: Contact): string {
  return c.phone.trim() || c.backup.trim();
}

/** Confirm / Callback / No-show · date / Retry / Re-approach / Did they show? */
export function whyLabel(c: Contact, now: number, cfg: Config = DEFAULT_CONFIG): string {
  const o = callOrder(c, cfg);
  if (o == null) return '';
  if (tagKind(c.tag) === 'scheduled' && c.callAt != null && c.callAt < now) return 'Did they show?';
  switch (o) {
    case 1: return 'Confirm';
    case 2: return 'Callback';
    case 3: {
      const m = c.notes.match(/(?:.*[^0-9])?([0-9]{1,2}\/[0-9]{1,2}): No-showed/);
      return m ? `No-show · ${m[1]}` : 'No-show';
    }
    case 4: return 'Retry';
    case 5: return 'Re-approach';
    default: return '';
  }
}

export { md };

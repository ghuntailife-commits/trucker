// Builds the Today working list and the appointments list. This is the old Today!C5 / T5 formulas,
// rewritten step by step so each rule can be read and tested. Same filters and the same ranking.
import type { Config } from './config';
import { DEFAULT_CONFIG } from './config';
import type { Contact } from './types';
import { tagKind, tagShort } from './tags';
import { DAY_MS, parts, sameDay, startOfDay } from './time';
import { nextAction, callOrder, phoneToCall, whyLabel } from './schedule';

export interface TodayContext {
  now: number;
  /** When the list was last re-sorted (Order!B2). */
  snap: number;
  /** Contact IDs in the order saved at the last re-sort (Order!A). */
  savedOrder: string[];
  /** Contact IDs saved for the appointments list (Order!C). */
  savedAppts?: string[];
  /** Times of every logged Dial, per contact ID (for the time-of-day nudge). */
  dialTimes?: Map<string, number[]>;
  /** v2: ranks fresh contacts (higher first). Leave out to keep the import order. */
  freshScore?: (c: Contact) => number;
}

export interface TodayRow {
  contact: Contact;
  why: string;
  done: boolean;
  nextAction: number | null;
  category: 1 | 2 | 3;   // 1 priority, 2 retry, 3 fresh
}

const ZONE_OFFSET: Record<string, number> = { ET: 0, CT: -1, MT: -2, PT: -3 };
const hourFrac = (ms: number, tz: string) => { const p = parts(ms, tz); return p.h + p.mi / 60; };
const block = (h: number) => (h >= 12 ? 1 : 0) + (h >= 15 ? 1 : 0) + (h >= 18 ? 1 : 0);

/** Stable sort by a list of keys (ascending). */
function sortBy<T>(arr: T[], ...keys: ((t: T) => number)[]): T[] {
  return arr.map((v, i) => ({ v, i })).sort((a, b) => {
    for (const k of keys) { const d = k(a.v) - k(b.v); if (d) return d; }
    return a.i - b.i;
  }).map(o => o.v);
}

/**
 * @param contacts every contact on the lists that feed Today, in list order (lists in tab order, then original row order)
 */
export function buildToday(contacts: Contact[], ctx: TodayContext, cfg: Config = DEFAULT_CONFIG): TodayRow[] {
  const { now, snap, tz } = { ...ctx, tz: cfg.tz };
  const today = startOfDay(now, tz);
  const order = new Map(ctx.savedOrder.map((id, i) => [id, i]));
  const snapToday = sameDay(snap, now, tz) && hourFrac(snap, tz) >= cfg.pmStartHour;
  const nowH = parts(now, tz).h;

  type W = { c: Contact; idx: number; na: number | null; untagged: boolean; dcn: number; dco: number;
    newn: boolean; dpm: boolean; ccu: boolean; dph: boolean; ctg: 1 | 2 | 3; sbk: number; kyb: number;
    rka: number; kxa: number; kxc: number; fky: number; psn: number; done: boolean; auto: boolean; score: number };

  const isPm = (c: Contact, untagged: boolean) =>
    untagged && c.dials >= 1 && c.dials <= cfg.pmRetryMaxDials && c.lastDialed != null && sameDay(c.lastDialed, now, tz)
    && hourFrac(c.lastDialed, tz) < cfg.pmStartHour && c.lastDialed < snap && snapToday;
  // v2: the same second try without a re-sort. A morning no-answer comes back on its own after the PM start hour.
  const afterPm = hourFrac(now, tz) >= cfg.pmStartHour;
  const isAutoPm = (c: Contact, untagged: boolean) =>
    cfg.autoPmRetry && afterPm && untagged && c.dials >= 1 && c.dials <= cfg.pmRetryMaxDials && c.lastDialed != null
    && sameDay(c.lastDialed, now, tz) && hourFrac(c.lastDialed, tz) < cfg.pmStartHour && c.callAt == null;

  // 1. Who is on the list
  const picked: W[] = [];
  contacts.forEach((c, idx) => {
    const untagged = tagKind(c.tag) === 'none';
    const lstd = c.lastDialed ?? 0;
    const auto = isAutoPm(c, untagged);
    const wkd = c.lastDialed != null && sameDay(c.lastDialed, now, tz) && c.lastDialed >= snap && !auto;
    const inord = order.has(c.id);
    const pmr = isPm(c, untagged) || auto;
    const frsh = untagged && c.dials === 0;
    const na = nextAction(c, now, cfg);
    const nxtd = na != null && na <= today;
    const ctc = cfg.catchUpHours != null && untagged && c.dials >= 1 && c.dials <= cfg.catchUpMaxDials
      && (now - lstd) / 3_600_000 >= cfg.catchUpHours && (c.callAt ?? 0) <= now;
    const due = nxtd || frsh || (wkd && inord) || pmr || ctc;
    const callable = tagKind(c.tag) !== 'scheduled' && callOrder(c, cfg) != null && phoneToCall(c) !== '';
    if (!(due && (callable || (wkd && inord)))) return;

    const dco = callOrder(c, cfg) ?? 5;
    const dwv = c.newNumberMark ?? -1;
    const newn = untagged && dwv >= 0 && Number.isInteger(dwv) && c.dials < dwv + cfg.newNumberPriorityDials;
    const dpm = pmr;
    const ccu = untagged && c.dials >= 1 && na != null && na > today && lstd < snap && !dpm;
    const dph = untagged && c.dials > 0 && c.lastDialed == null;
    const ctg: 1 | 2 | 3 = dco <= 3 || newn ? 1 : untagged && c.dials === 0 && dco === 4 ? 3 : 2;
    const sbk = dco <= 3 ? dco : newn ? 4 : dpm ? 4.5 : dco === 5 ? 6 : dph ? 5.5 : 5;
    let tcur = 0;
    if (ctg === 2 && cfg.timeOfDayNudge) {
      const off = ZONE_OFFSET[c.zone] ?? 0;
      const cur = block(nowH + off);
      for (const t of ctx.dialTimes?.get(c.id) ?? []) if (block(parts(t, tz).h + off) === cur) tcur++;
    }
    const kyb = ctg === 2 ? c.dials + 100 * (ccu ? 1 : 0) + cfg.timeOfDayNudge * tcur : 0;
    picked.push({ c, idx, na, untagged, dcn: c.dials, dco, newn, dpm, ccu, dph, ctg, sbk, kyb,
      rka: 0, kxa: 0, kxc: 0, fky: 0, psn: order.get(c.id) ?? 100000, auto,
      done: c.lastDialed != null && c.lastDialed > 0 && c.lastDialed >= snap && !auto,
      score: ctg === 3 && ctx.freshScore ? ctx.freshScore(c) : 1 });
  });
  // v2: automatic PM retries go next up: just before the first contact in the saved order not yet dialed
  const open = picked.filter(w => !w.done && !w.auto && w.psn < 100000).map(w => w.psn);
  const nextUp = (open.length ? Math.min(...open) : 100000) - 0.5;
  for (const w of picked) if (w.auto) w.psn = nextUp;

  // 2. Rank fresh contacts within their state so the states take turns
  const a = sortBy(picked, w => w.ctg, w => (w.ctg === 3 ? -w.score : 0));
  const seen = new Map<string, number>();
  for (const w of a) {
    const k = w.ctg + '|' + w.c.list;
    const r = seen.get(k) ?? 0;
    w.rka = r; seen.set(k, r + 1);
    w.kxa = w.ctg === 3 ? w.rka : w.sbk;
    w.kxc = w.ctg === 3 ? (ctx.freshScore ? -w.score : w.idx) : (w.c.callAt ?? w.na ?? Number.MAX_SAFE_INTEGER);
  }
  // 3. Order inside each category, then mix retries and fresh contacts by the fresh share
  const b = sortBy(a, w => w.ctg, w => w.kxa, w => w.kyb, w => w.kxc);
  const share = cfg.freshShareByBlock ? cfg.freshShareByBlock[block(nowH)] : cfg.freshShare;
  const shr = Math.min(Math.max(share, 0.05), 0.95);
  const rk = new Map<number, number>();
  for (const w of b) {
    const r = (rk.get(w.ctg) ?? 0) + 1; rk.set(w.ctg, r);
    w.fky = w.ctg === 1 ? r - 1_000_000 : w.ctg === 2 ? r / (1 - shr) : r / shr;
  }
  // 4. The saved order wins; contacts added since go after it
  const c = sortBy(b, w => w.psn, w => w.fky).slice(0, Math.min(cfg.listSize, 200));

  return c.map(w => {
    const done = w.done;
    const why = done ? 'DONE TODAY - ' + tagShort(w.c.tag)
      : w.c.status === 'Backup' && w.untagged ? 'New Number-backup'
      : w.newn ? 'New number'
      : w.dpm ? 'PM retry'
      : w.ctg === 3 ? 'Fresh'
      : whyLabel(w.c, now, cfg);
    return { contact: w.c, why, done, nextAction: w.na, category: w.ctg };
  });
}

export interface ApptRow { contact: Contact; status: string; called: boolean }

/** Appointments to confirm or close out, and called-into contacts waiting for a result (old Today!T5). */
export function buildAppointments(contacts: Contact[], ctx: TodayContext, cfg: Config = DEFAULT_CONFIG): ApptRow[] {
  const { now, snap } = ctx;
  const tz = cfg.tz;
  const today = startOfDay(now, tz);
  const saved = new Map((ctx.savedAppts ?? []).map((id, i) => [id, i]));
  const rows = contacts.filter(c => {
    const k = tagKind(c.tag);
    const sch = k === 'scheduled' && (c.callAt ?? 0) < today + 2 * DAY_MS;
    const wkd = c.lastDialed != null && c.lastDialed > 0 && c.lastDialed >= snap;
    return sch || k === 'calledInto' || (wkd && saved.has(c.id));
  });
  const sorted = sortBy(rows,
    c => tagKind(c.tag) === 'calledInto' ? 0 : saved.get(c.id) ?? 100000,
    c => c.callAt ?? Number.MAX_SAFE_INTEGER);
  return sorted.slice(0, 40).map(c => {
    const called = c.lastDialed != null && c.lastDialed > 0 && c.lastDialed >= snap;
    let status: string;
    if (tagKind(c.tag) === 'calledInto') status = 'How did it go? Mark Presented or Sold';
    else {
      const pre = called ? 'CALLED - ' : '';
      if (c.callAt != null) {
        const conf = c.confirmedAt != null && c.confirmedAt >= today;        // confirmed today
        status = pre + (c.callAt < now ? 'Did they show?'
          : startOfDay(c.callAt, tz) > today ? (conf ? 'Confirmed for tomorrow' : 'Confirm for tomorrow')
          : conf && cfg.confirmMorningOf ? 'Confirmed today' : 'Confirm today');
      } else status = pre + (c.lastDialed != null && c.lastDialed >= snap ? 'Closed out' : 'No calendar time - check');
    }
    return { contact: c, status, called };
  });
}

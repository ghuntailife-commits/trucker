// The daily health check: things in an agent's contacts that need a person to look at them.
// Nothing here changes data. Each finding lists the contacts so the agent (or George) can open them and fix them.
import type { Contact } from '../rules/types';
import type { NoSaleRecord, SaleRecord } from '../rules/results';
import { tagKind } from '../rules/tags';
import { DAY_MS, startOfDay, zoned, md, parts } from '../rules/time';
import { digits10 } from '../contacts/phones';

export type Level = 'fix' | 'check' | 'info';
export interface Finding {
  key: string;
  level: Level;
  title: string;
  /** One plain sentence on why it matters and what to do. */
  detail: string;
  ids: string[];
  /** Extra text per contact, shown next to the name (when, which number). */
  about?: Record<string, string>;
}

export interface HealthInput { contacts: Contact[]; sales: SaleRecord[]; noSales: NoSaleRecord[]; now: number; tz: string }

const RANK: Record<Level, number> = { fix: 0, check: 1, info: 2 };

export function healthCheck({ contacts, sales, noSales, now, tz }: HealthInput): Finding[] {
  const out: Finding[] = [];
  const today = startOfDay(now, tz);
  const live = contacts.filter(c => !['given', 'dnc'].includes(tagKind(c.tag)));
  const add = (f: Finding) => { if (f.ids.length) out.push(f); };

  // 1. appointments that already happened with no result saved
  const past = live.filter(c => tagKind(c.tag) === 'scheduled' && c.callAt != null && c.callAt < now - 2 * 3_600_000);
  add({ key: 'pastAppt', level: 'fix', title: 'Appointments with no result', ids: past.map(c => c.id),
    about: Object.fromEntries(past.map(c => [c.id, md(c.callAt!, tz)])),
    detail: 'These appointment times have passed. Mark each one Sold, Presented, No-show or move it, so Results and the calendar stay right.' });

  // 2. a number marked do-not-call that is still on another contact being dialed
  const dncNums = new Set<string>();
  for (const c of contacts) if (tagKind(c.tag) === 'dnc') for (const n of [c.phone, c.backup]) { const d = digits10(n); if (d.length === 10) dncNums.add(d); }
  const dncHit = live.filter(c => [c.phone, c.backup].some(n => dncNums.has(digits10(n))));
  add({ key: 'dncDup', level: 'fix', title: 'Do-not-call number on another contact', ids: dncHit.map(c => c.id),
    detail: 'Someone asked not to be called on this number, and it is also on these contacts. Check them before the next dial.' });

  // 3. callbacks more than a day late that nobody has dialed since
  const cb = live.filter(c => tagKind(c.tag) === 'callback' && c.callAt != null && c.callAt < today - DAY_MS && (c.lastDialed ?? 0) < c.callAt);
  add({ key: 'lateCallback', level: 'check', title: 'Callbacks more than a day late', ids: cb.map(c => c.id),
    about: Object.fromEntries(cb.map(c => [c.id, md(c.callAt!, tz)])),
    detail: 'They asked for a call at a set time and it slipped. They are at the top of Today; call them first.' });

  // 4. follow-up dates from a no-sale that passed with no dial
  const latest = new Map<string, NoSaleRecord>();
  for (const n of noSales) { const p = latest.get(n.contactId); if (!p || p.at <= n.at) latest.set(n.contactId, n); }
  const byId = new Map(contacts.map(c => [c.id, c]));
  const fu: string[] = [], fuAbout: Record<string, string> = {};
  for (const [id, n] of latest) {
    if (!n.followUp) continue;
    const [y, m, d] = n.followUp.split('-').map(Number), day = zoned(y, m, d, 0, 0, tz);
    const c = byId.get(id);
    if (!c || tagKind(c.tag) !== 'presented' || day >= today) continue;
    if ((c.lastDialed ?? 0) >= day) continue;
    fu.push(id); fuAbout[id] = md(day, tz);
  }
  add({ key: 'lateFollowUp', level: 'check', title: 'Follow-ups that passed with no call', ids: fu, about: fuAbout,
    detail: 'You set these follow-up dates on a no-sale and the day went by. They show on Today as Follow-up.' });

  // 5. the same number on more than one contact
  const seen = new Map<string, string[]>();
  for (const c of live) for (const n of new Set([digits10(c.phone), digits10(c.backup)])) {
    if (n.length !== 10) continue;
    const a = seen.get(n); a ? a.push(c.id) : seen.set(n, [c.id]);
  }
  const dupIds: string[] = [], dupAbout: Record<string, string> = {};
  for (const [n, ids] of seen) if (ids.length > 1) for (const id of ids) {
    if (dupIds.includes(id)) continue;
    dupIds.push(id); dupAbout[id] = `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)} · ${ids.length} contacts`;
  }
  add({ key: 'dupPhone', level: 'check', title: 'Same number on more than one contact', ids: dupIds, about: dupAbout,
    detail: 'One person can get dialed twice from two rows. Usually one row is a copy; keep the one with the history.' });

  // 6. a number that is not 10 digits
  const odd = live.filter(c => [c.phone, c.backup].some(n => n.trim() && digits10(n).length !== 10));
  add({ key: 'oddPhone', level: 'check', title: 'Numbers that are not 10 digits', ids: odd.map(c => c.id),
    about: Object.fromEntries(odd.map(c => [c.id, c.phone || c.backup])),
    detail: 'These will not dial. Fix the number, or move it to Needs Number.' });

  // 7. sales this month with no email (the policy summary email needs one)
  const pt = parts(now, tz), month = zoned(pt.y, pt.m, 1, 0, 0, tz);
  const noEmail = sales.filter(s => s.at >= month && !s.email?.trim()).map(s => s.contactId).filter(id => byId.has(id) && !byId.get(id)!.email);
  add({ key: 'saleEmail', level: 'info', title: 'Sales this month with no email', ids: [...new Set(noEmail)],
    detail: 'The policy summary email needs an address. Add it from the sale on the Appointments page.' });

  // 8. contacts with a number but no time zone (their best-time ordering is a guess)
  const noZone = live.filter(c => (c.phone || c.backup) && (!c.zone || c.zone === '?') && c.list !== 'Hardcards');
  add({ key: 'noZone', level: 'info', title: 'Contacts with no time zone', ids: noZone.map(c => c.id),
    detail: 'Today places calls by the contact’s local time. Without a zone they are ordered as Eastern.' });

  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || b.ids.length - a.ids.length);
}

/** Totals for the header badge: how many need fixing and how many to look at. */
export function healthCount(f: Finding[]) {
  return { fix: f.filter(x => x.level === 'fix').reduce((a, x) => a + x.ids.length, 0),
    check: f.filter(x => x.level === 'check').reduce((a, x) => a + x.ids.length, 0) };
}

// Home's "Recent" feed (George, 2026-11-27): small news lines like "11 new contacts delivered!", newest first.
// Pure, tested in test/recent.test.ts.
import type { Contact, LogEvent } from '../rules/types';
import { tagKind } from '../rules/tags';

export interface Recent { at: number; text: string; sub?: string; tone: 'blue' | 'green' | 'violet' | 'amber'; go?: 'contacts' | 'appts' | 'results' }
const DAY = 86_400_000, GAP = 10 * 60_000;

export function recentEvents(contacts: Contact[], log: LogEvent[], sales: { at: number; contactId: string; alp?: number }[], now: number, days = 7): Recent[] {
  const since = now - days * DAY, out: Recent[] = [];
  // deliveries: contacts that arrived close together count as one delivery
  const added = contacts.filter(c => c.addedAt && c.addedAt >= since).sort((a, b) => a.addedAt! - b.addedAt!);
  let group: Contact[] = [];
  const flush = () => {
    if (!group.length) return;
    const lists = [...new Set(group.map(c => c.list))];
    out.push({ at: group[group.length - 1].addedAt!, tone: 'blue', go: 'contacts', text: `${group.length} new contact${group.length === 1 ? '' : 's'} delivered!`,
      sub: lists.length <= 3 ? lists.join(', ') : `${lists.slice(0, 3).join(', ')} and ${lists.length - 3} more` });
    group = [];
  };
  for (const c of added) { if (group.length && c.addedAt! - group[group.length - 1].addedAt! > GAP) flush(); group.push(c); }
  flush();
  const delivered = out.map(o => o.at);
  // imports logged before contacts carried their arrival time
  const imports = new Map<number, { n: number; lists: string[] }>();
  for (const e of log) {
    if (e.kind !== 'Import' || e.at < since || delivered.some(t => Math.abs(t - e.at) < GAP)) continue;
    const k = Math.round(e.at / GAP), x = imports.get(k) ?? { n: 0, lists: [] };
    x.n += e.count || 1; if (e.list && !x.lists.includes(e.list)) x.lists.push(e.list); imports.set(k, x);
  }
  for (const [k, x] of imports) out.push({ at: k * GAP, tone: 'blue', go: 'contacts', text: `${x.n} new contact${x.n === 1 ? '' : 's'} delivered!`, sub: x.lists.slice(0, 3).join(', ') });
  const byId = new Map(contacts.map(c => [c.id, c]));
  const nm = (id: string, e?: LogEvent) => {
    const c = byId.get(id); const f = c?.first ?? e?.first ?? '', l = c?.last ?? e?.last ?? '';
    return `${f} ${l ? l[0] + '.' : ''}`.trim() || 'a contact';
  };
  // bookings: one line per day ("3 appointments booked")
  const dayKey = (t: number) => Math.floor((t - 5 * 3_600_000) / DAY);
  const booked = new Map<number, LogEvent[]>();
  for (const e of log) if (e.kind === 'Tag' && e.at >= since && tagKind(e.tag) === 'scheduled') { const k = dayKey(e.at); booked.set(k, [...(booked.get(k) ?? []), e]); }
  for (const es of booked.values()) {
    const last = es.reduce((a, b) => (b.at > a.at ? b : a));
    out.push(es.length === 1 ? { at: last.at, tone: 'violet', go: 'appts', text: `Appointment booked with ${nm(last.contactId, last)}` }
      : { at: last.at, tone: 'violet', go: 'appts', text: `${es.length} appointments booked`, sub: es.slice(0, 4).map(e => nm(e.contactId, e)).join(', ') + (es.length > 4 ? ` and ${es.length - 4} more` : '') });
  }
  for (const s of sales) if (s.at >= since && s.at <= now) out.push({ at: s.at, tone: 'green', go: 'results', text: `Sale! ${nm(s.contactId)}${s.alp ? ` · $${Math.round(s.alp).toLocaleString('en-US')}` : ''}` });
  return out.filter(o => o.at <= now + GAP).sort((a, b) => b.at - a.at);
}

/** "Just now", "25m ago", "3h ago", "Yesterday", "Tue". */
export function ago(at: number, now: number, tz: string): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const day = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  if (day(at) === day(now)) return `${Math.round(m / 60)}h ago`;
  if (day(at) === day(now - DAY)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(at);
}

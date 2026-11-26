// Appointments calendar (brief section 7). Builds the APPOINTMENTS calendar event for a booking, matches calendar
// events back to contacts by phone (the old syncAppointments), lays out the week view, and writes .ics files.
// Pure functions: the Google Calendar calls themselves live on the server and only pass these shapes through.
import type { Contact, LogEvent } from '../rules/types';
import { tagKind } from '../rules/tags';
import { DAY_MS, addDays, parts, startOfDay, zoned } from '../rules/time';
import { fmtPhone, digits10 } from '../contacts/phones';
import type { SaleRecord, NoSaleRecord } from '../rules/results';

export type EventKind = 'appt' | 'callback';

export interface CalEvent {
  kind: EventKind;
  title: string;
  start: number;
  end: number;
  description: string;
  location: string;
  guests: string[];
}

/** The event for a booked appointment (30 min) or callback (10 min). Same title and details as the v27 sheet. */
export function eventFor(c: Contact, kind: EventKind, when: number, opts: { email?: string; note?: string } = {}): CalEvent {
  const name = `${c.first.trim()} ${c.last.trim()}`.trim();
  const ph = c.phone.trim() || c.backup.trim();
  const pf = fmtPhone(ph) ?? ph;
  const co = c.company.trim(), st = c.state.trim(), zone = String(c.zone || '').trim();
  const title = (kind === 'callback' ? 'CALL BACK - ' : '') + [name, co, pf, st].filter(Boolean).join(' - ');
  const note = String(opts.note ?? '').trim();
  const description = `Phone: ${pf}\nUnion / Company: ${co}` + (zone && zone !== '?' ? `\nContact time zone: ${zone}` : '')
    + (note ? `\n\n${note}` : '');
  return {
    kind, title, start: when, end: when + (kind === 'callback' ? 10 : 30) * 60_000, description,
    location: [c.city.trim(), st].filter(Boolean).join(', '),
    guests: opts.email?.trim() ? [opts.email.trim()] : [],
  };
}

// ---------- matching calendar events back to contacts ----------
export interface ExternalEvent { id: string; title: string; description: string; start: number; allDay?: boolean }
export interface SyncReport {
  matched: number;
  updates: { contactId: string; callAt: number }[];
  notTagged: string[];   // upcoming appointments whose contact is not tagged Scheduled
  unmatched: string[];   // events with no phone that matches a contact
}

const PHONE_RX = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g;

/**
 * Reads the APPOINTMENTS calendar back into the app. Each event is matched to a contact by a phone number in its
 * title or description. A Scheduled contact takes the soonest upcoming event time (or the latest past one).
 * Contacts that are not tagged Scheduled are never changed, so an old time is never written back.
 * Callback events ("CALL BACK - ...") are left out: they are not appointments.
 */
export function matchEvents(events: ExternalEvent[], contacts: Contact[], now: number): SyncReport {
  const byPhone = new Map<string, Contact>();
  for (const c of contacts) for (const p of [c.phone, c.backup]) { const d = digits10(p); if (d.length === 10 && !byPhone.has(d)) byPhone.set(d, c); }
  const per = new Map<string, { c: Contact; times: number[]; title: string }>();
  const unmatched: string[] = [];
  for (const ev of events) {
    if (ev.allDay || /^CALL BACK/i.test(ev.title)) continue;
    const found = `${ev.title} ${ev.description}`.match(PHONE_RX) ?? [];
    const hit = found.map(f => byPhone.get(digits10(f))).find(Boolean);
    if (!hit) { unmatched.push(ev.title); continue; }
    const p = per.get(hit.id) ?? { c: hit, times: [], title: ev.title };
    p.times.push(ev.start);
    per.set(hit.id, p);
  }
  const updates: SyncReport['updates'] = [], notTagged: string[] = [];
  for (const { c, times, title } of per.values()) {
    const future = times.filter(t => t >= now).sort((a, b) => a - b);
    const pick = future.length ? future[0] : Math.max(...times);
    if (tagKind(c.tag) !== 'scheduled') { if (pick >= now) notTagged.push(title); continue; }
    if (c.callAt !== pick) updates.push({ contactId: c.id, callAt: pick });
  }
  return { matched: per.size, updates, notTagged, unmatched };
}

export function syncMessage(r: SyncReport): string {
  let msg = `Appointments matched to contacts: ${r.matched} (${r.updates.length} updated).`;
  if (r.notTagged.length) msg += `\nUpcoming appointments for contacts not tagged Scheduled: ${r.notTagged.slice(0, 10).join('; ')}`;
  if (r.unmatched.length) msg += `\nNo contact matched these events (phone not found): ${r.unmatched.slice(0, 10).join('; ')}`;
  return msg;
}

// ---------- week view ----------
export type ItemKind = 'appt' | 'callback' | 'followup' | 'sold' | 'presented' | 'noshow';
export interface CalItem {
  key: string;
  contactId: string;
  kind: ItemKind;
  at: number;
  allDay?: boolean;
  label: string;          // status shown on the card
  detail?: string;
}

/** Monday 00:00 of the week holding `ms`. */
export function weekStart(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return addDays(startOfDay(ms, tz), -((p.wd + 6) % 7), tz);
}

/**
 * Everything on the calendar between `from` and `to`: booked appointments, callbacks, follow-ups from no-sale
 * forms, and the results already recorded (sold, presented, no-show).
 */
export function calendarItems(contacts: Contact[], sales: SaleRecord[], noSales: NoSaleRecord[], log: LogEvent[],
                              from: number, to: number, now: number, tz: string): CalItem[] {
  const out: CalItem[] = [];
  const today = startOfDay(now, tz);
  const inRange = (t: number) => t >= from && t < to;
  for (const c of contacts) {
    const k = tagKind(c.tag);
    if (c.callAt == null || !inRange(c.callAt)) continue;
    if (k === 'scheduled') {
      const confirmed = c.confirmedAt != null && c.confirmedAt >= today;
      out.push({ key: 'a' + c.id, contactId: c.id, kind: 'appt', at: c.callAt,
        label: c.callAt < now ? 'Did they show?' : confirmed ? 'Confirmed' : c.callAt < today + 2 * DAY_MS ? 'Confirm' : 'Booked' });
    } else if (k === 'callback') {
      out.push({ key: 'c' + c.id, contactId: c.id, kind: 'callback', at: c.callAt, label: 'Callback' });
    }
  }
  sales.forEach((s, i) => { if (inRange(s.at)) out.push({ key: 's' + i, contactId: s.contactId, kind: 'sold', at: s.at, label: 'Sold',
    detail: `${s.alpType} ALP $${Math.round(s.alp).toLocaleString('en-US')}` }); });
  noSales.forEach((n, i) => {
    if (inRange(n.at)) out.push({ key: 'n' + i, contactId: n.contactId, kind: 'presented', at: n.at, label: 'Presented',
      detail: n.objections.join(', ') || n.reason });
    if (n.followUp) {
      const [y, m, d] = n.followUp.split('-').map(Number);
      const t = zoned(y, m, d, 0, 0, tz);   // all day: listed first on its day
      if (inRange(t)) out.push({ key: 'f' + i, contactId: n.contactId, kind: 'followup', at: t, allDay: true, label: 'Follow up',
        detail: n.followUpNote || undefined });
    }
  });
  log.forEach((e, i) => {
    if (e.kind === 'Tag' && tagKind(e.tag) === 'noshow' && inRange(e.at))
      out.push({ key: 'x' + i, contactId: e.contactId, kind: 'noshow', at: e.at, label: 'No-show' });
  });
  return out.sort((a, b) => a.at - b.at);
}

// ---------- .ics files (Add to calendar, before Google Calendar is connected) ----------
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function toIcs(events: (CalEvent & { uid: string })[], stamp: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Truckers//Appointments//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@truckers`, `DTSTAMP:${icsTime(stamp)}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`,
      `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.kind === 'appt') lines.push('BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment in 1 hour', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

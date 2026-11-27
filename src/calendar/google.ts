// Google Calendar calls for Dispatch, server side only (George, 2026-11-26). Each agent connects once; the server keeps
// their Google refresh token and keeps their primary calendar matching Dispatch: booked appointments and callbacks are
// added, moved and removed, and an appointment moved in Google Calendar moves in Dispatch too.
import type { CalEvent } from './events';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface WantedEvent extends CalEvent { uid: string; contactId: string }
export interface Row { uid: string; google_id: string; contact_id: string; start_at: number; hash: string }
export interface Move { contactId: string; start: number }

// Accept the names George may already have in Vercel from the go-live setup.
const pick = (...names: string[]) => names.map(n => process.env[n]).find(v => v && v.trim())?.trim();
export const googleKeys = () => ({
  id: pick('GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'GOOGLE_ID', 'GOOGLE_CLIENTID'),
  secret: pick('GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_SECRET', 'GOOGLE_CLIENT_SECRET_KEY', 'GOOGLE_SECRET_KEY'),
});

export const hashOf = (e: WantedEvent) => JSON.stringify([e.title, e.start, e.end, e.description, e.location, e.guests]);

/** What a sync has to do, worked out before any call to Google. Pure: tested in test/calendar.test.ts. */
export function planSync(wanted: WantedEvent[], rows: Row[], google: Map<string, { start: number; cancelled: boolean }>, now: number) {
  const byUid = new Map(rows.map(r => [r.uid, r]));
  const moves: Move[] = [], upsert: WantedEvent[] = [], remove: Row[] = [], forget: Row[] = [], moved: { row: Row; start: number }[] = [];
  const want = new Set(wanted.map(w => w.uid));
  for (const w of wanted) {
    const r = byUid.get(w.uid), g = r ? google.get(r.google_id) : undefined;
    // moved in Google Calendar (and Dispatch still has the time it last sent): Google wins, Dispatch follows
    if (r && g && !g.cancelled && g.start !== r.start_at && w.start === r.start_at && w.kind === 'appt') {
      moves.push({ contactId: w.contactId, start: g.start }); moved.push({ row: r, start: g.start }); continue;
    }
    if (r && g?.cancelled && w.start === r.start_at) continue;          // deleted in Google: leave it deleted
    if (!r || r.hash !== hashOf(w)) upsert.push(w);
  }
  for (const r of rows) if (!want.has(r.uid)) (r.start_at > now ? remove : forget).push(r);
  return { moves, moved, upsert, remove, forget };
}

/** Events the agent's old sheet already put on their calendar for the same contact and time (George, 2026-11-27: every
 * appointment showed twice). Dispatch takes those over instead of adding its own: the row is pointed at the original
 * (hash '' so it gets Dispatch's notes), and a copy Dispatch already made is listed for removal. Pure. */
const phoneKey = (title: string) => (title.match(/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]?\d{4}/)?.[0] ?? '').replace(/\D/g, '').slice(-10);
const keyOf = (title: string, start: number) => `${start}|${phoneKey(title) || title.trim().toLowerCase()}`;
export function adoptOriginals(wanted: WantedEvent[], rows: Row[], others: { id: string; title: string; start: number; allDay: boolean }[]) {
  const orig = new Map<string, string>();
  for (const o of others) if (!o.allDay) orig.set(keyOf(o.title, o.start), o.id);
  const byUid = new Map(rows.map(r => [r.uid, r]));
  const taken = new Set(rows.map(r => r.google_id));
  const out = rows.slice(), copies: string[] = [];
  for (const w of wanted) {
    const id = orig.get(keyOf(w.title, w.start));
    if (!id || taken.has(id)) continue;
    taken.add(id);
    const r = byUid.get(w.uid);
    if (r) { copies.push(r.google_id); out[out.indexOf(r)] = { ...r, google_id: id, hash: '' }; }
    else out.push({ uid: w.uid, google_id: id, contact_id: w.contactId, start_at: w.start, hash: '' });
  }
  return { rows: out, copies };
}

/** Dispatch events left over for a contact whose row now points at a different event (a copy from before Dispatch took
 * over the original, or two syncs racing). Only upcoming, not-deleted ones. Pure. */
export function strayCopies(rows: Row[], google: Map<string, { start: number; cancelled: boolean; uid?: string }>, now: number) {
  const byUid = new Map(rows.map(r => [r.uid, r.google_id]));
  const out: string[] = [];
  for (const [id, e] of google) {
    const mine = e.uid ? byUid.get(e.uid) : undefined;
    if (!e.cancelled && e.start > now && mine && mine !== id) out.push(id);
  }
  return out;
}

export async function accessToken(refresh: string): Promise<string> {
  const { id, secret } = googleKeys();
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set on Vercel.');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const j = await r.json() as { access_token?: string; error?: string; error_description?: string };
  if (!j.access_token) throw new Error(j.error === 'invalid_grant' ? 'RECONNECT' : `Google sign-in: ${j.error_description ?? j.error ?? r.status}`);
  return j.access_token;
}

async function g<T>(token: string, url: string, init: RequestInit = {}): Promise<T | null> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 404 || r.status === 410) return null;
  if (r.status === 204) return {} as T;
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(t)) throw new Error('Turn on the Google Calendar API in Google Cloud (APIs & Services > Library > Google Calendar API > Enable).');
    if (r.status === 403 && /insufficient/i.test(t)) throw new Error('RECONNECT');
    throw new Error(`Google Calendar said ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

/** Dispatch's events on the agent's calendar from yesterday on, by Google id. */
export async function listOurs(token: string, agent: string, now: number) {
  const out = new Map<string, { start: number; cancelled: boolean; uid?: string }>();
  let page: string | undefined;
  do {
    const p = new URLSearchParams({ privateExtendedProperty: `dispatchAgent=${agent}`, timeMin: new Date(now - 86_400_000).toISOString(),
      showDeleted: 'true', singleEvents: 'true', maxResults: '2500' });
    if (page) p.set('pageToken', page);
    const j = await g<{ items?: { id: string; status: string; start?: { dateTime?: string }; extendedProperties?: { private?: Record<string, string> } }[]; nextPageToken?: string }>(token, `${API}?${p}`);
    for (const e of j?.items ?? []) out.set(e.id, { start: e.start?.dateTime ? Date.parse(e.start.dateTime) : 0, cancelled: e.status === 'cancelled', uid: e.extendedProperties?.private?.uid });
    page = j?.nextPageToken;
  } while (page);
  return out;
}

/** The agent's own Google events (not Dispatch's), so the Appointments calendar shows them as busy time (George, 2026-11-27). */
export interface OtherEvent { id: string; title: string; start: number; end: number; allDay: boolean }
export async function listOthers(token: string, from: number, to: number): Promise<OtherEvent[]> {
  const out: OtherEvent[] = [];
  let page: string | undefined;
  type Item = { id: string; status: string; summary?: string; transparency?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
    extendedProperties?: { private?: Record<string, string> } };
  for (let i = 0; i < 5; i++) {
    const p = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '500' });
    if (page) p.set('pageToken', page);
    const j = await g<{ items?: Item[]; nextPageToken?: string }>(token, `${API}?${p}`);
    for (const e of j?.items ?? []) {
      if (e.status === 'cancelled' || e.extendedProperties?.private?.dispatchAgent) continue;
      const allDay = !e.start?.dateTime;
      const start = Date.parse(e.start?.dateTime ?? `${e.start?.date}T12:00:00Z`), end = Date.parse(e.end?.dateTime ?? `${e.end?.date}T12:00:00Z`);
      if (!Number.isFinite(start)) continue;
      out.push({ id: e.id, title: (e.summary ?? 'Busy').slice(0, 120), start, end: Number.isFinite(end) ? end : start + 1_800_000, allDay });
    }
    page = j?.nextPageToken; if (!page) break;
  }
  return out;
}

const body = (e: WantedEvent, agent: string) => ({
  summary: e.title, description: `${e.description}\n\nAdded by Dispatch.`, location: e.location || undefined,
  start: { dateTime: new Date(e.start).toISOString() }, end: { dateTime: new Date(e.end).toISOString() },
  attendees: e.guests.map(email => ({ email })),
  reminders: e.kind === 'appt' ? { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] } : { useDefault: true },
  extendedProperties: { private: { dispatchAgent: agent, contactId: e.contactId, uid: e.uid } },
});

export async function putEvent(token: string, agent: string, e: WantedEvent, googleId?: string): Promise<string> {
  const q = `?sendUpdates=${e.guests.length ? 'all' : 'none'}`;
  if (googleId) {
    const b = body(e, agent);
    // an event the old sheet made: keep its text-tracking lines (Texts: ..., NO TEXTS) under Dispatch's notes
    const cur = await g<{ description?: string }>(token, `${API}/${encodeURIComponent(googleId)}`).catch(() => null);
    const keep = (cur?.description ?? '').split('\n').filter(l => /^\s*(Texts:|NO TEXTS)/i.test(l) && !b.description.includes(l.trim()));
    if (keep.length) b.description = `${b.description}\n${keep.join('\n')}`;
    const j = await g<{ id: string }>(token, `${API}/${encodeURIComponent(googleId)}${q}`, { method: 'PUT', body: JSON.stringify({ ...b, status: 'confirmed' }) });
    if (j) return j.id;
  }
  const j = await g<{ id: string }>(token, `${API}${q}`, { method: 'POST', body: JSON.stringify(body(e, agent)) });
  return j!.id;
}

export async function deleteEvent(token: string, googleId: string, guests: boolean) {
  await g(token, `${API}/${encodeURIComponent(googleId)}?sendUpdates=${guests ? 'all' : 'none'}`, { method: 'DELETE' });
}

/** Plain words for a database error on the calendar tables, keeping Supabase's own words for checking. */
export const calMsg = (m: string) =>
  /permission denied/i.test(m) ? `Calendar tables need permission (run the calendar SQL again, it now grants it). Supabase said: ${m}`
  : /schema cache|does not exist/i.test(m) ? `Calendar tables not found. Supabase said: ${m}`
  : `Calendar: ${m}`;

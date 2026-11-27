// Google Calendar calls for Dispatch, server side only (George, 2026-11-26). Each agent connects once; the server keeps
// their Google refresh token and keeps their primary calendar matching Dispatch: booked appointments and callbacks are
// added, moved and removed, and an appointment moved in Google Calendar moves in Dispatch too.
import type { CalEvent } from './events';

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface WantedEvent extends CalEvent { uid: string; contactId: string }
export interface Row { uid: string; google_id: string; contact_id: string; start_at: number; hash: string }
export interface Move { contactId: string; start: number }

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

export async function accessToken(refresh: string): Promise<string> {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
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
  const out = new Map<string, { start: number; cancelled: boolean }>();
  let page: string | undefined;
  do {
    const p = new URLSearchParams({ privateExtendedProperty: `dispatchAgent=${agent}`, timeMin: new Date(now - 86_400_000).toISOString(),
      showDeleted: 'true', singleEvents: 'true', maxResults: '2500' });
    if (page) p.set('pageToken', page);
    const j = await g<{ items?: { id: string; status: string; start?: { dateTime?: string } }[]; nextPageToken?: string }>(token, `${API}?${p}`);
    for (const e of j?.items ?? []) out.set(e.id, { start: e.start?.dateTime ? Date.parse(e.start.dateTime) : 0, cancelled: e.status === 'cancelled' });
    page = j?.nextPageToken;
  } while (page);
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
    const j = await g<{ id: string }>(token, `${API}/${encodeURIComponent(googleId)}${q}`, { method: 'PUT', body: JSON.stringify({ ...body(e, agent), status: 'confirmed' }) });
    if (j) return j.id;
  }
  const j = await g<{ id: string }>(token, `${API}${q}`, { method: 'POST', body: JSON.stringify(body(e, agent)) });
  return j!.id;
}

export async function deleteEvent(token: string, googleId: string, guests: boolean) {
  await g(token, `${API}/${encodeURIComponent(googleId)}?sendUpdates=${guests ? 'all' : 'none'}`, { method: 'DELETE' });
}

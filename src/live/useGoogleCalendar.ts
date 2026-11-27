'use client';
// Google Calendar in the browser (George, 2026-11-26): connect once, then every booked appointment and callback is kept
// on the agent's Google Calendar (the server does the Google calls: app/api/calendar). Appointments moved in Google
// Calendar move in Dispatch. Runs a few seconds after any change, and every 5 minutes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LIVE, db } from './supabase';
import type { Contact } from '../rules/types';
import { tagKind } from '../rules/tags';
import { eventNote } from '../brief/text';
import { eventFor } from '../calendar/events';
import { addNote } from '../rules/engine';
import { mdTime } from '../rules/time';
import type { WantedEvent, Move, OtherEvent } from '../calendar/google';

export type CalState = { status: 'off' | 'checking' | 'connected' | 'reconnect' | 'error'; email?: string | null; error?: string; lastSync?: number; others?: OtherEvent[] };

async function call(path: string, init: RequestInit = {}) {
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return r.json();
}

/** Every appointment and callback Dispatch wants on the calendar (from two hours ago on). */
export function wantedEvents(contacts: Contact[], now: number): WantedEvent[] {
  const out: WantedEvent[] = [];
  for (const c of contacts) {
    const k = tagKind(c.tag);
    if (c.callAt == null || c.callAt < now - 2 * 3_600_000 || (k !== 'scheduled' && k !== 'callback')) continue;
    const kind = k === 'scheduled' ? 'appt' : 'callback';
    const email = kind === 'appt' ? c.email?.trim() : undefined;   // prep notes on the event (George, 2026-11-27), never on a client's invite
    out.push({ ...eventFor(c, kind, c.callAt, { email, note: eventNote(c, now, !!email) }), uid: `${c.id}:${kind}`, contactId: c.id });
  }
  return out;
}

export function useGoogleCalendar(agent: string, contacts: Contact[], tz: string, ready: boolean,
  apply: (changed: Contact[], message: string) => void) {
  const readyRef = useRef(ready); readyRef.current = ready;
  const [st, setSt] = useState<CalState>({ status: LIVE ? 'checking' : 'off' });
  const latest = useRef(contacts); latest.current = contacts;
  const busy = useRef(false);

  const sync = useCallback(async () => {
    // never before the contacts have loaded: an empty list would take every appointment off the calendar
    if (!LIVE || busy.current || !readyRef.current) return;
    busy.current = true;
    try {
      for (let round = 0; round < 10; round++) {
        const j = await call('/api/calendar/sync', { method: 'POST', body: JSON.stringify({ agent, events: wantedEvents(latest.current, Date.now()) }) });
        if (j.error) { setSt(s => ({ ...s, status: 'error', error: j.error })); break; }
        if (!j.connected) { setSt({ status: j.reconnect ? 'reconnect' : 'off' }); break; }
        const moves = (j.moves ?? []) as Move[];
        if (moves.length) {
          const byId = new Map(latest.current.map(c => [c.id, c]));
          const changed = moves.flatMap(m => { const c = byId.get(m.contactId); return c ? [{ ...c, callAt: m.start,
            notes: addNote(c.notes, `${mdTime(Date.now(), tz)}: Moved in Google Calendar to ${mdTime(m.start, tz)}`) }] : []; });
          if (changed.length) apply(changed, `${changed.length} appointment${changed.length === 1 ? '' : 's'} moved in Google Calendar.`);
        }
        setSt(s => ({ ...s, status: 'connected', error: undefined, lastSync: Date.now(), ...(Array.isArray(j.others) ? { others: j.others as OtherEvent[] } : {}) }));
        if (!j.more) break;
      }
    } catch (e) { setSt(s => ({ ...s, status: 'error', error: (e as Error).message })); }
    finally { busy.current = false; }
  }, [agent, apply, tz]);

  // back from Google's permission screen: save the long-term sign-in, then sync
  useEffect(() => {
    if (!LIVE) return;
    let live = true;
    (async () => {
      let back = false; try { back = sessionStorage.getItem('dispatch-cal-connect') === '1'; sessionStorage.removeItem('dispatch-cal-connect'); } catch { /* */ }
      if (back) {
        const { data } = await db().auth.getSession();
        const j = await call('/api/calendar/connect', { method: 'POST', body: JSON.stringify({ refreshToken: data.session?.provider_refresh_token, email: data.session?.user.email }) });
        if (j.error && live) setSt({ status: 'error', error: j.error });
      }
      const j = await call(`/api/calendar/connect?agent=${encodeURIComponent(agent)}`);
      if (!live) return;
      if (j.connected) { setSt({ status: 'connected', email: j.email }); void sync(); }
      else if (!j.setup && !j.error && j.keys === false) setSt({ status: 'error', error: 'Google keys are missing in Vercel (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).' });
      else setSt({ status: j.setup || j.error ? 'error' : 'off', error: j.setup ?? j.error });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // a few seconds after appointments change, and every 5 minutes
  const sig = wantedEvents(contacts, 0).map(e => `${e.uid}@${e.start}`).join('|');
  useEffect(() => {
    if (st.status !== 'connected') return;
    const t = setTimeout(() => void sync(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready, st.status === 'connected']);
  useEffect(() => {
    if (st.status !== 'connected') return;
    const t = setInterval(() => void sync(), 5 * 60_000);
    return () => clearInterval(t);
  }, [st.status, sync]);

  const disconnect = useCallback(async () => { await call('/api/calendar/connect', { method: 'POST', body: JSON.stringify({ disconnect: true }) }); setSt({ status: 'off' }); }, []);
  return { ...st, sync, disconnect };
}
export type GoogleCal = ReturnType<typeof useGoogleCalendar>;

'use client';
// Calling inside Dispatch through Twilio (George, 2026-11-27). The browser is the phone: it gets a pass from
// /api/twilio/token, then places and takes calls. Only for agents with "Call through Dispatch" on in Settings.
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from './supabase';

type TwCall = {
  accept: () => void; reject: () => void; disconnect: () => void; mute: (m?: boolean) => void; isMuted: () => boolean;
  sendDigits: (d: string) => void; on: (ev: string, fn: (...a: unknown[]) => void) => void;
  parameters?: Record<string, string>; customParameters?: Map<string, string>;
};
type TwDevice = {
  register: () => Promise<void>; connect: (o: { params: Record<string, string> }) => Promise<TwCall>; destroy: () => void;
  updateToken: (t: string) => void; on: (ev: string, fn: (...a: unknown[]) => void) => void;
};

export type TwStatus = 'off' | 'loading' | 'ready' | 'error';
export interface TwState { status: TwStatus; error: string; live: null | { phone: string; state: 'connecting' | 'ringing' | 'open'; muted: boolean; incoming: boolean; cell?: boolean };
  incoming: null | { phone: string } }

async function getToken(): Promise<string> {
  const { data } = await db().auth.getSession();
  const r = await fetch('/api/twilio/token', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  const j = await r.json().catch(() => ({})) as { token?: string; error?: string };
  if (!r.ok || !j.token) throw new Error(j.error ?? `Could not start calling (${r.status})`);
  return j.token;
}

/** onEnded: the call hung up (either side), so the screen can stop the timer and log it. */
/** cell: ring the agent's own phone for outgoing calls instead of the computer (George, 2026-11-27). */
export function useTwilio(on: boolean, onEnded: () => void, cell = false) {
  const [st, setSt] = useState<TwState>({ status: 'off', error: '', live: null, incoming: null });
  const dev = useRef<TwDevice | null>(null);
  const call = useRef<TwCall | null>(null);
  const ring = useRef<TwCall | null>(null);
  const ended = useRef(onEnded); ended.current = onEnded;
  /** how loud each side is right now (0 to 1), for the sound bars: i = the agent's mic, o = the contact */
  const level = useRef({ i: 0, o: 0 });
  const bridge = useRef<string | null>(null);   // the call to the agent's cell, while it lasts

  const watch = useCallback((c: TwCall, phone: string, incoming: boolean) => {
    call.current = c;
    setSt(s => ({ ...s, live: { phone, state: incoming ? 'open' : 'connecting', muted: false, incoming }, incoming: null }));
    c.on('ringing', () => setSt(s => (s.live ? { ...s, live: { ...s.live, state: 'ringing' } } : s)));
    c.on('accept', () => setSt(s => (s.live ? { ...s, live: { ...s.live, state: 'open' } } : s)));
    c.on('volume', (i, o) => { level.current = { i: Number(i) || 0, o: Number(o) || 0 }; });
    c.on('mute', (m) => setSt(s => (s.live ? { ...s, live: { ...s.live, muted: !!m } } : s)));
    const done = () => { if (call.current !== c) return; call.current = null; level.current = { i: 0, o: 0 }; setSt(s => ({ ...s, live: null })); ended.current(); };
    c.on('disconnect', done); c.on('cancel', done); c.on('reject', done);
    c.on('error', (e) => { setSt(s => ({ ...s, error: (e as Error)?.message ?? 'Call failed' })); done(); });
  }, []);

  useEffect(() => {
    if (!on) return;
    let stop = false;
    setSt(s => ({ ...s, status: 'loading', error: '' }));
    (async () => {
      try {
        const token = await getToken();
        const { Device } = await import('@twilio/voice-sdk');
        if (stop) return;
        const d = new Device(token, { codecPreferences: ['opus', 'pcmu'] as never, closeProtection: 'A call is going. Leave Dispatch and hang up?' }) as unknown as TwDevice;
        dev.current = d;
        d.on('tokenWillExpire', async () => { try { d.updateToken(await getToken()); } catch { /* the next call asks again */ } });
        d.on('error', (e) => setSt(s => ({ ...s, error: (e as Error)?.message ?? 'Calling stopped working' })));
        d.on('incoming', (c) => {
          const tc = c as TwCall;
          const from = tc.parameters?.From ?? '';
          if (call.current) { tc.reject(); return; }   // already on a call: it goes to voicemail
          ring.current = tc;
          setSt(s => ({ ...s, incoming: { phone: from } }));
          const gone = () => { if (ring.current === tc) { ring.current = null; setSt(s => ({ ...s, incoming: null })); } };
          tc.on('cancel', gone); tc.on('disconnect', gone); tc.on('reject', gone);
        });
        await d.register();
        if (!stop) setSt(s => ({ ...s, status: 'ready' }));
      } catch (e) { if (!stop) setSt(s => ({ ...s, status: 'error', error: (e as Error).message })); }
    })();
    return () => { stop = true; dev.current?.destroy(); dev.current = null; call.current = null; setSt({ status: 'off', error: '', live: null, incoming: null }); };
  }, [on]);

  /** Calls a number. Returns false when calling isn't ready (the screen falls back to the phone app). */
  const start = useCallback(async (to: string, name = ''): Promise<boolean> => {
    if (cell) {
      if (bridge.current || call.current) return false;
      try {
        const { data } = await db().auth.getSession();
        const r = await fetch('/api/twilio/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ to, name }) });
        const j = await r.json().catch(() => ({})) as { sid?: string; error?: string };
        if (!r.ok || !j.sid) { setSt(s => ({ ...s, error: j.error ?? `Could not ring your cell (${r.status})` })); return false; }
        bridge.current = j.sid;
        setSt(s => ({ ...s, error: '', live: { phone: to, state: 'ringing', muted: false, incoming: false, cell: true } }));
        return true;
      } catch (e) { setSt(s => ({ ...s, error: (e as Error).message })); return false; }
    }
    const d = dev.current; if (!d || call.current) return false;
    try { watch(await d.connect({ params: { To: to } }), to, false); return true; }
    catch (e) { setSt(s => ({ ...s, error: (e as Error).message })); return false; }
  }, [watch, cell]);
  const hangup = useCallback(() => {
    const sid = bridge.current;
    if (sid) {
      bridge.current = null; setSt(s => ({ ...s, live: null }));
      void db().auth.getSession().then(({ data }) => fetch('/api/twilio/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ hangup: sid }) })).catch(() => {});
      return;
    }
    call.current?.disconnect();
  }, []);
  const mute = useCallback(() => { const c = call.current; if (c) c.mute(!c.isMuted()); }, []);
  const digits = useCallback((k: string) => { call.current?.sendDigits(k); }, []);
  const answer = useCallback(() => { const c = ring.current; if (!c) return; ring.current = null; c.accept(); watch(c, c.parameters?.From ?? '', true); }, [watch]);
  const decline = useCallback(() => { const c = ring.current; ring.current = null; c?.reject(); setSt(s => ({ ...s, incoming: null })); }, []);
  return { ...st, level, ready: st.status === 'ready', onCall: () => !!call.current || !!bridge.current, start, hangup, mute, digits, answer, decline };
}

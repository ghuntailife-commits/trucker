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
export interface TwState { status: TwStatus; error: string; live: null | { phone: string; state: 'connecting' | 'ringing' | 'open'; muted: boolean; incoming: boolean; cell?: boolean; machine?: boolean };
  incoming: null | { phone: string } }

async function getToken(): Promise<string> {
  const { data } = await db().auth.getSession();
  const r = await fetch('/api/twilio/token', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  const j = await r.json().catch(() => ({})) as { token?: string; error?: string };
  if (!r.ok || !j.token) throw new Error(j.error ?? `Could not start calling (${r.status})`);
  return j.token;
}

/** How a call ended, for auto-dial: did anyone pick up, did the agent hang up, and was it a voicemail machine. */
export interface CallEnd { answered: boolean; byMe: boolean; machine: boolean; auto: boolean }

/** onEnded: the call hung up (either side), so the screen can stop the timer and log it. */
/** onMachine: an auto-dial call reached a voicemail machine (Twilio's background check, a few seconds in). */
/** cell: ring the agent's own phone for outgoing calls instead of the computer (George, 2026-11-27). */
export function useTwilio(on: boolean, onEnded: (end?: CallEnd) => void, cell = false, onMachine?: () => void, agent = '') {
  const [st, setSt] = useState<TwState>({ status: 'off', error: '', live: null, incoming: null });
  const dev = useRef<TwDevice | null>(null);
  const call = useRef<TwCall | null>(null);
  const ring = useRef<TwCall | null>(null);
  const ended = useRef(onEnded); ended.current = onEnded;
  const machineCb = useRef(onMachine); machineCb.current = onMachine;
  /** this call: was it answered, did the agent hang up, auto-dial's reference for the voicemail check */
  const info = useRef({ answered: false, byMe: false, machine: false, ref: '' });
  /** how loud each side is right now (0 to 1), for the sound bars: i = the agent's mic, o = the contact */
  const level = useRef({ i: 0, o: 0 });
  const bridge = useRef<string | null>(null);   // the call to the agent's cell, while it lasts

  /** Auto-dial: look for Twilio's voicemail answer for about 15 seconds after pick-up. */
  const listenForMachine = async (c: TwCall, ref: string) => {
    for (let k = 0; k < 15 && call.current === c; k++) {
      await new Promise(r => setTimeout(r, 1000));
      if (call.current !== c) return;
      const { data } = await db().from('quo_events').select('payload').eq('id', `call.amd:${ref}`).limit(1);
      const by = (data?.[0] as { payload?: { answeredBy?: string } } | undefined)?.payload?.answeredBy;
      if (!by) continue;
      if (/^(machine|fax)/.test(by) && call.current === c) {
        info.current.machine = true;
        setSt(s => (s.live ? { ...s, live: { ...s.live, machine: true } } : s));
        machineCb.current?.();
      }
      return;
    }
  };

  const watch = useCallback((c: TwCall, phone: string, incoming: boolean, ref = '') => {
    call.current = c;
    info.current = { answered: incoming, byMe: false, machine: false, ref };
    setSt(s => ({ ...s, live: { phone, state: incoming ? 'open' : 'connecting', muted: false, incoming }, incoming: null }));
    c.on('ringing', () => setSt(s => (s.live ? { ...s, live: { ...s.live, state: 'ringing' } } : s)));
    c.on('accept', () => {
      info.current.answered = true;
      setSt(s => (s.live ? { ...s, live: { ...s.live, state: 'open' } } : s));
      if (ref) void listenForMachine(c, ref);
    });
    c.on('volume', (i, o) => { level.current = { i: Number(i) || 0, o: Number(o) || 0 }; });
    c.on('mute', (m) => setSt(s => (s.live ? { ...s, live: { ...s.live, muted: !!m } } : s)));
    const done = () => { if (call.current !== c) return; call.current = null; level.current = { i: 0, o: 0 }; setSt(s => ({ ...s, live: null }));
      const n = info.current; ended.current({ answered: n.answered, byMe: n.byMe, machine: n.machine, auto: !!n.ref }); };
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
  const start = useCallback(async (to: string, name = '', auto = false): Promise<boolean> => {
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
    const ref = auto ? `${agent || 'a'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` : '';
    try { watch(await d.connect({ params: auto ? { To: to, Auto: '1', Ref: ref } : { To: to } }), to, false, ref); return true; }
    catch (e) { setSt(s => ({ ...s, error: (e as Error).message })); return false; }
  }, [watch, cell, agent]);
  const hangup = useCallback(() => {
    const sid = bridge.current;
    if (sid) {
      bridge.current = null; setSt(s => ({ ...s, live: null }));
      void db().auth.getSession().then(({ data }) => fetch('/api/twilio/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ hangup: sid }) })).catch(() => {});
      return;
    }
    if (call.current) info.current.byMe = true;
    call.current?.disconnect();
  }, []);
  const mute = useCallback(() => { const c = call.current; if (c) c.mute(!c.isMuted()); }, []);
  const digits = useCallback((k: string) => { call.current?.sendDigits(k); }, []);
  const answer = useCallback(() => { const c = ring.current; if (!c) return; ring.current = null; c.accept(); watch(c, c.parameters?.From ?? '', true); }, [watch]);
  const decline = useCallback(() => { const c = ring.current; ring.current = null; c?.reject(); setSt(s => ({ ...s, incoming: null })); }, []);
  return { ...st, level, ready: st.status === 'ready', onCall: () => !!call.current || !!bridge.current, start, hangup, mute, digits, answer, decline };
}

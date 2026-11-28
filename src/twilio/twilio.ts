// Calling inside Dispatch through Twilio (George, 2026-11-27). The agent talks through the browser (headset or
// earbuds); Twilio dials the contact from one of the team's numbers, local to the contact when there is one,
// records the call, and tells Dispatch when it ends. Those events go into quo_events like Quo's, so notes, dial
// counts, recordings and coaching all work the same way. Server-side pieces only use node:crypto (no Twilio package).
// Pure, tested in test/twilio.test.ts.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export interface TwilioEnv { accountSid: string; apiKey: string; apiSecret: string; appSid: string; authToken: string }
export function twilioEnv(env: Record<string, string | undefined> = process.env): TwilioEnv | null {
  const v = { accountSid: env.TWILIO_ACCOUNT_SID, apiKey: env.TWILIO_API_KEY, apiSecret: env.TWILIO_API_SECRET, appSid: env.TWILIO_TWIML_APP_SID, authToken: env.TWILIO_AUTH_TOKEN };
  if (!v.accountSid || !v.apiKey || !v.apiSecret || !v.appSid || !v.authToken) return null;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x).trim()])) as unknown as TwilioEnv;
}
/** The env names still missing, for the Settings page and error messages. */
export function twilioMissing(env: Record<string, string | undefined> = process.env): string[] {
  return ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_AUTH_TOKEN'].filter(k => !env[k]?.trim());
}

/** The browser's pass to make and take calls as this agent (Twilio Access Token with a Voice grant), for an hour. */
export function accessToken(e: Pick<TwilioEnv, 'accountSid' | 'apiKey' | 'apiSecret' | 'appSid'>, identity: string, nowMs: number, ttl = 3600): string {
  const now = Math.floor(nowMs / 1000);
  const header = { cty: 'twilio-fpa;v=1', typ: 'JWT', alg: 'HS256' };
  const payload = { jti: `${e.apiKey}-${now}`, iss: e.apiKey, sub: e.accountSid, iat: now, nbf: now, exp: now + ttl,
    grants: { identity, voice: { incoming: { allow: true }, outgoing: { application_sid: e.appSid } } } };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${b64url(createHmac('sha256', e.apiSecret).update(body).digest())}`;
}

/** Checks a request really came from Twilio (X-Twilio-Signature: HMAC-SHA1 of the URL plus the sorted form fields). */
export function validTwilio(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const want = createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(want), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const e164 = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : ''; };
export { e164 as twilioE164 };

/** A link to a recording that works without signing in but can't be guessed. */
export const recKey = (secret: string, sid: string) => createHmac('sha256', secret).update(`rec:${sid}`).digest('hex').slice(0, 24);

/** What Twilio does when the agent calls a contact: dial them from callerId, record both sides, report the result. */
export function outboundTwiml(o: { to: string; callerId: string; base: string; agent: string; contactPhone: string; record: boolean; notice: boolean }): string {
  const q = `a=${encodeURIComponent(o.agent)}&p=${encodeURIComponent(o.contactPhone)}`;
  const rec = o.record ? ` record="record-from-answer-dual" recordingStatusCallback="${esc(`${o.base}/api/twilio/recording?${q}`)}" recordingStatusCallbackEvent="completed"` : '';
  const whisper = o.record && o.notice ? ` url="${esc(`${o.base}/api/twilio/notice`)}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${esc(o.callerId)}" answerOnBridge="true" timeout="30"${rec}>` +
    `<Number statusCallback="${esc(`${o.base}/api/twilio/status?${q}`)}" statusCallbackEvent="initiated ringing answered completed"${whisper}>${esc(o.to)}</Number></Dial></Response>`;
}

/** Someone calls one of the team's numbers: ring the agent who talked with them last in Dispatch, else take a message. */
export function inboundTwiml(o: { agent: string | null; base: string; from: string }): string {
  const q = `a=${encodeURIComponent(o.agent ?? '')}&p=${encodeURIComponent(o.from)}&vm=1`;
  const vm = `<Say voice="Polly.Joanna">Sorry we missed your call. Please leave your name and a good time to call you back.</Say>` +
    `<Record maxLength="120" playBeep="true" recordingStatusCallback="${esc(`${o.base}/api/twilio/recording?${q}`)}" recordingStatusCallbackEvent="completed"/>`;
  if (!o.agent) return `<?xml version="1.0" encoding="UTF-8"?><Response>${vm}</Response>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25" answerOnBridge="true"><Client>${esc(o.agent)}</Client></Dial>${vm}</Response>`;
}

/** The short line the contact hears when they pick up, before the agent is connected (recording notice). */
export const NOTICE_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">This call may be recorded.</Say></Response>`;

/** A Twilio call status report as a stored event, shaped like Quo's so quoNote reads it ("Dispatch call: 2m 03s"). */
export function statusRow(p: Record<string, string>, agent: string, phone: string): Record<string, unknown> | null {
  if (p.CallStatus !== 'completed' && p.CallStatus !== 'no-answer' && p.CallStatus !== 'busy' && p.CallStatus !== 'failed' && p.CallStatus !== 'canceled') return null;
  const secs = Number(p.CallDuration ?? 0) || 0;
  const answered = p.CallStatus === 'completed' && secs > 0;
  const sid = p.CallSid ?? '';
  return { id: `call.completed:${sid}`, agent_id: agent || null, type: 'call.completed', call_id: p.ParentCallSid || sid, phone,
    at: new Date().toISOString(), applied: false,
    payload: { source: 'twilio', type: 'call.completed', data: { object: { id: sid, direction: 'outgoing', duration: secs, status: answered ? 'answered' : p.CallStatus } } } };
}

/** A recording that finished, as a stored event with a link that plays it in the browser. */
export function recordingRow(p: Record<string, string>, agent: string, phone: string, base: string, secret: string, voicemail: boolean): Record<string, unknown> | null {
  const sid = p.RecordingSid; if (!sid || p.RecordingStatus && p.RecordingStatus !== 'completed') return null;
  const url = `${base}/api/twilio/rec/${sid}?k=${recKey(secret, sid)}`;
  return { id: `call.recording.completed:${sid}`, agent_id: agent || null, type: voicemail ? 'call.voicemail' : 'call.recording.completed', call_id: p.CallSid ?? null, phone,
    at: new Date().toISOString(), applied: false,
    payload: { source: 'twilio', type: 'call.recording.completed', data: { object: { id: sid, recordingUrl: url, duration: Number(p.RecordingDuration ?? 0) || 0 } } } };
}

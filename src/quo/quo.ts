// Quo (the phone and text service George and Gracie use) built into the dialer.
// What it does: calls go out through the agent's Quo number, texts (reminders, confirmations) go out from the dialer
// with a preview first, and Quo tells the dialer when a call ends or a text comes in (webhooks), so talk time and
// replies land on the right contact. Nothing is ever dispositioned on its own: the agent still picks the result.
//
// The live connection needs each agent's Quo API key and number at go-live. The request and event shapes follow
// Quo's public API (api.openphone.com/v1); recheck them against Quo's docs when the key is added.
import type { Contact } from '../rules/types';
import { digits10 } from '../contacts/phones';

export const QUO_API = 'https://api.openphone.com/v1';

/** +1 and 10 digits, the form Quo wants. null when the number is not a full US number. */
export function e164(phone: string): string | null {
  const d = digits10(phone);
  return d.length === 10 ? `+1${d}` : null;
}

// ---------- texts ----------
// Each agent can rewrite these and add their own (George, 2026-11-27: "My texts" in the profile menu).
// Templates use {first} {last} {agent} {company} {time} {day} {when} {tz}; the defaults below are the starting point.
export type TextKey = 'booked' | 'confirmTomorrow' | 'confirmToday' | 'hour' | 'noShow' | 'missed' | 'followUp';
export const TEXT_KEYS: TextKey[] = ['booked', 'confirmTomorrow', 'confirmToday', 'hour', 'noShow', 'missed', 'followUp'];
export const TEXT_LABEL: Record<TextKey, string> = {
  booked: 'Confirmation after booking', confirmTomorrow: 'Night-before reminder', confirmToday: 'Morning reminder',
  hour: '1 hour before', noShow: 'No-show follow-up', missed: 'Sorry I missed you', followUp: 'Follow-up after a presentation',
};
export const TEXT_WHEN: Record<TextKey, string> = {
  booked: 'Right after you set the appointment', confirmTomorrow: 'The day before the appointment', confirmToday: 'The morning of the appointment',
  hour: 'About an hour before', noShow: 'After they miss the appointment', missed: 'After a call they did not pick up', followUp: 'After a presentation with no sale yet',
};
export const DEFAULT_TEXTS: Record<TextKey, string> = {
  booked: "Hi {first}, this is {agent}. You're all set for {when} {tz}. I'll call you at this number. Text me here if anything changes. Reply STOP to opt out.",
  confirmTomorrow: 'Hi {first}, this is {agent}. Just a reminder about our appointment tomorrow at {time} {tz}. Reply YES to confirm or text me a better time.',
  confirmToday: 'Hi {first}, this is {agent}. Just a reminder about our appointment today at {time} {tz}. Reply YES to confirm or text me a better time.',
  hour: "Hi {first}, this is {agent}. I'll be calling you in about an hour, at {time} {tz}. Talk soon!",
  noShow: "Hi {first}, this is {agent}. Sorry we missed each other for our {time} {tz} call. When's a good time to reschedule?",
  missed: 'Hi {first}, this is {agent} about the benefits for {company} members. Sorry I missed you. When is a good time to call back?',
  followUp: 'Hi {first}, this is {agent}. Following up on our talk. Is now still a good time to finish getting you set up?',
};
export const TEXT_FIELDS = ['first', 'last', 'agent', 'company', 'time', 'day', 'when', 'tz'] as const;
export interface CustomText { id: string; name: string; body: string }
/** An agent's own texts: rewritten defaults and templates they made. */
export interface MyTexts { edits?: Partial<Record<TextKey, string>>; custom?: CustomText[] }
export interface TextFill { agent: string; when?: string; time?: string; day?: string; tz?: string }

/** Fills a template's {fields}. Empty fields drop out cleanly ("for {company} members" with no company reads "for members"). */
export function renderText(tpl: string, c: Partial<Pick<Contact, 'first' | 'last' | 'company'>>, f: TextFill): string {
  const v: Record<string, string> = { first: c.first || 'there', last: c.last ?? '', agent: f.agent, company: c.company ?? '',
    time: f.time ?? '', day: f.day ?? '', when: f.when ?? '', tz: f.tz ?? 'ET' };
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m))
    .replace(/[ \t]{2,}/g, ' ').replace(/ ([.,!?])/g, '$1').trim();
}
/** The message for each kind of text, the agent's own version when they wrote one. Edited in the preview before sending. */
export function textFor(key: TextKey, c: Partial<Pick<Contact, 'first' | 'last' | 'company'>>, f: TextFill, mine?: MyTexts | null): string {
  return renderText(mine?.edits?.[key]?.trim() || DEFAULT_TEXTS[key], c, f);
}
/** Which text fits first: by how soon the appointment is, or a no-show. */
export function suggestText(apptAt: number | null | undefined, now: number, noShow: boolean, sameDay: boolean): TextKey {
  if (noShow) return 'noShow';
  if (apptAt == null) return 'missed';
  if (apptAt < now) return 'noShow';
  if (apptAt - now <= 90 * 60_000) return 'hour';
  return sameDay ? 'confirmToday' : 'confirmTomorrow';
}

/** Texts are short: Quo splits anything over 160 characters into parts. */
export const textParts = (s: string) => (s.length <= 160 ? 1 : Math.ceil(s.length / 153));

export interface SendText { from: string; to: string; content: string }
export function checkText(t: SendText): string | null {
  if (!e164(t.to)) return 'That number is not a full 10-digit number.';
  if (!t.from) return 'Add your Quo number in Settings first.';
  if (!t.content.trim()) return 'Write the text first.';
  if (t.content.length > 1600) return 'That text is too long (1,600 characters at most).';
  return null;
}

/** The request the server sends to Quo for one text. The API key stays on the server; the screen never sees it. */
export function sendTextRequest(t: SendText, apiKey: string) {
  return {
    url: `${QUO_API}/messages`,
    init: { method: 'POST', headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: t.content, from: e164(t.from) ?? t.from, to: [e164(t.to)] }) },
  };
}

// ---------- calls ----------
/** How the Call button dials when Quo is on: the Quo app picks up tel: links once it is the default calling app. */
export function callLink(phone: string): string | null {
  const n = e164(phone);
  return n ? `tel:${n}` : null;
}

// ---------- events from Quo (webhooks) ----------
export type QuoEvent =
  | { kind: 'callEnded'; phone: string; direction: 'in' | 'out'; seconds: number; answered: boolean; at: number; id: string }
  | { kind: 'textIn'; phone: string; body: string; at: number; id: string }
  | { kind: 'ignored'; type: string };

/** Reads a webhook body from Quo into something the dialer understands. Unknown events are ignored, never errors. */
export function readEvent(body: unknown): QuoEvent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any, type = String(b?.type ?? ''), o = b?.data?.object ?? {};
  const t = (s: unknown) => { const n = Date.parse(String(s ?? '')); return Number.isFinite(n) ? n : Date.now(); };
  if (type === 'call.completed') {
    const out = o.direction === 'outgoing';
    const other = String(out ? (Array.isArray(o.to) ? o.to[0] : o.to) : o.from ?? '');
    const start = o.answeredAt ? t(o.answeredAt) : null, end = o.completedAt ? t(o.completedAt) : t(b.createdAt);
    const seconds = typeof o.duration === 'number' ? o.duration : start ? Math.max(0, Math.round((end - start) / 1000)) : 0;
    return { kind: 'callEnded', phone: other, direction: out ? 'out' : 'in', seconds, answered: !!o.answeredAt || seconds > 0, at: end, id: String(o.id ?? b.id ?? '') };
  }
  if (type === 'message.received') {
    return { kind: 'textIn', phone: String(o.from ?? ''), body: String(o.text ?? o.body ?? o.content ?? ''), at: t(o.createdAt ?? b.createdAt), id: String(o.id ?? b.id ?? '') };
  }
  return { kind: 'ignored', type };
}

/** The contact a Quo event is about: same 10 digits on the main or backup number. Newest dial wins on a tie. */
export function matchContact(contacts: Contact[], phone: string): Contact | undefined {
  const d = digits10(phone);
  if (d.length !== 10) return undefined;
  return contacts.filter(c => digits10(c.phone) === d || digits10(c.backup) === d)
    .sort((a, b) => (b.lastDialed ?? 0) - (a.lastDialed ?? 0))[0];
}

/**
 * Checks a webhook came from Quo. Quo's current webhooks follow the Standard Webhooks format: a "whsec_..." secret and
 * headers webhook-id, webhook-timestamp and webhook-signature ("v1,<base64>"), signing "<id>.<timestamp>.<body>".
 * Older OpenPhone webhooks use "openphone-signature" (see verifySignature).
 */
export async function verifyStandard(id: string | null, ts: string | null, sigs: string | null, rawBody: string, secret: string): Promise<boolean> {
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;   // older than 10 minutes: refuse replays
  const keyB64 = secret.replace(/^whsec_/, '');
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(keyB64), ch => ch.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`)));
  const want = btoa(String.fromCharCode(...mac));
  return sigs.split(' ').some(p => { const sig = p.split(',')[1] ?? ''; if (sig.length !== want.length) return false;
    let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i); return diff === 0; });
}

/** Checks a webhook really came from Quo: header "hmac;1;<timestamp>;<signature>", HMAC-SHA256 of "<timestamp>.<body>". */
export async function verifySignature(header: string | null, rawBody: string, signingKeyB64: string): Promise<boolean> {
  const parts = String(header ?? '').split(';');
  if (parts.length !== 4 || parts[0] !== 'hmac') return false;
  const [, , ts, sig] = parts;
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(signingKeyB64), ch => ch.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`)));
  const want = btoa(String.fromCharCode(...mac));
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** The note line a Quo event leaves on the contact. */
export function eventNote(e: QuoEvent, md: string): string {
  if (e.kind === 'callEnded') {
    const m = Math.floor(e.seconds / 60), s = e.seconds % 60;
    return `${md}: Quo ${e.direction === 'in' ? 'call from them' : 'call'} ${e.answered ? `${m}m ${String(s).padStart(2, '0')}s` : 'not answered'}`;
  }
  if (e.kind === 'textIn') return `${md}: Text from them: "${e.body.slice(0, 200)}"`;
  return '';
}

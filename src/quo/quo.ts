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
export type TextKey = 'confirmToday' | 'confirmTomorrow' | 'booked' | 'missed' | 'followUp';
export const TEXT_LABEL: Record<TextKey, string> = {
  confirmToday: 'Reminder: today', confirmTomorrow: 'Reminder: tomorrow', booked: 'Booked: confirmation',
  missed: 'Sorry I missed you', followUp: 'Follow-up after a presentation',
};
export interface TextFill { agent: string; when?: string; time?: string }

/** The message for each kind of text. The agent can edit it in the preview before sending. */
export function textFor(key: TextKey, c: Pick<Contact, 'first' | 'company'>, f: TextFill): string {
  const hi = `Hi ${c.first || 'there'}, this is ${f.agent}`;
  switch (key) {
    case 'confirmToday': return `${hi}. Just a reminder about our appointment today at ${f.time ?? ''} ET. Reply YES to confirm or text me a better time.`;
    case 'confirmTomorrow': return `${hi}. Just a reminder about our appointment tomorrow at ${f.time ?? ''} ET. Reply YES to confirm or text me a better time.`;
    case 'booked': return `${hi}. You're all set for ${f.when ?? ''} ET. I'll call you at this number. Text me here if anything changes.`;
    case 'missed': return `${hi} about the benefits for ${c.company ? c.company + ' ' : ''}members. Sorry I missed you. When is a good time to call back?`;
    case 'followUp': return `${hi}. Following up on our talk. Is now still a good time to finish getting you set up?`;
  }
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

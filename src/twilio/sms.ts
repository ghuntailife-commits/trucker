// Texting through Dispatch's own numbers (George, 2026-11-27, after the 10DLC campaign was approved). A text goes
// from the same local number Dispatch calls that contact from, so they see one number. Replies come back to
// /api/twilio/sms-in and land on the contact's notes like Quo's. Pure parts, tested in test/twilioSms.test.ts.
import { pickFrom } from '../quo/localMatch';
import { twilioE164 } from './twilio';

const d10 = (p: string) => String(p ?? '').replace(/\D/g, '').slice(-10);

/** The number to text from: the one this contact last heard from us (call or text), else the best local match. */
export function textFrom(pool: string[], to: string, lastFrom: string | null | undefined): string | null {
  const last = d10(lastFrom ?? '');
  const same = last ? pool.find(n => d10(n) === last) : undefined;
  if (same) return twilioE164(same) || same;
  const { from } = pickFrom(pool, to, null);
  return from ? twilioE164(from) || from : null;
}

/** What a Twilio texting error means, in plain words. */
export function smsProblem(code: number | string | undefined, message = ''): string {
  switch (Number(code)) {
    case 21610: return 'This person texted STOP, so texts to them are blocked. They can text START to allow them again.';
    case 21211: case 21614: return 'That number can\'t get texts (it isn\'t a valid mobile number).';
    case 21408: case 21612: return 'Texts to that number aren\'t allowed from Dispatch.';
    case 21606: case 21659: case 21712: return 'That Dispatch number isn\'t set up for texting yet. Check it is in the Dispatch messaging service in Twilio.';
    case 30034: case 30035: return 'The texting registration isn\'t finished for that number yet.';
    case 30007: return 'The phone company filtered that text as spam.';
    case 30003: case 30005: case 30006: return 'That number can\'t get texts (unreachable, unknown or a landline).';
    default: return message ? `Twilio said: ${message}` : 'The text did not go through.';
  }
}

/** An incoming text as a stored event, shaped like Quo's so the notes read "Text from them: …". */
export function inboundRow(p: Record<string, string>, agent: string | null): Record<string, unknown> | null {
  const sid = p.MessageSid || p.SmsMessageSid; if (!sid) return null;
  const media = Number(p.NumMedia ?? 0) || 0;
  const text = [String(p.Body ?? '').trim(), media ? `[${media === 1 ? 'a picture' : `${media} pictures`}]` : ''].filter(Boolean).join(' ');
  const from = twilioE164(p.From ?? '') || p.From || '';
  return { id: `message.received:${sid}`, agent_id: agent, type: 'message.received', call_id: null, phone: from, at: new Date().toISOString(), applied: false,
    payload: { source: 'twilio', type: 'message.received', data: { object: { id: sid, text, from, to: twilioE164(p.To ?? '') || p.To || '' } } } };
}

/** A text the carrier would not deliver, so the agent finds out (the screen already noted it as sent). */
export function failedRow(p: Record<string, string>, agent: string | null): Record<string, unknown> | null {
  const sid = p.MessageSid || p.SmsSid; const st = p.MessageStatus || p.SmsStatus;
  if (!sid || (st !== 'failed' && st !== 'undelivered')) return null;
  return { id: `message.failed:${sid}`, agent_id: agent, type: 'message.failed', call_id: null, phone: twilioE164(p.To ?? '') || p.To || '', at: new Date().toISOString(), applied: false,
    payload: { source: 'twilio', type: 'message.failed', data: { object: { id: sid, why: smsProblem(p.ErrorCode) } } } };
}

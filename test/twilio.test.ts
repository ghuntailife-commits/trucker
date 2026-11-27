// Calling inside Dispatch (George, 2026-11-27): token, Twilio's signature check, call instructions, stored events. Made-up numbers.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { accessToken, validTwilio, outboundTwiml, inboundTwiml, statusRow, recordingRow, recKey, twilioMissing } from '../src/twilio/twilio';
import { quoNote } from '../src/quo/events';

const env = { accountSid: 'AC' + '1'.repeat(32), apiKey: 'SK' + '2'.repeat(32), apiSecret: 'secret', appSid: 'AP' + '3'.repeat(32) };

describe('Twilio calling', () => {
  it('makes a signed token with a voice grant for the agent', () => {
    const t = accessToken(env, 'sam', Date.UTC(2026, 10, 27, 23));
    const [h, p, s] = t.split('.');
    const pay = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(pay.grants.identity).toBe('sam');
    expect(pay.grants.voice.outgoing.application_sid).toBe(env.appSid);
    expect(pay.exp - pay.iat).toBe(3600);
    expect(createHmac('sha256', 'secret').update(`${h}.${p}`).digest('base64url')).toBe(s);
  });
  it("checks Twilio's signature", () => {
    const url = 'https://dispatchdialer.com/api/twilio/voice', params = { To: '+12145550142', From: 'client:sam' };
    const sig = createHmac('sha1', 'tok').update(url + 'Fromclient:samTo+12145550142').digest('base64');
    expect(validTwilio('tok', url, params, sig)).toBe(true);
    expect(validTwilio('tok', url, { ...params, To: '+19995550000' }, sig)).toBe(false);
    expect(validTwilio('tok', url, params, null)).toBe(false);
  });
  it('dials the contact from the local number, records, and plays the notice', () => {
    const x = outboundTwiml({ to: '+12145550142', callerId: '+12145550100', base: 'https://d.com', agent: 'sam', contactPhone: '+12145550142', record: true, notice: true });
    expect(x).toContain('callerId="+12145550100"');
    expect(x).toContain('record="record-from-answer-dual"');
    expect(x).toContain('url="https://d.com/api/twilio/notice"');
    expect(x).toContain('/api/twilio/status?a=sam&amp;p=%2B12145550142');
    expect(outboundTwiml({ to: '+1', callerId: '+1', base: '', agent: 'a', contactPhone: '', record: false, notice: true })).not.toContain('record=');
    expect(inboundTwiml({ agent: 'sam', base: 'https://d.com', from: '+1' })).toContain('<Client>sam</Client>');
    expect(inboundTwiml({ agent: null, base: 'https://d.com', from: '+1' })).not.toContain('<Client>');
  });
  it('stores the call result and recording like Quo, so notes and dials work the same', () => {
    const r = statusRow({ CallStatus: 'completed', CallDuration: '125', CallSid: 'CA1', ParentCallSid: 'CA0' }, 'sam', '+12145550142')!;
    expect(r.agent_id).toBe('sam');
    expect(quoNote(r as never)).toBe('Dispatch call: 2m 05s');
    expect(quoNote(statusRow({ CallStatus: 'no-answer', CallSid: 'CA2' }, 'sam', 'x') as never)).toBe('Dispatch call: not answered');
    expect(statusRow({ CallStatus: 'ringing', CallSid: 'CA3' }, 'sam', 'x')).toBeNull();
    const rec = recordingRow({ RecordingSid: 'RE' + 'a'.repeat(32), RecordingStatus: 'completed', CallSid: 'CA1' }, 'sam', 'p', 'https://d.com', 'secret', false)!;
    expect(quoNote(rec as never)).toBe(`Call recording: https://d.com/api/twilio/rec/RE${'a'.repeat(32)}?k=${recKey('secret', 'RE' + 'a'.repeat(32))}`);
    expect(twilioMissing({ TWILIO_ACCOUNT_SID: 'x' })).toContain('TWILIO_API_KEY');
  });
});

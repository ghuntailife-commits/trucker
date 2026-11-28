// Dispatch texting (George, 2026-11-27). Made-up numbers.
import { describe, expect, it } from 'vitest';
import { failedRow, inboundRow, smsProblem, textFrom } from '../src/twilio/sms';
import { quoNote } from '../src/quo/events';

const pool = ['+16155550100', '+12145550100', '+17865550100'];

describe('textFrom', () => {
  it('uses the number the contact last heard from', () => {
    expect(textFrom(pool, '+16155550199', '+12145550100')).toBe('+12145550100');
  });
  it('else the local match', () => {
    expect(textFrom(pool, '+16155550199', null)).toBe('+16155550100');
    expect(textFrom(pool, '+16155550199', '+19995550000')).toBe('+16155550100');   // no longer a team number
  });
  it('none with no numbers', () => { expect(textFrom([], '+16155550199', null)).toBeNull(); });
});

describe('incoming texts and failures', () => {
  it('a reply reads like a Quo text on the notes', () => {
    const row = inboundRow({ MessageSid: 'SM1', From: '+16155550199', To: '+16155550100', Body: 'Tuesday works', NumMedia: '1' }, 'george')!;
    expect(row.phone).toBe('+16155550199'); expect(row.agent_id).toBe('george');
    expect(quoNote(row as Parameters<typeof quoNote>[0])).toBe('Text from them: "Tuesday works [a picture]"');
  });
  it('an undelivered text tells the agent why', () => {
    expect(failedRow({ MessageSid: 'SM2', MessageStatus: 'delivered', To: '+16155550199' }, 'george')).toBeNull();
    const row = failedRow({ MessageSid: 'SM2', MessageStatus: 'undelivered', ErrorCode: '30007', To: '+16155550199' }, 'george')!;
    expect(quoNote(row as Parameters<typeof quoNote>[0])).toBe('Text not delivered: The phone company filtered that text as spam.');
  });
  it('STOP in plain words', () => { expect(smsProblem(21610)).toMatch(/texted STOP/); });
});

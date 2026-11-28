// Dispatch call transcripts (George, 2026-11-27). Made-up lines only.
import { describe, expect, it } from 'vitest';
import { dialogueFrom, parseKey } from '../src/twilio/intel';
import { transcriptText } from '../src/quo/events';

describe('Twilio transcripts', () => {
  it('channel 1 is the agent, channel 2 the contact, in time order, read like a Quo transcript', () => {
    const d = dialogueFrom([{ media_channel: 2, transcript: 'Hello?', start_time: 1.2 }, { media_channel: 1, transcript: 'Hi Jordan, it is Pat.', start_time: 2.5 },
      { media_channel: 2, transcript: ' ', start_time: 3 }], false);
    expect(transcriptText({ data: { object: { dialogue: d } } })).toBe('Contact: Hello?\nAgent: Hi Jordan, it is Pat.');
  });
  it('a voicemail is all the contact', () => {
    expect(transcriptText({ data: { object: { dialogue: dialogueFrom([{ media_channel: 1, transcript: 'Call me back.' }], true) } } })).toBe('Contact: Call me back.');
  });
  it('reads who and which call from the key', () => {
    expect(parseKey('george|+15555550100|CA123|vm')).toEqual({ agent: 'george', phone: '+15555550100', callSid: 'CA123', voicemail: true });
    expect(parseKey(undefined).agent).toBe('');
  });
});

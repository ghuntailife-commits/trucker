// Quo webhook events. Numbers are made up (555-01xx).
import { describe, it, expect } from 'vitest';
import { quoParts, quoNote, transcriptText } from '../src/quo/events';

const call = { type: 'call.completed', createdAt: '2026-11-27T01:00:00Z', data: { object: { id: 'AC1', direction: 'outgoing', from: '+15550100001', to: '+15550100002',
  answeredAt: '2026-11-27T00:55:00Z', completedAt: '2026-11-27T00:58:05Z' } } };

describe('quo events', () => {
  it('knows our number and theirs, both ways', () => {
    expect(quoParts(call)).toMatchObject({ ours: '+15550100001', them: '+15550100002', callId: 'AC1', id: 'AC1' });
    const text = { type: 'message.received', data: { object: { id: 'M1', direction: 'incoming', from: '+15550100002', to: ['+15550100001'], text: 'Yes 6pm works' } } };
    expect(quoParts(text)).toMatchObject({ ours: '+15550100001', them: '+15550100002', callId: null });
    expect(quoNote({ type: text.type, payload: text })).toBe('Text from them: "Yes 6pm works"');
  });
  it('ignores events it does not use', () => { expect(quoParts({ type: 'contact.updated', data: { object: {} } })).toBeNull(); });
  it('writes call length, recording and AI notes', () => {
    expect(quoNote({ type: call.type, payload: call })).toBe('Quo call: 3m 05s');
    const rec = { type: 'call.recording.completed', data: { object: { id: 'AC1', media: [{ url: 'https://example.com/r.mp3' }] } } };
    expect(quoNote({ type: rec.type, payload: rec })).toBe('Call recording: https://example.com/r.mp3');
    const tr = { type: 'call.transcript.completed', data: { object: { callId: 'AC1', dialogue: [
      { identifier: '+15550100001', userId: 'U1', content: 'Hi, this is George.' }, { identifier: '+15550100002', content: 'Call me Tuesday.' }] } } };
    expect(quoParts(tr)).toMatchObject({ callId: 'AC1', ours: '', them: '' });
    expect(transcriptText(tr)).toBe('Agent: Hi, this is George.\nContact: Call me Tuesday.');
    expect(quoNote({ type: tr.type, payload: tr, ai_note: 'Wants a call Tuesday.' })).toBe('Call notes (AI): Wants a call Tuesday.');
    expect(quoNote({ type: tr.type, payload: tr })).toBe('');
  });
});

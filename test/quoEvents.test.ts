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

describe('Quo webhook signatures (Standard Webhooks)', () => {
  it('accepts a correctly signed body and refuses a changed one', async () => {
    const { verifyStandard } = await import('../src/quo/quo');
    const secretBytes = new Uint8Array(24).map((_, i) => i + 1);
    const secret = 'whsec_' + btoa(String.fromCharCode(...secretBytes));
    const id = 'msg_1', ts = String(Math.floor(Date.now() / 1000)), body = '{"type":"message.received"}';
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))));
    expect(await verifyStandard(id, ts, `v1,${sig}`, body, secret)).toBe(true);
    expect(await verifyStandard(id, ts, `v1,${sig}`, body + ' ', secret)).toBe(false);
  });
});

describe("Quo's 2026 webhook format (data.resource + data.context)", () => {
  it('reads a received text', async () => {
    const { quoParts, quoNote, quoNumberId } = await import('../src/quo/events');
    const body = { id: 'EV1', apiVersion: '2026-03-30', type: 'message.received', createdAt: '2026-11-27T02:18:27.681Z',
      data: { context: { phoneNumberId: 'PN1', senderIdentifier: '+15555550101', recipientIdentifiers: ['+15555550199'] },
        resource: { id: 'AC1', direction: 'incoming', text: 'Hello', createdAt: '2026-11-27T02:18:27Z' } } };
    const p = quoParts(body)!;
    expect(p.ours).toBe('+15555550199'); expect(p.them).toBe('+15555550101'); expect(quoNumberId(body)).toBe('PN1');
    expect(quoNote({ type: 'message.received', payload: body })).toBe('Text from them: "Hello"');
  });
  it('reads a call, its recording and its transcript', async () => {
    const { quoParts, quoNote, transcriptText } = await import('../src/quo/events');
    const ctx = { phoneNumberId: 'PN1', participants: { workspace: ['+15555550199'], external: ['+15555550101'] } };
    const call = { type: 'call.completed', data: { context: ctx, resource: { id: 'CA1', direction: 'outgoing', status: 'answered', duration: 125 } } };
    const p = quoParts(call)!;
    expect([p.callId, p.ours, p.them]).toEqual(['CA1', '+15555550199', '+15555550101']);
    expect(quoNote({ type: 'call.completed', payload: call })).toBe('Quo call: 2m 05s');
    const rec = { type: 'call.recording.completed', data: { context: ctx, resource: { id: 'CA1', recordings: [{ url: 'https://example.com/r.mp3' }] } } };
    expect(quoNote({ type: 'call.recording.completed', payload: rec })).toBe('Call recording: https://example.com/r.mp3');
    const tr = { type: 'call.transcript.completed', data: { context: ctx, resource: { callId: 'CA1', dialogue: [
      { userId: 'US1', identifier: null, content: 'Hi, this is the agent' }, { userId: null, identifier: '+15555550101', content: 'Hey' }] } } };
    expect(quoParts(tr)!.callId).toBe('CA1');
    expect(transcriptText(tr)).toBe('Agent: Hi, this is the agent\nContact: Hey');
  });
});

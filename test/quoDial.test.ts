// A call made in Quo counts as a dial (George, 2026-11-27). Made-up contacts.
import { describe, expect, it } from 'vitest';
import { contact, et, MIN } from './helpers';
import { dialerAction, quoDial } from '../src/rules/engine';

describe('Quo calls count as dials', () => {
  const at = et(27, 16, 0);
  it('counts one dial for a Quo call, and two calls close together are one dial', () => {
    const c = contact({ dials: 2, lastDialed: et(26, 10) });
    const a = quoDial(c, at, at + MIN);
    expect(a.contact.dials).toBe(3);
    expect(a.events).toHaveLength(1);
    expect(quoDial(a.contact, at + 3 * MIN, at + 4 * MIN).ignored).toBe(true);
    expect(quoDial(a.contact, at + 70 * MIN, at + 71 * MIN).contact.dials).toBe(4);
  });
  it('No answer right after a counted Quo call does not count it again', () => {
    const c = quoDial(contact({ dials: 2, lastDialed: et(26, 10) }), at, at + MIN).contact;
    const r = dialerAction(c, 'noanswer', at + 2 * MIN);
    expect(r.contact.dials).toBe(3);
    expect(r.events.filter(e => e.kind === 'Dial')).toHaveLength(0);
    expect(dialerAction(r.contact, 'noanswer', at + 30 * MIN).contact.dials).toBe(4);
  });
  it('a Quo call after the agent already tapped No answer is the same dial', () => {
    const c = dialerAction(contact({ dials: 2, lastDialed: et(26, 10) }), 'noanswer', at - MIN).contact;
    expect(quoDial(c, at, at + MIN).ignored).toBe(true);
  });
});
describe('a result tapped during a long call', () => {
  it('is the dial, and the Quo call that ends 40 minutes later adds nothing', () => {
    const start = et(27, 15, 0);
    const c = dialerAction(contact({ dials: 1, lastDialed: et(25, 10) }), 'noanswer', start + 2 * MIN).contact;
    expect(quoDial(c, start + 40 * MIN, start + 41 * MIN).ignored).toBe(true);
  });
});
import { quoParts } from '../src/quo/events';
describe('incoming call ringing', () => {
  it('reads call.ringing with whose number is whose', () => {
    const p = quoParts({ type: 'call.ringing', data: { object: { id: 'AC1', direction: 'incoming', from: '+12145550142', to: '+17865550100', createdAt: '2026-11-27T22:00:00Z' } } });
    expect(p).toMatchObject({ type: 'call.ringing', callId: 'AC1', ours: '+17865550100', them: '+12145550142' });
  });
});
import { plainNote } from '../src/rules/engine';
import { quoNote } from '../src/quo/events';
describe('Quo text notes', () => {
  it('saves a client text word for word, never as a callback', () => {
    const c = contact({ tag: '' });
    const r = plainNote(c, 'Text from them: "tomorrow 2pm @ fri 10am, email me at a@b.com"', et(27, 17));
    expect(r.contact.tag).toBe('');
    expect(r.contact.callAt).toBeNull();
    expect(r.contact.notes).toContain('email me at a@b.com');
  });
  it('turns a text sent from the Quo app into a note', () => {
    expect(quoNote({ type: 'message.delivered', payload: { data: { object: { text: 'See you at 7', direction: 'outgoing' } } } })).toBe('Texted (Quo): "See you at 7"');
  });
});

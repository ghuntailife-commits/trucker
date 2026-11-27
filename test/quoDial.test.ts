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
    expect(quoDial(a.contact, at + 60 * MIN, at + 61 * MIN).contact.dials).toBe(4);
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

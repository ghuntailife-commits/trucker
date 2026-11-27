// What the calls taught us about a person, for the call brief (George, 2026-11-27). Made-up facts only.
import { describe, expect, it } from 'vitest';
import { factsByTopic, lastCallNotes, mergeFacts, readFacts } from '../src/brief/profile';
import { readCallTool } from '../src/quo/coach';

const D = 86_400_000;
describe('profile facts', () => {
  it('reads Claude facts safely', () => {
    expect(readFacts([{ topic: 'Family', fact: ' Two kids, 4 and 7 ' }, { topic: 'Weird', fact: 'Likes fishing' }, { topic: 'Job' }, 'x']))
      .toEqual([{ topic: 'Family', fact: 'Two kids, 4 and 7' }, { topic: 'Other', fact: 'Likes fishing' }]);
    expect(readFacts(null)).toEqual([]);
  });
  it('merges newest first, drops repeats, keeps three per topic', () => {
    let p = mergeFacts(undefined, [{ topic: 'Job', fact: 'Left UPS in 2024' }, { topic: 'Hours', fact: 'Works nights' }], 1 * D);
    p = mergeFacts(p, [{ topic: 'Job', fact: 'left ups in 2024.' }, { topic: 'Job', fact: 'Now drives for a school district' }], 2 * D);
    expect(p.filter(f => f.topic === 'Job').map(f => f.fact)).toEqual(['left ups in 2024.', 'Now drives for a school district']);
    for (let i = 0; i < 5; i++) p = mergeFacts(p, [{ topic: 'Hours', fact: `Shift ${i}` }], (3 + i) * D);
    expect(p.filter(f => f.topic === 'Hours').map(f => f.fact)).toEqual(['Shift 4', 'Shift 3', 'Shift 2']);
  });
  it('groups by topic; "That day" fades after two weeks', () => {
    const p = mergeFacts(undefined, [{ topic: 'That day', fact: 'At his son’s game' }, { topic: 'Family', fact: 'Married' }], 0);
    expect(factsByTopic(p, 3 * D).map(g => g.topic)).toEqual(['Family', 'That day']);
    expect(factsByTopic(p, 20 * D).map(g => g.topic)).toEqual(['Family']);
  });
  it('finds the last call notes', () => {
    expect(lastCallNotes('11/20: NA | 11/25: Call notes (AI): Busy driving, call after 6. | 11/26: VM')).toEqual({ day: '11/25', text: 'Busy driving, call after 6.' });
    expect(lastCallNotes('11/20: NA')).toBeNull();
  });
  it('the call tool carries the facts', () => {
    const r = readCallTool({ note: 'Talked.', outcome: 'Callback set', objections: [], went_well: '', try_next: '', facts: [{ topic: 'Best time', fact: 'After 6 PM' }] });
    expect(r?.tags.facts).toEqual([{ topic: 'Best time', fact: 'After 6 PM' }]);
  });
});

import { eventNote, briefKey } from '../src/brief/text';
import { contact } from './helpers';
describe('appointment prep notes', () => {
  const c = { ...contact({ first: 'Pat' }), notes: '11/25: Call notes (AI): Works nights at the hub, wife Jen decides with him.', profile: mergeFacts(undefined, [{ topic: 'Family', fact: 'Wife Jen' }], 0) };
  it('go on the event when only the agent sees it', () => {
    const n = eventNote(c, 1000, false);
    expect(n).toContain('LAST CALL (11/25): Works nights');
    expect(n).toContain('• Family: Wife Jen');
  });
  it('never go on an invite the client gets', () => {
    expect(eventNote(c, 1000, true)).not.toContain('Jen');
  });
  it('the brief is rewritten only when something changed', () => {
    expect(briefKey(c, 'appt')).toBe(briefKey({ ...c }, 'appt'));
    expect(briefKey(c, 'appt')).not.toBe(briefKey({ ...c, notes: c.notes + ' | 11/26: VM' }, 'appt'));
  });
});

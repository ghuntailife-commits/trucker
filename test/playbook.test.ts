// Team Playbook filing and counts. Made-up calls only.
import { describe, expect, it } from 'vitest';
import { applyLearn, emptyPlaybook, learnInput, readExchanges, rebuttalsFor, score, type StudyCall } from '../src/quo/playbook';

const call = (id: string, outcome: string, ex: [string, string, string, 'saved' | 'lost'][], opener = 'Hi, this is Sam with the union benefits'): StudyCall =>
  ({ id, at: Number(id.slice(1)), agent: 'a1', outcome, opener, stage: 'Pitched', note: '', exchanges: ex.map(([objection, contactSaid, agentSaid, result]) => ({ objection, contactSaid, agentSaid, result })) });

describe('team playbook', () => {
  it('reads exchanges safely', () => {
    expect(readExchanges([{ objection: 'Money is tight', contact_said: 'No money', agent_said: 'It is free to look', result: 'weird' }, null, 'x']))
      .toEqual([{ objection: 'Money is tight', contactSaid: 'No money', agentSaid: 'It is free to look', result: 'unclear' }]);
    expect(readExchanges('nope')).toEqual([]);
  });
  it('files exchanges under rebuttals and counts tries and saves itself', () => {
    const calls = [call('c1', 'Booked', [['Too busy / bad time', 'I am driving', 'Totally get it, 2 minutes tonight or tomorrow?', 'saved']]),
      call('c2', 'Not interested', [['Too busy / bad time', 'Busy', 'When is better?', 'lost']]),
      call('c3', 'Booked', [['Too busy / bad time', 'Not now', 'Two minutes tonight or tomorrow?', 'saved']])];
    const pb0 = emptyPlaybook(), inp = learnInput(pb0, calls, []);
    expect(inp.xs.map(x => x.id)).toEqual(['x0', 'x1', 'x2']);
    const pb = applyLearn(pb0, calls, inp, {
      exchanges: [{ x: 'x0', rebuttal: '', new_line: 'Totally get it - two minutes tonight or tomorrow?' }, { x: 'x1', rebuttal: '', new_line: 'When is a better time?' }, { x: 'x2', rebuttal: 'new:x0', new_line: '' }],
      openers: [{ c: 'c0', opener: '', new_line: 'Union benefits intro' }, { c: 'c1', opener: 'o?', new_line: '' }],
      why: [{ id: 'new:x0', why: 'Gives two easy choices.' }], ideas: [{ objection: 'Money is tight', line: 'It costs nothing to see what you already have.', why: 'Lowers the stakes.', from: 'idea' }],
      summary: 'Early days.', tips: ['Offer two times'], trends: [], questions: ['Need more calls'], learned: 'Two-choice close works on busy people.' }, 1000);
    // x2 pointed at a not-yet-made id, so it was skipped rather than guessed
    const busy = rebuttalsFor(pb, 'Too busy / bad time');
    expect(busy.map(r => [r.tried, r.saved])).toEqual([[1, 1], [1, 0]]);
    expect(busy[0].why).toBe('Gives two easy choices.');
    expect(pb.objections[0]).toMatchObject({ label: 'Too busy / bad time', heard: 3, saved: 2 });
    expect(pb.openers).toHaveLength(1); expect(pb.openers[0]).toMatchObject({ tried: 1, good: 1 });
    expect(rebuttalsFor(pb, 'Money is tight')[0]).toMatchObject({ from: 'idea', tried: 0 });
    expect(pb.callsStudied).toBe(3); expect(pb.watermark).toBe(3); expect(pb.learned[0].text).toMatch(/Two-choice/);
    // next day: same idea filed under the existing id adds to its counts
    const more = [call('c9', 'Booked', [['Too busy / bad time', 'Driving', 'Two minutes tonight or tomorrow?', 'saved']])];
    const id = busy[0].id, inp2 = learnInput(pb, more, []);
    expect(inp2.text).toContain(`${id} | Too busy / bad time`);
    const pb2 = applyLearn(pb, more, inp2, { exchanges: [{ x: 'x0', rebuttal: id, new_line: '' }], openers: [], why: [], ideas: [], summary: '', tips: null, trends: [], questions: [], learned: '' }, 2000);
    expect(pb2.rebuttals.find(r => r.id === id)).toMatchObject({ tried: 2, saved: 2 });
    expect(pb2.summary).toBe('Early days.'); expect(pb2.tips).toEqual(['Offer two times']); expect(pb2.learned).toHaveLength(1);
  });
  it('ranks by save rate, pulled toward even for few tries', () => {
    expect(score({ tried: 1, saved: 1 })).toBeLessThan(score({ tried: 10, saved: 9 }));
    expect(score({ tried: 0, saved: 0 })).toBe(0.5);
  });
});

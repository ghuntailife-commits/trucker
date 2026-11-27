import { describe, it, expect } from 'vitest';
import { readCallTool, coachSums, weekForClaude, type CoachCall } from '../src/quo/coach';

const call = (id: string, outcome: string, objections: string[] = []): CoachCall =>
  ({ id, agentId: 'a1', callId: id, at: Number(id.slice(1)), phone: '+15555550101', note: 'Made-up call.', tags: readCallTool({ note: 'x', outcome, objections, went_well: 'Kept it short', try_next: 'Ask for the spouse' })!.tags });

describe('coaching tags', () => {
  it('reads Claude\'s tool input and guards odd values', () => {
    const r = readCallTool({ note: ' Booked Tue 6 PM. ', outcome: 'Booked', objections: ['Money is tight', ''], went_well: 'Warm open', try_next: '' })!;
    expect(r.note).toBe('Booked Tue 6 PM.');
    expect(r.tags).toEqual({ outcome: 'Booked', objections: ['Money is tight'], wentWell: 'Warm open', tryNext: '', opener: '', stage: undefined, exchanges: [] });
    expect(readCallTool({ note: 'x', outcome: 'Something new', objections: 'nope' })!.tags.outcome).toBe('Other');
    expect(readCallTool(null)).toBeNull();
  });
  it('sums outcomes and objections, counting the ones saved anyway', () => {
    const s = coachSums([call('c1', 'Booked', ['Money is tight']), call('c2', 'Not interested', ['Money is tight']), call('c3', 'Voicemail'), { ...call('c4', 'Booked'), tags: null }]);
    expect(s.calls).toBe(3); expect(s.talked).toBe(2); expect(s.good).toBe(1);
    expect(s.objections).toEqual([{ label: 'Money is tight', count: 2, savedAnyway: 1 }]);
    expect(s.outcomes[0]).toEqual({ label: 'Booked', count: 1 });
    expect(weekForClaude([call('c1', 'Booked')])).toMatch(/Calls analyzed: 1/);
  });
});

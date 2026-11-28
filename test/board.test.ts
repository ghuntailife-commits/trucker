// Top dialers today (George, 2026-11-28). Made-up agents only.
import { describe, expect, it } from 'vitest';
import { rankBoard, initials, isLive, type BoardRow } from '../src/team/board';

const r = (agent: string, dials: number, extra: Partial<BoardRow> = {}): BoardRow => ({ agent, name: agent, day: 20261128, dials, connects: 0, booked: 0, at: 0, ...extra });

describe('top dialers board', () => {
  it('ranks today by dials, then reached, and leaves out other days and zero dials', () => {
    const out = rankBoard([r('a', 40), r('b', 55), r('c', 40, { connects: 5 }), r('d', 90, { day: 20261127 }), r('e', 0)], 20261128);
    expect(out.map(x => x.agent)).toEqual(['b', 'c', 'a']);
  });
  it('makes initials and knows who is live', () => {
    expect(initials('Pat Lee Morgan')).toBe('PM');
    expect(initials('Sam')).toBe('SA');
    expect(isLive(r('a', 1, { at: 1_000_000 }), 1_000_000 + 14 * 60_000)).toBe(true);
    expect(isLive(r('a', 1, { at: 1_000_000 }), 1_000_000 + 16 * 60_000)).toBe(false);
  });
});

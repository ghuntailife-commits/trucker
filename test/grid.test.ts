import { describe, expect, it } from 'vitest';
import { hourRange, lanes, snapSlot, isOpen, BLOCK_MS } from '../src/calendar/grid';

describe('appointments time grid', () => {
  it('shows 8 AM to 9 PM, stretched for early or late blocks', () => {
    expect(hourRange([600])).toEqual([8, 21]);
    expect(hourRange([7 * 60 + 30, 21 * 60])).toEqual([7, 22]);
  });
  it('puts overlapping half hours side by side and lone ones full width', () => {
    const m = lanes([{ key: 'a', start: 0 }, { key: 'b', start: 15 * 60_000 }, { key: 'c', start: BLOCK_MS }, { key: 'd', start: 5 * BLOCK_MS }]);
    expect(m.get('a')).toEqual({ lane: 0, of: 2 }); expect(m.get('b')).toEqual({ lane: 1, of: 2 });
    expect(m.get('c')).toEqual({ lane: 0, of: 2 }); expect(m.get('d')).toEqual({ lane: 0, of: 1 });
  });
  it('snaps a drop to the nearest half hour inside the day', () => {
    expect(snapSlot(44, 8, 21)).toBe(1); expect(snapSlot(-20, 8, 21)).toBe(0); expect(snapSlot(9999, 8, 21)).toBe(25);
  });
  it('knows open time', () => {
    expect(isOpen([0], BLOCK_MS)).toBe(true); expect(isOpen([0], BLOCK_MS / 2)).toBe(false);
  });
});

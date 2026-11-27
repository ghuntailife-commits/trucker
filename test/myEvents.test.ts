import { describe, expect, it } from 'vitest';
import { addEvent, moveEvent, removeEvent, eventsBetween } from '../src/calendar/myEvents';
import { lanes } from '../src/calendar/grid';

describe('my own calendar events', () => {
  it('adds, moves and removes, kept in time order', () => {
    let l = addEvent([], { title: ' Lunch ', start: 2000, mins: 60 }, 'a');
    l = addEvent(l, { title: '', start: 1000, mins: 30 }, 'b');
    expect(l.map(e => [e.id, e.title])).toEqual([['b', 'Busy'], ['a', 'Lunch']]);
    l = moveEvent(l, 'b', 5000); expect(l.map(e => e.id)).toEqual(['a', 'b']);
    expect(removeEvent(l, 'a').map(e => e.id)).toEqual(['b']);
  });
  it('finds events touching a range', () => {
    const l = addEvent([], { title: 'x', start: 0, mins: 60 }, 'a');
    expect(eventsBetween(l, 30 * 60_000, 90 * 60_000).length).toBe(1); expect(eventsBetween(l, 60 * 60_000, 99 * 60_000).length).toBe(0);
  });
  it('lays a long event beside the half hours it covers', () => {
    const m = lanes([{ key: 'e', start: 0, len: 2 * 3_600_000 }, { key: 'a', start: 3_600_000 }]);
    expect(m.get('e')).toEqual({ lane: 0, of: 2 }); expect(m.get('a')).toEqual({ lane: 1, of: 2 });
  });
});

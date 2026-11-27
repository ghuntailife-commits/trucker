// A follow-up call is not a new presentation (George, 2026-11-27). Made-up events only.
import { describe, expect, it } from 'vitest';
import { realPresentations } from '../src/reports/presented';
import { TAGS } from '../src/rules/tags';
import type { LogEvent } from '../src/rules/types';

const tag = (at: number, contactId: string, t: string) => ({ at, contactId, kind: 'Tag', tag: t, list: 'Texas', first: '', last: '', phone: '', count: 1, dials: 1 }) as LogEvent;

describe('what counts as a presentation', () => {
  it('a follow-up "still no sale" or a sale on the follow-up does not count again', () => {
    const log = [tag(1, 'a', TAGS.scheduled), tag(2, 'a', TAGS.presented), tag(3, 'a', TAGS.presented), tag(4, 'a', TAGS.sold)];
    const real = realPresentations(log);
    expect(log.filter(e => real.has(e)).map(e => e.at)).toEqual([2]);
  });
  it('booked again after the last presentation: the next one counts', () => {
    const log = [tag(2, 'a', TAGS.presented), tag(5, 'a', TAGS.scheduled), tag(6, 'a', TAGS.presented), tag(7, 'b', TAGS.sold)];
    const real = realPresentations(log);
    expect(log.filter(e => real.has(e)).map(e => e.at)).toEqual([2, 6, 7]);
  });
});

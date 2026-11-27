// Two screens saving the same agent's list (George, 2026-11-27: Ivan's open screen wiped the admin's import). Made-up contacts.
import { describe, expect, it } from 'vitest';
import { mergePart } from '../src/live/parts';

const c = (id: string, dials = 0) => ({ id, first: 'Avery', last: id, dials });

describe('saving a list someone else changed', () => {
  it('keeps contacts only they added, our edits win, our removals stay removed', () => {
    const base = [c('1'), c('2'), c('3')];
    const mine = [c('1', 5), c('2')];                       // dialed 1, removed 3
    const theirs = [c('1'), c('2'), c('3'), c('9'), c('10')]; // the admin imported 9 and 10
    const out = mergePart('c:Florida', base, mine, theirs) as { id: string; dials: number }[];
    expect(out.map(x => x.id)).toEqual(['1', '2', '9', '10']);
    expect(out[0].dials).toBe(5);
  });
  it('takes their edit of a contact this screen did not touch', () => {
    const out = mergePart('c:Texas', [c('1')], [c('1')], [c('1', 2)]) as { dials: number }[];
    expect(out[0].dials).toBe(2);
  });
  it('history keeps every line from both', () => {
    const e = (at: number) => ({ at, contactId: 'x', kind: 'Dial' });
    expect((mergePart('l:2026-11', [], [e(1), e(3)], [e(1), e(2)]) as unknown[]).length).toBe(3);
  });
});

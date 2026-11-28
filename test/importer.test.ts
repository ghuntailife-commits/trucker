// Importing contacts someone already worked elsewhere (George, 2026-11-28). Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { planImport } from '../src/contacts/importer';
import { TAGS } from '../src/rules/tags';

const opts = { now: Date.parse('2026-11-28T14:00:00Z'), nextId: (i: number) => `n${i}` };
const row = (res: string, dials = '2', last = '2026-11-27T12:00:00-05:00', at = '') =>
  ['Pat', `Test${res.length}${dials}`, '214-555-0142', 'Driver', 'Acme Freight', 'Austin', 'TX', '', '', 'note', res, dials, last, at];

describe('import with results', () => {
  it('brings the result, dial count and last dial', () => {
    const [l] = planImport([row('Hung up')], [], opts);
    expect(l.ok).toBe(true);
    expect(l.contact).toMatchObject({ tag: TAGS.notInterested, dials: 2, lastDialed: Date.parse('2026-11-27T17:00:00Z') });
    expect(l.result).toContain('Hung up, 2 dials');
  });
  it('a no answer stays untagged with its dials', () => {
    expect(planImport([row('No answer', '1')], [], opts)[0].contact).toMatchObject({ tag: '', dials: 1 });
  });
  it('callbacks and appointments need a time', () => {
    expect(planImport([row('Scheduled')], [], opts)[0].ok).toBe(false);
    const [l] = planImport([row('Scheduled', '1', '2026-11-27T12:00:00-05:00', '2026-11-30T14:00:00-06:00')], [], opts);
    expect(l.contact).toMatchObject({ tag: TAGS.scheduled, callAt: Date.parse('2026-11-30T20:00:00Z') });
  });
  it('refuses a result it does not know, and plain imports are unchanged', () => {
    expect(planImport([row('Maybe')], [], opts)[0].result).toContain('unknown result');
    expect(planImport([row('').slice(0, 10)], [], opts)[0].contact).toMatchObject({ tag: '', dials: 0, lastDialed: null });
  });
});

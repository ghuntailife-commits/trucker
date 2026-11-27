import { describe, expect, it } from 'vitest';
import { mergeReturns, type LibraryState } from '../src/library/library';
import type { Contact } from '../src/rules/types';

const c = (id: string, phone: string, notes = '11/20: No answer') => ({ id, first: 'Avery', last: 'Test', phone, backup: '', company: 'Acme', job: '', city: 'Dallas', state: 'TX',
  linkedin: '', notes, dials: 4, tag: '', lastDialed: 5, list: 'Texas' } as unknown as Contact);

describe('contacts sent back to the library', () => {
  it('updates the one it handed out, adds new ones, keeps notes and history', () => {
    const st: LibraryState = { v: 1, contacts: [{ id: 'L1', first: 'Avery', last: 'Test', phone: '2145550100', job: '', company: 'Acme', city: 'Dallas', state: 'TX', linkedin: '', backup: '', notes: '', givenTo: 'Sam', givenAt: 1 }],
      handouts: [{ id: 'h', at: 1, agent: 'sam', agentName: 'Sam', items: [{ libId: 'L1', contactId: 'c-1' }] }] };
    const r = mergeReturns(st, [{ contact: c('c-1', '(214) 555-0100'), byName: 'Sam', at: 9, reason: 'Long-time no-show' },
      { contact: { ...c('c-2', '(972) 555-0199'), first: 'Blair' }, byName: 'Sam', at: 9, reason: '' }], i => `new${i}`);
    expect(r.added).toBe(1); expect(r.updated).toBe(1);
    expect(r.state.contacts[0]).toMatchObject({ givenTo: '', givenAt: null, notes: '11/20: No answer', history: { dials: 4, returnedBy: 'Sam', reason: 'Long-time no-show' } });
    expect(r.state.contacts[1]).toMatchObject({ id: 'new1', first: 'Blair', givenTo: '' });
  });
});

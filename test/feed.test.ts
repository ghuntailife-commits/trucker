// Team feed (George, 2026-11-27). Made-up contacts.
import { describe, expect, it } from 'vitest';
import { feedText, newItems, seenOf, trimFeed, type Snap } from '../src/team/feed';
import { TAGS } from '../src/rules/tags';
import type { Contact } from '../src/rules/types';

const now = Date.UTC(2026, 10, 27, 20);
const c = (id: string, addedAt?: number, list = 'Ohio') => ({ id, first: 'Sam', last: 'Test', list, addedAt } as unknown as Contact);
const empty: Snap = { contacts: [c('a')], log: [], sales: [], noSales: [] };
const me = { id: 'ivan', name: 'Ivan' };

describe('team feed', () => {
  it('turns new results into items', () => {
    const seen = seenOf(empty);
    const next: Snap = { contacts: [c('a'), c('b', now - 1000), c('d', now - 900, 'Texas')],
      log: [{ at: now - 60_000, contactId: 'a', list: 'Ohio', first: 'Sam', last: 'Test', phone: '', kind: 'Tag', count: 1, tag: TAGS.scheduled, dials: 1 }],
      sales: [{ at: now, contactId: 'a', alp: 1200 } as never], noSales: [{ at: now, contactId: 'x', objections: ['Money is tight'], reason: '' } as never, { at: now, contactId: 'y', objections: [], reason: '', again: true } as never] };
    const got = newItems(seen, next, me, now);
    expect(got.map(f => f.kind).sort()).toEqual(['booked', 'leads', 'presented', 'sale']);
    const leads = got.find(f => f.kind === 'leads')!;
    expect([leads.n, leads.where]).toEqual([2, ['Ohio', 'Texas']]);
    expect(newItems(seenOf(next), next, me, now)).toEqual([]);
  });
  it('says it plainly, and "you" for your own', () => {
    const leads = { id: '1', at: now, agent: 'ivan', name: 'Ivan', kind: 'leads' as const, n: 11, where: ['Ohio'] };
    expect(feedText(leads, 'ivan').text).toBe('11 Leads Assigned to you!');
    expect(feedText(leads, 'ivan').sub).toBe('Find them in Ohio (Contacts and Today)');
    expect(feedText(leads, 'gracie').text).toBe('11 Leads Assigned to Ivan!');
    const sale = { id: '2', at: now, agent: 'gracie', name: 'Gracie', kind: 'sale' as const, alp: 1200, contactId: 'q' };
    expect(feedText(sale, 'ivan').text).toBe('Gracie made a sale! $1,200 ALP');
    expect(feedText(sale, 'gracie', 'Pat E.').text).toBe('You made a sale! $1,200 ALP · Pat E.');
    expect(feedText({ ...sale, kind: 'presented', reason: 'Money is tight' }, 'ivan')).toEqual({ mine: false, text: 'Gracie presented. No sale yet', sub: 'Reason: Money is tight' });
  });
  it('keeps the feed short and without repeats', () => {
    const f = { id: 'x', at: now, agent: 'a', name: 'A', kind: 'booked' as const };
    expect(trimFeed([f, f, { ...f, id: 'old', at: now - 20 * 86_400_000 }], now)).toHaveLength(1);
  });
});

// Admin changes on another agent's Dispatch travel through their inbox (George, 2026-11-27). Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { applyInbox, diffState, isEmpty, mergeInbox } from '../src/app-store/inbox';
import type { Contact, LogEvent } from '../src/rules/types';

const c = (id: string, over: Partial<Contact> = {}) => ({ id, first: 'Avery', last: id, phone: '(214) 555-0150', dials: 0, notes: '', ...over }) as Contact;
const ev = (at: number, contactId: string) => ({ at, contactId, kind: 'Import' }) as LogEvent;
const st = (contacts: Contact[], log: LogEvent[] = []) => ({ contacts, log, sales: [] as number[], noSales: [] as number[], savedOrder: contacts.map(x => x.id) });

describe('admin changes through the inbox', () => {
  it('finds added, changed and removed contacts and new history', () => {
    const a = st([c('1'), c('2'), c('3')]);
    const b = st([c('1'), c('2', { notes: 'edited' }), c('4')], [ev(5, '4')]);
    const d = diffState(a, b);
    expect(d.contacts.map(x => x.id)).toEqual(['4']);
    expect(d.changed!.map(x => x.id)).toEqual(['2']);
    expect(d.removed).toEqual(['3']);
    expect(d.events).toHaveLength(1);
    expect(isEmpty(diffState(a, a))).toBe(true);
  });
  it('applies them on the agent\'s screen without losing the agent\'s own dials', () => {
    const agentNow = st([c('1', { dials: 4 }), c('2'), c('3')]);   // the agent dialed 1 meanwhile
    const box = mergeInbox(null, { contacts: [c('4')], removed: ['3'], changed: [c('2', { notes: 'edited' })], events: [ev(5, '4')] });
    const out = applyInbox(agentNow, box);
    expect(out.contacts.map(x => x.id)).toEqual(['1', '2', '4']);
    expect(out.contacts[0].dials).toBe(4);
    expect(out.contacts[1].notes).toBe('edited');
    expect(out.savedOrder).toEqual(['1', '2', '4']);
    expect(applyInbox(out, box).contacts).toHaveLength(3);   // applying twice adds nothing
  });
  it('a later edit of the same contact wins when changes pile up', () => {
    const box = mergeInbox(mergeInbox(null, { contacts: [], removed: [], changed: [c('2', { notes: 'a' })] }), { contacts: [], removed: [], changed: [c('2', { notes: 'b' })] });
    expect(box.changed!.map(x => x.notes)).toEqual(['b']);
  });
});

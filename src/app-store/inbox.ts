// Changes the admin makes on another agent's Dispatch travel through that agent's inbox (George, 2026-11-27: "make it
// so that I can add leads and such to their dispatch while they're there"). The agent's own screen applies them, so
// neither side saves over the other. Pure, tested in test/inbox.test.ts.
import type { Contact, LogEvent } from '../rules/types';

export interface Inbox<S = unknown, N = unknown> {
  contacts: Contact[];        // added
  removed: string[];
  changed?: Contact[];        // edited by the admin: replace the agent's copy
  events?: LogEvent[];        // history lines the admin's changes wrote
  sales?: S[]; noSales?: N[];
}

type State<S, N> = { contacts: Contact[]; log: LogEvent[]; sales: S[]; noSales: N[] };

/** What changed between two copies of an agent's data (by contact id; history, sales and no-sales by what was added). */
export function diffState<S, N>(a: State<S, N>, b: State<S, N>): Inbox<S, N> {
  const before = new Map(a.contacts.map(c => [c.id, c]));
  const now = new Set(b.contacts.map(c => c.id));
  const contacts: Contact[] = [], changed: Contact[] = [];
  for (const c of b.contacts) {
    const o = before.get(c.id);
    if (!o) contacts.push(c);
    else if (o !== c && JSON.stringify(o) !== JSON.stringify(c)) changed.push(c);
  }
  const removed = a.contacts.filter(c => !now.has(c.id)).map(c => c.id);
  const added = <T>(x: T[], y: T[]) => (y.length > x.length ? y.slice(x.length) : []);
  return { contacts, removed, changed, events: added(a.log, b.log), sales: added(a.sales, b.sales), noSales: added(a.noSales, b.noSales) };
}

export const isEmpty = (i: Inbox | null | undefined) => !i || !(i.contacts?.length || i.removed?.length || i.changed?.length || i.events?.length || i.sales?.length || i.noSales?.length);

/** Adds new changes to what is already waiting; a later edit of the same contact wins. */
export function mergeInbox<S, N>(box: Inbox<S, N> | null | undefined, add: Inbox<S, N>): Inbox<S, N> {
  const b = box ?? { contacts: [], removed: [] };
  const gone = new Set([...(b.removed ?? []), ...add.removed]);
  const byId = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map(x => [x.id, x])).values()];
  return {
    contacts: byId([...(b.contacts ?? []), ...add.contacts].filter(c => !gone.has(c.id))),
    removed: [...gone],
    changed: byId([...(b.changed ?? []), ...(add.changed ?? [])].filter(c => !gone.has(c.id))),
    events: [...(b.events ?? []), ...(add.events ?? [])],
    sales: [...(b.sales ?? []), ...(add.sales ?? [])],
    noSales: [...(b.noSales ?? []), ...(add.noSales ?? [])],
  };
}

/** Applies waiting changes to the agent's data. New contacts join the end of today's order. */
export function applyInbox<T extends State<S, N> & { savedOrder: string[] }, S, N>(s: T, inbox: Inbox<S, N>, prep: (c: Contact) => Contact = c => c): T {
  if (isEmpty(inbox)) return s;
  const gone = new Set(inbox.removed ?? []);
  const have = new Set(s.contacts.map(c => c.id));
  const changed = new Map((inbox.changed ?? []).map(c => [c.id, prep(c)]));
  const add = (inbox.contacts ?? []).filter(c => !have.has(c.id) && !gone.has(c.id)).map(prep);
  const seen = new Set(s.log.map(e => `${e.at}|${e.contactId}|${e.kind}`));
  const events = (inbox.events ?? []).filter(e => !seen.has(`${e.at}|${e.contactId}|${e.kind}`));
  return { ...s,
    contacts: [...s.contacts.filter(c => !gone.has(c.id)).map(c => changed.get(c.id) ?? c), ...add],
    savedOrder: [...s.savedOrder.filter(id => !gone.has(id)), ...add.map(c => c.id)],
    log: events.length ? [...s.log, ...events].sort((a, b) => a.at - b.at) : s.log,
    sales: inbox.sales?.length ? [...s.sales, ...inbox.sales] : s.sales,
    noSales: inbox.noSales?.length ? [...s.noSales, ...inbox.noSales] : s.noSales };
}

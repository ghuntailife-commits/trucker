// The team feed (George, 2026-11-27): small news everyone on Dispatch sees, to feel connected. Leads assigned, sales
// with ALP, presentations with the no-sale reason, appointments booked. Each agent's own screen notices its new results
// and posts them; every screen shows new ones as a sage-green note in the bottom left and in Home's Recent card.
// Other agents' contacts are never named: the feed carries the contact's id only, and only its own agent's screen
// turns that into a name. Pure, tested in test/feed.test.ts.
import type { Contact, LogEvent } from '../rules/types';
import type { NoSaleRecord, SaleRecord } from '../rules/results';
import { tagKind } from '../rules/tags';

export type FeedKind = 'leads' | 'sale' | 'presented' | 'booked';
export interface FeedItem {
  id: string; at: number; agent: string; name: string; kind: FeedKind;
  n?: number; where?: string[]; alp?: number; reason?: string; contactId?: string;
}

export interface Snap { contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[] }
export interface Seen { sales: Set<string>; noSales: Set<string>; booked: Set<string>; contacts: Set<string> }

const sk = (s: { contactId: string; at: number }) => `${s.contactId}|${s.at}`;
export function seenOf(s: Snap): Seen {
  return { sales: new Set(s.sales.map(sk)), noSales: new Set(s.noSales.map(sk)), contacts: new Set(s.contacts.map(c => c.id)),
    booked: new Set(s.log.filter(e => e.kind === 'Tag' && tagKind(e.tag) === 'scheduled').map(e => `${e.contactId}|${e.at}`)) };
}

/** What happened since the last look, as feed items for this agent. */
export function newItems(seen: Seen, s: Snap, agent: { id: string; name: string }, now: number): FeedItem[] {
  const out: FeedItem[] = [];
  const base = { agent: agent.id, name: agent.name };
  for (const x of s.sales) if (!seen.sales.has(sk(x))) out.push({ ...base, id: `sale:${agent.id}:${sk(x)}`, at: now, kind: 'sale', alp: Math.round(x.alp || 0), contactId: x.contactId });
  for (const x of s.noSales) if (!x.again && !seen.noSales.has(sk(x)))
    out.push({ ...base, id: `pres:${agent.id}:${sk(x)}`, at: now, kind: 'presented', reason: x.objections?.[0] || x.reason || '', contactId: x.contactId });
  for (const e of s.log) if (e.kind === 'Tag' && tagKind(e.tag) === 'scheduled' && now - e.at < 3_600_000 && !seen.booked.has(`${e.contactId}|${e.at}`))
    out.push({ ...base, id: `book:${agent.id}:${e.contactId}|${e.at}`, at: now, kind: 'booked', contactId: e.contactId });
  const arrived = s.contacts.filter(c => !seen.contacts.has(c.id) && c.addedAt && now - c.addedAt < 30 * 60_000);
  if (arrived.length) {
    const where = [...new Set(arrived.map(c => c.list))];
    out.push({ ...base, id: `leads:${agent.id}:${arrived[0].id}:${arrived.length}`, at: now, kind: 'leads', n: arrived.length, where });
  }
  return out;
}

const places = (w: string[] = []) => (w.length <= 2 ? w.join(' and ') : `${w.slice(0, 2).join(', ')} and ${w.length - 2} more`);
const usd = (n = 0) => `$${n.toLocaleString('en-US')}`;

/** The words for one item. `me` = the viewer's agent id; `contact` names the viewer's own contact when known. */
export function feedText(f: FeedItem, me: string, contact?: string): { text: string; sub?: string; mine: boolean } {
  const mine = f.agent === me, who = mine ? 'You' : f.name, c = mine && contact ? ` · ${contact}` : '';
  switch (f.kind) {
    case 'leads': return { mine, text: `${f.n} Lead${f.n === 1 ? '' : 's'} Assigned${mine ? ' to you' : ` to ${f.name}`}!`, sub: mine ? `Find them in ${places(f.where)} (Contacts and Today)` : undefined };
    case 'sale': return { mine, text: `${who} made a sale! ${usd(f.alp)} ALP${c}` };
    case 'presented': return { mine, text: `${who} presented${c}. No sale yet`, sub: f.reason ? `Reason: ${f.reason}` : undefined };
    case 'booked': return { mine, text: `${who} booked an appointment${c}` };
  }
}

/** Keeps an agent's own feed part short: newest 100 from the last 14 days, one per id. */
export function trimFeed(items: FeedItem[], now: number): FeedItem[] {
  const seen = new Set<string>();
  return items.filter(f => now - f.at < 14 * 86_400_000).sort((a, b) => b.at - a.at).filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true))).slice(0, 100);
}

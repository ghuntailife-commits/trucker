// "Best first" order for Needs Number: which contacts are most worth finding a number for.
// Uses only what Dispatch already knows: licensed states, past conversations, which companies buy, and how findable someone is.
// Pure functions, tested in test/priority.test.ts.
import type { Contact, LogEvent } from '../rules/types';
import type { SaleRecord, NoSaleRecord } from '../rules/results';
import { parseState } from './states';

export interface PriorityCtx {
  /** The agent's licensed states (abbreviations). Empty = treat every state as licensed. */
  states: string[];
  log: LogEvent[];
  sales: SaleRecord[];
  noSales: NoSaleRecord[];
  contacts: Contact[];
}
export interface Priority { score: number; why: string[] }

/** "UPS Freight" and "ups" count as the same company. */
export const companyKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|llc|co|corp|company|the)\b/g, ' ').trim().split(/\s+/)[0] ?? '';

/** Precomputes what scoring needs once per list, so 5,000 contacts score in a blink. */
export function priorityScorer(ctx: PriorityCtx): (c: Contact) => Priority {
  const lic = new Set(ctx.states.map(s => parseState(s)?.abbr ?? s.toUpperCase()));
  const reached = new Set(ctx.log.filter(e => e.reach).map(e => e.contactId));
  const byId = new Map(ctx.contacts.map(c => [c.id, c]));
  const co = (id: string, who?: { company: string }) => companyKey(who?.company ?? byId.get(id)?.company ?? '');
  const sold = new Map<string, number>(), sat = new Map<string, number>();
  for (const s of ctx.sales) { const k = co(s.contactId, s.who); if (k) { sold.set(k, (sold.get(k) ?? 0) + 1); sat.set(k, (sat.get(k) ?? 0) + 1); } }
  for (const s of ctx.noSales) { const k = co(s.contactId, s.who); if (k) sat.set(k, (sat.get(k) ?? 0) + 1); }
  const presented = new Set([...ctx.sales.map(s => s.contactId), ...ctx.noSales.map(s => s.contactId)]);

  return (c: Contact): Priority => {
    let score = 50; const why: string[] = [];
    const st = parseState(c.state)?.abbr ?? '';
    if (lic.size && st && !lic.has(st)) { score -= 60; why.push(`Not licensed in ${st}`); }
    else if (lic.size && !st) { score -= 10; why.push('No state'); }
    if (presented.has(c.id)) { score += 35; why.push('Presented before'); }
    else if (reached.has(c.id) || (c.quals?.length ?? 0) > 0) { score += 30; why.push('Talked before'); }
    const k = companyKey(c.company), n = sold.get(k) ?? 0, seen = sat.get(k) ?? 0;
    if (n) { score += Math.min(25, 8 + n * 3); why.push(`${n} sale${n === 1 ? '' : 's'} at ${c.company.split(/[,(]/)[0].trim()}`); }
    else if (seen >= 3) { score += 5; why.push(`Sat with ${seen} at this company`); }
    if (/^https?:\/\//.test(c.linkedin)) { score += 10; why.push('LinkedIn'); }
    if (c.first && c.last && c.city) score += 8; else { score -= 12; why.push('Missing name or city'); }
    if (c.backup) { score += 5; }
    if (c.dials >= 10) { score -= 5; }
    return { score, why };
  };
}

/** Points taken off each further contact from the same company, so the top of the list is a mix, not one employer. */
export const MIX_STEP = 6;

/** Best first, mixed: each company's 2nd, 3rd... contact counts a little less, so companies take turns near the top. */
export function mixOrder<T>(items: T[], score: (x: T) => number, company: (x: T) => string, tie: (a: T, b: T) => number = () => 0): T[] {
  const per = new Map<string, number>();
  const ranked = [...items].sort((a, b) => score(b) - score(a) || tie(a, b));
  const eff = new Map<T, number>();
  for (const x of ranked) { const k = companyKey(company(x)) || '?'; const n = per.get(k) ?? 0; per.set(k, n + 1); eff.set(x, score(x) - MIX_STEP * n); }
  return ranked.sort((a, b) => eff.get(b)! - eff.get(a)! || tie(a, b));
}

/** Contacts sorted best first, mixed across companies (ties keep list order). */
export function bestFirst(cs: Contact[], ctx: PriorityCtx): { c: Contact; p: Priority }[] {
  const f = priorityScorer(ctx);
  return mixOrder(cs.map(c => ({ c, p: f(c) })), x => x.p.score, x => x.c.company, (a, b) => a.c.list.localeCompare(b.c.list) || a.c.seq - b.c.seq);
}

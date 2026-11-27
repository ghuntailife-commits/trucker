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

const GENERIC = new Set(['international', 'american', 'united', 'national', 'union', 'us', 'general', 'southern', 'northern', 'western', 'eastern',
  'local', 'city', 'county', 'state', 'north', 'south', 'east', 'west', 'great', 'first', 'new', 'j', 'a', 'b', 'c']);
/** One key per employer: "UPS Freight" = "ups", "IBEW Local 212" = "ibew", "United Parcel Service" = "ups", "J.B. Hunt" = "j b hunt". */
export function companyKey(s: string): string {
  const w = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|llc|co|corp|corporation|company|the|of)\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  const k = w.join(' ');
  if (/^united parcel|^u p s\b/.test(k)) return 'ups';
  if (!w.length) return '';
  return GENERIC.has(w[0]) ? w.slice(0, 3).join(' ') : w[0];
}

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
  // which lists pick up: people reached per dial, by list (needs 40+ dials to count)
  const dials = new Map<string, number>(), reach = new Map<string, number>();
  for (const e of ctx.log) { if (e.kind === 'Dial') dials.set(e.list, (dials.get(e.list) ?? 0) + (e.count || 1)); if (e.reach) reach.set(e.list, (reach.get(e.list) ?? 0) + 1); }
  let totD = 0, totR = 0; for (const [l, n] of dials) { totD += n; totR += reach.get(l) ?? 0; }
  const avg = totD ? totR / totD : 0;
  const listLift = (l: string) => { const n = dials.get(l) ?? 0; if (n < 40 || !avg) return 0; return Math.max(-8, Math.min(12, Math.round(((reach.get(l) ?? 0) / n / avg - 1) * 12))); };
  // states where presentations happened
  const pres = new Map<string, number>();
  for (const x of [...ctx.sales, ...ctx.noSales]) { const st = parseState(byId.get(x.contactId)?.state ?? '')?.abbr; if (st) pres.set(st, (pres.get(st) ?? 0) + 1); }

  return (c: Contact): Priority => {
    let score = 50; const why: string[] = [];
    const st = parseState(c.state)?.abbr ?? '';
    if (lic.size && st && !lic.has(st)) { score -= 60; why.push(`Not licensed in ${st}`); }
    else if (lic.size && !st) { score -= 10; why.push('No state'); }
    if (presented.has(c.id)) { score += 35; why.push('Presented before'); }
    else if (reached.has(c.id) || (c.quals?.length ?? 0) > 0) { score += 30; why.push('Talked before'); }
    const k = companyKey(c.company), n = sold.get(k) ?? 0, seen = sat.get(k) ?? 0;
    if (n) { score += Math.min(25, 6 + n * 4); why.push(`${n} sale${n === 1 ? '' : 's'} at ${c.company.split(/[,(]/)[0].trim()}`); }
    else if (seen >= 3) { score += 5; why.push(`Sat with ${seen} at this company`); }
    const lift = listLift(c.list);
    if (lift) { score += lift; if (lift >= 4) why.push(`${c.list} picks up`); }
    const ps = st ? pres.get(st) ?? 0 : 0;
    if (ps >= 2) { score += Math.min(10, ps * 2); why.push(`${ps} presentations in ${st}`); }
    if (/^https?:\/\//.test(c.linkedin)) { score += 10; why.push('LinkedIn'); }
    if (c.first && c.last && c.city) score += 8; else { score -= 12; why.push('Missing name or city'); }
    if (c.backup) { score += 5; }
    if (c.dials >= 10) { score -= 5; }
    return { score, why };
  };
}

/** Scores within this many points count as the same tier; companies take turns only inside a tier. */
export const TIER = 10;

/**
 * Best first, mixed: contacts are grouped into score tiers (90s, 80s, ...). Inside a tier, companies take turns
 * (UPS, Ryder, Sysco, UPS, Ryder...), so no employer fills the top, but a strong contact never drops below a weaker tier.
 */
export function mixOrder<T>(items: T[], score: (x: T) => number, company: (x: T) => string, tie: (a: T, b: T) => number = () => 0): T[] {
  const ranked = [...items].sort((a, b) => score(b) - score(a) || tie(a, b));
  const out: T[] = [];
  for (let i = 0; i < ranked.length;) {
    const tier = Math.floor(score(ranked[i]) / TIER);
    let j = i; while (j < ranked.length && Math.floor(score(ranked[j]) / TIER) === tier) j++;
    const byCo = new Map<string, T[]>();
    for (const x of ranked.slice(i, j)) { const k = companyKey(company(x)) || '?'; (byCo.get(k) ?? byCo.set(k, []).get(k)!).push(x); }
    const queues = [...byCo.values()];
    for (let round = 0; out.length < j; round++) for (const q of queues) if (q[round]) out.push(q[round]);
    i = j;
  }
  return out;
}

/** Contacts sorted best first, mixed across companies (ties keep list order). */
export function bestFirst(cs: Contact[], ctx: PriorityCtx): { c: Contact; p: Priority }[] {
  const f = priorityScorer(ctx);
  return mixOrder(cs.map(c => ({ c, p: f(c) })), x => x.p.score, x => x.c.company, (a, b) => a.c.list.localeCompare(b.c.list) || a.c.seq - b.c.seq);
}

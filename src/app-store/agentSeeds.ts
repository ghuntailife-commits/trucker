// Whose contacts the demo loads for each agent. George gets the read-only copy of his sheet when the build has it;
// Austin and Gracie get made-up contacts on their own states (only George's real data was approved for the demo).
import type { Contact, LogEvent } from '../rules/types';
import type { SaleRecord, NoSaleRecord } from '../rules/results';
import type { AgentId } from '../team/agents';
import { demoContacts, demoHistory, type DemoList } from './demoData';
import { demoMonth } from './demoLog';
import { REAL_SEED } from './realSeed';

export interface Seed { contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[]; goal?: number }

const L = (list: string, st: string, cities: string[], ac: string[], zone: Contact['zone']): DemoList => ({ list, st, cities, ac, zone });
const OTHERS: Record<Exclude<AgentId, 'george'>, { seed: number; count: number; scale: number; days: number; lists: DemoList[]; w: number[] }> = {
  austin: { seed: 19, count: 140, scale: 0.45, days: 22, w: [50, 32, 18], lists: [
    L('Florida', 'FL', ['Jacksonville', 'Tampa', 'Orlando'], ['904', '813', '407'], 'ET'),
    L('Pennsylvania', 'PA', ['Pittsburgh', 'Allentown', 'Harrisburg'], ['412', '610', '717'], 'ET'),
    L('West Virginia', 'WV', ['Charleston', 'Huntington'], ['304', '681'], 'ET')] },
  gracie: { seed: 23, count: 160, scale: 0.6, days: 22, w: [14, 22, 18, 12, 14, 10, 10], lists: [
    L('Arkansas', 'AR', ['Little Rock', 'Fort Smith'], ['501', '479'], 'CT'),
    L('Florida', 'FL', ['Miami', 'Pensacola'], ['305', '850'], 'ET'),
    L('Pennsylvania', 'PA', ['Philadelphia', 'Erie'], ['215', '814'], 'ET'),
    L('South Carolina', 'SC', ['Columbia', 'Charleston'], ['803', '843'], 'ET'),
    L('Virginia', 'VA', ['Richmond', 'Norfolk'], ['804', '757'], 'ET'),
    L('Oklahoma', 'OK', ['Tulsa', 'Oklahoma City'], ['918', '405'], 'CT'),
    L('Tennessee', 'TN', ['Chattanooga', 'Jackson'], ['423', '731'], 'ET')] },
};

/** George's key stays what it was, so his saved demo changes carry over. */
export function storageKey(agent: AgentId): string {
  if (agent === 'george') return REAL_SEED ? `trucker-real-${REAL_SEED.builtAt}` : 'trucker-demo-v2';
  return `trucker-${agent}-v1`;
}

export function agentSeed(agent: AgentId, now: number, tz: string): Seed {
  if (agent === 'george' && REAL_SEED) {
    const r = structuredClone(REAL_SEED);
    return { contacts: r.contacts, log: r.log, sales: r.sales, noSales: r.noSales, goal: r.goal };
  }
  const o = agent === 'george' ? null : OTHERS[agent];
  const contacts = demoContacts(now, tz, o?.count ?? 160, o ? { seed: o.seed, lists: o.lists, idPrefix: agent } : {});
  const h = demoHistory(contacts, now, tz);
  const m = demoMonth(now, tz, o?.days ?? 30, o ? { seed: o.seed * 3, scale: o.scale, idPrefix: `${agent}-h`,
    lists: o.lists.map(x => [x.list, x.ac] as [string, string[]]), weights: o.w } : {});
  return { contacts, log: [...m.log, ...h.log].sort((a, b) => a.at - b.at), sales: [...m.sales, ...h.sales].sort((a, b) => a.at - b.at),
    noSales: [...m.noSales, ...h.noSales].sort((a, b) => a.at - b.at) };
}

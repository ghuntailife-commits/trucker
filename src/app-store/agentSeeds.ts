// Whose contacts the demo loads for each agent. George gets the read-only copy of his sheet when the build has it;
// Austin and Gracie get made-up contacts on their own states (only George's real data was approved for the demo).
import type { Contact, LogEvent } from '../rules/types';
import type { SaleRecord, NoSaleRecord } from '../rules/results';
import type { AgentId } from '../team/agents';
import { demoContacts, demoHistory, type DemoList } from './demoData';
import { demoMonth } from './demoLog';
import { REAL_SEED } from './realSeed';
import { ROSTER } from '../team/roster';

export interface Seed { contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[]; goal?: number }

const L = (list: string, st: string, cities: string[], ac: string[], zone: Contact['zone']): DemoList => ({ list, st, cities, ac, zone });
type Other = { seed: number; count: number; scale: number; days: number; lists: DemoList[]; w: number[] };
const OTHERS: Record<string, Other> = {
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

// One or two made-up cities and area codes per state, for the rest of the team's made-up demo contacts.
const PLACES: Record<string, [string, string[], string[], Contact['zone']]> = {
  AL: ['Alabama', ['Birmingham', 'Mobile'], ['205', '251'], 'CT'], AR: ['Arkansas', ['Little Rock'], ['501'], 'CT'], AZ: ['Arizona', ['Phoenix'], ['602'], 'MT'],
  CA: ['California', ['Fresno', 'Stockton'], ['559', '209'], 'PT'], CO: ['Colorado', ['Denver'], ['303'], 'MT'], FL: ['Florida', ['Tampa', 'Jacksonville'], ['813', '904'], 'ET'],
  GA: ['Georgia', ['Atlanta', 'Macon'], ['404', '478'], 'ET'], IA: ['Iowa', ['Des Moines'], ['515'], 'CT'], IL: ['Illinois', ['Joliet', 'Peoria'], ['815', '309'], 'CT'],
  IN: ['Indiana', ['Indianapolis'], ['317'], 'ET'], KY: ['Kentucky', ['Louisville'], ['502'], 'ET'], LA: ['Louisiana', ['Shreveport', 'Baton Rouge'], ['318', '225'], 'CT'],
  MD: ['Maryland', ['Baltimore'], ['410'], 'ET'], ME: ['Maine', ['Bangor'], ['207'], 'ET'], MI: ['Michigan', ['Grand Rapids', 'Lansing'], ['616', '517'], 'ET'],
  MN: ['Minnesota', ['Minneapolis', 'Duluth'], ['612', '218'], 'CT'], NC: ['North Carolina', ['Charlotte', 'Greensboro'], ['704', '336'], 'ET'],
  NH: ['New Hampshire', ['Manchester'], ['603'], 'ET'], NJ: ['New Jersey', ['Newark', 'Trenton'], ['973', '609'], 'ET'], NV: ['Nevada', ['Las Vegas', 'Reno'], ['702', '775'], 'PT'],
  OH: ['Ohio', ['Columbus', 'Dayton'], ['614', '937'], 'ET'], OK: ['Oklahoma', ['Tulsa'], ['918'], 'CT'], OR: ['Oregon', ['Portland'], ['503'], 'PT'],
  PA: ['Pennsylvania', ['Harrisburg', 'Pittsburgh'], ['717', '412'], 'ET'], RI: ['Rhode Island', ['Providence'], ['401'], 'ET'],
  SC: ['South Carolina', ['Columbia', 'Greenville'], ['803', '864'], 'ET'], TN: ['Tennessee', ['Memphis', 'Knoxville'], ['901', '865'], 'CT'],
  TX: ['Texas', ['Dallas', 'Houston', 'San Antonio'], ['214', '713', '210'], 'CT'], UT: ['Utah', ['Salt Lake City'], ['801'], 'MT'],
  VA: ['Virginia', ['Richmond', 'Roanoke'], ['804', '540'], 'ET'], WV: ['West Virginia', ['Charleston'], ['304'], 'ET'],
};
/** Made-up demo settings for anyone without a hand-made set: a few of their licensed states, sized by a hash of their id. */
function otherFor(agent: string): Other {
  let h = 0; for (const ch of agent) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const row = ROSTER.find(r => r.id === agent);
  const abbrs = (row?.states ?? 'TX').split(',').map(x => x.trim()).filter(a => PLACES[a]).slice(0, 4);
  const lists = (abbrs.length ? abbrs : ['TX']).map(a => { const [name, cities, ac, zone] = PLACES[a]; return L(name, a, cities, ac, zone); });
  return { seed: 30 + (h % 500), count: 93 + (h % 7), scale: 0.25 + (h % 50) / 100, days: 6 + (h % 10), lists, w: lists.map((_, i) => 40 - i * 8) };
}

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
  const o = agent === 'george' ? null : OTHERS[agent] ?? otherFor(agent);
  const contacts = demoContacts(now, tz, o?.count ?? 160, o ? { seed: o.seed, lists: o.lists, idPrefix: agent } : {});
  const h = demoHistory(contacts, now, tz);
  const m = demoMonth(now, tz, o?.days ?? 30, o ? { seed: o.seed * 3, scale: o.scale, idPrefix: `${agent}-h`,
    lists: o.lists.map(x => [x.list, x.ac] as [string, string[]]), weights: o.w } : {});
  return { contacts, log: [...m.log, ...h.log].sort((a, b) => a.at - b.at), sales: [...m.sales, ...h.sales].sort((a, b) => a.at - b.at),
    noSales: [...m.noSales, ...h.noSales].sort((a, b) => a.at - b.at) };
}

// Turns a read-only copy of an agent's sheet (realdata/raw/*.json, as the Sheets API returns cell values)
// into realdata/seed.json for the demo build. realdata/ is git-ignored: real contacts never go into the repo.
// Run: node scripts/run-real-seed.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { migrateSheet, toEvent, sheetDate, norm, type TabInput } from '../src/migrate/fromSheet';
import { money, OBJECTIONS, type SaleRecord, type NoSaleRecord } from '../src/rules/results';
import { tagKind, TAGS } from '../src/rules/tags';
import type { LogEvent } from '../src/rules/types';

type Cell = string;
const DIR = 'realdata/raw';
const SKIP = new Set(['Utah', 'Rules', 'Best Times', 'Results', 'Sales', 'No Sales', 'Activity Log']);
const load = (n: string): Cell[][] => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8')).values;

const tabs: TabInput[] = readdirSync(DIR).map(f => f.replace(/\.json$/, '')).filter(n => !SKIP.has(n))
  .map(list => ({ list, rows: load(list).slice(1) }));   // first row is the header (sheet row 2)
const logRows = load('Activity Log');
const { contacts, events, report } = migrateSheet(tabs, logRows);

contacts.forEach(c => {
  c.id = `${c.list}|${c.seq}`;
  if (c.list === 'Hardcards') {          // Hardcards columns G/H are Union and Beneficiary, not job and company
    const beneficiary = c.company;
    c.company = c.job; c.job = '';
    if (beneficiary) c.notes = `Beneficiary: ${beneficiary}` + (c.notes ? ' | ' + c.notes : '');
  }
});

const log: LogEvent[] = events.map(({ index, row }, i) => {
  const e = toEvent(row, index >= 0 ? contacts[index].id : '');
  if (row.kind === 'Imported') { e.kind = 'Import'; e.count = Number(logRows[i]?.[6]) || row.count; }
  const reach = logRows[i]?.[10];
  if (e.kind === 'Tag' && (reach === '0' || reach === '1')) e.reach = reach === '1';
  return e;
});

const phoneKey = (p: string) => p.replace(/\D/g, '').slice(-10);
const findContact = (list: string, first: string, last: string, phone: string) => {
  const k = norm(first) + '|' + norm(last), ph = phoneKey(phone);
  return contacts.find(c => (!list || c.list === list) && norm(c.first) + '|' + norm(c.last) === k)
    ?? (ph.length === 10 ? contacts.find(c => phoneKey(c.phone) === ph || phoneKey(c.backup) === ph) : undefined);
};
const company = (s: string) => s;

const sales: SaleRecord[] = [];
for (const r of load('Sales')) {
  const at = sheetDate(r[0]); if (at == null) continue;
  const [, list, first, last, phone, co] = r;
  const c = findContact(list, first, last, phone);
  const desk = !list;
  sales.push({ at, contactId: c && !desk ? c.id : `desk|${norm(first)}${norm(last)}`,
    alpType: r[11] === 'Trial' ? 'Trial' : 'Standard', alp: money(r[6]) ?? 0, monthly: money(r[7]) ?? 0,
    wholeLife: money(r[9]) ?? 0, adb: money(r[10]) ?? 0, email: r[12] ?? '', note: r[13] ?? '', calledInto: false,
    who: { first, last, phone, company: company(co), list: desk ? 'Production Desk' : list } });
}
const noSales: NoSaleRecord[] = [];
for (const r of load('No Sales')) {
  const at = sheetDate(r[0]); if (at == null) continue;
  const [, list, first, last, phone, co, obj = '', reason = '', fu = '', fuNote = ''] = r;
  const c = findContact(list, first, last, phone);
  const desk = !list;
  const f = sheetDate(fu);
  const iso = f == null ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(f);
  noSales.push({ at, contactId: c && !desk ? c.id : `desk|${norm(first)}${norm(last)}`,
    objections: OBJECTIONS.filter(o => obj.split(',').map(s => s.trim()).includes(o)), reason: reason === obj ? '' : reason,
    followUp: iso, followUpNote: fuNote === 'From Production Desk' ? '' : fuNote, calledInto: false,
    who: { first, last, phone, company: co, list: desk ? 'Production Desk' : list } });
}

// Presentations the log never saw (Production Desk, early Hardcards sales): add the tag so the funnel adds up.
let added = 0;
const hasTag = (id: string, first: string, last: string, kinds: string[], at: number) => log.some(e => e.kind === 'Tag'
  && kinds.includes(tagKind(e.tag)) && Math.abs(e.at - at) < 3 * 86_400_000
  && (e.contactId === id || (norm(e.first) === norm(first) && norm(e.last) === norm(last))));
for (const s of sales) if (!hasTag(s.contactId, s.who!.first, s.who!.last, ['sold'], s.at)) {
  log.push({ at: s.at, contactId: s.contactId, list: s.who!.list, first: s.who!.first, last: s.who!.last, phone: s.who!.phone,
    kind: 'Tag', count: 1, tag: TAGS.sold, dials: 0, reach: false }); added++;
}
for (const s of noSales) if (!hasTag(s.contactId, s.who!.first, s.who!.last, ['presented', 'sold'], s.at)) {
  log.push({ at: s.at, contactId: s.contactId, list: s.who!.list, first: s.who!.first, last: s.who!.last, phone: s.who!.phone,
    kind: 'Tag', count: 1, tag: TAGS.presented, dials: 0, reach: false }); added++;
}
log.sort((a, b) => a.at - b.at);

const goal = 20000;
writeFileSync('realdata/seed.json', JSON.stringify({ builtAt: Date.now(), goal, contacts, log, sales, noSales }));
console.log(JSON.stringify({ contacts: contacts.length, log: log.length, sales: sales.length, noSales: noSales.length,
  addedTags: added, logUnmatched: report.logUnmatched, issues: report.issues.length,
  unmatchedSales: sales.filter(s => !contacts.some(c => c.id === s.contactId)).map(s => s.who!.first + ' ' + s.who!.last + ' ' + s.who!.list),
  exists: existsSync('realdata/seed.json') }, null, 1));

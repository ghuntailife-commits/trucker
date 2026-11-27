// Turns a read-only copy of an agent's sheet (realdata/raw/*.json, as the Sheets API returns cell values)
// into realdata/seed.json for the demo build. realdata/ is git-ignored: real contacts never go into the repo.
// Run: node scripts/run-real-seed.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { buildAgentData, NOT_LISTS } from '../src/migrate/agentSheet';

const DIR = 'realdata/raw';
const load = (n: string): string[][] => existsSync(`${DIR}/${n}.json`) ? JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf8')).values : [];
const lists = readdirSync(DIR).map(f => f.replace(/\.json$/, '')).filter(n => !NOT_LISTS.has(n) && n !== 'Utah')
  .map(list => ({ list, rows: load(list) }));   // first row is the header (sheet row 2)
const { report, ...data } = buildAgentData({ lists, log: load('Activity Log'), sales: load('Sales'), noSales: load('No Sales') });

writeFileSync('realdata/seed.json', JSON.stringify({ builtAt: Date.now(), goal: 20000, ...data }));
console.log(JSON.stringify({ contacts: data.contacts.length, log: data.log.length, sales: data.sales.length, noSales: data.noSales.length,
  addedTags: report.addedTags, logUnmatched: report.logUnmatched, issues: report.issues.length, unmatchedSales: report.unmatchedSales }, null, 1));

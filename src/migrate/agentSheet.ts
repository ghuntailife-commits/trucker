// One agent's whole Truckers sheet → the app's data: contacts, every Activity Log row (dials, tags, imports), sales and
// no-sales. Used by the switch-over (reads each sheet once, read only) and by the demo's real-data build.
// Input is cell values as the Sheets API returns them; dates may be serial numbers (keeps the seconds) or text.
import { migrateSheet, toEvent, sheetDate, norm, type TabInput, type MigrationReport } from './fromSheet';
import { money, OBJECTIONS, type SaleRecord, type NoSaleRecord } from '../rules/results';
import { tagKind, TAGS } from '../rules/tags';
import type { Contact, LogEvent } from '../rules/types';

export type Cell = string | number | boolean | null | undefined;
/** Tabs that are never contact lists, even if their header looks like one. */
export const NOT_LISTS = new Set(['Rules', 'Best Times', 'Results', 'Sales', 'No Sales', 'Activity Log', 'Today', 'Import',
  'Needs Number', 'Cannot Find', 'Dispositioned', 'Order', 'Daily Summary', 'Color Code']);

/** A contact-list tab: its sheet row 2 is the header Tag, Dials, Dial +1, First Name, Last Name, Phone... */
export function isListHeader(row: Cell[] | undefined): boolean {
  const h = (row ?? []).map(x => String(x ?? '').trim().toLowerCase());
  return h[0] === 'tag' && h[1] === 'dials' && h[3] === 'first name' && h[4] === 'last name' && h[5] === 'phone';
}

export interface SheetTabs {
  /** Contact lists: values from sheet row 2 down (row 2 is the header). */
  lists: { list: string; rows: Cell[][] }[];
  /** Activity Log, Sales, No Sales: values from sheet row 2 down. Missing tabs are empty. */
  log: Cell[][]; sales: Cell[][]; noSales: Cell[][];
}

export interface AgentData { contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[] }
export interface AgentReport extends MigrationReport { sales: number; noSales: number; events: number; addedTags: number; unmatchedSales: number }

const s = (v: Cell) => (v == null ? '' : String(v));

export function buildAgentData(t: SheetTabs): AgentData & { report: AgentReport } {
  const tabs: TabInput[] = t.lists.map(l => ({ list: l.list, rows: l.rows.slice(1) }));
  const logRows = t.log;
  const { contacts, events, report } = migrateSheet(tabs, logRows);

  contacts.forEach(c => {
    c.id = `${c.list}|${c.seq}`;
    if (c.list === 'Hardcards') {          // Hardcards columns G/H are Union and Beneficiary, not job and company
      const beneficiary = c.company;
      c.company = c.job; c.job = '';
      if (beneficiary) c.notes = `Beneficiary: ${beneficiary}` + (c.notes ? ' | ' + c.notes : '');
    }
  });

  // migrateSheet drops rows it can't read, so match each event back to its sheet row by position
  const parsedRows = logRows.filter(r => sheetDate(r?.[0]) != null);
  const log: LogEvent[] = events.map(({ index, row }, i) => {
    const e = toEvent(row, index >= 0 ? contacts[index].id : '');
    const raw = parsedRows[i];
    if (row.kind === 'Imported') { e.kind = 'Import'; e.count = Number(raw?.[6]) || row.count; }
    const reach = s(raw?.[10]);
    if (e.kind === 'Tag' && (reach === '0' || reach === '1')) e.reach = reach === '1';
    return e;
  });

  const phoneKey = (p: string) => p.replace(/\D/g, '').slice(-10);
  const findContact = (list: string, first: string, last: string, phone: string) => {
    const k = norm(first) + '|' + norm(last), ph = phoneKey(phone);
    return contacts.find(c => (!list || c.list === list) && norm(c.first) + '|' + norm(c.last) === k)
      ?? (ph.length === 10 ? contacts.find(c => phoneKey(c.phone) === ph || phoneKey(c.backup) === ph) : undefined);
  };

  const sales: SaleRecord[] = [];
  for (const r of t.sales) {
    const at = sheetDate(r[0]); if (at == null) continue;
    const [list, first, last, phone, co] = [1, 2, 3, 4, 5].map(i => s(r[i]));
    const c = findContact(list, first, last, phone);
    const desk = !list;
    sales.push({ at, contactId: c && !desk ? c.id : `desk|${norm(first)}${norm(last)}`,
      alpType: s(r[11]) === 'Trial' ? 'Trial' : 'Standard', alp: money(s(r[6])) ?? 0, monthly: money(s(r[7])) ?? 0,
      wholeLife: money(s(r[9])) ?? 0, adb: money(s(r[10])) ?? 0, email: s(r[12]), note: s(r[13]), calledInto: false,
      who: { first, last, phone, company: co, list: desk ? 'Production Desk' : list } });
  }
  const noSales: NoSaleRecord[] = [];
  for (const r of t.noSales) {
    const at = sheetDate(r[0]); if (at == null) continue;
    const [list, first, last, phone, co, obj, reason, , fuNote] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => s(r[i]));
    const c = findContact(list, first, last, phone);
    const desk = !list;
    const f = sheetDate(r[8]);
    const iso = f == null ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(f);
    noSales.push({ at, contactId: c && !desk ? c.id : `desk|${norm(first)}${norm(last)}`,
      objections: OBJECTIONS.filter(o => obj.split(',').map(x => x.trim()).includes(o)), reason: reason === obj ? '' : reason,
      followUp: iso, followUpNote: fuNote === 'From Production Desk' ? '' : fuNote, calledInto: false,
      who: { first, last, phone, company: co, list: desk ? 'Production Desk' : list } });
  }

  // Presentations the log never saw (Production Desk, early Hardcards sales): add the tag so the funnel adds up.
  let added = 0;
  const hasTag = (id: string, first: string, last: string, kinds: string[], at: number) => log.some(e => e.kind === 'Tag'
    && kinds.includes(tagKind(e.tag)) && Math.abs(e.at - at) < 3 * 86_400_000
    && (e.contactId === id || (norm(e.first) === norm(first) && norm(e.last) === norm(last))));
  for (const x of sales) if (!hasTag(x.contactId, x.who!.first, x.who!.last, ['sold'], x.at)) {
    log.push({ at: x.at, contactId: x.contactId, list: x.who!.list, first: x.who!.first, last: x.who!.last, phone: x.who!.phone,
      kind: 'Tag', count: 1, tag: TAGS.sold, dials: 0, reach: false }); added++;
  }
  for (const x of noSales) if (!hasTag(x.contactId, x.who!.first, x.who!.last, ['presented', 'sold'], x.at)) {
    log.push({ at: x.at, contactId: x.contactId, list: x.who!.list, first: x.who!.first, last: x.who!.last, phone: x.who!.phone,
      kind: 'Tag', count: 1, tag: TAGS.presented, dials: 0, reach: false }); added++;
  }
  log.sort((a, b) => a.at - b.at);

  const ids = new Set(contacts.map(c => c.id));
  return { contacts, log, sales, noSales, report: { ...report, sales: sales.length, noSales: noSales.length, events: log.length,
    addedTags: added, unmatchedSales: sales.filter(x => !ids.has(x.contactId)).length } };
}

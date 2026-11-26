// Changing a result after the fact, from a card on the Appointments page: "it was presented, not sold" becomes "sold",
// a no-show turns out to have shown up, a sale was keyed in wrong. The old record is taken out and the new one is put
// in at the same time, so Results, the Sales list and the Activity Log all read as if it had been entered right.
// The contact keeps a dated note of the change, and its current tag only moves when that result is still its latest.
import type { Contact, LogEvent } from './types';
import { TAGS, tagKind } from './tags';
import { addNote } from './engine';
import { md, mdTime } from './time';
import { saleNote, noSaleNote, type SaleRecord, type NoSaleRecord } from './results';

export type AmendFrom = 'sold' | 'presented' | 'noshow';
export type AmendTo = 'sold' | 'presented' | 'noshow' | 'scheduled';
export interface AmendState { contacts: Contact[]; log: LogEvent[]; sales: SaleRecord[]; noSales: NoSaleRecord[] }
/** Which result is being changed: a sale or no-sale by its index, or a no-show by its Activity Log index. */
export interface AmendTarget { from: AmendFrom; index: number }
export interface AmendForm {
  sale?: Omit<SaleRecord, 'at' | 'contactId' | 'calledInto'>;
  noSale?: Omit<NoSaleRecord, 'at' | 'contactId' | 'calledInto'>;
  when?: number;
}

const NAME: Record<AmendFrom | AmendTo, string> = { sold: 'Sold', presented: 'Presented, no sale', noshow: 'No-show', scheduled: 'Booked again' };
const TAG_OF: Record<AmendTo, string> = { sold: TAGS.sold, presented: TAGS.presented, noshow: TAGS.noshow, scheduled: TAGS.scheduled };
const KIND_OF: Record<AmendFrom, string[]> = { sold: ['sold'], presented: ['presented', 'sold'], noshow: ['noshow'] };

/** The Activity Log tag row that goes with a sale or no-sale: same contact, matching tag, closest in time (within 8 days). */
function matchingTag(log: LogEvent[], contactId: string, kinds: string[], at: number): number {
  let best = -1, gap = 8 * 86_400_000;
  log.forEach((e, i) => {
    if (e.kind !== 'Tag' || e.contactId !== contactId || !kinds.includes(tagKind(e.tag))) return;
    const g = Math.abs(e.at - at);
    if (g < gap) { gap = g; best = i; }
  });
  return best;
}

export function amendResult(st: AmendState, target: AmendTarget, to: AmendTo, form: AmendForm, now: number, tz: string):
  { error: string } | { state: AmendState; message: string } {
  const { from, index } = target;
  let log = [...st.log], sales = [...st.sales], noSales = [...st.noSales];
  let at: number, contactId: string, calledInto = false, reach = false;
  let who: SaleRecord['who'];

  // 1. take the old result out
  if (from === 'sold') {
    const s = sales[index]; if (!s) return { error: 'That sale is no longer there.' };
    ({ at, contactId, calledInto } = s); who = s.who;
    sales.splice(index, 1);
  } else if (from === 'presented') {
    const n = noSales[index]; if (!n) return { error: 'That no-sale is no longer there.' };
    ({ at, contactId, calledInto } = n); who = n.who;
    noSales.splice(index, 1);
  } else {
    const e = log[index]; if (!e || tagKind(e.tag) !== 'noshow') return { error: 'That no-show is no longer there.' };
    ({ at, contactId } = e);
  }
  const ti = from === 'noshow' ? index : matchingTag(log, contactId, from === 'sold' ? ['sold'] : ['presented'], at);
  const old = ti >= 0 ? log[ti] : undefined;
  if (old) { reach = !!old.reach; log.splice(ti, 1); }

  const c = st.contacts.find(x => x.id === contactId);
  if (!who && c) who = { first: c.first, last: c.last, phone: c.phone || c.backup, company: c.company, list: c.list };
  if (to === 'sold' && !form.sale) return { error: 'Fill in the sale first.' };
  if (to === 'presented' && !form.noSale) return { error: 'Fill in what stopped the sale first.' };
  if (to === 'scheduled' && form.when == null) return { error: 'Pick the new appointment time.' };

  // 2. put the new one in, dated when the old one was
  const tagRow = (tag: string, t: number): LogEvent => ({ at: t, contactId, list: old?.list ?? who?.list ?? c?.list ?? '',
    first: old?.first ?? who?.first ?? '', last: old?.last ?? who?.last ?? '', phone: old?.phone ?? who?.phone ?? '',
    kind: 'Tag', count: 1, tag, dials: old?.dials ?? c?.dials ?? 0, reach });
  let line = '';
  if (to === 'sold') {
    sales.push({ ...form.sale!, at, contactId, calledInto, who });
    log.push(tagRow(TAGS.sold, old?.at ?? at));
    line = saleNote(form.sale!, at, tz);
  } else if (to === 'presented') {
    noSales.push({ ...form.noSale!, at, contactId, calledInto, who });
    log.push(tagRow(TAGS.presented, old?.at ?? at));
    line = noSaleNote(form.noSale!, at, tz);
  } else if (to === 'noshow') {
    log.push(tagRow(TAGS.noshow, old?.at ?? at));
    line = `${md(at, tz)}: No-showed (appt ${mdTime(at, tz)})`;
  }
  sales = sales.sort((a, b) => a.at - b.at); noSales = noSales.sort((a, b) => a.at - b.at); log = log.sort((a, b) => a.at - b.at);

  // 3. the contact: a dated note always; the tag only when this result is still the latest thing that happened
  let contacts = st.contacts;
  if (c) {
    const same = from === to ? 'Result edited' : `Result changed from ${NAME[from]} to ${NAME[to]}`;
    let x: Contact = { ...c, notes: addNote(c.notes, `${md(now, tz)}: ${same} (${md(at, tz)})`) };
    if (line) x.notes = addNote(x.notes, line);
    const latest = KIND_OF[from].includes(tagKind(c.tag));
    if (to === 'scheduled') x = { ...x, tag: TAGS.scheduled, callAt: form.when!, confirmedAt: null, noShowTries: 0, callbackTries: 0 };
    else if (latest) x = { ...x, tag: TAG_OF[to], callAt: null, confirmedAt: null, noShowTries: 0, callbackTries: 0 };
    if (form.sale?.email) x.email = form.sale.email;
    contacts = st.contacts.map(y => (y.id === c.id ? x : y));
  }
  const name = who ? `${who.first} ${who.last}` : c ? `${c.first} ${c.last}` : 'Contact';
  const message = from === to ? `${name}: ${NAME[to].toLowerCase()} updated.` : `${name}: changed from ${NAME[from].toLowerCase()} to ${NAME[to].toLowerCase()}.`;
  return { state: { contacts, log, sales, noSales }, message };
}

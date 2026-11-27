// The contact library (George, 2026-11-26): every contact George buys or pulls lives here until he hands it to an
// agent. Was the Lead Library sheet: one tab per state, columns First…Notes, then "Given to" and "Date given".
// Agents can only be sent contacts in states they are licensed in (they set those in their profile menu).
import type { Contact } from '../rules/types';
import { dropHeader, IMPORT_COLUMNS, planImport } from '../contacts/importer';
import { parseState } from '../contacts/states';
import { zoned } from '../rules/time';
import { digits10, norm } from '../contacts/phones';

export interface LibraryContact {
  id: string;
  first: string; last: string; phone: string; job: string; company: string; city: string;
  /** Two-letter state. */
  state: string;
  linkedin: string; backup: string; notes: string;
  /** Who has it, as written on the sheet ("George", "Marshall"); empty while it is still in the library. */
  givenTo: string;
  givenAt: number | null;
}

/** One send, so it can be undone. */
export interface Handout { id: string; at: number; agent: string; agentName: string; items: { libId: string; contactId: string }[]; undoneAt?: number }

export interface LibraryState { v: 1; contacts: LibraryContact[]; handouts: Handout[] }

export interface Recipient { id: string; name: string; states: string[] }

const clean = (v: unknown) => String(v ?? '').trim();

/** A Lead Library tab (A: First … J: Notes, K: Given to, L: Date given) to library contacts. Read only: the sheet is never written. */
export function fromSheet(tab: string, rows: string[][], nextId: (i: number) => string, tz = 'America/New_York'): LibraryContact[] {
  const tabState = parseState(tab);
  return dropHeader(rows).flatMap((r, i) => {
    const g = (k: number) => clean(r[k]);
    if (!g(0) && !g(1)) return [];
    const st = parseState(g(6)) ?? tabState;
    return [{ id: nextId(i), first: g(0), last: g(1), phone: g(2), job: g(3), company: g(4), city: g(5), state: st?.abbr ?? g(6),
      linkedin: g(7), backup: g(8), notes: g(9), givenTo: g(10), givenAt: parseDay(g(11), tz) }];
  });
}

/** "11/24/2026", "11/24" or "2026-11-24" to noon that day; anything else is null. */
export function parseDay(s: string, tz = 'America/New_York'): number | null {
  let y: number, m: number, d: number;
  const a = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (a) { m = +a[1]; d = +a[2]; y = a[3] ? (a[3].length === 2 ? 2000 + +a[3] : +a[3]) : new Date().getFullYear(); }
  else if (b) { y = +b[1]; m = +b[2]; d = +b[3]; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return zoned(y, m, d, 12, 0, tz);   // noon, so the day reads the same in every US zone
}

/** Is the agent licensed in this state? Their list holds full names ("Texas"); the library holds "TX". */
export function licensed(states: string[], abbr: string): boolean {
  return states.some(s => parseState(s)?.abbr === abbr);
}

export interface StateCount { state: string; name: string; total: number; open: number }
export function stateCounts(lib: LibraryContact[]): StateCount[] {
  const m = new Map<string, StateCount>();
  for (const c of lib) {
    const k = c.state || '?';
    const e = m.get(k) ?? { state: k, name: parseState(k)?.name ?? 'Unknown state', total: 0, open: 0 };
    e.total++; if (!c.givenTo) e.open++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

/** How many each person has been given, by the name written in Given to. */
export function givenCounts(lib: LibraryContact[]): { name: string; n: number }[] {
  const m = new Map<string, { name: string; n: number }>();
  for (const c of lib) if (c.givenTo) {
    const k = c.givenTo.toLowerCase(), e = m.get(k) ?? { name: c.givenTo, n: 0 };
    e.n++; m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

export interface HandoutLine { libId: string; name: string; state: string; ok: boolean; result: string; contact?: Contact;
  /** The same person sitting untouched in another agent's contacts: taken off their list when this is sent. */
  moveFrom?: { agent: string; agentName: string; contactId: string }[] }

/**
 * No contact is worked by two agents (George, 2026-11-26). Checks each send against every other agent's contacts by
 * phone (main or backup) and by name + company. If another agent has the person but has not called them yet, the send
 * goes ahead and takes them off that agent's list; if the other agent has already called or tagged them, it is skipped.
 */
export function checkOtherAgents(plan: HandoutLine[], others: { id: string; name: string; contacts: Contact[] }[]): HandoutLine[] {
  const idx = others.map(o => {
    const phones = new Map<string, Contact>(), names = new Map<string, Contact>();
    for (const c of o.contacts) {
      for (const p of [c.phone, c.backup]) { const d = digits10(p); if (d.length === 10) phones.set(d, c); }
      names.set(`${norm(c.first)}|${norm(c.last)}|${norm(c.company)}`, c);
    }
    return { o, phones, names };
  });
  return plan.map(l => {
    if (!l.ok || !l.contact) return l;
    const c = l.contact, moveFrom: NonNullable<HandoutLine['moveFrom']> = [];
    for (const { o, phones, names } of idx) {
      let hit: Contact | undefined;
      for (const p of [c.phone, c.backup]) { const d = digits10(p); if (d.length === 10) { hit = phones.get(d); if (hit) break; } }
      hit ??= names.get(`${norm(c.first)}|${norm(c.last)}|${norm(c.company)}`);
      if (!hit) continue;
      if (hit.dials > 0 || hit.tag || hit.lastDialed) return { ...l, ok: false, contact: undefined,
        result: `Skipped - ${o.name} is already working this contact${hit.dials ? ` (${hit.dials} dial${hit.dials === 1 ? '' : 's'})` : ''}` };
      moveFrom.push({ agent: o.id, agentName: o.name, contactId: hit.id });
    }
    return moveFrom.length ? { ...l, moveFrom, result: `${l.result}, and take it off ${moveFrom.map(m => m.agentName).join(' and ')}'s list (not called yet)` } : l;
  });
}

/** What sending these library contacts to this agent would do, before anything is saved. Same duplicate check as Import. */
export function planHandout(ids: string[], lib: LibraryContact[], to: Recipient, theirs: Contact[], opts: { now: number; nextId: (i: number) => string }): HandoutLine[] {
  const byId = new Map(lib.map(c => [c.id, c]));
  const picked = ids.map(id => byId.get(id)).filter((c): c is LibraryContact => !!c);
  const out: HandoutLine[] = [], send: LibraryContact[] = [];
  for (const c of picked) {
    const name = `${c.first} ${c.last}`.trim();
    if (c.givenTo) out.push({ libId: c.id, name, state: c.state, ok: false, result: `Skipped - already given to ${c.givenTo}` });
    else if (!licensed(to.states, c.state)) out.push({ libId: c.id, name, state: c.state, ok: false, result: `Skipped - ${to.name} is not licensed in ${parseState(c.state)?.name ?? c.state}` });
    else { out.push({ libId: c.id, name, state: c.state, ok: true, result: '' }); send.push(c); }
  }
  const rows = [[...IMPORT_COLUMNS] as string[], ...send.map(c => [c.first, c.last, c.phone, c.job, c.company, c.city, c.state, c.linkedin, c.backup, c.notes])];
  const lines = planImport(rows, theirs, opts);
  send.forEach((c, i) => {
    const line = out.find(l => l.libId === c.id)!, p = lines[i];
    line.ok = p.ok; line.contact = p.contact;
    line.result = p.ok ? p.result.replace('Will import to', 'Will add to') : p.result;
  });
  return out;
}

/** Marks the sent contacts as given and records the send for Undo. */
export function applyHandout(state: LibraryState, plan: HandoutLine[], to: Recipient, now: number, id: string): { state: LibraryState; handout: Handout; added: Contact[] } {
  const ok = plan.filter(l => l.ok && l.contact);
  const given = new Set(ok.map(l => l.libId));
  const handout: Handout = { id, at: now, agent: to.id, agentName: to.name, items: ok.map(l => ({ libId: l.libId, contactId: l.contact!.id })) };
  return {
    state: { ...state, contacts: state.contacts.map(c => (given.has(c.id) ? { ...c, givenTo: to.name, givenAt: now } : c)), handouts: [...state.handouts, handout] },
    handout, added: ok.map(l => l.contact!),
  };
}

/** Takes a send back: contacts the agent has not dialed or tagged go back to the library; the rest stay with the agent. */
export function undoHandout(state: LibraryState, handoutId: string, theirs: Contact[], now: number): { state: LibraryState; remove: string[]; kept: string[] } {
  const h = state.handouts.find(x => x.id === handoutId);
  if (!h || h.undoneAt) return { state, remove: [], kept: [] };
  const byId = new Map(theirs.map(c => [c.id, c]));
  const remove: string[] = [], back = new Set<string>(), kept: string[] = [];
  for (const it of h.items) {
    const c = byId.get(it.contactId);
    if (!c || (c.dials === 0 && !c.tag && !c.lastDialed)) { if (c) remove.push(c.id); back.add(it.libId); }
    else kept.push(`${c.first} ${c.last}`);
  }
  return {
    state: { ...state, contacts: state.contacts.map(c => (back.has(c.id) ? { ...c, givenTo: '', givenAt: null } : c)),
      handouts: state.handouts.map(x => (x.id === handoutId ? { ...x, undoneAt: now } : x)) },
    remove, kept,
  };
}

// ---------- adding to the library (CSV import, Lead Library sheet move) ----------

const H: Record<string, keyof LibraryContact | 'name'> = {
  first: 'first', firstname: 'first', last: 'last', lastname: 'last', name: 'name', fullname: 'name', phone: 'phone', phonenumber: 'phone', mobile: 'phone', cell: 'phone',
  job: 'job', jobtitle: 'job', title: 'job', role: 'job', position: 'job', company: 'company', employer: 'company', union: 'company', city: 'city', state: 'state',
  linkedin: 'linkedin', linkedinurl: 'linkedin', backup: 'backup', backupphone: 'backup', phone2: 'backup', notes: 'notes', note: 'notes',
  givento: 'givenTo', dategiven: 'givenAt',
};
const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A pasted or uploaded table to library contacts. Uses the header row when it has one (any column order), else the sheet's order. */
export function libraryFromTable(rows: string[][], nextId: (i: number) => string, tz = 'America/New_York'): LibraryContact[] {
  const head = (rows[0] ?? []).map(c => H[nk(c)]);
  if (head.filter(Boolean).length < 2) return fromSheet('', rows, nextId, tz);
  return rows.slice(1).flatMap((r, i) => {
    const o: Record<string, string> = {};
    head.forEach((k, j) => { if (k && !o[k]) o[k] = String(r[j] ?? '').trim(); });
    if (o.name && !o.first && !o.last) { const w = o.name.split(/\s+/); o.first = w[0] ?? ''; o.last = w.slice(1).join(' '); }
    if (!o.first && !o.last) return [];
    const st = parseState(o.state ?? '');
    return [{ id: nextId(i), first: o.first ?? '', last: o.last ?? '', phone: o.phone ?? '', job: o.job ?? '', company: o.company ?? '', city: o.city ?? '',
      state: st?.abbr ?? (o.state ?? ''), linkedin: o.linkedin ?? '', backup: o.backup ?? '', notes: o.notes ?? '', givenTo: o.givenTo ?? '', givenAt: parseDay(o.givenAt ?? '', tz) }];
  });
}

export interface LibraryAddPlan { add: LibraryContact[]; skipped: { name: string; why: string }[] }

/**
 * What adding these contacts would do, without doing it. Skips ones already given to an agent (George 2026-11-26:
 * "if it shows on the sheet that it has been given to an agent already don't add it"), ones with no usable state,
 * and ones already in the library or already in an agent's lists (same phone, or same name and company).
 */
export function planLibraryAdd(incoming: LibraryContact[], lib: LibraryContact[], agentsContacts: { phone: string; backup: string; first: string; last: string; company: string }[] = []): LibraryAddPlan {
  const d10 = (p: string) => p.replace(/\D/g, '').slice(-10);
  const phones = new Set<string>(), names = new Set<string>();
  const remember = (c: { phone: string; backup: string; first: string; last: string; company: string }) => {
    for (const p of [c.phone, c.backup]) { const d = d10(p); if (d.length === 10) phones.add(d); }
    names.add(`${nk(c.first)}|${nk(c.last)}|${nk(c.company)}`);
  };
  lib.forEach(remember); agentsContacts.forEach(remember);
  const add: LibraryContact[] = [], skipped: { name: string; why: string }[] = [];
  for (const c of incoming) {
    const name = `${c.first} ${c.last}`.trim();
    if (nk(c.first) === 'first' && nk(c.last) === 'last') continue;                       // a header row
    if (!c.last && !c.company && !c.phone && !c.city) continue;                            // a title or note row, not a person
    if (c.givenTo) { skipped.push({ name, why: `Already given to ${c.givenTo}` }); continue; }
    if (!parseState(c.state)) { skipped.push({ name, why: `No state${c.state ? ` ("${c.state}")` : ''}` }); continue; }
    const ph = [c.phone, c.backup].map(d10).filter(d => d.length === 10);
    if (ph.some(d => phones.has(d)) || names.has(`${nk(c.first)}|${nk(c.last)}|${nk(c.company)}`)) { skipped.push({ name, why: 'Already in the library or with an agent' }); continue; }
    add.push({ ...c, state: parseState(c.state)!.abbr, givenTo: '', givenAt: null });
    remember(c);
  }
  return { add, skipped };
}

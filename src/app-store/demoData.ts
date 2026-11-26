// Made-up contacts for the demo. No real people or numbers (555-01xx numbers are reserved for fiction).
import type { Contact } from '../rules/types';
import { TAGS } from '../rules/tags';
import { DAY_MS, addDays, startOfDay } from '../rules/time';

const FIRST = ['Avery', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Rowan', 'Skyler', 'Parker', 'Reese', 'Emerson',
  'Hayden', 'Kendall', 'Logan', 'Peyton', 'Sawyer', 'Taylor', 'Blake', 'Cameron', 'Drew', 'Elliot', 'Finley', 'Harper',
  'Jamie', 'Kai', 'Lane', 'Marley', 'Noel', 'Oakley', 'Phoenix', 'River', 'Sage', 'Tatum', 'Wren', 'Ellis', 'Shay'];
const LAST = ['Calloway', 'Brightwater', 'Hollins', 'Pembrook', 'Ashford', 'Whitlock', 'Danvers', 'Kingsley', 'Merriweather',
  'Thornton', 'Fairbanks', 'Holloway', 'Langford', 'Redmond', 'Sterling', 'Winslow', 'Bramble', 'Cartwright', 'Dunmore', 'Everly'];
const COS = ['Lonestar Freight', 'Peachtree Logistics', 'Magnolia Rail', 'Red River Haulers', 'Bluegrass Parcel', 'UPS', 'Gulf Coast Cartage',
  'Ironhorse Rail', 'Summit Warehousing', 'Delta Linehaul'];
const JOBS = ['Package Car Driver', 'Feeder Driver', 'Conductor', 'Yard Jockey', 'Warehouse Lead', 'Dock Worker', 'Dispatcher', 'Mechanic', 'Loader'];
const LISTS: { list: string; st: string; cities: string[]; ac: string[]; zone: Contact['zone'] }[] = [
  { list: 'Texas', st: 'TX', cities: ['Dallas', 'Fort Worth', 'Houston', 'Amarillo'], ac: ['214', '817', '713', '806'], zone: 'CT' },
  { list: 'Georgia', st: 'GA', cities: ['Atlanta', 'Macon', 'Savannah'], ac: ['404', '478', '912'], zone: 'ET' },
  { list: 'Alabama', st: 'AL', cities: ['Birmingham', 'Mobile', 'Huntsville'], ac: ['205', '251', '256'], zone: 'CT' },
  { list: 'Tennessee', st: 'TN', cities: ['Knoxville', 'Memphis', 'Nashville'], ac: ['865', '901', '615'], zone: 'ET' },
];

/** A small seeded random generator, so the demo looks the same every time it is reset. */
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

export function demoContacts(now: number, tz: string, count = 160): Contact[] {
  const r = rng(7);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const day = startOfDay(now, tz);
  const out: Contact[] = [];
  let ph = 100;
  const num = (ac: string) => `(${ac}) 555-01${String(ph++ % 100).padStart(2, '0')}`;
  for (let i = 0; i < count; i++) {
    const L = LISTS[i % LISTS.length];
    const c: Contact = {
      id: `demo-${i + 1}`, list: L.list, tag: '', dials: 0, first: pick(FIRST), last: pick(LAST), phone: num(pick(L.ac)),
      job: pick(JOBS), company: pick(COS), city: pick(L.cities), state: L.st, backup: '', notes: '', lastDialed: null,
      status: '', callAt: null, linkedin: '', zone: L.zone, newNumberMark: null, callbackTries: 0, noShowTries: 0,
      swapMemo: null, seq: Math.floor(i / LISTS.length) + 3,
    };
    const kind = i % 20;
    const ago = (d: number, h = 10) => addDays(day, -d, tz) + h * 3_600_000;
    if (kind < 7) { /* fresh */ }
    else if (kind < 13) { c.dials = 1 + (i % 6); c.lastDialed = ago(1 + (i % 5)); c.notes = `${i % 2 ? 'Union member since 2015' : ''}`; }
    else if (kind === 13) { c.tag = TAGS.callback; c.dials = 2; c.lastDialed = ago(1); c.callAt = day + 14 * 3_600_000; c.status = 'Good';
      c.notes = 'Wife said he is on a run until Thursday'; }
    else if (kind === 14) { c.tag = TAGS.noshow; c.dials = 3; c.lastDialed = ago(1); c.status = 'Good';
      c.notes = 'Has 2 kids, interested in whole life'; }
    else if (kind === 15) { c.tag = TAGS.scheduled; c.dials = 2; c.lastDialed = ago(2); c.status = 'Good';
      c.callAt = day + (i % 40 < 20 ? 18 : 24 + 19) * 3_600_000; }
    else if (kind === 16) { c.dials = 6; c.lastDialed = ago(2); c.backup = num(L.ac[0]); c.notes = 'Muse: 2 results, picked the Dallas one'; }
    else if (kind === 17) { c.dials = 3; c.lastDialed = ago(1); c.newNumberMark = 3; c.notes = 'Muse: new number found via LinkedIn'; }
    else if (kind === 18) { c.tag = TAGS.notInterested; c.dials = 2; c.lastDialed = now - 80 * DAY_MS; c.status = 'Good'; }
    else { c.tag = i % 40 === 19 ? TAGS.calledInto : TAGS.bad; c.dials = 1; c.lastDialed = ago(0, 9); c.status = i % 40 === 19 ? 'Good' : 'Bad'; }
    out.push(c);
  }
  // a few with no number (Needs Number)
  for (let k = 0; k < 6; k++) Object.assign(out[k * 7 + 1], { phone: '', notes: 'No number found yet' });
  // a few more with no number, and two nobody could find a number for
  for (let k = 6; k < 12; k++) Object.assign(out[k * 7 + 1], { phone: '', backup: '', notes: '' });
  for (const k of [12, 13]) Object.assign(out[k * 7 + 1], { phone: '', backup: '', status: 'Cannot Find', notes: 'CANNOT FIND - no match on Muse or LinkedIn' });
  return out;
}

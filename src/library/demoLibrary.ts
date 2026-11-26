// Made-up library contacts for the demo (George asked for no further reads of the Lead Library sheet). Same tabs as
// his sheet; about a third already given out, a few to Marshall, who is not on Dispatch yet.
import type { LibraryContact } from './library';
import { zoned } from '../rules/time';

const FIRST = ['Avery', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Jordan', 'Kendall', 'Logan', 'Morgan', 'Noel', 'Parker',
  'Quinn', 'Reese', 'Rowan', 'Sawyer', 'Tatum', 'Wren', 'Dale', 'Curtis', 'Wayne', 'Ray', 'Lonnie', 'Travis', 'Rhonda', 'Deb', 'Earl', 'Shane'];
const LAST = ['Ashford', 'Bramble', 'Calloway', 'Dunmore', 'Ellison', 'Fairbank', 'Galloway', 'Hollins', 'Ingram', 'Jessup', 'Kettering', 'Lindell',
  'Marlow', 'Northcutt', 'Oakes', 'Pruitt', 'Quarles', 'Ridley', 'Stroud', 'Tolliver', 'Underhill', 'Varner', 'Whitlock', 'Yancey'];
const JOB = ['Truck Driver', 'CDL-A Driver', 'Owner Operator', 'Regional Driver', 'OTR Driver', 'Local Delivery Driver', 'Tanker Driver', 'Flatbed Driver'];
const CO = ['Ridgeline Freight', 'Bluewater Logistics', 'Iron Prairie Transport', 'Cardinal Haulers', 'Summit Lane Carriers', 'Red Oak Trucking',
  'Northstar Freightways', 'Copperline Express', 'Harbor Point Transport', 'Granite Road Logistics'];
const STATES: [string, string, string[]][] = [
  ['TX', '214', ['Dallas', 'Fort Worth', 'Amarillo', 'Lubbock', 'Waco']], ['FL', '813', ['Tampa', 'Lakeland', 'Ocala', 'Jacksonville']],
  ['NC', '704', ['Charlotte', 'Gastonia', 'Hickory']], ['WV', '304', ['Charleston', 'Huntington', 'Beckley']], ['OH', '614', ['Columbus', 'Dayton', 'Toledo']],
  ['SC', '803', ['Columbia', 'Rock Hill', 'Sumter']], ['ME', '207', ['Bangor', 'Portland', 'Lewiston']], ['MI', '616', ['Grand Rapids', 'Lansing', 'Kalamazoo']],
  ['PA', '717', ['Harrisburg', 'Lancaster', 'York', 'Erie']],
];
const SIZE: Record<string, number> = { TX: 48, FL: 30, NC: 22, WV: 12, OH: 18, SC: 16, ME: 8, MI: 14, PA: 26 };
const WHO: Record<string, string[]> = { TX: ['George'], FL: ['Austin', 'Gracie'], NC: ['George'], WV: ['Austin'], OH: ['Marshall'], SC: ['Gracie'], ME: [], MI: ['Marshall'], PA: ['Austin', 'Gracie'] };

export function demoLibrary(tz = 'America/New_York'): LibraryContact[] {
  let n = 0, seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const out: LibraryContact[] = [];
  for (const [st, ac, cities] of STATES) {
    for (let i = 0; i < SIZE[st]; i++) {
      n++;
      const first = pick(FIRST), last = pick(LAST), who = WHO[st];
      const given = who.length && i < Math.round(SIZE[st] * 0.4);
      const noPhone = rnd() < 0.15;
      out.push({
        id: `lib-${n}`, first, last, phone: noPhone ? '' : `(${ac}) 555-01${String(n % 100).padStart(2, '0')}`, job: pick(JOB), company: pick(CO),
        city: pick(cities), state: st, linkedin: rnd() < 0.6 ? `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-demo${n}` : '',
        backup: '', notes: '', givenTo: given ? who[i % who.length] : '', givenAt: given ? zoned(2026, 11, 3 + (i % 20), 12, 0, tz) : null,
      });
    }
  }
  return out;
}

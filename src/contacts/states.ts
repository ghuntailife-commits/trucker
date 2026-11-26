// US states: names, abbreviations and the main time zone (the zone most of the state's people live in).
import type { Zone } from '../rules/types';

export const STATES: Record<string, [string, Zone]> = {
  AL: ['Alabama', 'CT'], AK: ['Alaska', 'AKT'], AZ: ['Arizona', 'MT'], AR: ['Arkansas', 'CT'], CA: ['California', 'PT'],
  CO: ['Colorado', 'MT'], CT: ['Connecticut', 'ET'], DE: ['Delaware', 'ET'], DC: ['District of Columbia', 'ET'], FL: ['Florida', 'ET'],
  GA: ['Georgia', 'ET'], HI: ['Hawaii', 'HT'], ID: ['Idaho', 'MT'], IL: ['Illinois', 'CT'], IN: ['Indiana', 'ET'], IA: ['Iowa', 'CT'],
  KS: ['Kansas', 'CT'], KY: ['Kentucky', 'ET'], LA: ['Louisiana', 'CT'], ME: ['Maine', 'ET'], MD: ['Maryland', 'ET'],
  MA: ['Massachusetts', 'ET'], MI: ['Michigan', 'ET'], MN: ['Minnesota', 'CT'], MS: ['Mississippi', 'CT'], MO: ['Missouri', 'CT'],
  MT: ['Montana', 'MT'], NE: ['Nebraska', 'CT'], NV: ['Nevada', 'PT'], NH: ['New Hampshire', 'ET'], NJ: ['New Jersey', 'ET'],
  NM: ['New Mexico', 'MT'], NY: ['New York', 'ET'], NC: ['North Carolina', 'ET'], ND: ['North Dakota', 'CT'], OH: ['Ohio', 'ET'],
  OK: ['Oklahoma', 'CT'], OR: ['Oregon', 'PT'], PA: ['Pennsylvania', 'ET'], RI: ['Rhode Island', 'ET'], SC: ['South Carolina', 'ET'],
  SD: ['South Dakota', 'CT'], TN: ['Tennessee', 'CT'], TX: ['Texas', 'CT'], UT: ['Utah', 'MT'], VT: ['Vermont', 'ET'],
  VA: ['Virginia', 'ET'], WA: ['Washington', 'PT'], WV: ['West Virginia', 'ET'], WI: ['Wisconsin', 'CT'], WY: ['Wyoming', 'MT'],
};

/** "tx", "Texas" or "TEXAS" -> { abbr: 'TX', name: 'Texas', zone: 'CT' }. */
export function parseState(s: string): { abbr: string; name: string; zone: Zone } | null {
  const up = String(s ?? '').trim().toUpperCase();
  if (!up) return null;
  if (STATES[up]) return { abbr: up, name: STATES[up][0], zone: STATES[up][1] };
  for (const [abbr, [name, zone]] of Object.entries(STATES)) if (name.toUpperCase() === up) return { abbr, name, zone };
  return null;
}

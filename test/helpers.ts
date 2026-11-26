// Made-up contacts for tests. No real contact data.
import type { Contact } from '../src/rules/types';
import { zoned } from '../src/rules/time';

export const TZ = 'America/New_York';
/** Eastern wall-clock time in Nov 2026. */
export const et = (d: number, h: number, mi = 0, m = 11) => zoned(2026, m, d, h, mi, TZ);
export const MIN = 60_000;

let n = 0;
export function contact(over: Partial<Contact> = {}): Contact {
  n++;
  return {
    id: 'c' + n, list: 'Texas', tag: '', dials: 0, first: 'Test' + n, last: 'Person', phone: '(214) 555-01' + String(n % 100).padStart(2, '0'),
    job: 'Driver', company: 'Acme Freight', city: 'Dallas', state: 'TX', backup: '', notes: '', lastDialed: null,
    status: '', callAt: null, linkedin: '', zone: 'CT', newNumberMark: null, callbackTries: 0, noShowTries: 0,
    swapMemo: null, seq: n, ...over,
  };
}

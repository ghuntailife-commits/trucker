// Result forms (brief section 7): the Sold and "Presented, not sold" popups, checked and turned into
// a Sales / No Sales row plus the dated note on the contact. Same fields, checks and note text as the v27 sheet.
import { DAY_MS, md } from './time';

export const OBJECTIONS = ['Price', 'Needs to Think', 'Spouse / Family', 'Existing Coverage', 'Trust / Skepticism',
  'Timing', 'Affordability', 'Other'] as const;

export type AlpType = 'Trial' | 'Standard';
/** Where a sale came from when it wasn't one of the agent's own list contacts (George, 2026-11-26). */
export type SaleSource = 'company' | 'referral' | 'other';
export const SOURCE_LABEL: Record<SaleSource, string> = { company: 'Company lead', referral: 'Referral', other: 'Other source' };

export interface SaleForm { type: string; alp: string; monthly: string; wholeLife: string; adb: string; email: string; note: string }
export interface SaleRecord {
  at: number; contactId: string; alpType: AlpType; alp: number; monthly: number; wholeLife: number; adb: number;
  email: string; note: string; calledInto: boolean;
  /** Name, phone, company and list at the time of the sale, so reports still read right if the contact changes. */
  who?: { first: string; last: string; phone: string; company: string; list: string };
  /** Set for sales entered by hand from Results: company leads, referrals and the like. */
  source?: SaleSource;
}

/** A sale from outside the agent's lists, ready to save. The client's name goes in `who`; there is no contact behind it. */
export function outsideSale(f: { source: SaleSource; first: string; last: string; phone: string; company: string; at: number; id: string },
  sale: Omit<SaleRecord, 'at' | 'contactId' | 'calledInto'>): { error: string } | { ok: SaleRecord } {
  const first = f.first.trim(), last = f.last.trim();
  if (!first && !last) return { error: "Enter the client's name." };
  return { ok: { ...sale, at: f.at, contactId: `out-${f.id}`, calledInto: false, source: f.source,
    who: { first, last, phone: f.phone.trim(), company: f.company.trim(), list: SOURCE_LABEL[f.source] } } };
}

export interface NoSaleForm { objections: string[]; reason: string; followUp: string; followUpNote: string }
export interface NoSaleRecord {
  at: number; contactId: string; objections: string[]; reason: string; followUp: string; followUpNote: string; calledInto: boolean;
  who?: { first: string; last: string; phone: string; company: string; list: string };
  /** Saved on a follow-up call after the presentation, not a new presentation (George, 2026-11-27). */
  again?: boolean;
}

/** "$1,200.50" → 1200.5. null when it isn't a plain dollar amount (at most 2 decimals). */
export function money(v: string | number | null | undefined): number | null {
  const x = String(v ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return null;
  return Math.round(parseFloat(x) * 100) / 100;
}

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export function checkSale(f: SaleForm): { error: string } | { ok: Omit<SaleRecord, 'at' | 'contactId' | 'calledInto'> } {
  if (f.type !== 'Trial' && f.type !== 'Standard') return { error: 'Pick Trial or Standard for the ALP.' };
  const alp = money(f.alp), mo = money(f.monthly), wl = money(f.wholeLife);
  const adb = String(f.adb ?? '').trim() === '' ? 0 : money(f.adb);
  if (alp === null || alp <= 0) return { error: 'Enter the trial or standard ALP as a dollar amount, e.g. 1200.' };
  if (mo === null || mo <= 0) return { error: 'Enter the monthly premium as a dollar amount, e.g. 100.' };
  if (wl === null || wl <= 0) return { error: 'Enter the whole life coverage amount as dollars, e.g. 25000.' };
  if (adb === null || adb < 0) return { error: 'Enter the ADB amount as dollars, e.g. 25000 (or leave it blank for none).' };
  const email = String(f.email ?? '').trim();
  if (email && !isEmail(email)) return { error: 'That email does not look right.' };
  return { ok: { alpType: f.type, alp, monthly: mo, wholeLife: wl, adb, email, note: String(f.note ?? '').trim() } };
}

const usd2 = (n: number) => '$' + n.toFixed(2);
const usd0 = (n: number) => '$' + n.toFixed(0);

/** The dated line added to the contact's notes (same text as v27). */
export function saleNote(s: Pick<SaleRecord, 'alpType' | 'alp' | 'monthly' | 'wholeLife' | 'adb'>, now: number, tz: string): string {
  return `${md(now, tz)}: Sold - ${s.alpType} ALP ${usd2(s.alp)}, monthly premium ${usd2(s.monthly)}, whole life ${usd0(s.wholeLife)}`
    + (s.adb > 0 ? `, ADB ${usd0(s.adb)}` : ', no ADB');
}

/** A sale is dated at its appointment time when that was in the last 7 days, otherwise when it was entered. */
export function saleDate(apptAt: number | null | undefined, now: number): number {
  return apptAt != null && apptAt <= now && now - apptAt <= 7 * DAY_MS ? apptAt : now;
}

export function checkNoSale(f: NoSaleForm): { error: string } | { ok: Omit<NoSaleRecord, 'at' | 'contactId' | 'calledInto'> } {
  const objections = OBJECTIONS.filter(o => (f.objections ?? []).includes(o));
  const reason = String(f.reason ?? '').trim();
  if (!objections.length && !reason) return { error: 'Pick at least one objection, or write what stopped the sale.' };
  const fu = String(f.followUp ?? '').trim();
  if (fu && !/^\d{4}-\d{2}-\d{2}$/.test(fu)) return { error: 'Pick the follow-up date from the calendar.' };
  return { ok: { objections, reason, followUp: fu, followUpNote: String(f.followUpNote ?? '').trim() } };
}

export function noSaleNote(n: Pick<NoSaleRecord, 'objections' | 'reason' | 'followUp' | 'followUpNote'>, now: number, tz: string): string {
  const fu = n.followUp ? n.followUp.split('-').map(Number) : null;
  return `${md(now, tz)}: Presented, no sale`
    + (n.objections.length ? ' - ' + n.objections.join(', ') : '')
    + (n.reason ? ' - ' + n.reason : '')
    + (fu ? ` - follow up ${fu[1]}/${fu[2]}` : '')
    + (n.followUpNote ? ` (${n.followUpNote})` : '');
}

/** ALP counted toward totals (one ALP per sale, trial or standard). */
export const saleAlp = (s: { alp?: number; trialAlp?: number; standardAlp?: number }) =>
  s.alp ?? ((s.trialAlp ?? 0) + (s.standardAlp ?? 0));

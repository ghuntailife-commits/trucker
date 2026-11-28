// Quick typing in the follow-up email form (George, 2026-11-27): "25k wl" becomes "$25,000 guaranteed whole life
// coverage", "61.9" becomes "61.90", "dec" becomes "December". Pure, tested in test/followUp.test.ts.

/** "25k", "$25,000", "1.5m", "2,000" -> the number; 0 when it isn't one. */
export function money(v: string): number {
  const m = /^\s*\$?\s*([\d,]*\.?\d+)\s*([km])?\s*$/i.exec(String(v ?? ''));
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1);
  return Number.isFinite(n) ? n : 0;
}
const dollars = (n: number) => '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const KINDS: [RegExp, (amt: string) => string][] = [
  [/^(wl|whole ?life|gwl|guaranteed( whole life)?)$/i, a => `${a} guaranteed whole life coverage`],
  [/^(term|tdb|temp|temporary|temporary death benefit|death benefit)$/i, a => `${a} of temporary death benefit`],
  [/^(add|ad&d|accidental)$/i, a => `${a} of accidental death coverage`],
];

/** One coverage line: money amounts get "$" and commas; a bare "25k wl" / "100k term" is written out in full. */
export function tidyCoverage(line: string): string {
  const s = String(line ?? '').trim();
  if (!s) return '';
  const m = /^\$?\s*([\d,]*\.?\d+\s*[km]?)\s*(.*)$/i.exec(s);
  if (m && money(m[1])) {
    const amt = dollars(money(m[1])), rest = m[2].trim();
    const kind = KINDS.find(([re]) => re.test(rest));
    if (kind) return kind[1](amt);
    return rest ? `${amt} ${rest}` : amt;
  }
  // amounts inside the line, e.g. "Whole life 25k"
  return s.replace(/\$?\b(\d[\d,]*\.?\d*)\s*([km])\b/gi, (_, n, k) => dollars(money(`${n}${k}`)))
    .replace(/\$?\b(\d{4,})\b(?!\.\d)/g, (_, n) => dollars(Number(n)));
}

/** "61.9" -> "61.90"; "$61.94/mo" -> "61.94". */
export function tidyMonthly(v: string): string {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return n ? n.toFixed(2) : String(v ?? '').trim();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "dec", "Dec.", "12" -> "December". */
export function tidyMonth(v: string): string {
  const s = String(v ?? '').trim().replace(/\.$/, '');
  if (!s) return '';
  if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12) return MONTHS[+s - 1];
  return MONTHS.find(m => s.length >= 3 && m.toLowerCase().startsWith(s.toLowerCase())) ?? s;
}

/** "12th", "the 12", "12" -> "12". */
export function tidyDay(v: string): string {
  const m = /(\d{1,2})/.exec(String(v ?? ''));
  return m && +m[1] >= 1 && +m[1] <= 31 ? String(+m[1]) : String(v ?? '').trim();
}

// Phone numbers: the same 10-digit rules as the current sheet (an 11-digit number starting with 1 is fine).

/** "(214) 555-0101", or null when it is not a 10-digit US number. */
export function fmtPhone(s: string): string | null {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Splits "214-555-0101 / 214-555-0102" (also , ; | or "or") into formatted numbers, dropping repeats. */
export function splitPhones(s: string): string[] {
  const out: string[] = [];
  for (const p of String(s ?? '').split(/[/;,|]|\s+or\s+/i)) {
    const f = fmtPhone(p);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/** The last 10 digits, for comparing numbers written different ways. */
export const digits10 = (s: string) => String(s ?? '').replace(/\D/g, '').slice(-10);

/** Lowercase letters and digits only, for comparing names and companies. */
export const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

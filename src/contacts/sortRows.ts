// Click-a-column sorting for every table. Pure, tested in test/priority.test.ts.
export type SortVal = string | number | null | undefined;
export interface SortState { key: string; dir: 1 | -1 }

/** Sorts a copy. Blanks always go last, numbers compare as numbers, words ignore case. */
export function sortRows<T>(rows: T[], get: (r: T) => SortVal, dir: 1 | -1): T[] {
  const blank = (v: SortVal) => v === null || v === undefined || v === '';
  return rows.map((r, i) => ({ r, i, v: get(r) })).sort((a, b) => {
    if (blank(a.v) || blank(b.v)) return blank(a.v) === blank(b.v) ? a.i - b.i : blank(a.v) ? 1 : -1;
    const x = typeof a.v === 'string' ? a.v.toLowerCase() : a.v!, y = typeof b.v === 'string' ? b.v.toLowerCase() : b.v!;
    return (x < y ? -1 : x > y ? 1 : a.i - b.i) * (x === y ? 1 : dir);
  }).map(x => x.r);
}

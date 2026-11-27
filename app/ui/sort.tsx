'use client';
// One sort hook for every table: click a column header to sort, click again to flip, a third time to go back to the page's own order.
import { useMemo, useState } from 'react';
import { sortRows, type SortState, type SortVal } from '../../src/contacts/sortRows';

export type SortCols<T> = Record<string, (r: T) => SortVal>;

export function useSort<T>(rows: T[], cols: SortCols<T>, start: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(start);
  const sorted = useMemo(() => sort && cols[sort.key] ? sortRows(rows, cols[sort.key], sort.dir) : rows, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const click = (key: string, firstDir: 1 | -1) => setSort(s => !s || s.key !== key ? { key, dir: firstDir } : s.dir === firstDir ? { key, dir: (-firstDir) as 1 | -1 } : null);
  /** A sortable header cell. Numbers and dates start biggest/newest first. */
  const th = (key: string, label: React.ReactNode, cls = '', firstDir: 1 | -1 = /\b(num|r|n)\b/.test(cls) ? -1 : 1) => (
    <th key={key} className={`sortable ${cls}`} aria-sort={sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        title="Click to sort" onClick={() => click(key, firstDir)}>
      {label}<span className="sarrow">{sort?.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</span>
    </th>
  );
  return { sorted, sort, setSort, th };
}

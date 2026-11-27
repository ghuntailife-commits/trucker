// Shift-click to pick a range (George, 2026-11-26): click one row, shift-click another, and every row between them
// (in the order shown on screen) is ticked, or unticked if the second click unticks. Rows that can't be picked are passed over.

export function rangePick(prev: ReadonlySet<string>, order: readonly string[], last: string | null, id: string, on: boolean,
  shift: boolean, canPick: (id: string) => boolean = () => true): Set<string> {
  const out = new Set(prev);
  const a = last == null ? -1 : order.indexOf(last), b = order.indexOf(id);
  if (shift && a >= 0 && b >= 0) {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (const x of order.slice(lo, hi + 1)) if (canPick(x)) { if (on) out.add(x); else out.delete(x); }
  } else if (on) out.add(id); else out.delete(id);
  return out;
}

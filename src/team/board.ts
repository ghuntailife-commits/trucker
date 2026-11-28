// The live "Top dialers today" board on Home (George, 2026-11-28). Each agent's screen posts its own numbers for
// the day; everyone reads the whole team's. Pure parts, tested in test/board.test.ts.
export interface BoardRow { agent: string; name: string; day: number; dials: number; connects: number; booked: number; at: number }

/** Today's rows, most dials first (then reached, then booked); yesterday's numbers drop off at midnight Eastern. */
export function rankBoard(rows: BoardRow[], day: number): BoardRow[] {
  return rows.filter(r => r && r.day === day && r.dials > 0)
    .sort((a, b) => b.dials - a.dials || b.connects - a.connects || b.booked - a.booked || a.at - b.at);
}

/** Initials for the round badge: "Gracie Lynn" -> "GL", "Anum" -> "AN". */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
}

/** "Live" while the agent dialed in the last 15 minutes. */
export const isLive = (r: BoardRow, now: number) => now - r.at < 15 * 60_000;

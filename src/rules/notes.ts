// Notes are stored oldest first. On screen, the dated call history comes first (newest first), then research notes,
// so the latest result is what the agent reads during a call. Same as v27's Today list.
const HIST = /^(\d{1,2}\/\d{1,2}\D|Bad number:)/;

export function notesNewestFirst(notes: string): string[] {
  const s = String(notes || '');
  if (!s.trim()) return [];
  const p = s.split(' | ').map(x => x.trim()).filter(Boolean);
  const hist: string[] = [], other: string[] = [];
  for (const x of p) (HIST.test(x) ? hist.unshift(x) : other.push(x));
  return [...hist, ...other];
}

export const isHistoryNote = (line: string) => HIST.test(line);

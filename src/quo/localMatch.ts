// Which of the agent's Quo numbers a text goes out from (George, 2026-11-27: local match). Keep an ongoing conversation
// on the line it started on; otherwise one with the contact's area code, then one in their state, then in their time zone, then the main one.
// Pure, tested in test/localMatch.test.ts.
import { AREA } from '../contacts/zones';

const d10 = (p: string) => p.replace(/\D/g, '').slice(-10);
const where = (p: string) => AREA.get(d10(p).slice(0, 3));

export function pickFrom(mine: string[], to: string, lastUsed?: string | null): { from: string; why: string } {
  if (!mine.length) return { from: '', why: '' };
  if (lastUsed) { const hit = mine.find(m => d10(m) === d10(lastUsed)); if (hit) return { from: hit, why: 'same line as your last texts with them' }; }
  const ac = d10(to).slice(0, 3);
  const same = ac.length === 3 ? mine.find(m => d10(m).slice(0, 3) === ac) : undefined;
  if (same) return { from: same, why: `same area code (${ac})` };
  const them = where(to);
  if (them) {
    const st = mine.find(m => where(m)?.state === them.state);
    if (st) return { from: st, why: `your ${them.state} number` };
    const z = mine.find(m => { const w = where(m); return w && w.zone !== 'mixed' && w.zone === them.zone; });
    if (z) return { from: z, why: `same time zone (${them.zone})` };
  }
  return { from: mine[0], why: 'your main number' };
}

/** The agent's number that shows up in a stored Quo event (the line a past text with this person used). */
export function lineIn(payload: unknown, mine: string[]): string | null {
  const s = JSON.stringify(payload ?? '').replace(/\D+/g, ' ');
  return mine.find(m => { const d = d10(m); return d.length === 10 && s.includes(d); }) ?? null;
}

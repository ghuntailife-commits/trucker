// "Get local numbers" (George, 2026-11-27): which Twilio numbers to buy so calls show a local number.
// Counts the team's contacts by area code and state, skips what the team already has, and suggests
// one number per state (in that state's busiest area code) plus, if wanted, the busiest area codes.
// Pure, tested in test/twilioPlan.test.ts.
import { AREA } from '../contacts/zones';

const d10 = (p: string) => p.replace(/\D/g, '').slice(-10);

export interface NumberTarget { key: string; kind: 'state' | 'area'; state: string; areaCode: string; contacts: number }
export interface NumberPlan { states: NumberTarget[]; areas: NumberTarget[]; total: number; coveredByState: number; coveredByArea: number }

/** about what one Twilio local number costs a month (US) */
export const NUMBER_MONTHLY = 1.15;

export function planNumbers(phones: string[], owned: string[], topAreas = 25, minState = 1): NumberPlan {
  const byArea = new Map<string, number>();
  let total = 0;
  for (const p of phones) {
    const d = d10(p); if (d.length !== 10) continue;
    const ac = d.slice(0, 3); if (!AREA.has(ac)) continue;
    total++; byArea.set(ac, (byArea.get(ac) ?? 0) + 1);
  }
  const ownAreas = new Set(owned.map(o => d10(o).slice(0, 3)));
  const ownStates = new Set([...ownAreas].map(a => AREA.get(a)?.state).filter(Boolean) as string[]);
  const byState = new Map<string, { n: number; top: string; topN: number }>();
  for (const [ac, n] of byArea) {
    const st = AREA.get(ac)!.state;
    const s = byState.get(st) ?? { n: 0, top: ac, topN: 0 };
    s.n += n; if (n > s.topN) { s.top = ac; s.topN = n; }
    byState.set(st, s);
  }
  const states: NumberTarget[] = [...byState].filter(([st, v]) => !ownStates.has(st) && v.n >= minState)
    .map(([st, s]) => ({ key: `st:${st}`, kind: 'state' as const, state: st, areaCode: s.top, contacts: s.n }))
    .sort((a, b) => b.contacts - a.contacts);
  // area codes that get their own number: the busiest ones not already owned and not already the state pick
  const picked = new Set([...ownAreas, ...states.map(s => s.areaCode)]);
  const areas: NumberTarget[] = [...byArea].filter(([ac]) => !picked.has(ac))
    .sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, topAreas))
    .map(([ac, n]) => ({ key: `ac:${ac}`, kind: 'area' as const, state: AREA.get(ac)!.state, areaCode: ac, contacts: n }));
  const inStates = new Set([...ownStates, ...states.map(s => s.state)]);
  const coveredByState = [...byArea].reduce((t, [ac, n]) => t + (inStates.has(AREA.get(ac)!.state) ? n : 0), 0);
  const exact = new Set([...picked, ...areas.map(a => a.areaCode)]);
  const coveredByArea = [...byArea].reduce((t, [ac, n]) => t + (exact.has(ac) ? n : 0), 0);
  return { states, areas, total, coveredByState, coveredByArea };
}

/** Share of contacts who'd see an exact area-code match with the chosen targets plus what's owned. */
export function exactShare(phones: string[], owned: string[], chosen: NumberTarget[]): number {
  const codes = new Set([...owned.map(o => d10(o).slice(0, 3)), ...chosen.map(c => c.areaCode)]);
  let t = 0, hit = 0;
  for (const p of phones) { const d = d10(p); if (d.length !== 10 || !AREA.has(d.slice(0, 3))) continue; t++; if (codes.has(d.slice(0, 3))) hit++; }
  return t ? hit / t : 0;
}

// "Ring my cell" (George, 2026-11-27): Dispatch calls the agent's own phone first, says who they're calling, then
// connects the contact; calls coming in ring the computer and the cell together, and whichever answers first takes
// it. The cell shows the caller's real number and hears their name first. Pure, tested in test/twilioCell.test.ts.
// no node:crypto here: the screen uses this file too
const twilioE164 = (p: string) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : ''; };

export interface CellPref { on: boolean; cell: string }
export const cellKey = (agent: string) => `dispatch-cell-${agent}`;
export const cellReady = (p: CellPref | null | undefined): p is CellPref => !!p?.on && !!twilioE164(p.cell ?? '');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Short enough to say before connecting; the name only (no number), so it is quick. */
export const sayName = (name: string) => String(name ?? '').replace(/[^\p{L}\p{N}' .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

/** The agent picked up their cell: say who, then run the usual dial (record, notice, status). */
export function bridgeTwiml(name: string, dialTwiml: string): string {
  const who = sayName(name);
  const say = `<Say voice="Polly.Joanna">${who ? `Calling ${esc(who)}.` : 'Connecting.'}</Say>`;
  return dialTwiml.replace('<Response>', `<Response>${say}`);
}

/** What the agent hears on their cell for a call coming in, before it connects. */
export function whisperTwiml(name: string): string {
  const who = sayName(name);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${who ? `Dispatch call from ${esc(who)}.` : 'Dispatch call.'}</Say></Response>`;
}

/** Find a contact's name in an agent's saved contacts (the parts of their list) by phone. */
export function nameFor(contactLists: unknown[], phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return '';
  for (const list of contactLists) for (const c of (Array.isArray(list) ? list : []) as { first?: string; last?: string; phone?: string; backup?: string }[]) {
    if ([c.phone, c.backup].some(p => String(p ?? '').replace(/\D/g, '').slice(-10) === d)) return `${c.first ?? ''} ${c.last ?? ''}`.trim();
  }
  return '';
}

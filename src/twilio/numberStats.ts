// Numbers report (George, 2026-11-28): how each Dispatch calling number is doing, from the call and text events
// Dispatch already stores. Dials, connects (a person picked up and talked), voicemails, talk time, texts, which
// agents used it, and a spam warning when a number connects far less often than the rest.
import { AREA } from '../contacts/zones';
import { dayKey } from '../rules/time';

export type Ev = { id: string; type: string; call_id: string | null; phone: string | null; at: string; agent_id: string | null; payload: Record<string, unknown> | null };

export type NumRow = {
  phone: string; area: string; state: string;
  today: number; d7: number; d30: number;
  connects7: number; connects30: number; rate7: number | null; rate30: number | null;
  voicemails30: number; talkSecs30: number; avgTalk: number | null;
  textsOut30: number; textsIn30: number; agents: string[]; last: number | null;
  warn: string | null; resting: boolean;
};

/** A call that lasted this long counts as a real conversation, not a hang-up. */
export const CONNECT_SECS = 20;
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(-10);
const obj = (e: Ev) => ((e.payload?.data as { object?: Record<string, unknown> } | undefined)?.object ?? {}) as Record<string, unknown>;

export function numberStats(owned: string[], events: Ev[], now: number, tz: string, cap: number): NumRow[] {
  const today = dayKey(now, tz);
  const ago = (ms: number) => now - ms;
  const rows = new Map<string, NumRow & { calls: Map<string, number> }>();
  const row = (d: string) => {
    let r = rows.get(d);
    if (!r) {
      const a = AREA.get(d.slice(0, 3));
      r = { phone: d, area: d.slice(0, 3), state: a?.state ?? '', today: 0, d7: 0, d30: 0, connects7: 0, connects30: 0, rate7: null, rate30: null,
        voicemails30: 0, talkSecs30: 0, avgTalk: null, textsOut30: 0, textsIn30: 0, agents: [], last: null, warn: null, resting: false, calls: new Map() };
      rows.set(d, r);
    }
    return r;
  };
  for (const p of owned) row(digits(p));

  const callFrom = new Map<string, string>();      // browser call id -> our number
  const machine = new Set<string>();               // call legs a machine answered
  for (const e of events) {
    if (e.type === 'call.dialed') {
      const d = digits((e.payload as { from?: string } | null)?.from); if (!d) continue;
      const t = Date.parse(e.at); if (t < ago(30 * 86_400_000)) continue;
      const r = row(d);
      if (e.call_id) { callFrom.set(e.call_id, d); r.calls.set(e.call_id, t); }
      if (dayKey(t, tz) === today) r.today++;
      if (t >= ago(7 * 86_400_000)) r.d7++;
      r.d30++;
      if (e.agent_id && !r.agents.includes(e.agent_id)) r.agents.push(e.agent_id);
      if (!r.last || t > r.last) r.last = t;
    } else if (e.type === 'call.amd') {
      const by = String((e.payload as { answeredBy?: string } | null)?.answeredBy ?? '');
      if (by.startsWith('machine') || by === 'fax') { if (e.call_id) machine.add(e.call_id); }
    }
  }
  for (const e of events) {
    if (e.type === 'call.completed' && e.call_id && callFrom.has(e.call_id)) {
      const o = obj(e); const r = row(callFrom.get(e.call_id)!);
      const t = r.calls.get(e.call_id) ?? Date.parse(e.at);
      if (machine.has(String(o.id ?? ''))) { r.voicemails30++; continue; }
      const secs = Number(o.duration ?? 0) || 0;
      if (o.status === 'answered' && secs >= CONNECT_SECS) {
        r.connects30++; r.talkSecs30 += secs;
        if (t >= ago(7 * 86_400_000)) r.connects7++;
      }
    } else if (e.type === 'message.sent') {
      const d = digits((e.payload as { from?: string } | null)?.from); if (d && rows.has(d)) row(d).textsOut30++;
    } else if (e.type === 'message.received') {
      const d = digits(obj(e).to); if (d && rows.has(d)) row(d).textsIn30++;
    }
  }
  const out = [...rows.values()].map(({ calls: _c, ...r }) => ({
    ...r,
    rate7: r.d7 ? r.connects7 / r.d7 : null,
    rate30: r.d30 ? r.connects30 / r.d30 : null,
    avgTalk: r.connects30 ? Math.round(r.talkSecs30 / r.connects30) : null,
    resting: r.today >= cap,
  }));
  // spam watch: a number with enough dials whose week connect rate is under half the team's
  const busy = out.filter(r => r.d7 >= 20);
  const team = busy.reduce((a, r) => a + r.connects7, 0) / Math.max(1, busy.reduce((a, r) => a + r.d7, 0));
  for (const r of out) {
    if (r.d7 >= 20 && team > 0 && r.connects7 === 0) r.warn = 'No one picked up in 7 days. It may be flagged as spam.';
    else if (r.d7 >= 20 && team > 0 && (r.rate7 ?? 0) < team / 2) r.warn = 'Connects less than half as often as your other numbers. It may be flagged as spam.';
  }
  return out.sort((a, b) => b.d30 - a.d30 || b.today - a.today || a.phone.localeCompare(b.phone));
}

/** Totals across every number, for the top of the report. */
export function numberTotals(rows: NumRow[]) {
  const s = (k: 'today' | 'd7' | 'd30' | 'connects7' | 'connects30' | 'voicemails30' | 'talkSecs30' | 'textsOut30' | 'textsIn30') => rows.reduce((a, r) => a + r[k], 0);
  const d7 = s('d7'), c7 = s('connects7'), c30 = s('connects30');
  return { numbers: rows.length, used7: rows.filter(r => r.d7 > 0).length, today: s('today'), d7, d30: s('d30'), rate7: d7 ? c7 / d7 : null,
    voicemails30: s('voicemails30'), avgTalk: c30 ? Math.round(s('talkSecs30') / c30) : null, texts30: s('textsOut30') + s('textsIn30'),
    warned: rows.filter(r => r.warn).length, resting: rows.filter(r => r.resting).length };
}

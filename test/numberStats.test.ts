import { describe, it, expect } from 'vitest';
import { numberStats, numberTotals, type Ev } from '../src/twilio/numberStats';

const NOW = Date.parse('2026-11-28T17:00:00Z');
const iso = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
let n = 0;
const dial = (from: string, h: number, agent = 'george'): Ev => ({ id: `d${++n}`, type: 'call.dialed', call_id: `CA${n}`, phone: '+15550001111', at: iso(h), agent_id: agent, payload: { from } });
const done = (parent: string, child: string, status: string, duration: number): Ev => ({ id: `c${child}`, type: 'call.completed', call_id: parent, phone: '+15550001111', at: iso(0), agent_id: null,
  payload: { data: { object: { id: child, status, duration } } } });

describe('numberStats', () => {
  it('counts dials, connects, voicemails and talk time per number', () => {
    n = 0;
    const ev: Ev[] = [dial('+16155550100', 1), dial('+16155550100', 2), dial('+16155550100', 31 * 24), dial('+12125550199', 50, 'gracie')];
    ev.push(done('CA1', 'K1', 'answered', 95), done('CA2', 'K2', 'answered', 40), done('CA4', 'K4', 'no-answer', 0));
    ev.push({ id: 'a', type: 'call.amd', call_id: 'K2', phone: null, at: iso(2), agent_id: null, payload: { answeredBy: 'machine_end_beep' } });
    ev.push({ id: 'm', type: 'message.sent', call_id: null, phone: 'x', at: iso(3), agent_id: 'george', payload: { from: '+16155550100' } });
    const rows = numberStats(['+16155550100', '+12125550199', '+13055550111'], ev, NOW, 'America/New_York', 100);
    const a = rows.find(r => r.phone === '6155550100')!;
    expect(a).toMatchObject({ today: 2, d7: 2, d30: 2, connects30: 1, voicemails30: 1, avgTalk: 95, textsOut30: 1, state: 'TN', agents: ['george'] });
    expect(a.rate7).toBe(0.5);
    expect(rows.find(r => r.phone === '3055550111')!.d30).toBe(0);
    expect(numberTotals(rows)).toMatchObject({ numbers: 3, used7: 2, today: 2 });
  });
  it('warns on a number that connects far less than the others', () => {
    n = 0;
    const ev: Ev[] = [];
    for (let i = 0; i < 25; i++) { ev.push(dial('+16155550100', 3)); ev.push(done(`CA${n}`, `K${n}`, 'answered', 60)); }
    for (let i = 0; i < 25; i++) ev.push(dial('+12125550199', 3));
    const rows = numberStats([], ev, NOW, 'America/New_York', 100);
    expect(rows.find(r => r.phone === '2125550199')!.warn).toMatch(/spam/);
    expect(rows.find(r => r.phone === '6155550100')!.warn).toBeNull();
  });
});

'use client';
// Team: what everyone is doing today, and a daily history of dials and results (George, 2026-11-27).
import { useMemo, useState } from 'react';
import type { Seed } from '../../src/app-store/agentSeeds';
import type { AgentId, AgentSetting } from '../../src/team/agents';
import { dayStats, liveState, spanHours, type DayStats } from '../../src/team/daily';
import { addDays, startOfDay, parts } from '../../src/rules/time';
import { TZ, timeOnly } from './shared';
import { Panel, fmt$, pctTxt } from './charts';
import { useSort } from './sort';

const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o });
const wdShort = f({ weekday: 'short' }), longDay = f({ weekday: 'long', month: 'long', day: 'numeric' });

/** One card per agent: are they dialing right now, and how today is going. */
export function TodayNow({ agents, all, now, onPick }: { agents: AgentSetting[]; all: Partial<Record<AgentId, Seed>>; now: number; onPick?: (id: AgentId) => void }) {
  const today = startOfDay(now, TZ), tomorrow = addDays(today, 1, TZ);
  const rows = agents.map(a => ({ a, s: dayStats(all[a.id]!.log, all[a.id]!.sales, today, tomorrow) }))
    .sort((x, y) => y.s.dials - x.s.dials);
  const dialing = rows.filter(r => liveState(r.s, now) === 'dialing').length;
  return (
    <Panel span={4} title="Today, right now" meta={`${dialing} dialing now · ${rows.reduce((t, r) => t + r.s.dials, 0).toLocaleString('en-US')} dials so far`}
      foot="Dialing now = a dial in the last 15 minutes. Click an agent for their health check.">
      <div className="tnow">
        {rows.map(({ a, s }) => {
          const st = liveState(s, now);
          return (
            <button key={a.id} className={`tncard ${st}`} onClick={() => onPick?.(a.id)}>
              <div className="tnhead"><i className={`dot ${st}`} /><b>{a.name}</b>
                <small>{st === 'dialing' ? 'Dialing now' : st === 'break' ? `Last dial ${timeOnly(s.last!)}` : 'No dials yet'}</small></div>
              <div className="tnnums">
                <span><b>{s.dials}</b>dials</span><span><b>{s.connects}</b>reached</span><span><b>{s.booked}</b>booked</span>
                <span className={s.sold ? 'won' : ''}><b>{s.sold ? fmt$(s.alp) : s.presented}</b>{s.sold ? `${s.sold} sold` : 'presented'}</span>
              </div>
              {s.first != null && <small className="tnspan">Started {timeOnly(s.first)}{spanHours(s) && ` · ${spanHours(s)} on the phone`}</small>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

type Metric = 'dials' | 'connects' | 'booked' | 'alp';
const METRICS: [Metric, string][] = [['dials', 'Dials'], ['connects', 'Reached'], ['booked', 'Booked'], ['alp', 'ALP']];

/** Agents × the last 14 days, shaded by the chosen number; pick a day for everyone's full numbers. */
export function DailyHistory({ agents, all, now }: { agents: AgentSetting[]; all: Partial<Record<AgentId, Seed>>; now: number }) {
  const today = startOfDay(now, TZ);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i - 13, TZ)), [today]);
  const [m, setM] = useState<Metric>('dials');
  const grid = useMemo(() => agents.map(a => ({ a, cells: days.map(dd => dayStats(all[a.id]!.log, all[a.id]!.sales, dd, addDays(dd, 1, TZ))) })),
    [agents, all, days]);
  // opens on the latest day anyone dialed (today once the dialing starts)
  const [day, setDay] = useState(() => [...days].reverse().find((_, k) => grid.some(g => g.cells[days.length - 1 - k].dials > 0)) ?? today);
  const val = (s: DayStats) => s[m];
  const max = Math.max(1, ...grid.flatMap(g => g.cells.map(val)));
  const di = days.indexOf(day);
  const rows = grid.map(g => ({ a: g.a, s: g.cells[di] }));
  const { sorted, th } = useSort(rows, { name: r => r.a.name, dials: r => r.s.dials, reached: r => r.s.dials ? r.s.connects / r.s.dials : null,
    booked: r => r.s.booked, presented: r => r.s.presented, sold: r => r.s.sold, alp: r => r.s.alp, first: r => r.s.first, last: r => r.s.last }, { key: 'dials', dir: -1 });
  const tot = rows.reduce((t, r) => ({ dials: t.dials + r.s.dials, connects: t.connects + r.s.connects, booked: t.booked + r.s.booked,
    presented: t.presented + r.s.presented, sold: t.sold + r.s.sold, alp: t.alp + r.s.alp }), { dials: 0, connects: 0, booked: 0, presented: 0, sold: 0, alp: 0 });
  const show = (n: number) => (m === 'alp' ? (n ? fmt$(n).replace('.00', '') : '') : n ? String(n) : '');
  return <>
    <Panel span={4} title="Daily history" meta={<div className="seg mini" role="group" aria-label="Which number">
      {METRICS.map(([k, l]) => <button key={k} className={m === k ? 'on' : ''} onClick={() => setM(k)}>{l}</button>)}</div>}
      foot="Last 14 days. Darker = more. Click a day to see everyone's numbers for it.">
      <div className="tscroll">
        <table className="rt dh">
          <thead><tr><th>Agent</th>{days.map(dd => <th key={dd} className={`dhd ${dd === day ? 'on' : ''} ${[0, 6].includes(parts(dd, TZ).wd) ? 'we' : ''}`}>
            <button onClick={() => setDay(dd)} title={longDay.format(dd)}>{wdShort.format(dd).slice(0, 2)}<small>{parts(dd, TZ).d}</small></button></th>)}<th className="num">14 days</th></tr></thead>
          <tbody>
            {grid.map(g => (
              <tr key={g.a.id}>
                <td><b>{g.a.name}</b></td>
                {g.cells.map((s, i) => <td key={i} className={`dhc ${days[i] === day ? 'on' : ''} ${val(s) / max > 0.55 ? 'hi' : ''}`} onClick={() => setDay(days[i])}
                  data-tip={`${g.a.name}, ${longDay.format(days[i])}: ${s.dials} dials · ${s.connects} reached · ${s.booked} booked · ${s.sold} sold${s.alp ? ` (${fmt$(s.alp)})` : ''}`}
                  style={{ ['--a' as string]: (val(s) / max).toFixed(3) }}>{show(val(s))}</td>)}
                <td className="num"><b>{show(g.cells.reduce((t, s) => t + val(s), 0)) || '0'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
    <Panel span={4} title={longDay.format(day)} meta={`${tot.dials.toLocaleString('en-US')} dials · ${tot.booked} booked · ${tot.sold} sold${tot.alp ? ` · ${fmt$(tot.alp)}` : ''}`}>
      <div className="tscroll">
        <table className="rt">
          <thead><tr>{th('name', 'Agent')}{th('dials', 'Dials', 'num')}{th('reached', 'Reached', 'num')}{th('booked', 'Booked', 'num')}{th('presented', 'Presented', 'num')}
            {th('sold', 'Sales', 'num')}{th('alp', 'ALP', 'num')}{th('first', 'First dial', 'num')}{th('last', 'Last dial', 'num')}<th className="num">On the phone</th></tr></thead>
          <tbody>
            {sorted.map(({ a, s }) => (
              <tr key={a.id} className={s.dials ? '' : 'muted'}>
                <td><b>{a.name}</b></td><td className="num">{s.dials}</td><td className="num">{s.dials ? `${s.connects} (${pctTxt(s.connects, s.dials)})` : '—'}</td>
                <td className="num">{s.booked}</td><td className="num">{s.presented}</td><td className="num">{s.sold}</td><td className="num">{s.alp ? fmt$(s.alp) : '—'}</td>
                <td className="num">{s.first != null ? timeOnly(s.first) : '—'}</td><td className="num">{s.last != null ? timeOnly(s.last) : '—'}</td>
                <td className="num">{spanHours(s) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  </>;
}

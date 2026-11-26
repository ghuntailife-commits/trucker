// Team: the leaderboard, each agent's numbers, the daily health check and the Monday coaching notes.
// George (admin) sees everyone and can open any agent's screen; the boss sees results and totals only.
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Team } from '../../src/app-store/useTeam';
import { loadAgentData } from '../../src/app-store/useTeam';
import type { Seed } from '../../src/app-store/agentSeeds';
import type { AgentId, AgentSetting } from '../../src/team/agents';
import { visibleAgents } from '../../src/team/agents';
import * as R from '../../src/reports/results';
import { healthCheck, healthCount, type Finding } from '../../src/team/health';
import { mondayNote, type CoachNote } from '../../src/team/coaching';
import { addDays, startOfDay, parts, md } from '../../src/rules/time';
import { TZ } from './shared';
import { Panel, Kpi, Legend, Columns, fmt$, fmtK, pctTxt, type Hue } from './charts';
import { useTips } from './results';

type RangeKind = 'week' | 'lastweek' | 'month' | '30d';
const RANGES: [RangeKind, string][] = [['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['30d', 'Last 30 days']];
const HUE: Record<AgentId, Hue> = { george: 'a1', austin: 'a2', gracie: 'a3' };
const wdIdx = (t: number) => (parts(t, TZ).wd + 6) % 7;
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o });
const mdShort = f({ month: 'short', day: 'numeric' }), wdShort = f({ weekday: 'short' });

function rangeOf(k: RangeKind, now: number): R.Range {
  const today = startOfDay(now, TZ), mon = addDays(today, -wdIdx(now), TZ);
  if (k === 'week') return { from: mon, to: addDays(today, 1, TZ), label: 'This week' };
  if (k === 'lastweek') return { from: addDays(mon, -7, TZ), to: mon, label: 'Last week' };
  return R.rangeFor(k === 'month' ? 'month' : '30d', now, TZ);
}

export interface BoardRow { a: AgentSetting; alp: number; sold: number; presented: number; scheduled: number; noShows: number; calledInto: number;
  dials: number; connects: number; monthAlp: number }
export function boardRow(a: AgentSetting, s: Seed, r: R.Range, now: number): BoardRow {
  const fu = R.funnel(s.log, s.sales, r), m = R.rangeFor('month', now, TZ);
  const sum = (from: number, to: number) => s.sales.filter(x => x.at >= from && x.at < to).reduce((t, x) => t + x.alp, 0);
  return { a, alp: sum(r.from, r.to), sold: fu.sold, presented: fu.presented, scheduled: fu.scheduled, noShows: fu.noShows,
    calledInto: fu.calledInto, dials: fu.dials, connects: fu.connects, monthAlp: sum(m.from, m.to) };
}
const showRate = (b: BoardRow) => { const shows = b.presented - b.calledInto; return shows + b.noShows ? shows / (shows + b.noShows) : 0; };

export function TeamPage({ t, now, live, onViewAs, onDial }: {
  t: Team; now: number; live?: { id: AgentId; data: Seed };
  onViewAs?: (id: AgentId) => void; onDial?: (id: string) => void;
}) {
  const agents = visibleAgents({ id: t.viewer, role: t.role }, t.team);
  const [data, setData] = useState<Partial<Record<AgentId, Seed>>>({});
  const [rk, setRk] = useState<RangeKind>('month');
  const [sel, setSel] = useState<AgentId>(agents[0]?.id ?? 'george');
  const boss = t.role === 'boss';
  useTips();

  useEffect(() => {
    let alive = true;
    Promise.all(agents.filter(a => a.id !== live?.id).map(async a => [a.id, await loadAgentData(a.id, now, TZ)] as const))
      .then(rows => { if (alive) setData(d => ({ ...d, ...Object.fromEntries(rows) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.map(a => a.id).join(), live?.id]);
  const all: Partial<Record<AgentId, Seed>> = live ? { ...data, [live.id]: live.data } : data;
  const ready = agents.every(a => all[a.id]);
  const r = rangeOf(rk, now);

  const board = useMemo(() => (ready ? agents.map(a => boardRow(a, all[a.id]!, r, now)).sort((x, y) => y.alp - x.alp || y.presented - x.presented) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, rk, now, all.george, all.austin, all.gracie, t.team]);
  if (!ready) return <div className="respage"><div className="empty">Loading the team…</div></div>;

  const tot = board.reduce((acc, b) => ({ alp: acc.alp + b.alp, sold: acc.sold + b.sold, presented: acc.presented + b.presented,
    scheduled: acc.scheduled + b.scheduled, dials: acc.dials + b.dials, connects: acc.connects + b.connects }),
    { alp: 0, sold: 0, presented: 0, scheduled: 0, dials: 0, connects: 0 });
  const maxAlp = Math.max(1, ...board.map(b => b.alp));

  // the last 6 Mon–Sun weeks of ALP, and the last 14 days of dials, per agent
  const mon = addDays(startOfDay(now, TZ), -wdIdx(now), TZ);
  const weeks = Array.from({ length: 4 }, (_, i) => addDays(mon, -7 * (3 - i), TZ));
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(now, TZ), i - 13, TZ));
  const alpIn = (s: Seed, a: number, b: number) => s.sales.filter(x => x.at >= a && x.at < b).reduce((t2, x) => t2 + x.alp, 0);
  const dialsIn = (s: Seed, a: number, b: number) => s.log.filter(e => e.kind === 'Dial' && e.at >= a && e.at < b).reduce((t2, e) => t2 + e.count, 0);
  const weekCols = weeks.map(w => {
    const to = addDays(w, 7, TZ);
    return { label: mdShort.format(w), tip: `Week of ${mdShort.format(w)}: ${agents.map(a => `${a.name} ${fmt$(alpIn(all[a.id]!, w, to))}`).join(' · ')}`,
      bars: agents.map(a => ({ v: alpIn(all[a.id]!, w, to), hue: HUE[a.id], tip: `${a.name}, week of ${mdShort.format(w)}: ${fmt$(alpIn(all[a.id]!, w, to))} ALP` })) };
  });
  const dayCols = days.map(dd => {
    const to = addDays(dd, 1, TZ);
    return { label: wdShort.format(dd).slice(0, 2), sub: String(parts(dd, TZ).d), on: dd === startOfDay(now, TZ),
      tip: `${md(dd, TZ)}: ${agents.map(a => `${a.name} ${dialsIn(all[a.id]!, dd, to)}`).join(' · ')} dials`,
      bars: agents.map(a => ({ v: dialsIn(all[a.id]!, dd, to), hue: HUE[a.id], tip: `${a.name}, ${md(dd, TZ)}: ${dialsIn(all[a.id]!, dd, to)} dials` })) };
  });
  const legend = agents.map(a => [HUE[a.id], a.name] as [Hue, string]);
  const selA = agents.find(a => a.id === sel) ?? agents[0];

  return (
    <div className="respage teampage">
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{boss ? 'Results and totals' : `${agents.length} agents · ${t.team.agents.filter(a => a.quo).map(a => a.name).join(' and ')} on Quo`}</div>
          <h1>Team</h1>
        </div>
        <div className="rtools">
          <div className="seg mini" role="group" aria-label="Date range">
            {RANGES.map(([k, l]) => <button key={k} className={rk === k ? 'on' : ''} onClick={() => setRk(k)}>{l}</button>)}
          </div>
        </div>
      </section>
      <div className="rgrid">
        <div className="span4 kgrid k6" aria-label="Team totals">
            <Kpi label="Team ALP" value={fmt$(tot.alp)} tone="c-sold" sub={`${r.label} · ${mdShort.format(r.from)} – ${mdShort.format(r.to - 1)}`} />
            <Kpi label="Sales" value={tot.sold} />
            <Kpi label="Presented" value={tot.presented} sub={`close ${pctTxt(tot.sold, tot.presented)}`} />
            <Kpi label="Booked" value={tot.scheduled} />
            <Kpi label="Dials" value={tot.dials.toLocaleString('en-US')} />
            <Kpi label="Reached" value={pctTxt(tot.connects, tot.dials)} sub={`${tot.connects} people`} />
        </div>

        <Panel span={4} title="Leaderboard" meta={boss ? "Ranked by ALP" : "Ranked by ALP · click an agent for their health check and coaching note"}>
          <div className="tscroll board">
            <table className="rt lb">
              <thead><tr><th>#</th><th>Agent</th><th className="alpc">ALP</th><th className="num">Sales</th><th className="num">Presented</th><th className="num">Close</th>
                <th className="num">Booked</th><th className="num">Show rate</th><th className="num">Dials</th><th className="num">Reached</th><th className="goalc">Month goal</th></tr></thead>
              <tbody>
                {board.map((b, i) => {
                  const g = b.a.goal ? b.monthAlp / b.a.goal : 0;
                  return (
                    <tr key={b.a.id} className={`pick ${sel === b.a.id && !boss ? 'sel' : ''}`} tabIndex={0} onClick={() => setSel(b.a.id)}
                        onKeyDown={e => { if (e.key === 'Enter') setSel(b.a.id); }}>
                      <td className="muted">{i + 1}</td>
                      <td><span className="agentn"><i className={`sw ${HUE[b.a.id]}`} /><b>{b.a.name}</b>{b.a.role === 'admin' && <small>admin</small>}{b.a.quo && <small className="quo">Quo</small>}</span></td>
                      <td className="alpc"><span className="inbar"><i className={HUE[b.a.id]} style={{ width: `${100 * b.alp / maxAlp}%` }} /></span><b>{fmt$(b.alp)}</b></td>
                      <td className="num">{b.sold}</td><td className="num">{b.presented}</td><td className="num">{pctTxt(b.sold, b.presented)}</td>
                      <td className="num">{b.scheduled}</td><td className="num">{b.presented - b.calledInto + b.noShows ? Math.round(100 * showRate(b)) + '%' : '—'}</td>
                      <td className="num">{b.dials.toLocaleString('en-US')}</td><td className="num">{pctTxt(b.connects, b.dials)}</td>
                      <td className="goalc" data-tip={`${b.a.name}: ${fmt$(b.monthAlp)} of ${fmt$(b.a.goal)} this month`}>
                        <span className="meter sm"><i className="sold" style={{ width: Math.min(g, 1) * 100 + '%' }} /></span><small>{Math.round(g * 100)}% of {fmtK(b.a.goal)}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel span={2} title="ALP by week" meta={<Legend items={legend} />}>
          <Columns cols={weekCols} height={170} />
        </Panel>
        <Panel span={2} title="Dials by day" meta={<Legend items={legend} />} foot="Last 14 days, stacked by agent. Hover a bar for each agent's count.">
          <Columns cols={dayCols} height={170} stacked />
        </Panel>

        {!boss && selA && <AgentDetail key={selA.id} a={selA} s={all[selA.id]!} now={now} isLive={live?.id === selA.id}
          onViewAs={onViewAs} onDial={onDial} t={t} />}
        {boss && <p className="hint span4 bossnote">You are seeing results and totals only. Contact names, numbers and notes stay with each agent.</p>}
      </div>
    </div>
  );
}

function AgentDetail({ a, s, now, isLive, onViewAs, onDial, t }: { a: AgentSetting; s: Seed; now: number; isLive: boolean; t: Team;
  onViewAs?: (id: AgentId) => void; onDial?: (id: string) => void }) {
  const findings = useMemo(() => healthCheck({ contacts: s.contacts, sales: s.sales, noSales: s.noSales, now, tz: TZ }), [s, now]);
  const note = useMemo(() => mondayNote({ name: a.name, log: s.log, sales: s.sales, noSales: s.noSales, now, tz: TZ, goal: a.goal }), [s, now, a]);
  const byId = useMemo(() => new Map(s.contacts.map(c => [c.id, c])), [s.contacts]);
  const open = isLive ? onDial : undefined;
  return <>
    <Panel span={2} title={`Health check · ${a.name}`} meta={<HealthMeta f={findings} />}
      foot={isLive ? 'Runs every morning. Click a contact to open it in the dialer.' : <>Runs every morning. <button className="linkish" onClick={() => onViewAs?.(a.id)}>Open {a.name}&rsquo;s screen</button> to fix these.</>}>
      <HealthList findings={findings} name={id => { const c = byId.get(id); return c ? `${c.first} ${c.last}` : id; }} onOpen={open} />
    </Panel>
    <Panel span={2} title={`Monday coaching note · ${a.name}`} meta={a.coaching ? `Mondays ${t.team.coachingHour} AM ET` : 'Off in Settings'}
      foot="Written from their own numbers. Goes out by email at go-live; this is the preview.">
      <CoachCard n={note} />
    </Panel>
  </>;
}

function HealthMeta({ f }: { f: Finding[] }) {
  const n = healthCount(f);
  if (!f.length) return <span className="okline">All clear</span>;
  return <span>{n.fix ? <b className="c-noshow">{n.fix} to fix</b> : null}{n.fix && n.check ? ' · ' : ''}{n.check ? `${n.check} to look at` : ''}</span>;
}

const LEVEL: Record<Finding['level'], string> = { fix: 'Fix', check: 'Look', info: 'FYI' };
export function HealthList({ findings, name, onOpen }: { findings: Finding[]; name: (id: string) => string; onOpen?: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(findings.find(f => f.level === 'fix')?.key ?? null);
  if (!findings.length) return <p className="hint">Nothing to fix today. No passed appointments without a result, no late callbacks, no duplicate numbers.</p>;
  return (
    <div className="health">
      {findings.map(f => (
        <div className={`hf ${f.level} ${open === f.key ? 'on' : ''}`} key={f.key}>
          <button className="hfh" aria-expanded={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)}>
            <span className={`lvl ${f.level}`}>{LEVEL[f.level]}</span><b>{f.title}</b><span className="cnt">{f.ids.length.toLocaleString('en-US')}</span>
          </button>
          {open === f.key && (
            <div className="hfb">
              <p className="hint">{f.detail}</p>
              <ul>
                {f.ids.slice(0, 12).map(id => (
                  <li key={id}>
                    {onOpen ? <button className="linkish" onClick={() => onOpen(id)}>{name(id)}</button> : <span>{name(id)}</span>}
                    {f.about?.[id] && <small>{f.about[id]}</small>}
                  </li>
                ))}
              </ul>
              {f.ids.length > 12 && <p className="hint">and {(f.ids.length - 12).toLocaleString('en-US')} more</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CoachCard({ n }: { n: CoachNote }) {
  const copy = () => { try { navigator.clipboard?.writeText(n.text); } catch { /* */ } };
  return (
    <div className="coach">
      <div className="mailhead"><span>Subject</span><b>{n.subject}</b></div>
      <p>{n.hello}</p>
      <p className="hint">Last week ({n.week.label}) next to the week before:</p>
      <div className="coachnums">{n.lines.map(l => <div className="cn" key={l.label}><span>{l.label}</span><b>{l.now}</b>
        <span className={`tr ${l.trend}`}>{l.trend === 'up' ? '▲' : l.trend === 'down' ? '▼' : '•'}</span><span className="muted">was {l.before}</span></div>)}</div>
      {n.wins.length > 0 && <><div className="eyebrow">What went well</div><ul>{n.wins.map(w => <li key={w}>{w}</li>)}</ul></>}
      <div className="focus">
        <div className="eyebrow">This week, one thing</div>
        <b>{n.focus.title}</b>
        <p>{n.focus.why}</p>
        <ul>{n.focus.how.map(h => <li key={h}>{h}</li>)}</ul>
      </div>
      {n.bestTime && <p>{n.bestTime}</p>}
      {n.pace && <p><b>{n.pace}</b></p>}
      <button className="linkish" onClick={copy}>Copy the note</button>
    </div>
  );
}

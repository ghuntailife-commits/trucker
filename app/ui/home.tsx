'use client';
// Home (George, 2026-11-26): the daily production note front and center, then cards with what matters today.
import { useState } from 'react';
import type { Page } from '../../src/team/agents';
import type { DailyNote } from '../../src/home/dailyNote';
import type { CoachNote } from '../../src/team/coaching';
import { NAV_ICON } from './sidebar';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const Icon = ({ p }: { p: Page }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={NAV_ICON[p]} /></svg>;

export interface HomeAppt { id: string; at: number | null; name: string; company: string; pill: string; tone: string }
export interface HomeProps {
  note: DailyNote;
  stats: { dials: number; connects: number; scheduled: number; presented: number; sold: number; left: number };
  appts: HomeAppt[];
  waiting: { callbacks: number; followUps: number; noShows: number; newNumbers: number };
  coach: CoachNote | null;
  health: { fix: number; check: number };
  sheet: { waiting: number; look: number; needs: number };
  wins: { id: string; name: string; alp: number; at: number }[];
  /** Running standard and trial ALP at the end of each day this month so far. */
  monthDays: MonthDay[];
  /** When nothing is left today: the next day's appointments and its label. */
  nextAppts: HomeAppt[]; nextLabel: string;
  daysInMonth: number;
  go: (p: Page) => void;
  openHealth: () => void;
  onDial: (id: string) => void;
  timeOnly: (ms: number) => string;
  md: (ms: number) => string;
}

export interface MonthDay { std: number; trial: number; daySales: number; dayAlp: number }

/** Round a top value up to a friendly axis step. */
function niceStep(max: number) {
  const raw = max / 5, mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= raw) ?? raw;
}

/** Month to date: standard and trial ALP stacked, against an even pace to the goal. Hover or drag for each day. */
function PaceChart({ days, goal, daysInMonth, label }: { days: MonthDay[]; goal: number; daysInMonth: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 230, pad = { l: 48, r: 14, t: 18, b: 26 };
  const last = days.at(-1) ?? { std: 0, trial: 0, daySales: 0, dayAlp: 0 };
  const want = Math.max(goal, last.std + last.trial, 1) * 1.06;
  const step = niceStep(want), top = Math.ceil(want / step) * step;
  const x = (d: number) => pad.l + (d / daysInMonth) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const pts = (f: (d: MonthDay) => number) => [`${x(0)},${y(0)}`, ...days.map((v, i) => `${x(i + 1)},${y(f(v))}`)];
  const stdTop = pts(d => d.std), allTop = pts(d => d.std + d.trial);
  const base = `${x(days.length)},${y(0)} ${x(0)},${y(0)}`;
  const trialArea = [...allTop, ...[...stdTop].reverse()].join(' ');
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const kfmt = (v: number) => v >= 1000 ? `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : `$${v}`;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const d = Math.round(((vx - pad.l) / (W - pad.l - pad.r)) * daysInMonth);
    setHover(Math.max(1, Math.min(daysInMonth, d)));
  };
  const hd = hover != null ? days[hover - 1] : undefined;
  const paceAt = (d: number) => (goal * d) / daysInMonth;
  const tipLeft = hover != null ? (x(hover) / W) * 100 : 0;
  const xt = [1, 5, 10, 15, 20, 25].filter(d => daysInMonth - d > 2).concat(daysInMonth);
  return (
    <div className="pacewrap">
      <div className="plegend" aria-hidden="true">
        <span><i className="sw pace" />Even pace to your goal</span>
        <span className="phint">Hover or tap a day</span>
      </div>
      <svg className="pace" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${label} ALP so far: ${money(last.std + last.trial)} (${money(last.std)} standard, ${money(last.trial)} trial) against a ${money(goal)} goal`}>
        {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t ? 'grid' : 'axis'} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">{kfmt(t)}</text></g>)}
        <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} className="goalline" />
        <text x={pad.l + 6} y={y(goal) - 6} className="goallbl">Goal {money(goal)}</text>
        <line x1={x(0)} y1={y(0)} x2={x(daysInMonth)} y2={y(goal)} className="paceline2" />
        {days.length > 0 && <>
          <polygon points={`${stdTop.join(' ')} ${base}`} className="area std" />
          {last.trial > 0 && <polygon points={trialArea} className="area trial" />}
          <polyline points={stdTop.join(' ')} className="topline std" />
          {last.trial > 0 && <polyline points={allTop.join(' ')} className="topline trial" />}
          <circle cx={x(days.length)} cy={y(last.std + last.trial)} r={4.5} className="alpdot" />
          <text x={x(days.length) - 8} y={y(last.std + last.trial) - 10} textAnchor="end" className="nowlbl">{money(last.std + last.trial)}</text>
        </>}
        {xt.map(d => <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="tick">{d}</text>)}
        {hover != null && <g className="cross"><line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />
          {hd && <circle cx={x(hover)} cy={y(hd.std + hd.trial)} r={4.5} className="alpdot" />}
          <circle cx={x(hover)} cy={y(paceAt(hover))} r={3.5} className="pacedot" /></g>}
        <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" style={{ touchAction: 'pan-y' }}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className={`ptip ${tipLeft > 60 ? 'left' : ''}`} style={{ left: tipLeft + '%' }}>
          <b>{label} {hover}</b>
          {hd ? <>
            <span>{hd.daySales ? `${hd.daySales} ${hd.daySales === 1 ? 'sale' : 'sales'} that day, ${money(hd.dayAlp)}` : 'No sales that day'}</span>
            <span className="row"><i className="sw std" />Standard<em>{money(hd.std)}</em></span>
            <span className="row"><i className="sw trial" />Trial<em>{money(hd.trial)}</em></span>
            <span className="row tot">Month so far<em>{money(hd.std + hd.trial)}</em></span>
            <span className={hd.std + hd.trial >= paceAt(hover) ? 'up' : 'down'}>{money(Math.abs(hd.std + hd.trial - paceAt(hover)))} {hd.std + hd.trial >= paceAt(hover) ? 'ahead of' : 'behind'} pace</span>
          </> : <span>Pace by then: {money(paceAt(hover))}</span>}
        </div>
      )}
    </div>
  );
}

function ApptList({ list, h }: { list: HomeAppt[]; h: HomeProps }) {
  return <ul className="hlist">{list.slice(0, 6).map((a, i) => (
    <li key={a.id + i}><button onClick={() => h.onDial(a.id)}><span className="t">{a.at ? h.timeOnly(a.at) : '—'}</span><b>{a.name}</b><small>{a.company}</small>
      <span className={`spill ${a.tone}`}>{a.pill}</span></button></li>))}
    {list.length > 6 && <li className="more">and {list.length - 6} more</li>}</ul>;
}

export function HomePage(h: HomeProps) {
  const { note, stats: s } = h, m = note.month;
  const wkDelta = note.week.alp - note.week.prevAlp;
  const g = Math.max(m.goal, 1), stdW = Math.min(100, (m.std / g) * 100), trialW = Math.min(100 - stdW, (m.trial / g) * 100);
  return (
    <div className="home">
      <section className="hcard note">
        <div className="eyebrow">Daily note · rules draft, Claude writes it at go-live</div>
        <h1>{note.hello}</h1>
        <p className="lead">{note.lines[0]}</p>
        <div className="goalbar" role="img" aria-label={`${m.pct}% of the monthly goal: ${money(m.std)} standard and ${money(m.trial)} trial`}>
          <i className="std" style={{ width: stdW + '%' }} />
          {m.trial > 0 && <i className="trial" style={{ width: trialW + '%' }} />}
        </div>
        <div className="glegend"><span><i className="sw std" />Standard {money(m.std)}</span><span><i className="sw trial" />Trial {money(m.trial)}</span>
          <span className="gpct">{m.pct}% of {money(m.goal)}</span></div>
        <PaceChart days={h.monthDays} goal={m.goal} daysInMonth={h.daysInMonth} label={m.label} />
        <div className="nlines">{note.lines.slice(1).map((l, i) => <p key={i}>{l}</p>)}</div>
        <div className="nkpis">
          <div><span>{m.label} ALP</span><b className="green">{money(m.alp)}</b></div>
          <div><span>To goal</span><b>{m.toGo ? money(m.toGo) : 'Hit it'}</b></div>
          <div><span>Needed a day</span><b>{m.toGo ? money(m.perDay) : '—'}</b></div>
          <div><span>This week</span><b>{money(note.week.alp)}</b><small className={wkDelta >= 0 ? 'up' : 'down'}>{wkDelta >= 0 ? '▲' : '▼'} {money(Math.abs(wkDelta))} vs last week</small></div>
        </div>
        <div className="nbtns"><button className="btn primary" onClick={() => h.go('today')}>Start calling</button>
          <button className="btn" onClick={() => h.go('results')}>See results</button></div>
      </section>

      <section className="hcard today">
        <header><Icon p="today" /><h2>Today</h2><button className="linkish" onClick={() => h.go('today')}>Open</button></header>
        <div className="hstats">
          {([['Left to dial', s.left], ['Dials', s.dials], ['Connects', s.connects], ['Booked', s.scheduled], ['Presented', s.presented], ['Sold', s.sold]] as [string, number][])
            .map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}
        </div>
      </section>

      <section className="hcard appts">
        <header><Icon p="appts" /><h2>Appointments today</h2><button className="linkish" onClick={() => h.go('appts')}>Open</button></header>
        {h.appts.length ? <ApptList list={h.appts} h={h} /> : <p className="hint">Nothing booked today.</p>}
        {h.nextAppts.length > 0 && <>
          <div className="nextday">{h.nextLabel} · {h.nextAppts.length} booked</div>
          <ApptList list={h.nextAppts} h={h} />
        </>}
      </section>

      <section className="hcard waiting">
        <header><Icon p="today" /><h2>Waiting on Today</h2></header>
        <div className="wgrid">
          {([['Callbacks', h.waiting.callbacks, 'amber'], ['Follow-ups', h.waiting.followUps, 'violet'], ['No-shows', h.waiting.noShows, 'red'], ['New numbers', h.waiting.newNumbers, 'blue']] as [string, number, string][])
            .map(([l, v, t]) => <button key={l} className={`w-${t}`} onClick={() => h.go('today')}><b>{v}</b><span>{l}</span></button>)}
        </div>
      </section>

      {h.coach && !h.coach.quiet && (
        <section className="hcard coach">
          <header><Icon p="results" /><h2>This week&rsquo;s focus</h2></header>
          <b className="ftitle">{h.coach.focus.title}</b>
          <p>{h.coach.focus.why}</p>
          {h.coach.bestTime && <p className="hint">{h.coach.bestTime}</p>}
        </section>
      )}

      <section className="hcard wins">
        <header><Icon p="results" /><h2>Recent sales</h2><button className="linkish" onClick={() => h.go('results')}>Results</button></header>
        {h.wins.length ? <ul className="hlist">{h.wins.map((w, i) => <li key={i}><button onClick={() => h.onDial(w.id)}><span className="t">{h.md(w.at)}</span><b>{w.name}</b><span className="alp">{money(w.alp)}</span></button></li>)}</ul>
          : <p className="hint">No sales yet.</p>}
      </section>

      <section className="hcard health">
        <header><Icon p="contacts" /><h2>Health check</h2></header>
        <p>{h.health.fix + h.health.check ? <><b>{h.health.fix}</b> to fix and <b>{h.health.check}</b> to look at in your contacts.</> : 'All clear today.'}</p>
        <button className="btn sm" onClick={h.openHealth}>Open health check</button>
      </section>

      <section className="hcard sheet">
        <header><Icon p="needs" /><h2>Numbers</h2><button className="linkish" onClick={() => h.go('needs')}>Needs Number</button></header>
        <div className="wgrid three">
          <button onClick={() => h.go('needs')}><b>{h.sheet.needs.toLocaleString('en-US')}</b><span>Need a number</span></button>
          <button onClick={() => h.go('needs')}><b>{h.sheet.waiting}</b><span>On your number sheet</span></button>
          <button className={h.sheet.look ? 'w-red' : ''} onClick={() => h.go('needs')}><b>{h.sheet.look}</b><span>Need a look</span></button>
        </div>
      </section>
    </div>
  );
}

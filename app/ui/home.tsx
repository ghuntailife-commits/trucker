'use client';
// Home (George, 2026-11-26): the daily production note front and center, then cards with what matters today.
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
  /** Cumulative ALP at the end of each day this month so far. */
  monthDays: number[];
  daysInMonth: number;
  go: (p: Page) => void;
  openHealth: () => void;
  onDial: (id: string) => void;
  timeOnly: (ms: number) => string;
  md: (ms: number) => string;
}

function PaceChart({ days, goal, daysInMonth }: { days: number[]; goal: number; daysInMonth: number }) {
  const W = 560, H = 120, pad = { l: 4, r: 4, t: 10, b: 18 };
  const max = Math.max(goal, ...days, 1);
  const x = (d: number) => pad.l + (d / daysInMonth) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const pts = days.map((v, i) => `${x(i + 1)},${y(v)}`).join(' ');
  const last = days.at(-1) ?? 0;
  return (
    <svg className="pace" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`ALP this month: ${money(last)} against a ${money(goal)} goal`}>
      <line x1={x(0)} y1={y(0)} x2={x(daysInMonth)} y2={y(goal)} className="goalline" />
      <text x={x(daysInMonth)} y={y(goal) - 4} textAnchor="end" className="goallbl">Goal {money(goal)}</text>
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="axis" />
      {days.length > 0 && <polyline points={`${x(0)},${y(0)} ${pts}`} className="alpline" />}
      {days.map((v, i) => <circle key={i} cx={x(i + 1)} cy={y(v)} r={i === days.length - 1 ? 4 : 0} className="alpdot"><title>{`Day ${i + 1}: ${money(v)}`}</title></circle>)}
      {[1, 8, 15, 22, 29].filter(d => d <= daysInMonth).map(d => <text key={d} x={x(d)} y={H - 4} textAnchor="middle" className="tick">{d}</text>)}
    </svg>
  );
}

export function HomePage(h: HomeProps) {
  const { note, stats: s } = h, m = note.month;
  const wkDelta = note.week.alp - note.week.prevAlp;
  return (
    <div className="home">
      <section className="hcard note">
        <div className="eyebrow">Daily note · rules draft, Claude writes it at go-live</div>
        <h1>{note.hello}</h1>
        {note.lines.map((l, i) => <p key={i} className={i === 0 ? 'lead' : ''}>{l}</p>)}
        <div className="goalbar" role="img" aria-label={`${m.pct}% of the monthly goal`}><i style={{ width: Math.min(100, m.pct) + '%' }} /></div>
        <div className="nkpis">
          <div><span>{m.label} ALP</span><b className="green">{money(m.alp)}</b></div>
          <div><span>To goal</span><b>{m.toGo ? money(m.toGo) : 'Hit it'}</b></div>
          <div><span>Needed a day</span><b>{m.toGo ? money(m.perDay) : '—'}</b></div>
          <div><span>This week</span><b>{money(note.week.alp)}</b><small className={wkDelta >= 0 ? 'up' : 'down'}>{wkDelta >= 0 ? '▲' : '▼'} {money(Math.abs(wkDelta))} vs last week</small></div>
        </div>
        <PaceChart days={h.monthDays} goal={m.goal} daysInMonth={h.daysInMonth} />
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
        {h.appts.length ? <ul className="hlist">{h.appts.slice(0, 7).map((a, i) => (
          <li key={a.id + i}><button onClick={() => h.onDial(a.id)}><span className="t">{a.at ? h.timeOnly(a.at) : '—'}</span><b>{a.name}</b><small>{a.company}</small>
            <span className={`spill ${a.tone}`}>{a.pill}</span></button></li>))}</ul>
          : <p className="hint">Nothing booked today.</p>}
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

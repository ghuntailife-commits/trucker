'use client';
// System status, admin only (George, 2026-11-27): is everything working for every agent, without waiting for someone
// to say something broke. Refreshes every minute.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel } from './charts';
import { db, LIVE } from '../../src/live/supabase';
import { linesFor, worst, type AgentRaw, type Level } from '../../src/status/check';
import type { Team } from '../../src/app-store/useTeam';

type Crash = { agent: string; at: number; message: string; stack: string; page: string; ua: string };
type Resp = { now: number; build: string; agents: AgentRaw[]; crashes?: Crash[]; setup: { anthropic: boolean; google: boolean; quo: string[]; unassignedQuo: number }; error?: string };
const DOT: Record<Level, [string, string]> = { ok: ['All good', 'green'], warn: ['Look', 'amber'], bad: ['Problem', 'red'], off: ['Not used', 'grey'] };
const ORDER: Record<Level, number> = { bad: 0, warn: 1, ok: 2, off: 3 };

export function StatusPage({ t }: { t: Team }) {
  const [r, setR] = useState<Resp | null>(null);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(0);
  const load = useCallback(async () => {
    if (!LIVE) { setErr('System status works on the live site (dispatchdialer.com), not in the demo.'); return; }
    try {
      const { data } = await db().auth.getSession();
      const res = await fetch('/api/admin/status', { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, cache: 'no-store' });
      const j = await res.json() as Resp;
      if (!res.ok || j.error) throw new Error(j.error ?? `Status failed (${res.status})`);
      setR(j); setErr(''); setAt(Date.now());
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 60_000); return () => clearInterval(id); }, [load]);

  const name = useMemo(() => new Map(t.team.agents.map(a => [a.id, a.name])), [t.team.agents]);
  const missing = r ? r.agents.reduce((n, a) => n + (a.quo?.notesMissing ?? 0), 0) : 0;
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState('');
  const fix = async () => {
    setFixing(true); setFixMsg('');
    try {
      const { data } = await db().auth.getSession();
      const res = await fetch('/api/admin/status', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
      const j = await res.json() as { error?: string; fixed?: number; empty?: number; failed?: number; left?: number };
      if (!res.ok || j.error) throw new Error(j.error ?? `Failed (${res.status})`);
      setFixMsg(`${j.fixed} filled in, ${j.empty} were hang-ups with nothing to note${j.left ? `, ${j.left} still to go (click again)` : ''}`);
      void load();
    } catch (e) { setFixMsg((e as Error).message); } finally { setFixing(false); }
  };
  const rows = useMemo(() => (r ? r.agents.map(a => { const ls = linesFor(a, r.now, r.build); return { a, ls, w: worst(ls) }; })
    .sort((x, y) => ORDER[x.w] - ORDER[y.w] || (name.get(x.a.id) ?? x.a.id).localeCompare(name.get(y.a.id) ?? y.a.id)) : []), [r, name]);
  const counts = useMemo(() => { const c = { bad: 0, warn: 0, ok: 0, off: 0 }; for (const x of rows) c[x.w]++; return c; }, [rows]);

  return (
    <div className="respage setpage">
      <section className="hero"><div className="title"><div className="eyebrow">Only you see this</div><h1>System status</h1>
        <p className="muted">{at ? `Checked ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · refreshes every minute` : 'Checking…'}{' '}
          <button className="linkish" onClick={() => void load()}>Check now</button></p></div>
        {r && <div className="cells">{(['bad', 'warn', 'ok'] as Level[]).map(l => <div className="cell" key={l}><span>{DOT[l][0]}</span><b className={l === 'bad' ? 'red' : l === 'warn' ? 'amber' : 'green'}>{counts[l]}</b></div>)}</div>}
      </section>
      {err && <p className="preview err">{err}</p>}
      {r && <div className="rgrid">
        {!!r.crashes?.length && <Panel span={4} title="Screen errors (last 7 days)" meta={<span className="spill red">{r.crashes.length}</span>}
          foot="The newest error per agent. They saw a Reload button; nothing saved was lost.">
          <div className="stlines">{r.crashes.map(c => <div key={c.agent + c.at}><b>{c.agent}</b> · {new Date(c.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {c.page}
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '4px 0 10px' }}>{c.message}{'\n'}{c.stack.split('\n').slice(1, 5).join('\n')}</pre></div>)}</div>
        </Panel>}
        <Panel span={4} title="Setup" meta={<span className={`spill ${r.setup.anthropic && r.setup.google ? 'green' : 'amber'}`}>{r.setup.anthropic && r.setup.google ? 'All set' : 'Look'}</span>}>
          <div className="stlines">
            <Ln l={r.setup.anthropic ? 'ok' : 'bad'} label="Claude AI" d={r.setup.anthropic ? 'Key is set: call notes, call briefs and coaching work' : 'ANTHROPIC_API_KEY is missing on Vercel'} />
            <Ln l={r.setup.google ? 'ok' : 'warn'} label="Google sign-in & Calendar" d={r.setup.google ? 'Google keys are set' : 'Google keys are missing on Vercel'} />
            <Ln l={r.setup.quo.length ? 'ok' : 'warn'} label="Quo workspaces" d={r.setup.quo.length ? r.setup.quo.map(id => name.get(id) ?? id).join(', ') : 'None set up'} />
            {missing > 0 && <Ln l="warn" label="Missing AI notes" d={<>{missing} call{missing === 1 ? '' : 's'} this week {missing === 1 ? 'has' : 'have'} no AI notes yet. They are retried every morning, or{' '}
              <button className="linkish" disabled={fixing} onClick={() => void fix()}>{fixing ? 'filling in…' : 'fill them in now'}</button>{fixMsg && <> · {fixMsg}</>}</>} />}
            {r.setup.unassignedQuo > 0 && <Ln l="warn" label="Quo calls with no agent" d={`${r.setup.unassignedQuo} calls this week came from a number no agent has in Settings > Team`} />}
          </div>
        </Panel>
        {rows.map(({ a, ls, w }) => (
          <Panel key={a.id} span={2} title={name.get(a.id) ?? a.id} meta={<span className={`spill ${DOT[w][1]}`}>{DOT[w][0]}</span>}
            foot={<>{a.email ?? 'No sign-in email'}{a.role !== 'agent' ? ` · ${a.role}` : ''}</>}>
            <div className="stlines">{ls.map(l => <Ln key={l.label} l={l.level} label={l.label} d={l.detail} />)}</div>
          </Panel>
        ))}
      </div>}
    </div>
  );
}

function Ln({ l, label, d }: { l: Level; label: string; d: React.ReactNode }) {
  return <div className={`stline ${l}`}><i aria-label={DOT[l][0]} /><b>{label}</b><span>{d}</span></div>;
}

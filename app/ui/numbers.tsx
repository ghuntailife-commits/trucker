'use client';
// Numbers report on Team (George, 2026-11-28), admin only: how each Dispatch calling number is doing over 30 days.
// Dials, connect rate, voicemails, talk time, texts, who used it, and a spam warning for numbers that stopped connecting.
import { useEffect, useState } from 'react';
import { LIVE, db } from '../../src/live/supabase';
import { numberStats, numberTotals, type Ev, type NumRow } from '../../src/twilio/numberStats';
import { Panel, Kpi, pctTxt } from './charts';
import { useSort } from './sort';
import { TZ } from './shared';

type Report = { rows: NumRow[]; totals: ReturnType<typeof numberTotals>; names: Record<string, string>; cap: number; at: number; spent?: { today: number | null; month: number | null } };
const fmtPhone = (d: string) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
const secs = (s: number | null) => s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const money = (v: number | null | undefined) => v == null ? '—' : `$${v.toFixed(2)}`;
const pct = (r: number | null) => r == null ? '—' : `${Math.round(r * 100)}%`;
const ago = (t: number | null, now: number) => {
  if (!t) return 'Never';
  const m = Math.round((now - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** Made-up numbers for the demo. */
function demo(now: number): Report {
  const ev: Ev[] = []; let n = 0;
  const areas = ['615', '901', '512', '214', '713', '305', '404', '704', '317', '502', '205', '601'];
  areas.forEach((a, i) => {
    const from = `+1${a}555${String(100 + i).padStart(4, '0')}`;
    const dials = [64, 51, 47, 40, 38, 33, 27, 22, 15, 9, 4, 0][i];
    const rate = i === 5 ? 0.02 : 0.08 + (i % 4) * 0.03;
    for (let k = 0; k < dials; k++) {
      const at = new Date(now - ((k * 37 + i * 11) % (6 * 24)) * 3_600_000 - k * 60_000).toISOString(), id = `CA${++n}`;
      ev.push({ id: `d${n}`, type: 'call.dialed', call_id: id, phone: 'x', at, agent_id: ['george', 'gracie', 'anum'][k % 3], payload: { from } });
      const hit = (k * 7 + i) % 100 < rate * 100;
      const vm = !hit && k % 4 === 0;
      if (vm) ev.push({ id: `a${n}`, type: 'call.amd', call_id: `K${n}`, phone: null, at, agent_id: null, payload: { answeredBy: 'machine_end_beep' } });
      ev.push({ id: `c${n}`, type: 'call.completed', call_id: id, phone: 'x', at, agent_id: null,
        payload: { data: { object: { id: `K${n}`, status: hit || vm ? 'answered' : 'no-answer', duration: hit ? 60 + (k * 13) % 240 : vm ? 25 : 0 } } } });
    }
    for (let k = 0; k < (i < 4 ? 6 - i : 0); k++) ev.push({ id: `m${i}${k}`, type: 'message.sent', call_id: null, phone: 'x', at: new Date(now - k * 3_600_000).toISOString(), agent_id: 'george', payload: { from } });
  });
  const rows = numberStats(areas.map((a, i) => `+1${a}555${String(100 + i).padStart(4, '0')}`), ev, now, TZ, 100);
  return { rows, totals: numberTotals(rows), names: { george: 'George', gracie: 'Gracie', anum: 'Anum' }, cap: 100, at: now, spent: { today: 23.41, month: 187.96 } };
}

export function NumbersReport({ now }: { now: number }) {
  const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<'used' | 'all' | 'warn'>('used');
  const load = async () => {
    if (!LIVE) { setRep(demo(Date.now())); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await db().auth.getSession();
      const r = await fetch('/api/twilio/numbers?stats=1', { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
      const j = await r.json().catch(() => ({})) as Report & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
      setRep(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const rows = (rep?.rows ?? []).filter(r => show === 'all' || (show === 'warn' ? !!r.warn || r.resting : r.d30 > 0));
  const { sorted, th } = useSort(rows, {
    phone: r => r.phone, state: r => r.state, today: r => r.today, d7: r => r.d7, d30: r => r.d30, rate: r => r.rate7, c30: r => r.connects30,
    vm: r => r.d30 ? r.voicemails30 / r.d30 : null, talk: r => r.avgTalk, texts: r => r.textsOut30 + r.textsIn30, last: r => r.last,
  });
  if (err) return <div className="rgrid"><Panel span={4} title="Numbers"><p className="hint">Could not load the numbers: {err}</p>
    <button className="btn" onClick={() => void load()}>Try again</button></Panel></div>;
  if (!rep) return <div className="rgrid"><Panel span={4} title="Numbers"><p className="hint">Loading your numbers…</p></Panel></div>;
  const t = rep.totals;
  const best = Math.max(0.0001, ...rep.rows.filter(r => r.d7 >= 10).map(r => r.rate7 ?? 0));
  return (
    <div className="rgrid numrep">
      <div className="span4 kgrid k6" aria-label="Number totals">
        <Kpi label="Numbers in rotation" value={t.numbers} sub={`${t.used7} used in the last 7 days`} />
        <Kpi label="Dials today" value={t.today.toLocaleString('en-US')} sub={t.resting ? `${t.resting} resting (hit ${rep.cap})` : `cap ${rep.cap} per number`} />
        <Kpi label="Dials, 7 days" value={t.d7.toLocaleString('en-US')} sub={`${t.d30.toLocaleString('en-US')} in 30 days`} />
        <Kpi label="Connect rate, 7 days" value={pct(t.rate7)} tone="c-connects" sub={`talked 20s+ · avg talk ${secs(t.avgTalk)}`} />
        <Kpi label="Twilio spent today" value={money(rep.spent?.today)} sub={rep.spent?.month != null ? `${money(rep.spent.month)} this month · can lag an hour` : 'from your Twilio bill'} />
        <Kpi label="Spam warnings" value={t.warned} tone={t.warned ? 'c-noshow' : ''} sub={t.warned ? 'see the flagged numbers' : 'all numbers connecting'} />
      </div>
      <Panel span={4} title="Every number" meta={<span className="numtools">
        <span className="seg mini" role="group" aria-label="Which numbers">
          {([['used', 'Used in 30 days'], ['warn', `Needs a look (${rep.rows.filter(r => r.warn || r.resting).length})`], ['all', `All ${rep.rows.length}`]] as const)
            .map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </span>
        <button className="linkish" disabled={busy} onClick={() => void load()}>{busy ? 'Refreshing…' : `Refresh · ${ago(rep.at, now)}`}</button>
      </span>}>
        {!sorted.length ? <p className="hint">{show === 'warn' ? 'Nothing needs a look. Every number is connecting normally.' : 'No Dispatch calls from these numbers in the last 30 days.'}</p> :
        <div className="tscroll">
          <table className="rt numt">
            <thead><tr>{th('phone', 'Number')}{th('state', 'State')}{th('today', 'Today', 'num')}{th('d7', '7 days', 'num')}{th('d30', '30 days', 'num')}
              {th('rate', 'Connect rate (7d)', 'num')}{th('c30', 'Connects', 'num')}{th('vm', 'Voicemail', 'num')}{th('talk', 'Avg talk', 'num')}
              {th('texts', 'Texts', 'num')}<th>Used by</th>{th('last', 'Last call', 'num')}<th>Status</th></tr></thead>
            <tbody>{sorted.map(r => <tr key={r.phone} className={r.warn ? 'warnrow' : ''}>
              <td className="mono">{fmtPhone(r.phone)}</td>
              <td>{r.state || '—'}</td>
              <td className="num">{r.today}{r.resting && <span className="spill amber" style={{ marginLeft: 6 }}>resting</span>}</td>
              <td className="num">{r.d7}</td>
              <td className="num">{r.d30}</td>
              <td className="num"><span className="ratec"><span className="rbar"><i style={{ width: `${Math.min(100, ((r.rate7 ?? 0) / best) * 100)}%` }} /></span>{pct(r.rate7)}</span></td>
              <td className="num">{r.connects30}</td>
              <td className="num">{r.d30 ? pctTxt(r.voicemails30, r.d30) : '—'}</td>
              <td className="num">{secs(r.avgTalk)}</td>
              <td className="num" title={`${r.textsOut30} sent · ${r.textsIn30} received`}>{r.textsOut30 + r.textsIn30 || '—'}</td>
              <td className="muted">{r.agents.map(a => rep.names[a] ?? a).join(', ') || '—'}</td>
              <td className="num muted">{ago(r.last, now)}</td>
              <td>{r.warn ? <span className="spill red" title={r.warn}>Spam risk</span> : r.d7 ? <span className="spill green">Healthy</span> : <span className="muted">Idle</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {rep.rows.some(r => r.warn) && <div className="warnbox numwarn">
          {rep.rows.filter(r => r.warn).map(r => <p key={r.phone}><b>{fmtPhone(r.phone)}</b>: {r.warn} Rest it for a few days (take it out of the team numbers in Settings), and check it on freecallerregistry.com.</p>)}
        </div>}
        <p className="hint">Last 30 days of Dispatch calls (Twilio). A connect means the person talked 20 seconds or more; voicemails are calls a machine picked up. Quo calls are not included.</p>
      </Panel>
    </div>
  );
}

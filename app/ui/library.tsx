'use client';
// Contact library (admin, George 2026-11-26): the Lead Library sheet, living in the app. Pick contacts, pick the agent,
// see what will happen, send. Only agents licensed in a contact's state can get it.
import { useSort } from './sort';
import { useMemo, useState } from 'react';
import type { AgentId } from '../../src/team/agents';
import type { Team } from '../../src/app-store/useTeam';
import type { Library } from '../../src/app-store/useLibrary';
import { givenCounts, licensed, planHandout, stateCounts, type HandoutLine } from '../../src/library/library';
import { parseState, STATES } from '../../src/contacts/states';
import { mdTime } from '../../src/rules/time';
import { Dialog, TZ } from './shared';

type Show = 'open' | 'given' | 'all';
let seq = 0;
const newId = () => `c-${Date.now().toString(36)}-l${(seq++).toString(36)}`;
const md = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric', day: 'numeric' }).format(ms);

export function LibraryPage({ t, lib, now, say, onLicenses }: { t: Team; lib: Library; now: number; say: (s: string, k?: 'ok' | 'warn') => void; onLicenses: () => void }) {
  const agents = t.team.agents.filter(a => a.active);
  const [state, setState] = useState<string>('all');
  const [show, setShow] = useState<Show>('open');
  const [q, setQ] = useState('');
  const [to, setTo] = useState<AgentId | ''>('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [firstN, setFirstN] = useState(10);
  const [plan, setPlan] = useState<HandoutLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const agent = agents.find(a => a.id === to);

  const counts = useMemo(() => stateCounts(lib.lib), [lib.lib]);
  const given = useMemo(() => givenCounts(lib.lib), [lib.lib]);
  const open = lib.lib.filter(c => !c.givenTo).length;
  const rows = useMemo(() => {
    const n = q.toLowerCase().trim();
    return lib.lib.filter(c => (state === 'all' || c.state === state) && (show === 'all' || (show === 'open' ? !c.givenTo : !!c.givenTo))
      && (!n || `${c.first} ${c.last} ${c.company} ${c.city} ${c.givenTo}`.toLowerCase().includes(n)));
  }, [lib.lib, state, show, q]);
  const { sorted: sortedRows, th } = useSort(rows, { name: c => `${c.last} ${c.first}`, company: c => c.company, loc: c => `${c.state} ${c.city}`,
    phone: c => c.phone, given: c => c.givenTo, at: c => c.givenAt });
  const canPick = (c: typeof rows[number]) => !c.givenTo && (!agent || licensed(agent.states, c.state));
  const pickable = sortedRows.filter(canPick);
  const pick = (id: string, on: boolean) => setPicked(x => { const s = new Set(x); if (on) s.add(id); else s.delete(id); return s; });
  const pickFirst = () => setPicked(new Set(pickable.slice(0, firstN).map(c => c.id)));
  const choose = (id: AgentId | '') => {
    setTo(id);
    const a = agents.find(x => x.id === id);
    if (a) setPicked(p => new Set([...p].filter(pid => { const c = lib.lib.find(x => x.id === pid); return c && licensed(a.states, c.state); })));
  };
  const review = async () => {
    if (!agent) return;
    const theirs = await lib.contactsOf(agent.id, now);
    setPlan(planHandout([...picked], lib.lib, { id: agent.id, name: agent.name, states: agent.states }, theirs, { now, nextId: newId }));
  };
  const send = async () => {
    if (!agent || !plan) return;
    setBusy(true);
    const n = await lib.send(plan, { id: agent.id, name: agent.name, states: agent.states }, Date.now());
    setBusy(false); setPlan(null); setPicked(new Set());
    say(n ? `Sent ${n} contact${n === 1 ? '' : 's'} to ${agent.name}.${agent.id === t.viewer ? '' : ` They show up in ${agent.name}'s lists next time ${agent.name} opens Dispatch.`}` : 'Nothing was sent.', n ? 'ok' : 'warn');
  };
  const undo = async (id: string) => {
    const r = await lib.undo(id, Date.now());
    say(`${r.back} went back to the library.${r.kept.length ? ` ${r.kept.length} stayed with the agent because they were already called.` : ''}`, r.kept.length ? 'warn' : 'ok');
  };
  const recent = [...lib.handouts].reverse().slice(0, 5);
  const known = new Set(agents.map(a => a.name.toLowerCase()));

  return (
    <>
      <section className="hero">
        <div className="title">
          <div className="eyebrow">Admin · was the Lead Library sheet</div>
          <h1>Contact library</h1>
          <div className="passbar"><span>Pick contacts, pick the agent, review, send. Agents only get states they are licensed in.</span></div>
        </div>
        <div className="strip s4">
          {([['In the library', lib.lib.length, ''], ['Not given out', open, 'green'], ['Given out', lib.lib.length - open, 'blue'], ['Picked', picked.size, picked.size ? 'amber' : '']] as [string, number, string][])
            .map(([l, v, tone]) => <div className="cell" key={l}><span>{l}</span><b className={tone}>{v.toLocaleString('en-US')}</b></div>)}
        </div>
      </section>

      <main className="work single libwork">
        <section className="panel libside">
          <h3>States</h3>
          <div className="stlist">
            <button className={state === 'all' ? 'on' : ''} onClick={() => setState('all')}><span>All states</span><em>{open}</em></button>
            {counts.map(s => <button key={s.state} className={state === s.state ? 'on' : ''} onClick={() => setState(s.state)}>
              <span>{s.name}</span><em title={`${s.open} not given out of ${s.total}`}>{s.open}<small>/{s.total}</small></em></button>)}
          </div>
          <h3>Licensed states <button className="linkish" onClick={onLicenses}>Edit mine</button></h3>
          <ul className="lic">
            {agents.map(a => <li key={a.id}><b>{a.name}</b><span>{a.states.length ? a.states.map(s => parseState(s)?.abbr ?? s).join(', ') : 'None set yet'}</span></li>)}
          </ul>
          <h3>Given out</h3>
          <ul className="lic">
            {given.map(g => <li key={g.name}><b>{g.name}</b><span>{g.n}{known.has(g.name.toLowerCase()) ? '' : ' · not on Dispatch yet'}</span></li>)}
          </ul>
        </section>

        <section className="panel queue">
          <div className="toolbar libbar">
            <div className="tabs" role="tablist">
              {([['open', 'Not given out'], ['given', 'Given out'], ['all', 'All']] as [Show, string][]).map(([k, l]) =>
                <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
            </div>
            <input className="libq" placeholder="Search name, company, city" value={q} onChange={e => setQ(e.target.value)} />
            <div className="tbtns">
              <label className="sendto">Send to
                <select value={to} onChange={e => choose(e.target.value as AgentId | '')}>
                  <option value="">Pick an agent</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></label>
              <span className="firstn">First <input type="number" min={1} max={500} value={firstN} onChange={e => setFirstN(Math.max(1, +e.target.value || 1))} />
                <button className="btn" disabled={!pickable.length} onClick={pickFirst}>Pick</button></span>
              <button className="btn primary" disabled={!agent || !picked.size} onClick={review}>Review {picked.size || ''}{agent ? ` for ${agent.name}` : ''}</button>
            </div>
          </div>
          {agent && <div className="libnote">{agent.name} is licensed in {agent.states.join(', ') || 'no states yet'}. Contacts in other states can&rsquo;t be picked.</div>}
          <div className="tscroll tall">
            <table className="qt lib">
              <thead><tr>
                <th className="pickc"><input type="checkbox" aria-label="Pick every contact shown" checked={!!pickable.length && pickable.every(c => picked.has(c.id))}
                  onChange={e => setPicked(x => { const s = new Set(x); for (const c of pickable) { if (e.target.checked) s.add(c.id); else s.delete(c.id); } return s; })} /></th>
                {th('name', 'Contact')}{th('company', 'Company — Role')}{th('loc', 'Location')}{th('phone', 'Phone')}{th('given', 'Given to')}{th('at', 'Date given', 'num')}
              </tr></thead>
              <tbody>
                {sortedRows.slice(0, 400).map(c => {
                  const ok = canPick(c), noLic = !c.givenTo && agent && !licensed(agent.states, c.state);
                  return <tr key={c.id} className={`${picked.has(c.id) ? 'typed' : ''} ${noLic ? 'nolic' : ''}`}>
                    <td className="pickc"><input type="checkbox" disabled={!ok} aria-label={`Pick ${c.first} ${c.last}`} checked={picked.has(c.id)} onChange={e => pick(c.id, e.target.checked)} /></td>
                    <td className="strong">{c.first} {c.last}{c.linkedin && /^https:\/\//.test(c.linkedin) && <> <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="li">in</a></>}</td>
                    <td>{c.company}{c.job ? ` — ${c.job}` : ''}</td>
                    <td>{c.city}{c.city ? ', ' : ''}{c.state}{noLic && <span className="spill grey mini">Not licensed</span>}</td>
                    <td className="mono">{c.phone || <span className="muted">Needs a number</span>}</td>
                    <td>{c.givenTo ? <span className={`spill mini ${known.has(c.givenTo.toLowerCase()) ? 'teal' : 'grey'}`}>{c.givenTo}</span> : <span className="muted">—</span>}</td>
                    <td className="muted">{c.givenAt ? md(c.givenAt) : ''}</td>
                  </tr>;
                })}
                {!rows.length && <tr><td colSpan={7} className="emptyrow">No contacts match.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="tfoot"><span>{rows.length.toLocaleString('en-US')} shown{rows.length > 400 ? ' (first 400)' : ''}</span>
            <span>Demo: made-up library contacts. At go-live the app copies your Lead Library sheet in once, read only.</span></div>
          {recent.length > 0 && <div className="handouts">
            <h3>Recent sends</h3>
            {recent.map(h => <div key={h.id} className="hrow"><span>{mdTime(h.at, TZ)}</span><b>{h.items.length} to {h.agentName}</b>
              {h.undoneAt ? <em>Undone {mdTime(h.undoneAt, TZ)}</em> : <button className="btn sm" onClick={() => undo(h.id)}>Undo</button>}</div>)}
          </div>}
        </section>
      </main>

      {plan && agent && (
        <Dialog title={`Send to ${agent.name}?`} onClose={() => setPlan(null)} wide>
          <p><b>{plan.filter(l => l.ok).length}</b> will go into {agent.name}&rsquo;s lists and be marked given to {agent.name} today{plan.some(l => !l.ok) ? <>, <b>{plan.filter(l => !l.ok).length}</b> won&rsquo;t</> : ''}. Same duplicate and Do Not Call check as Import.</p>
          <div className="plan">
            {plan.map(l => <div key={l.libId} className={l.ok ? 'ok' : 'no'}><span>{l.ok ? '✓' : '✕'}</span><b>{l.name}</b><em>{l.result}</em></div>)}
          </div>
          <div className="bar"><button className="btn" onClick={() => setPlan(null)}>Back</button>
            <button className="btn primary" disabled={busy || !plan.some(l => l.ok)} onClick={send}>Send {plan.filter(l => l.ok).length}</button></div>
        </Dialog>
      )}
    </>
  );
}

/** The licensed-states picker every agent opens from the profile menu. */
export function LicensesDialog({ states, onSave, onClose }: { states: string[]; onSave: (s: string[]) => void; onClose: () => void }) {
  const ALL = useMemo(() => Object.keys(STATE_NAMES).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b])), []);
  const [on, setOn] = useState(() => new Set(states.map(s => parseState(s)?.abbr).filter(Boolean) as string[]));
  return (
    <Dialog title="My licensed states" onClose={onClose} wide>
      <p>Tick every state you hold a license in. The admin can only send you contacts in these states.</p>
      <div className="stgrid">
        {ALL.map(ab => <label key={ab} className={on.has(ab) ? 'on' : ''}><input type="checkbox" checked={on.has(ab)}
          onChange={e => setOn(x => { const s = new Set(x); if (e.target.checked) s.add(ab); else s.delete(ab); return s; })} />{STATE_NAMES[ab]}</label>)}
      </div>
      <div className="bar"><span className="muted">{on.size} picked</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => { onSave(ALL.filter(a => on.has(a)).map(a => STATE_NAMES[a])); onClose(); }}>Save</button></div>
    </Dialog>
  );
}
const STATE_NAMES: Record<string, string> = Object.fromEntries(Object.entries(STATES).filter(([k]) => k !== 'DC').map(([k, v]) => [k, v[0]]));

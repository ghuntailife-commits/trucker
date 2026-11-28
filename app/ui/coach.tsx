'use client';
// Coaching (George, 2026-11-26): what each agent's Quo calls say, from Claude's notes and tags. Agents see only
// their own calls (the database enforces it); George sees everyone and can pick an agent.
import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '../../src/rules/types';
import type { AgentSetting } from '../../src/team/agents';
import { coachSums, type CoachCall } from '../../src/quo/coach';
import { demoCoachCalls, DEMO_WEEKLY } from '../../src/quo/coachDemo';
import { matchContact } from '../../src/quo/quo';
import { LIVE } from '../../src/live/supabase';
import { loadCoachCalls, loadWeekly, askCoach, type WeeklyNote } from '../../src/live/coachClient';
import { Panel, Kpi, Rows, pctTxt } from './charts';
import { TZ } from './shared';
import { useSort } from './sort';
import { PlaybookView } from './playbook';
import { CoachCard } from './team';
import { mondayNote } from '../../src/team/coaching';
import { loadAgentData } from '../../src/app-store/useTeam';
import type { Seed } from '../../src/app-store/agentSeeds';
import { PresentationsView } from './presentations';
import type { GoogleCal } from '../../src/live/useGoogleCalendar';

const md = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DAY = 86_400_000;
const phoneTxt = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

export function CoachPage({ me, admin, agents, contacts, now, cal, coachingHour = 7 }: { me: AgentSetting; admin: boolean; agents: AgentSetting[]; contacts: Contact[]; now: number; cal?: GoogleCal; coachingHour?: number }) {
  const quoAgents = agents.filter(a => a.quo);
  const [who, setWho] = useState<string>(me.id);              // an agent id, or 'all' (admin)
  const [days, setDays] = useState<7 | 30 | 365>(7);
  const [calls, setCalls] = useState<CoachCall[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyNote | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState<'' | 'week' | 'tag'>('');
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<'book' | 'calls' | 'pres' | 'notes'>('book');
  const since = now - days * DAY;

  useEffect(() => {
    let alive = true; setErr('');
    if (!LIVE) { setCalls(demoCoachCalls(me.id, now).filter(c => c.at >= since)); setWeekly({ at: now, text: DEMO_WEEKLY, calls: 12 }); return; }
    setCalls(null);
    loadCoachCalls(who === 'all' ? null : who, since).then(c => { if (alive) setCalls(c); }).catch(e => { if (alive) { setErr(e.message); setCalls([]); } });
    if (who !== 'all') loadWeekly(who).then(w => { if (alive) setWeekly(w); }); else setWeekly(null);
    return () => { alive = false; };
  }, [who, days, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => coachSums(calls ?? []), [calls]);
  const untagged = (calls ?? []).filter(c => !c.tags && c.note).length;
  const name = (id: string) => agents.find(a => a.id === id)?.name ?? id;
  const contactOf = (c: CoachCall) => (c.agentId === me.id ? matchContact(contacts, c.phone) : undefined);
  const { sorted, th } = useSort(calls ?? [], {
    at: c => c.at, agent: c => name(c.agentId), who: c => { const x = contactOf(c); return x ? `${x.last} ${x.first}` : c.phone; },
    outcome: c => c.tags?.outcome ?? '', obj: c => c.tags?.objections.join(', ') ?? '', note: c => c.note }, { key: 'at', dir: -1 });

  const run = async (action: 'week' | 'tag') => {
    if (!LIVE) return;
    setBusy(action); setErr('');
    const r = await askCoach(who, action);
    setBusy('');
    if (r.error) return setErr(r.error);
    if (action === 'week' && r.text) setWeekly({ at: r.at!, text: r.text, calls: r.calls! });
    if (action === 'tag') setReload(x => x + 1);
  };
  const maxOb = Math.max(1, ...s.objections.map(o => o.count)), maxOc = Math.max(1, ...s.outcomes.map(o => o.count));
  const top = s.objections[0];

  return (
    <div className="respage">
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{tab === 'book' ? 'The whole team · learns from every transcribed call' : tab === 'notes' ? 'Each person’s week, from their own numbers' : tab === 'pres' ? `${who === 'all' ? 'Everyone' : name(who)} · Google Meet presentations read by Claude` : `${who === 'all' ? 'Everyone with Quo' : name(who)} · from Claude’s call notes`}</div>
          <h1>Coaching</h1>
        </div>
        <div className="rtools">
          {admin && tab !== 'book' && tab !== 'notes' && <select className="coachwho" value={who} onChange={e => setWho(e.target.value)} aria-label="Whose coaching">
            {(tab === 'pres' ? agents : quoAgents).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="all">Everyone</option>
          </select>}
          <div className="seg mini" role="group" aria-label="Coaching view">
            <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}>Team Playbook</button>
            <button className={tab === 'calls' ? 'on' : ''} onClick={() => setTab('calls')}>{admin ? 'Calls' : 'My calls'}</button>
            <button className={tab === 'pres' ? 'on' : ''} onClick={() => setTab('pres')}>Presentations</button>
            <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>Monday notes</button>
          </div>
          {tab !== 'book' && tab !== 'notes' && <div className="seg mini" role="group" aria-label="Date range">
            {([[7, 'Last 7 days'], [30, 'Last 30 days'], [365, 'Last year']] as [7 | 30 | 365, string][]).map(([k, l]) => <button key={k} className={days === k ? 'on' : ''} onClick={() => setDays(k)}>{l}</button>)}
          </div>}
        </div>
      </section>
      {!LIVE && tab !== 'pres' && tab !== 'notes' && <p className="hint coachdemo">Demo: made-up calls, to show what the Coaching tab looks like once Quo calls come in.</p>}
      {err && <p className="warnline coachdemo">{err}</p>}
      {tab === 'book' ? <PlaybookView agent={me.id} admin={admin} now={now} />
        : tab === 'notes' ? <MondayNotes me={me} agents={admin ? agents.filter(a => a.active !== false) : [me]} now={now} coachingHour={coachingHour} />
        : tab === 'pres' ? <PresentationsView me={me} who={who} admin={admin} agents={agents} contacts={contacts} now={now} days={days} cal={cal} /> : calls === null ? <div className="empty">Loading calls…</div> : (
        <div className="rgrid">
          <div className="span4 kgrid k4">
            <Kpi label="Calls analyzed" value={s.calls} sub={`${calls.length - s.calls ? `${calls.length - s.calls} not tagged yet · ` : ''}last ${days} days`} />
            <Kpi label="Real conversations" value={s.talked} sub="Not voicemail or no answer" />
            <Kpi label="Ended well" value={pctTxt(s.good, s.talked)} sub={`${s.good} booked, callback, presented or sold`} tone="c-sold" />
            <Kpi label="Top objection" value={<span className="kpitxt">{top ? top.label : '—'}</span>} sub={top ? `${top.count} calls · saved ${pctTxt(top.savedAnyway, top.count)}` : 'None heard yet'} tone="c-pres" />
          </div>

          <Panel span={2} title="Objections you hear" meta="Saved = the call still ended well">
            {s.objections.length ? <Rows hue="pres" head={['Objection', 'Calls', '', 'Saved']} rows={s.objections.map(o => ({ label: o.label, n: o.count, frac: o.count / maxOb, right: pctTxt(o.savedAnyway, o.count), tip: `${o.label}: ${o.count} calls, ${o.savedAnyway} still ended well` }))} />
              : <p className="hint pad16">No objections tagged yet.</p>}
          </Panel>
          <Panel span={2} title="How calls end">
            {s.outcomes.length ? <Rows head={['Outcome', 'Calls', '', 'Share']} rows={s.outcomes.map(o => ({ label: o.label, n: o.count, frac: o.count / maxOc, right: pctTxt(o.count, s.calls),
              hue: ['Booked', 'Sold', 'Presented', 'Callback set'].includes(o.label) ? 'sold' as const : ['Voicemail', 'No answer', 'Wrong number'].includes(o.label) ? 'muted' as const : 'noshow' as const }))} />
              : <p className="hint pad16">No calls tagged yet.</p>}
          </Panel>

          {who !== 'all' && <Panel span={2} title="This week's coaching" meta={weekly ? `Written ${md.format(weekly.at)} · ${weekly.calls} calls` : undefined}
            foot={LIVE && <button className="btn sm" disabled={!!busy || !s.calls} onClick={() => run('week')}>{busy === 'week' ? 'Writing…' : weekly ? 'Write a fresh note' : 'Write this week’s note'}</button>}>
            {weekly ? <p className="coachnote">{weekly.text}</p> : <p className="hint pad16">No note yet. Claude writes one from the last 7 days of tagged calls.</p>}
          </Panel>}
          <Panel span={who === 'all' ? 4 : 2} title="Call by call" meta="Newest first">
            <ul className="tiplist">{s.tips.slice(0, 6).map((t, i) => <li key={i}><span className="muted">{md.format(t.at)}</span>
              {t.wentWell && <span><b className="c-sold">Went well:</b> {t.wentWell}</span>}{t.tryNext && <span><b className="c-pres">Try next:</b> {t.tryNext}</span>}</li>)}</ul>
            {!s.tips.length && <p className="hint pad16">Tips show here as calls are tagged.</p>}
          </Panel>

          <Panel span={4} title="Calls" meta={`${calls.length} in the last ${days} days`}
            foot={LIVE && untagged > 0 && <button className="btn sm" disabled={!!busy} onClick={() => run('tag')}>{busy === 'tag' ? 'Tagging…' : `Tag ${Math.min(untagged, 15)} older call${untagged === 1 ? '' : 's'}`}</button>}>
            <div className="tscroll"><table className="rt coacht">
              <thead><tr>{th('at', 'Date', '', -1)}{who === 'all' && th('agent', 'Agent')}{th('who', 'Contact')}{th('outcome', 'Outcome')}{th('obj', 'Objections')}{th('note', 'Notes')}<th>Recording</th></tr></thead>
              <tbody>{sorted.map(c => { const x = contactOf(c); return (
                <tr key={c.id}><td className="c-dials">{md.format(c.at)}</td>{who === 'all' && <td>{name(c.agentId)}</td>}
                  <td><b>{x ? `${x.first} ${x.last}` : phoneTxt(c.phone)}</b></td>
                  <td>{c.tags ? <span className={`spill mini ${['Booked', 'Sold', 'Presented', 'Callback set'].includes(c.tags.outcome) ? 'green' : ['Voicemail', 'No answer', 'Wrong number'].includes(c.tags.outcome) ? 'grey' : 'red'}`}>{c.tags.outcome}</span> : <span className="muted">Not tagged</span>}</td>
                  <td className="c-pres">{c.tags?.objections.join(', ')}</td>
                  <td className="muted">{c.note}</td>
                  <td>{c.recording ? <a href={c.recording} target="_blank" rel="noreferrer">Listen</a> : ''}</td></tr>); })}</tbody>
            </table>{!calls.length && <p className="hint pad16">No transcribed Quo calls in this range yet. Calls need Quo call transcription turned on.</p>}</div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/** Each person's Monday coaching note (moved here from the Team tab, George 2026-11-27). Agents see their own. */
function MondayNotes({ me, agents, now, coachingHour }: { me: AgentSetting; agents: AgentSetting[]; now: number; coachingHour: number }) {
  const [who, setWho] = useState(me.id);
  const [seed, setSeed] = useState<Seed | null>(null);
  const a = agents.find(x => x.id === who) ?? me;
  useEffect(() => { let alive = true; setSeed(null); loadAgentData(a.id, now, TZ).then(x => { if (alive) setSeed(x); }); return () => { alive = false; }; }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const note = useMemo(() => (seed ? mondayNote({ name: a.name, log: seed.log, sales: seed.sales, noSales: seed.noSales, now, tz: TZ, goal: a.goal }) : null), [seed, a, now]);
  return (
    <div className="rgrid">
      {agents.length > 1 && <div className="span4 notepick" role="group" aria-label="Whose note">
        {agents.map(x => <button key={x.id} className={`chipbtn ${x.id === a.id ? 'on' : ''}`} onClick={() => setWho(x.id)}>{x.name}</button>)}</div>}
      <Panel span={4} title={`Monday coaching note · ${a.name}`} meta={a.coaching ? `Mondays ${coachingHour} AM ET` : 'Off in Settings'}
        foot="Written from their own numbers for last week. Your team's combined note is on the Team tab.">
        {note ? <CoachCard n={note} /> : <div className="empty">Loading…</div>}
      </Panel>
    </div>
  );
}

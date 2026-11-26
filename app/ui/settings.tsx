// Settings (admin only): each agent's goal, Quo and coaching switches, and the calling rules (was the Rules tab).
// Nothing saves until the preview of the changes is confirmed.
'use client';
import { useState } from 'react';
import type { Team } from '../../src/app-store/useTeam';
import { agentChanges, checkRules, defaultRules, ruleChanges, RULE_LABEL, type AgentSetting, type RuleSettings, type Role } from '../../src/team/agents';
import { Panel } from './charts';
import { Dialog } from './shared';

const hourOpt = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export function SettingsPage({ t }: { t: Team }) {
  const [agents, setAgents] = useState<AgentSetting[]>(() => structuredClone(t.team.agents));
  const [rules, setRules] = useState<RuleSettings>(() => structuredClone(t.team.rules));
  const [hour, setHour] = useState(t.team.coachingHour);
  const [review, setReview] = useState(false);
  const [goalText, setGoalText] = useState<Record<string, string>>(() => Object.fromEntries(t.team.agents.map(a => [a.id, String(a.goal)])));

  const setA = (id: string, ch: Partial<AgentSetting>) => setAgents(xs => xs.map(a => (a.id === id ? { ...a, ...ch } : a)));
  const setR = <K extends keyof RuleSettings>(k: K, v: RuleSettings[K]) => setRules(r => ({ ...r, [k]: v }));
  const num = (s: string) => Number(String(s).replace(/[$,\s%]/g, ''));

  const changes = [...agentChanges(t.team.agents, agents), ...ruleChanges(rules, t.team.rules),
    ...(hour !== t.team.coachingHour ? [`Monday coaching note goes out at ${hourOpt(hour)} (was ${hourOpt(t.team.coachingHour)})`] : [])];
  const problems = [...checkRules(rules), ...agents.filter(a => !(a.goal > 0)).map(a => `${a.name}'s goal needs a dollar amount.`),
    ...(agents.some(a => a.role === 'admin') ? [] : ['Keep at least one admin, or nobody can open Settings.'])];
  const fromApproved = ruleChanges(rules);

  const save = () => {
    for (const a of agents) t.setAgent(a.id, a);
    t.setRules(rules);
    t.setTeamField({ coachingHour: hour });
    setReview(false);
  };
  const undoAll = () => { setAgents(structuredClone(t.team.agents)); setRules(structuredClone(t.team.rules)); setHour(t.team.coachingHour);
    setGoalText(Object.fromEntries(t.team.agents.map(a => [a.id, String(a.goal)]))); };

  return (
    <div className="respage setpage">
      <section className="hero">
        <div className="title"><div className="eyebrow">Admin · was the Rules tab</div><h1>Settings</h1></div>
        <div className="rtools">
          <button className="btn" disabled={!changes.length} onClick={undoAll}>Discard changes</button>
          <button className="btn primary" disabled={!changes.length} onClick={() => setReview(true)}>Review {changes.length || ''} change{changes.length === 1 ? '' : 's'}</button>
        </div>
      </section>
      <div className="rgrid">
        <Panel span={4} title="Agents" meta="Goals, Quo and the Monday coaching note, per agent">
          <div className="tscroll">
            <table className="rt settable">
              <thead><tr><th>Agent</th><th>Role</th><th>States</th><th>Monthly goal</th><th>Quo</th><th>Quo number</th><th>Monday note</th></tr></thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a.id}>
                    <td><b>{a.name}</b><small className="muted"> · {a.team}</small></td>
                    <td><select value={a.role} onChange={e => setA(a.id, { role: e.target.value as Role })} aria-label={`${a.name} role`}>
                      <option value="admin">Admin: sees everyone</option><option value="agent">Agent: own contacts</option></select></td>
                    <td className="states">{a.states.join(', ')}</td>
                    <td><input className="money" inputMode="decimal" value={goalText[a.id] ?? ''} aria-label={`${a.name} monthly goal`}
                      onChange={e => { setGoalText(g => ({ ...g, [a.id]: e.target.value })); const n = num(e.target.value); setA(a.id, { goal: n > 0 ? Math.round(n) : 0 }); }} /></td>
                    <td><Toggle on={a.quo} label={`Quo for ${a.name}`} onChange={v => setA(a.id, { quo: v })} /></td>
                    <td><input placeholder={a.quo ? 'Added at go-live' : '—'} disabled={!a.quo} value={a.quoNumber} aria-label={`${a.name} Quo number`}
                      onChange={e => setA(a.id, { quoNumber: e.target.value })} /></td>
                    <td><Toggle on={a.coaching} label={`Monday note for ${a.name}`} onChange={v => setA(a.id, { coaching: v })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">The boss signs in with results-only access. Quo needs each agent&rsquo;s Quo API key, which goes into the server&rsquo;s locked settings at go-live, never into this page.</p>
        </Panel>

        <Panel span={2} title="Who gets called, and when" meta={fromApproved.length ? `${fromApproved.length} different from the approved settings` : 'Approved settings'}>
          <div className="setform">
            <label>{RULE_LABEL.retryDays}</label>
            <div className="days8">
              {rules.retryDays.map((v, i) => (
                <span key={i}><small>{i === 7 ? '8+' : i + 1}</small>
                  <input inputMode="numeric" value={v} aria-label={`Days after dial ${i + 1}`} onChange={e => {
                    const r = [...rules.retryDays]; r[i] = Math.round(num(e.target.value)) || 0; setR('retryDays', r); }} /></span>
              ))}
            </div>
            <Field label={RULE_LABEL.restDays} unit="days" v={rules.restDays} on={n => setR('restDays', n)} />
            <Field label={RULE_LABEL.backupDials} unit="dials" v={rules.backupDials} on={n => setR('backupDials', n)} />
            <Field label={RULE_LABEL.callbackTries} unit="tries" v={rules.callbackTries} on={n => setR('callbackTries', n)} />
            <Field label={RULE_LABEL.noShowTries} unit="tries" v={rules.noShowTries} on={n => setR('noShowTries', n)} />
            <Field label={RULE_LABEL.listSize} unit="contacts" v={rules.listSize} on={n => setR('listSize', n)} />
          </div>
        </Panel>

        <Panel span={2} title="Time of day and appointments">
          <div className="setform">
            <label>{RULE_LABEL.freshShareByBlock}</label>
            <div className="days8 b4">
              {(['Before 12', '12–3', '3–6', 'After 6'] as const).map((l, i) => (
                <span key={l}><small>{l}</small>
                  <input inputMode="numeric" disabled={!rules.freshShareByBlock} value={rules.freshShareByBlock ? Math.round(rules.freshShareByBlock[i] * 100) : ''}
                    aria-label={`Fresh share ${l}`} onChange={e => { const b = [...(rules.freshShareByBlock ?? [0.25, 0.25, 0.2, 0.1])] as [number, number, number, number];
                      b[i] = Math.max(0, Math.min(100, num(e.target.value))) / 100; setR('freshShareByBlock', b); }} />%</span>
              ))}
            </div>
            <p className="hint">The share of each hour&rsquo;s calls that go to fresh contacts. The rest go to retries and callbacks, which reach more people.</p>
            <div className="frow"><label>{RULE_LABEL.pmStartHour}</label>
              <select value={rules.pmStartHour} onChange={e => setR('pmStartHour', Number(e.target.value))}>
                {[12, 13, 14, 15, 16, 17].map(h => <option key={h} value={h}>{hourOpt(h)}</option>)}</select></div>
            <div className="frow"><label>{RULE_LABEL.autoPmRetry}</label><Toggle on={rules.autoPmRetry} label="Afternoon retry" onChange={v => setR('autoPmRetry', v)} /></div>
            <div className="frow"><label>{RULE_LABEL.confirmMorningOf}</label><Toggle on={rules.confirmMorningOf} label="Morning-of confirm" onChange={v => setR('confirmMorningOf', v)} /></div>
            <Field label={RULE_LABEL.apptSoonHours} unit="hours" v={rules.apptSoonHours} on={n => setR('apptSoonHours', n)} />
            <div className="frow"><label>Monday coaching note goes out at</label>
              <select value={hour} onChange={e => setHour(Number(e.target.value))}>{[6, 7, 8, 9, 10].map(h => <option key={h} value={h}>{hourOpt(h)} ET</option>)}</select></div>
            <button className="linkish" disabled={!fromApproved.length} onClick={() => setRules(defaultRules())}>Put back the approved settings</button>
          </div>
        </Panel>

        <Panel span={4} title="Quo connection" meta="Built in for George and Gracie">
          <div className="quoset">
            <div><b>Calls</b><p className="hint">The Call button dials through the Quo app. When a call ends, Quo tells the dialer, and the talk time is saved on the contact.</p></div>
            <div><b>Texts</b><p className="hint">Reminders and confirmations go out from the agent&rsquo;s Quo number, from the dialer, always with a preview first. Replies land on the contact&rsquo;s notes.</p></div>
            <div><b>Status</b><p className="hint"><span className="spill amber">Not connected yet</span> At go-live: each agent&rsquo;s API key and number, and the event link set up in Quo.</p></div>
          </div>
        </Panel>
      </div>

      {review && (
        <Dialog title="Save these changes?" onClose={() => setReview(false)}>
          <ul className="changes">{changes.map(c => <li key={c}>{c}</li>)}</ul>
          {problems.length > 0 && <div className="warnbox">{problems.map(p => <p key={p}>{p}</p>)}</div>}
          {!problems.length && changes.some(c => /^(Days|Rest|Dials|Callback|No-show|Today|Fresh|Afternoon|Morning|Second|Warn)/.test(c)) &&
            <p className="hint">Rule changes apply to everyone&rsquo;s Today list from the next re-sort.</p>}
          <div className="bar">
            <button className="btn" onClick={() => setReview(false)}>Keep editing</button>
            <button className="btn primary" disabled={problems.length > 0} onClick={save}>Save</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, unit, v, on }: { label: string; unit: string; v: number; on: (n: number) => void }) {
  return (
    <div className="frow"><label>{label}</label>
      <span className="unit"><input inputMode="numeric" value={v} aria-label={label} onChange={e => on(Math.round(Number(e.target.value.replace(/\D/g, ''))) || 0)} /> {unit}</span>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`tog ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>;
}

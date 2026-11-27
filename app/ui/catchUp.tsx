'use client';
// Admin: bring an agent's sheet work into Dispatch (George, 2026-11-27: Austin used his sheet for a few hours).
// Reads the sheet read only, shows what would change, and only then sends it to the agent's Dispatch.
import { useEffect, useState } from 'react';
import { db, signInGoogle } from '../../src/live/supabase';
import { liveLoad } from '../../src/live/kvStore';
import { readAgentSheet } from '../../src/live/sheets';
import { buildAgentData, type AgentData } from '../../src/migrate/agentSheet';
import { catchUp, type CatchUp } from '../../src/migrate/catchUp';
import { ROSTER } from '../../src/team/roster';
import { storageKey } from '../../src/app-store/agentSeeds';
import { inboxKey } from '../../src/app-store/useLibrary';
import { loadState, saveState } from '../../src/app-store/store';
import { mergeInbox, type Inbox } from '../../src/app-store/inbox';
import type { AgentId } from '../../src/team/agents';
import { Dialog, TZ } from './shared';

const RESUME = 'dispatch-catchup-resume';
const startOfToday = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  return `${p}T00:00`;
};
/** "2026-11-27T13:00" in the agent's time zone to ms. */
function fromLocal(v: string): number {
  const guess = Date.parse(`${v}:00Z`);
  const shown = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ })).getTime();
  return guess + (guess - shown);
}

export function CatchUpDialog({ onClose, say, preset }: { onClose: () => void; say: (m: string, tone?: 'ok' | 'warn') => void; preset?: string }) {
  const agents = ROSTER.filter(r => r.sheetId);
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(RESUME) ?? 'null') as { agent: string; since: string } | null; } catch { return null; } })();
  const [agent, setAgent] = useState(saved?.agent ?? preset ?? 'austin');
  const [since, setSince] = useState(saved?.since ?? startOfToday());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [plan, setPlan] = useState<CatchUp | null>(null);
  const who = agents.find(a => a.id === agent);

  const read = async () => {
    setErr(''); setPlan(null);
    const { data } = await db().auth.getSession();
    const token = data.session?.provider_token;
    const ask = () => { try { sessionStorage.setItem(RESUME, JSON.stringify({ agent, since })); } catch { /* */ } return signInGoogle(true); };
    if (!token) return ask();
    try {
      setBusy(`Reading ${who?.name}'s sheet (read only)…`);
      let tabs;
      try { tabs = await readAgentSheet(token, who!.sheetId); }
      catch (e) { if (/permission|sign-in expired|401|403/i.test((e as Error).message)) return ask(); throw e; }
      const sheet = buildAgentData(tabs);
      setBusy(`Reading ${who?.name}'s Dispatch…`);
      const mine = await liveLoad<AgentData>(storageKey(agent as AgentId));
      if (!mine) throw new Error(`${who?.name} has no Dispatch data yet.`);
      setPlan(catchUp(mine, sheet, fromLocal(since)));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };
  // back from Google's permission screen: read straight away
  useEffect(() => { if (saved) { try { sessionStorage.removeItem(RESUME); } catch { /* */ } void read(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!plan) return;
    setBusy('Saving…');
    try {
      const key = inboxKey(agent as AgentId);
      const box = await loadState<Inbox<unknown, unknown>>(key);
      await saveState(key, mergeInbox(box, { contacts: [], removed: [], changed: plan.changed, events: plan.events, sales: plan.sales, noSales: plan.noSales }));
      say(`${who?.name}'s sheet work is on its way: ${plan.changed.length} contacts, ${plan.events.length} activity rows. It shows on their Dispatch within a minute of it being open.`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };

  return <Dialog title="Bring over sheet work" onClose={onClose}>
    <div className="newev">
      <p className="hint">For an agent who worked in their old Truckers sheet after switching to Dispatch. Reads the sheet <b>read only</b>, then brings over the contacts it touched since the time you pick, their activity, sales and no-sales. Anything Dispatch dialed more recently is left as it is.</p>
      <label><span>Agent</span><select value={agent} onChange={e => { setAgent(e.target.value); setPlan(null); }}>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label><span>Sheet work since</span><input type="datetime-local" value={since} onChange={e => { setSince(e.target.value); setPlan(null); }} /></label>
      {busy && <p className="hint">{busy}</p>}
      {err && <p className="warnline">{err}</p>}
      {plan && <div className="catchplan">
        <p><b>{plan.touched}</b> contacts worked on the sheet since then.</p>
        <ul>
          <li><b>{plan.changed.length}</b> will be updated in Dispatch (tag, dials, notes, call-back time, numbers)</li>
          <li><b>{plan.events.length}</b> activity rows added (dials and results, with their times)</li>
          {(plan.sales.length > 0 || plan.noSales.length > 0) && <li><b>{plan.sales.length}</b> sales and <b>{plan.noSales.length}</b> no-sales added</li>}
          {plan.newerInDispatch.length > 0 && <li><b>{plan.newerInDispatch.length}</b> left as they are, because Dispatch has later work on them: {plan.newerInDispatch.slice(0, 5).join(', ')}{plan.newerInDispatch.length > 5 ? '…' : ''}</li>}
          {plan.unmatched.length > 0 && <li className="warnline"><b>{plan.unmatched.length}</b> not found in Dispatch, skipped: {plan.unmatched.slice(0, 5).join(', ')}{plan.unmatched.length > 5 ? '…' : ''}</li>}
        </ul>
        {plan.changed.length > 0 && <table className="rt"><thead><tr><th>Contact</th><th>Result on the sheet</th><th className="n">Dials</th></tr></thead>
          <tbody>{plan.changed.slice(0, 8).map(c => <tr key={c.id}><td>{c.first} {c.last}</td><td>{c.tag ? c.tag.slice(0, 40) : 'Dialed'}</td><td className="n">{c.dials}</td></tr>)}</tbody></table>}
        {plan.changed.length > 8 && <p className="hint">and {plan.changed.length - 8} more</p>}
      </div>}
      <div className="bar"><span className="muted" />
        <button className="btn" onClick={onClose}>Cancel</button>
        {!plan ? <button className="btn primary" disabled={!!busy} onClick={() => void read()}>Read the sheet</button>
          : <button className="btn primary" disabled={!!busy || (!plan.changed.length && !plan.events.length && !plan.sales.length && !plan.noSales.length)} onClick={() => void save()}>Bring it over</button>}
      </div>
    </div>
  </Dialog>;
}

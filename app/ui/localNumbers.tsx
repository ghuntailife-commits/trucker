'use client';
// "Get local numbers" (George, 2026-11-27): buys Twilio numbers near the team's contacts in a couple of minutes.
// Counts every agent's contacts by area code, suggests one number per state plus the busiest area codes, finds
// real numbers, shows the list and the monthly cost, and buys only after "Buy". Each number comes set up for
// Dispatch calls, texts (when the campaign is approved) and the caller-ID registrations.
import { useEffect, useMemo, useState } from 'react';
import { LIVE, db } from '../../src/live/supabase';
import { liveLoad } from '../../src/live/kvStore';
import { storageKey } from '../../src/app-store/agentSeeds';
import { ROSTER } from '../../src/team/roster';
import type { AgentId } from '../../src/team/agents';
import { quoNumbers } from '../../src/team/agents';
import { exactShare, NUMBER_MONTHLY, planNumbers, type NumberTarget } from '../../src/twilio/plan';
import { Dialog } from './shared';

async function api<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const { data } = await db().auth.getSession();
  const r = await fetch('/api/twilio/numbers', { method, headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Something went wrong (${r.status})`);
  return j;
}
const money = (n: number) => `$${n.toFixed(n < 100 ? 2 : 0)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

type Found = { key: string; phone: string; where: string; exact: boolean };

export function LocalNumbersDialog({ owned, onAdded, onClose }: { owned: string; onAdded: (nums: string[]) => void; onClose: () => void }) {
  const [phones, setPhones] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [byState, setByState] = useState(true);
  const [top, setTop] = useState(25);
  const [found, setFound] = useState<Found[] | null>(null);
  const [done, setDone] = useState<{ bought: { phone: string; texting: boolean; callerId: number }[]; failed: { phone: string; why: string }[] } | null>(null);
  const mine = useMemo(() => quoNumbers(owned), [owned]);

  useEffect(() => {
    if (!LIVE) { setPhones([]); return; }
    (async () => {
      const all: string[] = [];
      for (const r of ROSTER) {
        const d = await liveLoad<{ contacts?: { phone?: string; backup?: string }[] }>(storageKey(r.id as AgentId)).catch(() => null);
        for (const c of d?.contacts ?? []) { if (c.phone) all.push(c.phone); }
      }
      setPhones(all);
    })().catch(e => setErr((e as Error).message));
  }, []);

  const plan = useMemo(() => (phones ? planNumbers(phones, mine, top) : null), [phones, mine, top]);
  const targets: NumberTarget[] = plan ? [...(byState ? plan.states : []), ...plan.areas] : [];
  const share = phones && plan ? exactShare(phones, mine, targets) : 0;
  const byKey = new Map(targets.map(t => [t.key, t]));

  const find = async () => {
    setErr(''); const out: Found[] = [];
    try {
      for (let i = 0; i < targets.length; i += 15) {
        setBusy(`Finding numbers… ${Math.min(i + 15, targets.length)} of ${targets.length}`);
        const r = await api<{ found: Found[] }>('POST', { action: 'search', targets: targets.slice(i, i + 15).map(t => ({ key: t.key, areaCode: t.areaCode, state: t.state })) });
        out.push(...r.found);
      }
      setFound(out);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  const buy = async () => {
    if (!found?.length) return;
    setErr(''); const bought: { phone: string; texting: boolean; callerId: number }[] = []; const failed: { phone: string; why: string }[] = [];
    try {
      for (let i = 0; i < found.length; i += 10) {
        setBusy(`Buying and setting up… ${Math.min(i + 10, found.length)} of ${found.length}`);
        const r = await api<{ bought: typeof bought; failed: typeof failed }>('POST', { action: 'buy',
          numbers: found.slice(i, i + 10).map(f => { const t = byKey.get(f.key); return { phone: f.phone, label: t ? (t.kind === 'state' ? t.state : `${t.areaCode} ${t.state}`) : '' }; }) });
        bought.push(...r.bought); failed.push(...r.failed);
        if (r.bought.length) onAdded(r.bought.map(b => b.phone));   // saved as they come, so a stop halfway loses nothing
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); setDone({ bought, failed }); }
  };

  return <Dialog title="Get local numbers" onClose={busy ? () => {} : onClose} wide>
    <div className="newev localnums">
      {!LIVE && <p className="hint">This works on the live Dispatch only.</p>}
      {!phones && !err && <p className="hint">Counting your team&rsquo;s contacts by area code…</p>}
      {err && <p className="warnline">{err}</p>}

      {plan && !found && !done && <>
        <p className="hint">Each call shows the contact a number from their own area code when the team has one, else one from their state, else their time zone. You have {mine.length} number{mine.length === 1 ? '' : 's'} now. {plan.total.toLocaleString()} contacts across the team.</p>
        <label className="lnopt"><input type="checkbox" checked={byState} onChange={e => setByState(e.target.checked)} />
          <span><b>One number in each state</b> your contacts are in ({plan.states.length} state{plan.states.length === 1 ? '' : 's'} without one). Each in that state&rsquo;s busiest area code.</span></label>
        {byState && plan.states.length > 0 && <div className="chips">{plan.states.map(s => <span key={s.key} className="chip" title={`${s.contacts} contacts`}>{s.state} {s.areaCode}</span>)}</div>}
        <label className="lnopt"><span><b>Plus your busiest area codes</b></span>
          <select value={top} onChange={e => setTop(Number(e.target.value))}>{[0, 10, 25, 50, 75].map(n => <option key={n} value={n}>{n === 0 ? 'None' : `Top ${n}`}</option>)}</select></label>
        <div className="lnsum">
          <div><b>{targets.length}</b><small>numbers</small></div>
          <div><b>{money(targets.length * NUMBER_MONTHLY)}</b><small>about a month</small></div>
          <div><b>{pct(share)}</b><small>see their own area code</small></div>
          <div><b>{pct(plan.total ? (byState ? plan.coveredByState : plan.coveredByArea) / plan.total : 0)}</b><small>see their own state</small></div>
        </div>
        <p className="hint">Every number can call, text and send pictures, and is set up for Dispatch, your &ldquo;Dispatch&rdquo; texting group and your caller-ID registrations. No number is bought until you see the list and press Buy.</p>
        <div className="bar"><span className="muted" /><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!targets.length || !!busy || !LIVE} onClick={() => void find()}>Find {targets.length} numbers</button></div>
      </>}

      {found && !done && <>
        <p className="hint">Found {found.length} of {targets.length}. Remove any you don&rsquo;t want, then buy.</p>
        <div className="lnlist"><table className="rt"><thead><tr><th>For</th><th>Number</th><th>Where</th><th /></tr></thead>
          <tbody>{found.map(f => { const t = byKey.get(f.key); return <tr key={f.phone}>
            <td>{t ? (t.kind === 'state' ? `${t.state} (${t.contacts} contacts)` : `${t.areaCode} area code (${t.contacts})`) : ''}</td>
            <td>{fmt(f.phone)}{!f.exact && <small className="muted"> nearby code</small>}</td><td>{f.where}</td>
            <td><button className="linkish" onClick={() => setFound(x => x!.filter(y => y.phone !== f.phone))}>Remove</button></td></tr>; })}</tbody></table></div>
        <div className="bar"><span className="muted">{busy}</span><button className="btn" disabled={!!busy} onClick={() => setFound(null)}>Back</button>
          <button className="btn primary" disabled={!found.length || !!busy} onClick={() => void buy()}>Buy {found.length} numbers · about {money(found.length * NUMBER_MONTHLY)}/month</button></div>
      </>}

      {busy && !found && <p className="hint">{busy}</p>}

      {done && <>
        <p><b>{done.bought.length}</b> numbers bought and added to your team numbers. Calls start using them right away.</p>
        {done.bought.length > 0 && <ul className="hint">
          <li>Texting group: {done.bought.filter(b => b.texting).length} of {done.bought.length} added{done.bought.some(b => !b.texting) ? ' (the rest: add them to the Dispatch messaging service in Twilio)' : ''}.</li>
          <li>Caller-ID registrations: {done.bought.filter(b => b.callerId > 0).length} of {done.bought.length} added. Voice Integrity picks them up once it&rsquo;s approved.</li>
        </ul>}
        {done.failed.length > 0 && <div className="warnbox">{done.failed.map(f => <p key={f.phone}>{fmt(f.phone)}: {f.why}</p>)}</div>}
        <div className="bar"><span className="muted" /><button className="btn primary" onClick={onClose}>Done</button></div>
      </>}
    </div>
  </Dialog>;
}

/** Calls each number made today, for the Dispatch calling panel (spam watch). */
export function NumberUsage({ cap }: { cap: number }) {
  const [rows, setRows] = useState<{ phone: string; name: string; today: number; inTeam: boolean }[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (LIVE) api<{ numbers: NonNullable<typeof rows> }>('GET').then(r => setRows(r.numbers), e => setErr((e as Error).message)); }, []);
  if (!LIVE) return null;
  if (err) return <p className="hint">Calls per number: {err}</p>;
  if (!rows) return <p className="hint">Loading calls per number…</p>;
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.today - a.today);
  return <details className="lnusage"><summary>Calls per number today ({rows.reduce((t, r) => t + r.today, 0)} total)</summary>
    <table className="rt"><tbody>{sorted.map(r => <tr key={r.phone}><td>{fmt(r.phone)}{!r.inTeam && <small className="muted"> not in team numbers</small>}</td>
      <td className="n">{r.today}{r.today >= cap ? <span className="spill amber" style={{ marginLeft: 6 }}>resting</span> : null}</td></tr>)}</tbody></table></details>;
}

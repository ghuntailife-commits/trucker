'use client';
// Live-only screens: sign-in, "not on the team", the save status, and George's switch-over from the sheets.
import { useEffect, useState, type ReactNode } from 'react';
import { db, signInEmail, signInGoogle, signOut, whoAmI, type Person } from '../../src/live/supabase';
import { liveLoad, onSaveStatus, setMe, writeNow, type SaveStatus } from '../../src/live/kvStore';
import { readAgentSheet, readRegistryEmails, setOnWait } from '../../src/live/sheets';
import { buildAgentData, type AgentReport, type SheetTabs } from '../../src/migrate/agentSheet';
import { ROSTER } from '../../src/team/roster';
import { rosterAgent } from '../../src/team/agents';
import { storageKey } from '../../src/app-store/agentSeeds';
import { tagKind } from '../../src/rules/tags';
import { Mark, Wordmark } from './sidebar';

/** Shows the sign-in screen until someone on the team is signed in, then renders the app as them. */
export function LiveGate({ children }: { children: (p: Person) => ReactNode }) {
  const [st, setSt] = useState<{ kind: 'loading' } | { kind: 'out' } | { kind: 'stranger'; email: string } | { kind: 'in'; p: Person } | { kind: 'error'; msg: string }>({ kind: 'loading' });
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await db().auth.getSession();
        if (!data.session) return setSt({ kind: 'out' });
        const p = await whoAmI();
        if (!p) return setSt({ kind: 'stranger', email: data.session.user.email ?? '' });
        setMe(p.agent_id, p.role === 'admin');
        setSt({ kind: 'in', p });
      } catch (e) { setSt({ kind: 'error', msg: (e as Error).message }); }
    };
    check();
    const { data } = db().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') check(); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (st.kind === 'in') return <>{children(st.p)}</>;
  return (
    <div className="signin">
      <div className="signcard">
        <div className="signbrand"><Mark size={40} /><Wordmark height={30} /></div>
        {st.kind === 'loading' && <p className="hint">Loading…</p>}
        {st.kind === 'error' && <p className="warnline">Could not reach the database: {st.msg}</p>}
        {st.kind === 'stranger' && <>
          <p><b>{st.email}</b> is not on the team yet.</p>
          <p className="hint">Ask George to add this email, then sign in again.</p>
          <button className="btn" onClick={() => signOut()}>Use a different email</button>
        </>}
        {st.kind === 'out' && <SignIn />}
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const send = async () => {
    setErr('');
    const { error } = await signInEmail(email.trim());
    if (error) setErr(error.message); else setSent(email.trim());
  };
  if (sent) return <><p>Check <b>{sent}</b> for a sign-in link from Dispatch.</p><p className="hint">Open it on this device. It can take a minute, and may land in spam.</p>
    <button className="linkish" onClick={() => setSent(null)}>Use a different email</button></>;
  return <>
    <h2>Sign in</h2>
    <button className="btn primary wide" onClick={() => signInGoogle()}>Continue with Google</button>
    <div className="or"><span>or</span></div>
    <label className="field"><span>Email (any kind: Gmail, iCloud, Outlook…)</span>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && email.includes('@')) send(); }} placeholder="you@example.com" /></label>
    <button className="btn wide" disabled={!email.includes('@')} onClick={send}>Email me a sign-in link</button>
    {err && <p className="warnline">{err}</p>}
  </>;
}

/** The footer's save line: saved / saving / could not save. */
export function useSaveStatus(): SaveStatus | null {
  const [s, setS] = useState<SaveStatus | null>(null);
  useEffect(() => onSaveStatus(setS), []);
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Switch-over: read every agent's sheet once (read only), preview the counts, then save on Confirm and check them.

interface Row { id: string; name: string; sheetId: string; email: string; status: 'waiting' | 'reading' | 'ready' | 'saving' | 'done' | 'error';
  msg?: string; report?: AgentReport & { appts: number; lastAt: number | null }; data?: ReturnType<typeof buildAgentData>; existing?: number;
  check?: { contacts: number; log: number; sales: number; noSales: number }; include: boolean;
  tabs?: SheetTabs; skip?: string[] }

/** Tabs left out unless ticked: blank templates and copies of another tab. (George keeps his Utah tab, 2026-11-26.) */
const skipByDefault = (_agent: string, list: string) => /template/i.test(list) || /^copy of /i.test(list);

function built(agent: string, tabs: SheetTabs, skip: string[]) {
  const data = buildAgentData({ ...tabs, lists: tabs.lists.filter(l => !skip.includes(l.list)) });
  const lastAt = data.log.length ? data.log[data.log.length - 1].at : null;
  const appts = data.contacts.filter(c => tagKind(c.tag) === 'scheduled').length;
  return { data, report: { ...data.report, appts, lastAt } };
}

const fmt = (n: number) => n.toLocaleString('en-US');
const when = (t: number | null) => t == null ? '' : new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(t);

export function SwitchPage({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => ROSTER.map(r => ({ id: r.id, name: r.name, sheetId: r.sheetId, email: '', status: 'waiting', include: !['cameron', 'seth', 'general'].includes(r.id) })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upd = (id: string, ch: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...ch } : r)));

  useEffect(() => { db().auth.getSession().then(({ data }) => setToken(data.session?.provider_token ?? null)); }, []);
  useEffect(() => { (async () => {
    const { data } = await db().from('people').select('agent_id,email');
    const have = new Map((data ?? []).map((p: { agent_id: string; email: string | null }) => [p.agent_id, p.email ?? '']));
    setRows(rs => rs.map(r => ({ ...r, email: r.email || have.get(r.id) || '' })));
  })(); }, []);

  const readAll = async () => {
    if (!token) return;
    setBusy(true); setErr('');
    try {
      const emails = await readRegistryEmails(token);
      setRows(rs => rs.map(r => ({ ...r, email: r.email || emails[r.name.toLowerCase()] || Object.entries(emails).find(([k]) => k.split(/\s+/)[0] === r.name.toLowerCase())?.[1] || '' })));
    } catch (e) { setErr(`Registry: ${(e as Error).message}`); }
    for (const r of rows) {
      if (!r.include || r.status === 'ready' || r.status === 'done') continue;   // a second click only retries the rest
      upd(r.id, { status: 'reading', msg: undefined });
      setOnWait(() => upd(r.id, { msg: 'Google asked us to slow down. Waiting a moment, then trying again…' }));
      try {
        const tabs = await readAgentSheet(token, r.sheetId);
        const skip = tabs.lists.map(l => l.list).filter(l => skipByDefault(r.id, l));
        const { data, report } = built(r.id, tabs, skip);
        const existing = await db().from('kv').select('part', { count: 'exact', head: true }).eq('key', storageKey(r.id));
        upd(r.id, { status: 'ready', tabs, skip, data, report, existing: existing.count ?? 0, msg: tabs.lists.length ? undefined : 'No contact lists found on this sheet' });
      } catch (e) { upd(r.id, { status: 'error', msg: (e as Error).message }); }
    }
    setOnWait(null);
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true); setErr('');
    // 1. who is on the team (sign-in emails, roles, who is under whom)
    const people = ROSTER.map(r => ({ agent_id: r.id, name: r.name, role: r.role, lead_id: r.lead,
      email: rows.find(x => x.id === r.id)?.email.trim().toLowerCase() || null, updated_at: new Date().toISOString() }));
    const leadsFirst = [...people.filter(p => !p.lead_id), ...people.filter(p => p.lead_id)];
    const { error } = await db().from('people').upsert(leadsFirst, { onConflict: 'agent_id' });
    if (error) { setErr(`Saving the team list: ${error.message}`); setBusy(false); return; }
    // 2. each agent's data, then read it back and compare
    for (const r of rows) {
      if (!r.include || r.status !== 'ready' || !r.data) continue;
      upd(r.id, { status: 'saving' });
      try {
        const key = storageKey(r.id);
        await liveLoad(key);   // so a second run also removes parts the sheet no longer has
        const { contacts, log, sales, noSales } = r.data;
        const goal = rosterAgent(ROSTER.find(x => x.id === r.id)!).goal;
        await writeNow(key, { v: 1, contacts, log, sales, noSales, snap: 0, savedOrder: [], savedAppts: [], skips: [], undo: [], lastBackupTry: {}, goal, switchedAt: Date.now() }, r.id);
        const back = await liveLoad<{ contacts: unknown[]; log: unknown[]; sales: unknown[]; noSales: unknown[] }>(key);
        const check = { contacts: back?.contacts.length ?? 0, log: back?.log.length ?? 0, sales: back?.sales.length ?? 0, noSales: back?.noSales.length ?? 0 };
        const ok = check.contacts === contacts.length && check.log === log.length && check.sales === sales.length && check.noSales === noSales.length;
        upd(r.id, { status: ok ? 'done' : 'error', check, msg: ok ? undefined : 'Read-back counts do not match the sheet' });
      } catch (e) { upd(r.id, { status: 'error', msg: (e as Error).message }); }
    }
    setBusy(false);
  };

  const ready = rows.filter(r => r.include && r.status === 'ready');
  const done = rows.filter(r => r.status === 'done').length;
  const total = (k: 'contacts' | 'log' | 'sales' | 'noSales') => rows.reduce((n, r) => n + (r.include && r.data ? r.data[k].length : 0), 0);
  return (
    <section className="panel switch">
      <h2>Switch over from the sheets</h2>
      <p className="hint">Reads each agent&rsquo;s Truckers sheet once, <b>read only</b>, and copies every contact, note, tag, dial, sale, no-sale and appointment, with times to the second. Nothing is written to any sheet. Nothing is saved until you click Confirm.</p>
      {!token ? (
        <div className="bar"><button className="btn primary" onClick={() => signInGoogle(true)}>Connect Google Sheets (read only)</button>
          <span className="hint">Google will ask to let Dispatch see your spreadsheets. It cannot change them.</span></div>
      ) : (
        <div className="bar">
          <button className="btn primary" disabled={busy} onClick={readAll}>{rows.some(r => r.status === 'ready') ? 'Read again (only the ones not ready)' : '1. Read all sheets'}</button>
          <button className="btn go" disabled={busy || !ready.length} onClick={confirm}>2. Confirm and save {ready.length ? `${ready.length} agents` : ''}</button>
          {done > 0 && !busy && <button className="btn" onClick={onDone}>Done</button>}
          <button className="btn" disabled={busy} onClick={() => signInGoogle(true)} title="Asks Google again for read-only access to your spreadsheets">Reconnect Google Sheets</button>
        </div>
      )}
      {err && <p className="warnline">{err}</p>}
      <div className="tablewrap"><table className="rt switcht">
        <thead><tr><th>Copy</th><th>Agent</th><th>Sign-in email</th><th>Lists</th><th className="n">Contacts</th><th className="n">Activity rows</th><th className="n">Sales</th><th className="n">No sales</th><th className="n">Booked</th><th>Last activity</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className={r.status}>
            <td><input type="checkbox" checked={r.include} disabled={busy} onChange={e => upd(r.id, { include: e.target.checked })} aria-label={`Copy ${r.name}`} /></td>
            <td><b>{r.name}</b></td>
            <td><input className="emailin" value={r.email} disabled={busy} placeholder="needs an email" onChange={e => upd(r.id, { email: e.target.value })} /></td>
            <td className="hint lists">{r.tabs && r.tabs.lists.map(l => {
              const off = (r.skip ?? []).includes(l.list);
              const n = r.data?.report.perList.find(p => p.list === l.list)?.contacts;
              return <button key={l.list} className={`lchip ${off ? 'off' : ''}`} disabled={busy || r.status !== 'ready'}
                title={off ? 'Left out. Click to copy this list too.' : 'Click to leave this list out'}
                onClick={() => { const skip = off ? (r.skip ?? []).filter(x => x !== l.list) : [...(r.skip ?? []), l.list]; upd(r.id, { skip, ...built(r.id, r.tabs!, skip) }); }}>
                {off ? '✕ ' : ''}{l.list}{!off && n != null ? ` ${n}` : ''}</button>;
            })}</td>
            <td className="n">{r.data ? fmt(r.data.contacts.length) : ''}</td>
            <td className="n">{r.data ? fmt(r.data.log.length) : ''}</td>
            <td className="n">{r.data ? r.data.sales.length : ''}</td>
            <td className="n">{r.data ? r.data.noSales.length : ''}</td>
            <td className="n">{r.report ? r.report.appts : ''}</td>
            <td className="hint">{r.report ? when(r.report.lastAt) : ''}</td>
            <td>{{ waiting: '', reading: 'Reading…', ready: r.existing ? 'Ready · replaces what is in Dispatch' : 'Ready', saving: 'Saving…', done: 'Copied and checked ✓', error: '' }[r.status]}
              {r.msg && <div className="warnline">{r.msg}</div>}
              {r.report && r.report.logUnmatched > 0 && r.status !== 'error' && <div className="hint">{r.report.logUnmatched} activity rows had no matching contact (kept in history)</div>}</td>
          </tr>))}
        </tbody>
        <tfoot><tr><td /><td><b>Total</b></td><td /><td /><td className="n">{fmt(total('contacts'))}</td><td className="n">{fmt(total('log'))}</td><td className="n">{total('sales')}</td><td className="n">{total('noSales')}</td><td /><td /><td>{done ? `${done} copied` : ''}</td></tr></tfoot>
      </table></div>
    </section>
  );
}

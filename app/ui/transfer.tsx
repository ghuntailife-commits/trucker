'use client';
// Move contacts between agents (George, 2026-11-26): open an agent's contacts, tick some (shift-click for a range),
// pick who gets them, review, move. Opened from the Contact library (admin only).
import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '../../src/rules/types';
import type { AgentId } from '../../src/team/agents';
import type { Team } from '../../src/app-store/useTeam';
import type { Library } from '../../src/app-store/useLibrary';
import { planTransfer, type MoveLine } from '../../src/library/transfer';
import { tagShort } from '../../src/rules/tags';
import { Dialog, TZ, ShowCount } from './shared';
import { useSort } from './sort';
import { useRangePick } from './rangePick';

let seq = 0;
const newId = () => `c-${Date.now().toString(36)}-m${(seq++).toString(36)}`;
const status = (c: Contact) => (c.tag ? tagShort(c.tag) : c.dials ? 'Retry' : 'Fresh');

export function MoveContacts({ t, lib, now, onClose, say }: { t: Team; lib: Library; now: number; onClose: () => void; say: (s: string, k?: 'ok' | 'warn') => void }) {
  const agents = t.team.agents.filter(a => a.active);
  const [from, setFrom] = useState<AgentId | ''>('');
  const [to, setTo] = useState<AgentId | ''>('');
  const [list, setList] = useState<Contact[] | null>(null);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(500);
  const [plan, setPlan] = useState<MoveLine[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setList(null); setPicked(new Set()); setPlan(null);
    if (!from) return;
    let live = true;
    lib.contactsOf(from, now).then(cs => { if (live) setList(cs); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const states = useMemo(() => [...new Set((list ?? []).map(c => c.state).filter(Boolean))].sort(), [list]);
  const rows = useMemo(() => {
    const n = q.toLowerCase().trim();
    return (list ?? []).filter(c => (st === 'all' || c.state === st)
      && (!n || `${c.first} ${c.last} ${c.company} ${c.city} ${c.phone}`.toLowerCase().includes(n)));
  }, [list, q, st]);
  const { sorted, th } = useSort(rows, { name: c => `${c.last} ${c.first}`, company: c => c.company, st: c => c.state, city: c => c.city,
    phone: c => c.phone, status: c => status(c), dials: c => c.dials });
  const shown = sorted.slice(0, limit);
  const pick = useRangePick(setPicked, shown.map(c => c.id));
  const fromA = agents.find(a => a.id === from), toA = agents.find(a => a.id === to);

  const review = async () => {
    if (!fromA || !toA || !list) return;
    const theirs = await lib.contactsOf(toA.id, now);
    const chosen = list.filter(c => picked.has(c.id));
    setPlan(planTransfer(chosen, fromA, toA, theirs, { now, tz: TZ, nextId: i => `${newId()}-${i}` }));
  };
  const move = async () => {
    if (!plan || !fromA || !toA) return;
    setBusy(true);
    const n = await lib.transfer(fromA.id, toA.id, toA.name, plan);
    setBusy(false);
    say(n ? `Moved ${n} contact${n === 1 ? '' : 's'} from ${fromA.name} to ${toA.name}. They show up in their lists next time each of them opens Dispatch.` : 'Nothing was moved.', n ? 'ok' : 'warn');
    onClose();
  };

  if (plan && fromA && toA) {
    const ok = plan.filter(l => l.ok).length;
    return <Dialog title={`Move ${ok} of ${plan.length} from ${fromA.name} to ${toA.name}?`} onClose={() => setPlan(null)} wide>
      <div className="plan">
        {plan.map(l => <div key={l.id} className={l.ok ? 'ok' : 'no'}><span>{l.ok ? '✓' : '✕'}</span><b>{l.name}</b><em>{l.result}</em></div>)}
      </div>
      <div className="bar">
        <button className="btn" onClick={() => setPlan(null)}>Back</button>
        <button className="btn primary" disabled={!ok || busy} onClick={move}>{busy ? 'Moving…' : `Move ${ok}`}</button>
      </div>
    </Dialog>;
  }

  return <Dialog title="Move contacts between agents" onClose={onClose} wide>
    <div className="movebar">
      <label>From <select value={from} onChange={e => setFrom(e.target.value as AgentId | '')}>
        <option value="">Pick an agent</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>To <select value={to} onChange={e => setTo(e.target.value as AgentId | '')}>
        <option value="">Pick an agent</option>{agents.filter(a => a.id !== from).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {list && <>
        <select value={st} onChange={e => setSt(e.target.value)} aria-label="State"><option value="all">All states</option>{states.map(s => <option key={s}>{s}</option>)}</select>
        <input className="libq" placeholder="Search name, company, city, phone" value={q} onChange={e => setQ(e.target.value)} />
      </>}
    </div>
    {toA && <p className="hint">{toA.name} is licensed in {toA.states.join(', ') || 'no states yet'}. Contacts in other states are skipped. Click one, then shift-click another to pick everything between.</p>}
    {!from ? <p className="muted">Pick whose contacts to open.</p> : !list ? <p className="muted">Loading {fromA?.name}&rsquo;s contacts…</p> :
      <div className="tscroll tall">
        <table className="qt lib">
          <thead><tr>
            <th className="pickc"><input type="checkbox" aria-label="Pick every contact shown" checked={!!shown.length && shown.every(c => picked.has(c.id))}
              onChange={e => setPicked(x => { const s = new Set(x); for (const c of shown) { if (e.target.checked) s.add(c.id); else s.delete(c.id); } return s; })} /></th>
            {th('name', 'Contact')}{th('company', 'Company')}{th('st', 'State')}{th('city', 'City')}{th('phone', 'Phone')}{th('status', 'Status')}{th('dials', 'Dials', 'num')}
          </tr></thead>
          <tbody>
            {shown.map(c => <tr key={c.id} className={picked.has(c.id) ? 'typed' : ''}>
              <td className="pickc"><input type="checkbox" aria-label={`Pick ${c.first} ${c.last}`} checked={picked.has(c.id)} onChange={e => pick(c.id, e.target.checked, e)} /></td>
              <td className="strong">{c.first} {c.last}</td><td>{c.company}</td><td>{c.state}</td><td>{c.city}</td>
              <td className="mono">{c.phone || <span className="muted">Needs a number</span>}</td><td>{status(c)}</td><td className="num">{c.dials}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={8} className="emptyrow">No contacts match.</td></tr>}
          </tbody>
        </table>
      </div>}
    <div className="bar">
      {list && rows.length > 100 && <ShowCount value={limit} total={rows.length} onChange={setLimit} />}
      <span className="muted">{picked.size ? `${picked.size} picked` : ''}</span>
      <button className="btn" onClick={onClose}>Close</button>
      <button className="btn primary" disabled={!picked.size || !toA} onClick={review}>Review{picked.size ? ` ${picked.size}` : ''}{toA ? ` for ${toA.name}` : ''}</button>
    </div>
  </Dialog>;
}

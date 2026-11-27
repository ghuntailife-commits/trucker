'use client';
// Admin only: search every agent's contacts at once (George, 2026-11-27). Click a row to open that agent's Dispatch on the contact.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, TZ } from './shared';
import { searchAll, type SlimContact } from '../../src/admin/allSearch';
import { loadAllContacts } from '../../src/live/allContacts';
import { fmtPhone } from '../../src/contacts/phones';
import { tagShort } from '../../src/rules/tags';
import { md } from '../../src/rules/time';

export function AllSearch({ agents, start, onClose, onOpen }: { agents: { id: string; name: string }[]; start: string; onClose: () => void;
  onOpen: (agent: string, id: string) => void }) {
  const [q, setQ] = useState(start);
  const [who, setWho] = useState('');
  const [rows, setRows] = useState<SlimContact[] | null>(null);
  const [err, setErr] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const load = (fresh = false) => { setErr(''); loadAllContacts(agents.map(a => a.id), fresh).then(setRows, e => setErr((e as Error).message)); };
  useEffect(() => { load(); box.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const name = useMemo(() => new Map(agents.map(a => [a.id, a.name])), [agents]);
  const res = useMemo(() => (rows ? searchAll(rows, q, who || undefined) : { hits: [], total: 0 }), [rows, q, who]);
  const ph = (s: string) => (s ? fmtPhone(s) ?? s : '');
  return (
    <Dialog title="Search every agent" onClose={onClose} wide="x">
      <p className="muted small">Only you can see this. It looks through every agent&rsquo;s contacts by name, phone, company, job, city, state or email.</p>
      <div className="allsearch-bar">
        <input ref={box} className="libq" placeholder="Name, phone, company, city..." value={q} onChange={e => setQ(e.target.value)}
               onKeyDown={e => { if (e.key === 'Escape') onClose(); }} aria-label="Search every agent" />
        <select className="libq" value={who} onChange={e => setWho(e.target.value)} aria-label="Agent">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="btn" onClick={() => { setRows(null); load(true); }} title="Load the newest copy of everyone's contacts">Refresh</button>
      </div>
      {err && <p className="preview err">{err}</p>}
      {!rows && !err && <p className="muted">Loading everyone&rsquo;s contacts&hellip;</p>}
      {rows && <p className="muted small">{res.total ? `${res.total.toLocaleString('en-US')} match${res.total === 1 ? '' : 'es'}${res.total > res.hits.length ? `, showing the first ${res.hits.length}` : ''}`
        : q.trim().length < 2 ? `${rows.length.toLocaleString('en-US')} contacts across ${new Set(rows.map(r => r.a)).size} agents. Type at least 2 letters or 4 digits.` : 'No matches.'}</p>}
      {res.hits.length > 0 && <div className="tscroll allsearch">
        <table className="rt">
          <thead><tr><th>Agent</th><th>Contact</th><th>Phone</th><th>Backup</th><th>Company &mdash; job</th><th>Location</th><th>List</th><th>Status</th><th>Dials</th><th>Last dialed</th></tr></thead>
          <tbody>{res.hits.map(r => (
            <tr key={r.a + r.id} className="clickrow" tabIndex={0} onClick={() => onOpen(r.a, r.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r.a, r.id); }}
                title={`Open ${name.get(r.a) ?? r.a}'s Dispatch on this contact`}>
              <td><span className="pill">{name.get(r.a) ?? r.a}</span></td>
              <td><b>{r.n || '(no name)'}</b>{r.e && <div className="muted small">{r.e}</div>}</td>
              <td className="nowrap">{ph(r.p)}</td><td className="nowrap muted">{ph(r.b)}</td>
              <td>{[r.co, r.j].filter(Boolean).join(' — ')}</td>
              <td>{[r.ci, r.st].filter(Boolean).join(', ')}</td>
              <td>{r.l}</td>
              <td>{r.t ? tagShort(r.t) : ''}{r.ca ? <div className="muted small">{md(r.ca, TZ)}</div> : null}</td>
              <td className="num">{r.d}</td>
              <td className="nowrap">{r.ld ? md(r.ld, TZ) : ''}</td>
            </tr>))}
          </tbody>
        </table>
      </div>}
    </Dialog>
  );
}

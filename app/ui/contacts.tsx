'use client';
// Contacts: every contact on every list, with search, filters, details, edits, add, import and delete.
import { useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { tagKind, tagShort } from '../../src/rules/tags';
import { md, mdTime } from '../../src/rules/time';
import { notesNewestFirst } from '../../src/rules/notes';
import { parseTable, toCsv } from '../../src/contacts/csv';
import { IMPORT_COLUMNS, planImport, type ImportLine } from '../../src/contacts/importer';
import { needsGroup } from '../../src/contacts/needs';
import { EDIT_LABELS, planEdit, type EditFields } from '../../src/contacts/edit';
import { TZ, ZONE_NAME, Dialog, saveText } from './shared';

type D = ReturnType<typeof useDialer>;
type Group = 'all' | 'working' | 'callback' | 'appt' | 'notint' | 'bad' | 'needs' | 'dnc' | 'sold';
const GROUPS: [Group, string][] = [['all', 'All'], ['working', 'Working'], ['callback', 'Callbacks'], ['appt', 'Appointments'],
  ['notint', 'Not interested'], ['bad', 'Bad number'], ['needs', 'Needs number'], ['dnc', 'Do not call'], ['sold', 'Sold']];
const PAGE = 100;

function groupOf(c: Contact): Group {
  if (needsGroup(c) === 'needs' || needsGroup(c) === 'cannotFind') return 'needs';
  const k = tagKind(c.tag);
  if (k === 'callback') return 'callback';
  if (k === 'scheduled' || k === 'noshow' || k === 'calledInto') return 'appt';
  if (k === 'notInterested') return 'notint';
  if (k === 'bad') return 'bad';
  if (k === 'dnc' || k === 'given') return 'dnc';
  if (k === 'sold' || k === 'presented') return 'sold';
  return 'working';
}
const pillFor = (c: Contact) => {
  const g = groupOf(c);
  if (c.status === 'Cannot Find') return ['Cannot find', 'Done'];
  if (g === 'needs') return ['Needs number', 'NewNumber'];
  if (!c.tag) return [c.dials ? 'Retry' : 'Fresh', c.dials ? 'Retry' : 'Fresh'];
  const k = tagKind(c.tag);
  return [tagShort(c.tag), k === 'callback' ? 'Callback' : k === 'noshow' || k === 'bad' || k === 'dnc' ? 'NoShow' : k === 'sold' ? 'Sold'
    : k === 'scheduled' || k === 'calledInto' ? 'Confirm' : 'Done'];
};
const fieldsOf = (c: Contact): EditFields => ({ first: c.first, last: c.last, phone: c.phone, backup: c.backup, job: c.job,
  company: c.company, city: c.city, state: c.state, linkedin: c.linkedin });
let idSeq = 0;
const newId = () => `c-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

export function ContactsPage({ d, onDial }: { d: D; onDial: (id: string) => void }) {
  const [group, setGroup] = useState<Group>('all');
  const [list, setList] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: 'name' | 'list' | 'dials' | 'last'; dir: 1 | -1 }>({ key: 'list', dir: 1 });
  const [shown, setShown] = useState(PAGE);
  const [sel, setSel] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'add' | 'import' | 'delete'>(null);

  const lists = useMemo(() => [...new Set(d.contacts.map(c => c.list))].sort(), [d.contacts]);
  const counts = useMemo(() => {
    const m = Object.fromEntries(GROUPS.map(([g]) => [g, 0])) as Record<Group, number>;
    for (const c of d.contacts) if (!list || c.list === list) { m.all++; m[groupOf(c)]++; }
    return m;
  }, [d.contacts, list]);
  const rows = useMemo(() => {
    const n = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), dg = q.replace(/\D/g, '');
    const out = d.contacts.filter(c => (!list || c.list === list) && (group === 'all' || groupOf(c) === group) && (!n
      || `${c.first} ${c.last}`.toLowerCase().includes(n) || c.company.toLowerCase().includes(n) || c.city.toLowerCase().includes(n)
      || (dg.length >= 4 && (c.phone + c.backup).replace(/\D/g, '').includes(dg))));
    const key = (c: Contact): string | number => sort.key === 'name' ? `${c.last} ${c.first}`.toLowerCase() : sort.key === 'dials' ? c.dials
      : sort.key === 'last' ? c.lastDialed ?? 0 : `${c.list}|${String(c.seq).padStart(6, '0')}`;
    return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [d.contacts, list, group, q, sort]);
  useEffect(() => setShown(PAGE), [group, list, q]);

  const c = sel ? d.byId.get(sel) : undefined;
  const th = (key: typeof sort.key, label: string, cls = '') => (
    <th className={`sortable ${cls}`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'dials' || key === 'last' ? -1 : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );
  const exportCsv = () => saveText('contacts.csv', toCsv([
    ['List', 'First', 'Last', 'Phone', 'Backup', 'Job', 'Company', 'City', 'State', 'Zone', 'Tag', 'Dials', 'Last dialed', 'Call at', 'Status', 'LinkedIn', 'Notes'],
    ...rows.map(c => [c.list, c.first, c.last, c.phone, c.backup, c.job, c.company, c.city, c.state, c.zone, c.tag, c.dials,
      c.lastDialed ? mdTime(c.lastDialed, TZ) : '', c.callAt ? mdTime(c.callAt, TZ) : '', c.status, c.linkedin, c.notes]),
  ]));

  return (
    <>
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{d.contacts.length} contacts · {lists.length} lists</div>
          <h1>Contacts</h1>
          <div className="passbar"><span>Every contact on every list. Click one for details and edits.</span></div>
        </div>
        <div className="strip">
          {([['Total', counts.all, ''], ['Working', counts.working, 'blue'], ['Callbacks', counts.callback, 'amber'], ['Appointments', counts.appt, ''],
            ['Needs number', counts.needs, ''], ['Not interested', counts.notint, ''], ['Do not call', counts.dnc, ''], ['Sold / presented', counts.sold, 'green'],
          ] as [string, number, string][]).map(([l, v, tone]) => <div className="cell" key={l}><span>{l}</span><b className={tone}>{v}</b></div>)}
        </div>
      </section>

      <main className="work">
        <div className="leftcol">
          <section className="panel queue">
            <div className="toolbar">
              <div className="tabs" role="tablist">
                {GROUPS.map(([g, label]) => (
                  <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{label} <span>{counts[g]}</span></button>
                ))}
              </div>
            </div>
            <div className="toolbar sub">
              <div className="filters">
                <input className="filter" placeholder="Filter by name, company, city or phone" value={q} onChange={e => setQ(e.target.value)} />
                <select value={list} onChange={e => setList(e.target.value)} aria-label="List">
                  <option value="">All lists</option>
                  {lists.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="tbtns">
                <button className="btn primary" onClick={() => setDialog('add')}>Add contact</button>
                <button className="btn" onClick={() => setDialog('import')}>Import</button>
                <button className="btn" onClick={exportCsv}>Export CSV</button>
              </div>
            </div>
            <div className="tscroll">
              <table className="qt">
                <thead><tr>
                  {th('name', 'Contact')}<th>Phone</th><th>Backup</th>{th('list', 'List')}<th>Location · Zone</th><th>Company — Role</th>
                  <th>Status</th>{th('dials', 'Dials', 'num')}{th('last', 'Last', 'num')}<th className="num">Next</th><th>Notes (newest)</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, shown).map(x => {
                    const [label, cls] = pillFor(x);
                    return (
                      <tr key={x.id} className={x.id === sel ? 'cur' : ''} tabIndex={0} onClick={() => setSel(x.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(x.id); } }}>
                        <td className="strong">{x.first} {x.last}</td>
                        <td className="tnum">{x.phone || '—'}</td>
                        <td className="tnum muted">{x.backup || '—'}</td>
                        <td>{x.list}</td>
                        <td>{x.city}{x.city ? ', ' : ''}{x.state} · {x.zone}</td>
                        <td>{x.company}{x.job ? ` — ${x.job}` : ''}</td>
                        <td><span className={`pill ${cls}`}>{label}</span></td>
                        <td className="num">{x.dials}</td>
                        <td className="num muted">{x.lastDialed ? md(x.lastDialed, TZ) : '—'}</td>
                        <td className="num muted">{x.callAt ? md(x.callAt, TZ) : '—'}</td>
                        <td className="note muted">{(notesNewestFirst(x.notes)[0] ?? '').replace(/^(\d{1,2}\/\d{1,2}):\s*/, '$1 ')}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={11} className="emptyrow">No contacts match.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              <span>Showing {Math.min(shown, rows.length)} of {rows.length}</span>
              {rows.length > shown && <button className="linkish" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>}
            </div>
          </section>
        </div>

        <aside className="sidecol">
          {c ? <Detail key={c.id} c={c} d={d} onDial={onDial} onDelete={() => setDialog('delete')} />
            : (
              <section className="panel line">
                <div className="eyebrow">Contact details</div>
                <h2 className="serif name">Pick a contact</h2>
                <p className="hint">Click any row to see the full record, edit it, add a note, or open it in the dialer.</p>
                <div className="hist">
                  <div className="eyebrow">By list</div>
                  {lists.map(l => {
                    const all = d.contacts.filter(x => x.list === l);
                    return <button className="nl" key={l} onClick={() => setList(l)}><span>{l}</span><span className="muted">{all.length} · {all.filter(x => !x.phone).length} need a number</span></button>;
                  })}
                </div>
              </section>
            )}
        </aside>
      </main>

      {dialog === 'add' && <AddDialog d={d} onClose={() => setDialog(null)} onAdded={id => { setSel(id); setDialog(null); }} />}
      {dialog === 'import' && <ImportDialog d={d} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && c && (
        <Dialog title={`Delete ${c.first} ${c.last}?`} onClose={() => setDialog(null)}>
          <p>They come off every list: Today, Contacts and Needs Number. Dials already logged stay in the results.</p>
          <p className="hint">You can undo this right after with Undo.</p>
          <div className="bar"><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn danger" onClick={() => { d.batch('delete', { removed: [c.id] }, `${c.first} ${c.last} deleted.`); setSel(null); setDialog(null); }}>Delete contact</button></div>
        </Dialog>
      )}
    </>
  );
}

function Detail({ c, d, onDial, onDelete }: { c: Contact; d: D; onDial: (id: string) => void; onDelete: () => void }) {
  const [f, setF] = useState<EditFields>(fieldsOf(c));
  const [note, setNote] = useState('');
  const plan = useMemo(() => planEdit(c, f, d.contacts), [c, f, d.contacts]);
  const dirty = (Object.keys(f) as (keyof EditFields)[]).some(k => f[k] !== c[k]);
  const lines = notesNewestFirst(c.notes);
  const events = d.log.filter(e => e.contactId === c.id).slice(-8).reverse();
  const input = (k: keyof EditFields, half = false) => (
    <label className={half ? 'half' : ''}><span>{EDIT_LABELS[k]}</span>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>
  );
  const save = () => { if (!plan.error && plan.changes.length) d.batch('edit', { changed: [plan.contact] }, `${c.first} ${c.last}: ${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'} saved.`); };
  return (
    <section className="panel line">
      <div className="lhead"><div className="eyebrow">Contact · {c.list}</div>
        <span className={`pill ${pillFor(c)[1]}`}>{pillFor(c)[0]}</span></div>
      <h2 className="serif name">{c.first} {c.last}</h2>
      <div className="sub">{c.company}{c.job ? ` — ${c.job}` : ''}</div>
      <div className="sub muted">{c.city}{c.city ? ', ' : ''}{c.state} · {ZONE_NAME[c.zone] ?? c.zone} · {c.dials} dials · last {c.lastDialed ? md(c.lastDialed, TZ) : 'never'}</div>
      <div className="dact">
        <button className="callbtn sm" disabled={!c.phone} onClick={() => onDial(c.id)}>Open in dialer</button>
        {c.linkedin && /^https:\/\//.test(c.linkedin) && <a className="btn" href={c.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
      </div>

      <div className="form">
        {input('first', true)}{input('last', true)}{input('phone', true)}{input('backup', true)}
        {input('job', true)}{input('company', true)}{input('city', true)}{input('state', true)}{input('linkedin')}
      </div>
      {dirty && (
        <div className={`preview ${plan.error ? 'err' : ''}`}>
          {plan.error ? plan.error : <>
            <b>Will save:</b>
            <ul>{plan.changes.map(x => <li key={x.field}>{EDIT_LABELS[x.field]}: <s>{x.from || 'blank'}</s> → {x.to || 'blank'}</li>)}</ul>
          </>}
          <div className="bar">
            <button className="btn" onClick={() => setF(fieldsOf(c))}>Cancel</button>
            <button className="btn primary" disabled={!!plan.error || !plan.changes.length} onClick={save}>Save {plan.changes.length || ''} change{plan.changes.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}

      <div className="fieldset">
        <label>Add a note</label>
        <div className="row2">
          <input value={note} placeholder="e.g. Muse: picked the Dallas number" onChange={e => setNote(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { d.note(c.id, note); setNote(''); } }} />
          <button className="btn" disabled={!note.trim()} onClick={() => { d.note(c.id, note); setNote(''); }}>Add</button>
        </div>
      </div>

      <div className="hist">
        <div className="eyebrow">Notes</div>
        {lines.length ? lines.slice(0, 10).map((l, i) => {
          const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/);
          return <div className="hl" key={i}><span>{m ? m[1] : ''}</span><p>{m ? m[2] : l}</p></div>;
        }) : <p className="hint">No notes yet.</p>}
        {events.length > 0 && <>
          <div className="eyebrow" style={{ marginTop: 16 }}>Activity</div>
          {events.map((e, i) => <div className="hl" key={i}><span>{md(e.at, TZ)}</span><p>{e.kind === 'Tag' ? tagShort(e.tag) : e.kind === 'Dial' ? `Dial (${e.dials} total)` : e.kind}</p></div>)}
        </>}
        <button className="linkish danger del" onClick={onDelete}>Delete contact</button>
      </div>
    </section>
  );
}

function AddDialog({ d, onClose, onAdded }: { d: D; onClose: () => void; onAdded: (id: string) => void }) {
  const [v, setV] = useState<string[]>(IMPORT_COLUMNS.map(() => ''));
  const plan: ImportLine | undefined = v.some(x => x.trim())
    ? planImport([v], d.contacts, { now: d.now, nextId: newId })[0] : undefined;
  const add = () => {
    if (!plan?.contact) return;
    const ev = { at: Date.now(), contactId: plan.contact.id, list: plan.contact.list, first: plan.contact.first, last: plan.contact.last,
      phone: plan.contact.phone, kind: 'Import' as const, count: 1, tag: '', dials: 0 };
    d.batch('add contact', { added: [plan.contact], events: [ev] }, `${plan.name} added to ${plan.contact.list}.`);
    onAdded(plan.contact.id);
  };
  return (
    <Dialog title="Add a contact" onClose={onClose}>
      <div className="form">
        {IMPORT_COLUMNS.map((col, i) => (
          <label key={col} className={col === 'Notes' || col === 'LinkedIn' ? '' : 'half'}><span>{col}{i < 2 || col === 'State' ? ' *' : ''}</span>
            <input value={v[i]} autoFocus={i === 0} onChange={e => setV(v.map((x, j) => (j === i ? e.target.value : x)))} /></label>
        ))}
      </div>
      {plan && <p className={plan.ok ? 'okline' : 'errline'}>{plan.ok ? plan.result.replace('Will import', 'Will be added') : plan.result}</p>}
      <div className="bar"><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!plan?.ok} onClick={add}>Add contact</button></div>
    </Dialog>
  );
}

function ImportDialog({ d, onClose }: { d: D; onClose: () => void }) {
  const [text, setText] = useState('');
  const [hc, setHc] = useState(false);
  const [plan, setPlan] = useState<ImportLine[] | null>(null);
  const check = () => setPlan(planImport(parseTable(text), d.contacts, { now: d.now, nextId: newId, hardcards: hc }));
  const good = plan?.filter(x => x.ok) ?? [];
  const run = () => {
    const added = good.map(x => x.contact!);
    const byList = new Map<string, number>();
    for (const c of added) byList.set(c.list, (byList.get(c.list) ?? 0) + 1);
    const events = [...byList].map(([list, n]) => ({ at: Date.now(), contactId: '', list, first: '', last: '', phone: '', kind: 'Import' as const, count: n, tag: '', dials: 0 }));
    d.batch('import', { added, events }, `Imported ${added.length}, skipped ${(plan?.length ?? 0) - added.length}.`);
    onClose();
  };
  return (
    <Dialog title="Import contacts" onClose={onClose} wide>
      {!plan ? <>
        <p className="hint">Paste rows from a spreadsheet, or pick a CSV file. Columns in this order (a header row is fine):</p>
        <p className="cols">{IMPORT_COLUMNS.join(' · ')}</p>
        <textarea rows={9} value={text} onChange={e => setText(e.target.value)} placeholder={'Avery\tCalloway\t214-555-0101\tDriver\tLonestar Freight\tDallas\tTX'} />
        <div className="bar left">
          <label className="filepick btn">Choose a file<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={async e => {
            const f = e.target.files?.[0]; if (f) setText(await f.text());
          }} /></label>
          <label className="check"><input type="checkbox" checked={hc} onChange={e => setHc(e.target.checked)} /> These are Hardcards (union) contacts</label>
        </div>
        <p className="hint">Nothing is saved yet. The next step shows what will be imported and what will be skipped.</p>
        <div className="bar"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!text.trim()} onClick={check}>Check the list</button></div>
      </> : <>
        <p><b>{good.length}</b> will be imported, <b>{plan.length - good.length}</b> skipped.</p>
        <div className="plan">
          {plan.map(x => <div key={x.line} className={x.ok ? 'ok' : 'no'}><span>{x.line}</span><b>{x.name || '—'}</b><em>{x.result}</em></div>)}
        </div>
        <div className="bar"><button className="btn" onClick={() => setPlan(null)}>Back</button>
          <button className="btn primary" disabled={!good.length} onClick={run}>Import {good.length}</button></div>
      </>}
    </Dialog>
  );
}


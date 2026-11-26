'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialer } from '../src/app-store/useDialer';
import type { Contact } from '../src/rules/types';
import type { DialerKey } from '../src/rules/engine';
import { notesNewestFirst, isHistoryNote } from '../src/rules/notes';
import { tagShort, tagKind } from '../src/rules/tags';
import { mdTime, wdMdTime, md } from '../src/rules/time';
import { parseWhen } from '../src/rules/parseWhen';
import { nextAction } from '../src/rules/schedule';

const TZ = 'America/New_York';
const ZONE_TZ: Record<string, string> = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' };
const OBJECTIONS = ['Price', 'Needs to Think', 'Spouse / Family', 'Existing Coverage', 'Trust / Skepticism', 'Timing', 'Affordability', 'Other'];

function chipClass(why: string) {
  if (why.startsWith('DONE')) return 'Done';
  if (why.startsWith('Callback')) return 'Callback';
  if (why.startsWith('No-show') || why.startsWith('Did they')) return 'NoShow';
  if (why.startsWith('New Number') || why.startsWith('New number')) return 'NewNumber';
  if (why.startsWith('PM')) return 'PM';
  if (why === 'Fresh') return 'Fresh';
  if (why === 'Confirm') return 'Confirm';
  return '';
}
const localTime = (zone: string, now: number) => {
  const tz = ZONE_TZ[zone];
  return tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now) : '';
};

type Modal = null | { kind: 'sold' | 'presented' | 'reschedule'; id: string };

export default function Today() {
  const d = useDialer();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState<null | 'callback' | 'appt'>(null);
  const [when, setWhen] = useState('');
  const [noteText, setNoteText] = useState('');
  const [backupMode, setBackupMode] = useState(false);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const whenRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem('trucker-theme'); } catch { /* */ }
    setTheme(t === 'dark' || t === 'light' ? t : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('trucker-theme', theme); } catch { /* */ }
  }, [theme]);

  const current: Contact | undefined = (picked ? d.byId.get(picked) : undefined) ?? d.queue[0]?.contact;
  const currentRow = d.today.find(r => r.contact.id === current?.id);
  const why = currentRow?.why ?? (current ? tagShort(current.tag) : '');

  // reset the action area when the contact changes
  useEffect(() => { setPending(null); setWhen(''); setNoteText(''); setBackupMode(false); }, [current?.id]);

  const act = (key: DialerKey) => {
    if (!current) return;
    if ((key === 'callback' || key === 'appt') && !when.trim()) { setPending(key); setTimeout(() => whenRef.current?.focus(), 0); return; }
    d.press(current.id, key, { when: key === 'callback' || key === 'appt' ? when : '', note: noteText, backupMode });
    setPicked(null);
  };

  // keys 1-6, S skip, Ctrl+Z undo, / find
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); d.undo(); return; }
      if (typing || modal) return;
      const map: Record<string, DialerKey> = { '1': 'noanswer', '2': 'voicemail', '3': 'callback', '4': 'notint', '5': 'bad', '6': 'appt' };
      if (map[e.key]) { e.preventDefault(); act(map[e.key]); }
      else if (e.key.toLowerCase() === 's' && current) { d.skip(current.id); setPicked(null); }
      else if (e.key.toLowerCase() === 'b' && current?.backup) setBackupMode(b => !b);
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const results = useMemo(() => (q.trim().length >= 2 ? d.find(q) : []), [q, d]);
  const preview = useMemo(() => {
    if (!when.trim()) return '';
    const w = parseWhen(when, d.now, TZ, false);
    return !w ? 'Could not read that time' : 'error' in w ? w.error : w.label;
  }, [when, d.now]);

  if (!d.ready) return <div className="empty">Loading…</div>;
  const s = d.stats;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const lines = current ? notesNewestFirst(current.notes) : [];
  const na = current ? nextAction(current, d.now) : null;
  const dialNum = current ? (backupMode && current.backup ? current.backup : current.phone || current.backup) : '';

  return (
    <div className="shell">
      <div className="demo-banner">Demo with made-up contacts. Changes stay in this browser only.</div>
      <header className="top">
        <div className="brand"><span className="dot">T</span>Trucker Dialer</div>
        <div className="clock">{wdMdTime(d.now, TZ)} ET</div>
        <div className="tiles">
          <div className="tile"><b>{s.left}</b><span>Left to dial</span><div className="progress"><i style={{ width: pct + '%' }} /></div></div>
          <div className="tile"><b>{s.dials}</b><span>Dials</span></div>
          <div className="tile"><b>{s.connects}</b><span>Connects</span></div>
          <div className="tile"><b>{s.scheduled}</b><span>Scheduled</span></div>
          <div className="tile"><b>{s.presented}</b><span>Presented</span></div>
          <div className="tile"><b>{s.sold}</b><span>Sold</span></div>
        </div>
        <div className="tools">
          <div className="search">
            <input ref={searchRef} placeholder="Find a contact  ( / )" value={q} onChange={e => setQ(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} />
            {results.length > 0 && (
              <div className="results">
                {results.map(c => (
                  <button key={c.id} onClick={() => { setPicked(c.id); setQ(''); }}>
                    <b>{c.first} {c.last}</b> <span className="hint">· {c.company} · {c.list}{c.tag ? ' · ' + tagShort(c.tag) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Day' : 'Night'}</button>
          <button className="btn" onClick={d.reSort} title="Start a fresh pass">Re-sort</button>
        </div>
      </header>

      <main className="grid">
        {/* Up next */}
        <section className="panel queue">
          <h3>Up next <span>{d.queue.length} to dial · {s.done} done</span></h3>
          <div className="list">
            {d.today.map(r => (
              <button key={r.contact.id} className={`row ${r.done ? 'done' : ''} ${r.contact.id === current?.id ? 'active' : ''}`}
                      onClick={() => setPicked(r.contact.id)}>
                <span className="name">{r.contact.first} {r.contact.last}</span>
                <span className={`chip ${chipClass(r.why)}`}>{r.why.replace('DONE TODAY - ', '✓ ')}</span>
                <span className="sub">{r.contact.company} · {r.contact.city}, {r.contact.state} · {r.contact.dials} dials</span>
              </button>
            ))}
            {!d.today.length && <div className="empty">Nothing due right now.</div>}
          </div>
        </section>

        {/* The contact being dialed */}
        <section className="panel focus">
          {!current ? (
            <div className="empty">
              <h2>List finished</h2>
              <p>Everyone due today has been dialed. Press <b>Re-sort</b> to start a fresh pass with the contacts that are due again.</p>
              <button className="btn primary" onClick={d.reSort}>Re-sort Today</button>
            </div>
          ) : (
            <>
              <div className="head">
                <div>
                  <span className={`chip ${chipClass(why)}`}>{why || 'Contact'}</span>
                  <h1>{current.first} {current.last}</h1>
                  <div className="meta">{current.job}{current.job && current.company ? ' · ' : ''}{current.company}</div>
                </div>
                <div className="bar" style={{ marginTop: 0 }}>
                  <button className="btn" onClick={() => { d.skip(current.id); setPicked(null); }}>Skip (S)</button>
                  <button className="btn" disabled={!d.canUndo} onClick={d.undo}>Undo</button>
                </div>
              </div>

              <div className="phone">
                <a className="num" href={`tel:${dialNum.replace(/[^\d+]/g, '')}`}>{dialNum || 'No number'}</a>
                {current.backup && current.phone && (
                  <button className={`btn ${backupMode ? 'primary' : ''}`} onClick={() => setBackupMode(!backupMode)}>
                    {backupMode ? 'Calling backup (B)' : `Backup: ${current.backup} (B)`}
                  </button>
                )}
              </div>

              <div className="facts">
                <div className="fact"><span>Where</span><b>{current.city}, {current.state}</b> <span className="hint">{current.zone} · {localTime(current.zone, d.now)} there</span></div>
                <div className="fact"><span>Dials</span><b>{current.dials}</b></div>
                <div className="fact"><span>Last dialed</span><b>{current.lastDialed ? mdTime(current.lastDialed, TZ) : 'Never'}</b></div>
                <div className="fact"><span>{tagKind(current.tag) === 'scheduled' ? 'Appointment' : current.callAt ? 'Call at' : 'Next action'}</span>
                  <b>{current.callAt ? mdTime(current.callAt, TZ) : na ? md(na, TZ) : '—'}</b></div>
                <div className="fact"><span>List</span><b>{current.list}</b></div>
                {current.tag && <div className="fact"><span>Tag</span><b>{tagShort(current.tag)}</b></div>}
              </div>

              <div className="pad">
                <button className="key" onClick={() => act('noanswer')}><kbd>1</kbd>No answer</button>
                <button className="key" onClick={() => act('voicemail')}><kbd>2</kbd>Voicemail</button>
                <button className="key cb" onClick={() => act('callback')}><kbd>3</kbd>Callback</button>
                <button className="key ni" onClick={() => act('notint')}><kbd>4</kbd>Not interested</button>
                <button className="key bd" onClick={() => act('bad')}><kbd>5</kbd>Bad number</button>
                <button className="key ap" onClick={() => act('appt')}><kbd>6</kbd>Appointment</button>
              </div>

              <div className="when">
                <input ref={whenRef} placeholder={pending ? `${pending === 'appt' ? 'Appointment' : 'Callback'} time, e.g. fri 10am` : 'Callback / appointment time (optional)'}
                       value={when} onChange={e => setWhen(e.target.value)}
                       onKeyDown={e => { if (e.key === 'Enter' && pending) act(pending); }} />
                <input placeholder="Note (optional), e.g. wife answered" value={noteText} onChange={e => setNoteText(e.target.value)}
                       onKeyDown={e => {
                         if (e.key === 'Enter' && noteText.trim() && !pending) { d.note(current.id, noteText); setNoteText(''); }
                       }} />
                {pending
                  ? <button className="btn primary" onClick={() => act(pending)}>Save {pending === 'appt' ? 'appointment' : 'callback'}</button>
                  : <button className="btn" disabled={!noteText.trim()} onClick={() => { d.note(current.id, noteText); setNoteText(''); }}>Add note</button>}
              </div>
              <div className="sugg">
                {preview && <span className="hint">→ {preview}</span>}
                {['tomorrow 10am', 'tomorrow 6pm', 'fri 2pm', 'mon 9am'].map(x => <button key={x} onClick={() => setWhen(x)}>{x}</button>)}
              </div>

              <h3 style={{ padding: '18px 0 0' }}>History and notes</h3>
              {lines.length ? (
                <ul className="timeline">
                  {lines.map((l, i) => {
                    const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/);
                    return <li key={i} className={isHistoryNote(l) ? '' : 'research'}>{m ? <><span className="d">{m[1]}</span>{m[2]}</> : l}</li>;
                  })}
                </ul>
              ) : <p className="hint">No notes yet.</p>}
            </>
          )}
        </section>

        {/* Appointments, called-into, recent */}
        <aside className="side">
          <section className="panel">
            <h3>Appointments <span>{d.appts.length}</span></h3>
            {d.appts.map(a => {
              const c = a.contact;
              const ci = tagKind(c.tag) === 'calledInto';
              const cls = ci ? 'ci' : a.status.includes('show') ? 'show' : 'conf';
              return (
                <div className="appt" key={c.id}>
                  <div><b>{c.first} {c.last}</b> <span className="hint">{c.callAt ? '· ' + mdTime(c.callAt, TZ) : ''}</span></div>
                  <div className={`st ${cls}`}>{a.status}</div>
                  <div className="acts">
                    <button onClick={() => setModal({ kind: 'sold', id: c.id })}>Sold</button>
                    <button onClick={() => setModal({ kind: 'presented', id: c.id })}>Presented</button>
                    {!ci && <button onClick={() => d.outcome(c.id, 'noshow')}>No-show</button>}
                    {!ci && <button onClick={() => setModal({ kind: 'reschedule', id: c.id })}>Reschedule</button>}
                    <button onClick={() => setPicked(c.id)}>Open</button>
                  </div>
                </div>
              );
            })}
            {!d.appts.length && <div className="empty" style={{ padding: 20 }}>No appointments to confirm or close out.</div>}
          </section>
          <section className="panel" style={{ marginTop: 16 }}>
            <h3>Recent</h3>
            {d.recent.map(r => (
              <button key={r.contact.id} className="row" onClick={() => setPicked(r.contact.id)}>
                <span className="name">{r.contact.first} {r.contact.last}</span>
                <span className="hint">{mdTime(r.at, TZ).split(' ').slice(1).join(' ')}</span>
                <span className="sub">{r.tag ? tagShort(r.tag) : 'Dialed'} · {r.contact.dials} dials</span>
              </button>
            ))}
            {!d.recent.length && <div className="empty" style={{ padding: 20 }}>Nothing logged yet today.</div>}
            <div style={{ padding: 12 }}><button className="btn ghost" onClick={d.resetDemo}>Reset demo data</button></div>
          </section>
        </aside>
      </main>

      {modal && <ResultModal modal={modal} contact={d.byId.get(modal.id)} onClose={() => setModal(null)}
        onSave={(form) => { d.outcome(modal.id, modal.kind, form); setModal(null); }} now={d.now} />}
      {d.toast && <div className={`toast ${d.toast.kind}`}>{d.toast.text}</div>}
    </div>
  );
}

function ResultModal({ modal, contact, onClose, onSave, now }: {
  modal: NonNullable<Modal>; contact?: Contact; now: number; onClose: () => void;
  onSave: (f: { trialAlp?: number; standardAlp?: number; monthly?: number; objection?: string; note?: string; when?: number }) => void;
}) {
  const [trial, setTrial] = useState(''); const [std, setStd] = useState(''); const [mo, setMo] = useState('');
  const [obj, setObj] = useState(OBJECTIONS[0]); const [note, setNote] = useState(''); const [when, setWhen] = useState('');
  const [err, setErr] = useState('');
  const money = (v: string) => Number(v.replace(/[$,\s]/g, '')) || 0;
  const save = () => {
    if (modal.kind === 'sold') {
      if (!money(trial) && !money(std)) return setErr('Enter the trial or standard ALP.');
      onSave({ trialAlp: money(trial), standardAlp: money(std), monthly: money(mo), note });
    } else if (modal.kind === 'presented') onSave({ objection: obj, note });
    else {
      const w = parseWhen(when, now, TZ, false);
      if (!w || 'error' in w) return setErr(w && 'error' in w ? w.error : 'Could not read that time.');
      onSave({ when: w.date });
    }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{modal.kind === 'sold' ? 'Sold' : modal.kind === 'presented' ? 'Presented, not sold' : 'Reschedule'}: {contact?.first} {contact?.last}</h2>
        {modal.kind === 'sold' && <>
          <label>Trial ALP ($)</label><input inputMode="decimal" value={trial} onChange={e => setTrial(e.target.value)} autoFocus />
          <label>Standard ALP ($)</label><input inputMode="decimal" value={std} onChange={e => setStd(e.target.value)} />
          <label>Monthly premium ($)</label><input inputMode="decimal" value={mo} onChange={e => setMo(e.target.value)} />
        </>}
        {modal.kind === 'presented' && <>
          <label>What stopped it?</label>
          <select value={obj} onChange={e => setObj(e.target.value)}>{OBJECTIONS.map(o => <option key={o}>{o}</option>)}</select>
        </>}
        {modal.kind === 'reschedule' && <>
          <label>New appointment time</label><input value={when} onChange={e => setWhen(e.target.value)} placeholder="e.g. thu 6pm" autoFocus />
        </>}
        {modal.kind !== 'reschedule' && <><label>Note (optional)</label><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></>}
        {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
        <div className="bar"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
      </div>
    </div>
  );
}

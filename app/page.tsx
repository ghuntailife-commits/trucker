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

const Ico = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const IC = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  connect: 'M16 3h5v5M21 3l-7 7M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  pres: 'M3 3h18v12H3zM8 21l4-6 4 6',
  sold: 'M20 6 9 17l-5-5',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
};
const fmtSecs = (n: number) => `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`;

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
  const [call, setCall] = useState<{ id: string; at: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [view, setView] = useState<'dialer' | 'list'>('dialer');
  const [, tick] = useState(0);
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

  /** Call: opens the phone app (or the web dialer) and starts the call timer. */
  const startCall = (c: Contact, useBackup = false) => {
    const num = (useBackup && c.backup ? c.backup : c.phone || c.backup).replace(/[^\d+]/g, '');
    if (!num) return;
    setPicked(c.id); setCall({ id: c.id, at: Date.now() }); setCountdown(null);
    try { const a = document.createElement('a'); a.href = `tel:${num}`; a.rel = 'noopener'; a.click(); } catch { /* the number is on screen */ }
  };
  const endCall = (id: string) => {
    if (call && call.id === id) { d.logCall(id, Math.round((Date.now() - call.at) / 1000)); setCall(null); }
  };

  const act = (key: DialerKey) => {
    if (!current) return;
    if ((key === 'callback' || key === 'appt') && !when.trim()) { setPending(key); setTimeout(() => whenRef.current?.focus(), 0); return; }
    d.press(current.id, key, { when: key === 'callback' || key === 'appt' ? when : '', note: noteText, backupMode });
    endCall(current.id);
    setPicked(null);
    if (auto) setCountdown(3);
  };

  // call timer, and the auto-dial countdown to the next contact
  useEffect(() => {
    if (!call && countdown == null) return;
    const id = setInterval(() => {
      tick(t => t + 1);
      setCountdown(c => (c == null ? c : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [call, countdown != null]);
  useEffect(() => {
    if (countdown != null && countdown <= 0) {
      setCountdown(null);
      const next = d.queue[0]?.contact;
      if (auto && next) startCall(next);
    }
  }, [countdown]);

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
      else if ((e.key === 'Enter' || e.key.toLowerCase() === 'c') && current && !call) { e.preventDefault(); startCall(current, backupMode); }
      else if (e.key === 'Escape') setCountdown(null);
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
        </div>
      </header>

      <div className="stats">
        {([
          ['list', s.left, 'Left to dial', pct], ['phone', s.dials, 'Dials'], ['connect', s.connects, 'Connects'],
          ['clock', fmtSecs(s.avgTalk), 'Avg call'], ['cal', s.scheduled, 'Scheduled'], ['pres', s.presented, 'Presented'], ['sold', s.sold, 'Sold'],
        ] as [keyof typeof IC, string | number, string, number?][]).map(([ic, v, label, p]) => (
          <div className="stat" key={label}>
            <span className="ic"><Ico d={IC[ic]} /></span>
            <b>{v}</b><span className="lbl">{label}</span>
            {p != null && <div className="progress"><i style={{ width: p + '%' }} /></div>}
          </div>
        ))}
      </div>

      <div className="autobar">
        <div>
          <b>Auto-Dial</b>
          <span className="hint">{auto ? (countdown != null ? `Calling the next contact in ${countdown}… (Esc to wait)` : call ? 'On a call. Pick the result and the next one dials itself.' : 'On. Press Call to start.') : `${d.queue.length} contacts queued`}</span>
        </div>
        <div className="seg">
          <button className={view === 'dialer' ? 'on' : ''} onClick={() => setView('dialer')}>Dialer</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
        <button className="btn" onClick={d.reSort} title="Start a fresh pass"><Ico d={IC.reset} size={15} /> Re-sort</button>
        <button className={`btn ${auto ? '' : 'light'}`} onClick={() => {
          if (auto) { setAuto(false); setCountdown(null); }
          else { setAuto(true); setView('dialer'); const n = current ?? d.queue[0]?.contact; if (n && !call) startCall(n); }
        }}><Ico d={auto ? IC.pause : IC.play} size={15} /> {auto ? 'Stop Auto Dial' : 'Start Auto Dial'}</button>
      </div>

      {view === 'list' ? (
        <main className="tablewrap">
          <section className="panel">
            <div className="tscroll">
              <table className="tbl">
                <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Status</th><th>Next action</th><th className="num">Dials</th><th>Last dialed</th><th>Action</th></tr></thead>
                <tbody>
                  {d.today.map(r => {
                    const c = r.contact;
                    const nx = c.callAt ? mdTime(c.callAt, TZ) : r.nextAction ? md(r.nextAction, TZ) : '';
                    return (
                      <tr key={c.id} className={r.done ? 'done' : ''}>
                        <td><span className="av">{(c.first[0] ?? '') + (c.last[0] ?? '')}</span>{c.first} {c.last}</td>
                        <td>{c.company}<div className="hint">{c.job}</div></td>
                        <td className="mono">{c.phone || c.backup}</td>
                        <td><span className={`st-${chipClass(r.why) || 'Retry'}`}>{r.why.replace('DONE TODAY - ', '✓ ')}</span></td>
                        <td>{nx}</td>
                        <td className="num">{c.dials}</td>
                        <td>{c.lastDialed ? mdTime(c.lastDialed, TZ) : 'Never'}</td>
                        <td><button className="callpill" onClick={() => { setView('dialer'); startCall(c); }}><Ico d={IC.phone} size={13} /> Call</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      ) : (
      <main className="grid">
        {/* Up next */}
        <section className="panel queue">
          <h3>Up next <span>{d.queue.length} to dial · {s.done} done</span></h3>
          <div className="list">
            {d.today.map(r => (
              <div key={r.contact.id} role="button" tabIndex={0} className={`row ${r.done ? 'done' : ''} ${r.contact.id === current?.id ? 'active' : ''}`}
                      onClick={() => setPicked(r.contact.id)} onKeyDown={e => { if (e.key === ' ') setPicked(r.contact.id); }}>
                <span className="name">{r.contact.first} {r.contact.last}</span>
                <span className={`chip ${chipClass(r.why)}`}>{r.why.replace('DONE TODAY - ', '✓ ')}</span>
                <span className="sub">{r.contact.company} · {r.contact.city}, {r.contact.state} · {r.contact.dials} dials</span>
                {!r.done && <button className="callpill" onClick={e => { e.stopPropagation(); startCall(r.contact); }}><Ico d={IC.phone} size={13} /> Call</button>}
              </div>
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
                {call?.id === current.id ? (
                  <span className="oncall"><i /> On call {fmtSecs(Math.round((Date.now() - call.at) / 1000))}</span>
                ) : (
                  <button className="bigcall" disabled={!dialNum} onClick={() => startCall(current, backupMode)}>
                    <Ico d={IC.phone} size={20} /> Call <kbd>C</kbd>
                  </button>
                )}
                <a className="num" href={`tel:${dialNum.replace(/[^\d+]/g, '')}`} onClick={() => !call && setCall({ id: current.id, at: Date.now() })}>{dialNum || 'No number'}</a>
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
      )}

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

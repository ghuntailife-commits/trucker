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
  noans: 'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8M22 2 2 22',
  vm: 'M6 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM18 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM6 15h12',
  cb: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2M17 2.5l2 2',
  ni: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  bad: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  appt: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  end: 'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8',
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
  const [, tick] = useState(0);
  const whenRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstOpen = useRef<string | null>(null);

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

  // reset the action area when the contact changes, and bring the open row into view
  useEffect(() => {
    setPending(null); setWhen(''); setNoteText(''); setBackupMode(false);
    if (!current?.id) return;
    if (!firstOpen.current) { firstOpen.current = current.id; return; }   // don't jump on page load
    const t = setTimeout(() => document.querySelector(`[data-row="${current.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [current?.id]);

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

  /** One row of the big list. The current contact's row is open, with the dial controls inside it. */
  const renderRow = (c: Contact, rowWhy: string, done: boolean, next: number | null, pinned: boolean) => {
    const open = c.id === current?.id;
    const nx = c.callAt ? mdTime(c.callAt, TZ) : next ? md(next, TZ) : '';
    const label = rowWhy.replace('DONE TODAY - ', '✓ ') || (c.tag ? tagShort(c.tag) : 'Contact');
    const live = call?.id === c.id;
    return (
      <div key={(pinned ? 'pin-' : '') + c.id} data-row={c.id} className={`brow ${open ? 'open' : ''} ${done ? 'done' : ''} ${live ? 'live' : ''}`}>
        <div className="bline" role="button" tabIndex={0} onClick={() => setPicked(open ? picked : c.id)}
             onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setPicked(c.id); } }}>
          <span className="bname"><span className="av">{done ? '✓' : (c.first[0] ?? '') + (c.last[0] ?? '')}</span>
            <span><b>{c.first} {c.last}</b><small>{c.city}, {c.state}</small></span></span>
          <span className="bco">{c.company}<small>{c.job}</small></span>
          <span className="mono bph">{c.phone || c.backup || '—'}</span>
          <span><span className={`chip ${chipClass(rowWhy)}`}>{label}</span></span>
          <span className="num">{c.dials}</span>
          <span className="blast">{c.lastDialed ? mdTime(c.lastDialed, TZ) : 'Never'}</span>
          <span className="bnext">{nx || '—'}</span>
          <span className="bcall">
            {live ? <span className="livepill"><span className="wave"><i /><i /><i /><i /></span>{fmtSecs(Math.round((Date.now() - call!.at) / 1000))}</span>
              : !done && <button className="callpill" onClick={e => { e.stopPropagation(); startCall(c); }}><span className="ci"><Ico d={IC.phone} size={13} /></span><span className="ct">Call</span></button>}
          </span>
        </div>
        {open && expanded(c)}
      </div>
    );
  };

  const expanded = (c: Contact) => {
    const lines = notesNewestFirst(c.notes);
    const na = nextAction(c, d.now);
    const dialNum = backupMode && c.backup ? c.backup : c.phone || c.backup;
    return (
      <div className="bx">
        <div className="bxl">
          <div className="phone">
            {call?.id === c.id ? (
              <div className="dialer live">
                <span className="handset"><span className="wave"><i /><i /><i /><i /></span></span>
                <span className="dnum"><small>On call · {fmtSecs(Math.round((Date.now() - call.at) / 1000))}</small>{dialNum}</span>
                <span className="dhint">Pick a result to hang up</span>
              </div>
            ) : (
              <button className="dialer" disabled={!dialNum} onClick={() => startCall(c, backupMode)}>
                <span className="handset"><Ico d={IC.phone} size={22} /></span>
                <span className="dnum"><small>{backupMode ? 'Call backup' : 'Call'}</small>{dialNum || 'No number'}</span>
                <span className="kc">C</span>
              </button>
            )}
            {c.backup && c.phone && (
              <button className={`btn swap ${backupMode ? 'on' : ''}`} onClick={() => setBackupMode(!backupMode)}>
                {backupMode ? <>Main: {c.phone}</> : <>Backup: {c.backup}</>} <span className="kc">B</span>
              </button>
            )}
          </div>
          <div className="facts">
            <div className="fact"><span>Local time</span><b>{localTime(c.zone, d.now) || '—'}</b> <span className="hint">{c.zone}</span></div>
            <div className="fact"><span>{tagKind(c.tag) === 'scheduled' ? 'Appointment' : c.callAt ? 'Call at' : 'Next action'}</span>
              <b>{c.callAt ? mdTime(c.callAt, TZ) : na ? md(na, TZ) : '—'}</b></div>
            <div className="fact"><span>List</span><b>{c.list}</b></div>
            <div className="fact"><span>Tag</span><b>{c.tag ? tagShort(c.tag) : 'None'}</b></div>
          </div>
          <h3 className="bxh">History and notes</h3>
          {lines.length ? (
            <ul className="timeline">
              {lines.slice(0, 8).map((l, i) => {
                const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/);
                return <li key={i} className={isHistoryNote(l) ? '' : 'research'}>{m ? <><span className="d">{m[1]}</span>{m[2]}</> : l}</li>;
              })}
            </ul>
          ) : <p className="hint">No notes yet.</p>}
        </div>
        <div className="bxr">
          <div className="pad">
            {([
              ['noanswer', '1', 'No answer', 'Logs a dial', 'noans', 'n'],
              ['voicemail', '2', 'Voicemail', 'Dial + dated note', 'vm', 'n'],
              ['callback', '3', 'Callback', 'Needs a time', 'cb', 'amber'],
              ['notint', '4', 'Not interested', 'Re-approach in 75 days', 'ni', 'red'],
              ['bad', '5', 'Bad number', c.backup ? 'Backup takes over' : 'Off the list', 'bad', 'red'],
              ['appt', '6', 'Appointment', 'Needs a time', 'appt', 'green'],
            ] as [DialerKey, string, string, string, keyof typeof IC, string][]).map(([k, n, label, sub, ic, tone]) => (
              <button key={k} className={`key ${tone} ${pending === k ? 'armed' : ''}`} onClick={() => act(k)}>
                <span className="cap">{n}</span>
                <span className="glyph"><Ico d={IC[ic]} size={17} /></span>
                <span className="lab">{label}</span>
                <span className="subl">{sub}</span>
              </button>
            ))}
          </div>
          <div className="when">
            <input ref={whenRef} placeholder={pending ? `${pending === 'appt' ? 'Appointment' : 'Callback'} time, e.g. fri 10am` : 'Callback / appointment time (optional)'}
                   value={when} onChange={e => setWhen(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter' && pending) act(pending); }} />
            <input placeholder="Note (optional), e.g. wife answered" value={noteText} onChange={e => setNoteText(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter' && noteText.trim() && !pending) { d.note(c.id, noteText); setNoteText(''); } }} />
            {pending
              ? <button className="btn primary" onClick={() => act(pending)}>Save {pending === 'appt' ? 'appointment' : 'callback'}</button>
              : <button className="btn" disabled={!noteText.trim()} onClick={() => { d.note(c.id, noteText); setNoteText(''); }}>Add note</button>}
          </div>
          <div className="sugg">
            {preview && <span className="hint">→ {preview}</span>}
            {['tomorrow 10am', 'tomorrow 6pm', 'fri 2pm', 'mon 9am'].map(x => <button key={x} onClick={() => setWhen(x)}>{x}</button>)}
          </div>
          <div className="bar bxbar">
            <button className="btn" onClick={() => { d.skip(c.id); setPicked(null); }}><Ico d={IC.skip} size={14} /> Skip <span className="kc">S</span></button>
            <button className="btn" disabled={!d.canUndo} onClick={d.undo}><Ico d={IC.undo} size={14} /> Undo <span className="kc">⌘Z</span></button>
            <span className="hint" style={{ marginLeft: 'auto' }}>Pick a result and the next row opens</span>
          </div>
        </div>
      </div>
    );
  };

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
          ['cal', s.scheduled, 'Scheduled'], ['pres', s.presented, 'Presented'], ['sold', s.sold, 'Sold'],
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
        <button className="btn" onClick={d.reSort} title="Start a fresh pass"><Ico d={IC.reset} size={15} /> Re-sort</button>
        <button className={`go ${auto ? 'on' : ''}`} onClick={() => {
          if (auto) { setAuto(false); setCountdown(null); }
          else { setAuto(true); const n = current ?? d.queue[0]?.contact; if (n && !call) startCall(n); }
        }}><span className="gi"><Ico d={auto ? IC.pause : IC.play} size={12} /></span>{auto ? 'Stop Auto Dial' : 'Start Auto Dial'}</button>
      </div>

      <main className="grid2">
        <section className="panel blist">
          <div className="bhead">
            <span>Contact</span><span>Company · Job</span><span>Phone</span><span>Status</span>
            <span className="num">Dials</span><span>Last dialed</span><span>Next / call at</span><span />
          </div>
          {current && !currentRow && renderRow(current, why, false, null, true)}
          {d.today.map(r => renderRow(r.contact, r.why, r.done, r.nextAction, false))}
          {!current && (
            <div className="empty">
              <h2>List finished</h2>
              <p>Everyone due today has been dialed. Press <b>Re-sort</b> to start a fresh pass with the contacts that are due again.</p>
              <button className="btn primary" onClick={d.reSort}>Re-sort Today</button>
            </div>
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
                  <div><button className="who" onClick={() => setPicked(c.id)}>{c.first} {c.last}</button> <span className="hint">{c.callAt ? '· ' + mdTime(c.callAt, TZ) : ''}</span></div>
                  <div className={`st ${cls}`}>{a.status}</div>
                  <div className="acts seg2">
                    <button onClick={() => setModal({ kind: 'sold', id: c.id })}>Sold</button>
                    <button onClick={() => setModal({ kind: 'presented', id: c.id })}>Presented</button>
                    {!ci && <button onClick={() => d.outcome(c.id, 'noshow')}>No-show</button>}
                    {!ci && <button onClick={() => setModal({ kind: 'reschedule', id: c.id })}>Move</button>}
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

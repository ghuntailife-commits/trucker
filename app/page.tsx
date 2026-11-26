'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialer } from '../src/app-store/useDialer';
import type { Contact } from '../src/rules/types';
import type { DialerKey } from '../src/rules/engine';
import { notesNewestFirst, isHistoryNote } from '../src/rules/notes';
import { tagShort, tagKind } from '../src/rules/tags';
import { mdTime, md, sameDay } from '../src/rules/time';
import { parseWhen } from '../src/rules/parseWhen';

const OBJECTIONS = ['Price', 'Needs to Think', 'Spouse / Family', 'Existing Coverage', 'Trust / Skepticism', 'Timing', 'Affordability', 'Other'];
import { ContactsPage } from './ui/contacts';
import { NeedsPage } from './ui/needs';
import { TZ, ZONE_TZ, chipClass, localTime, Ico, IC, fmtSecs, ZONE_NAME, timeOnly, saveText } from './ui/shared';
type Modal = null | { kind: 'sold' | 'presented' | 'reschedule'; id: string };
const UNDO_LABEL: Record<string, string> = { noanswer: 'No answer', voicemail: 'Voicemail', callback: 'Callback', notint: 'Not interested',
  bad: 'Bad number', appt: 'Appointment', note: 'note', sold: 'Sold', presented: 'Presented', noshow: 'No-show', reschedule: 'Move' };
type Filter = 'All' | 'Callback' | 'NoShow' | 'NewNumber' | 'Retry' | 'Fresh';
const FILTERS: [Filter, string][] = [['All', 'All'], ['Callback', 'Callbacks'], ['NoShow', 'No-shows'], ['NewNumber', 'New numbers'], ['Retry', 'Retry'], ['Fresh', 'Fresh']];
const baseWhy = (why: string) => why.replace(/^DONE TODAY - /, '');
const groupOf = (why: string): Filter => {
  const k = chipClass(baseWhy(why));
  return k === 'Callback' || k === 'NoShow' || k === 'NewNumber' || k === 'Fresh' ? k : 'Retry';
};
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const hourOf = (t: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(t));
const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? 'a' : 'p');

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
  const [filter, setFilter] = useState<Filter>('All');
  const [page, setPage] = useState<'today' | 'contacts' | 'needs'>('today');
  const [, tick] = useState(0);
  const whenRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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
  const position = current ? d.queue.findIndex(r => r.contact.id === current.id) : -1;

  // reset the action area when the contact changes, and keep its row in view inside the table
  useEffect(() => {
    setPending(null); setWhen(''); setNoteText(''); setBackupMode(false);
    if (!current?.id || !tableRef.current) return;
    const el = tableRef.current.querySelector<HTMLElement>(`[data-row="${current.id}"]`);
    if (el) {
      const box = tableRef.current, top = el.offsetTop - 44, bottom = el.offsetTop + el.offsetHeight;
      if (top < box.scrollTop) box.scrollTo({ top, behavior: 'smooth' });
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top: bottom - box.clientHeight + 8, behavior: 'smooth' });
    }
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
    const id = setInterval(() => { tick(t => t + 1); setCountdown(c => (c == null ? c : c - 1)); }, 1000);
    return () => clearInterval(id);
  }, [call, countdown != null]);
  useEffect(() => {
    if (countdown != null && countdown <= 0) {
      setCountdown(null);
      const next = d.queue[0]?.contact;
      if (auto && next) startCall(next);
    }
  }, [countdown]);

  // keys: 1-6 results, C call, N note, / search, U undo, R re-sort, S skip, B backup, Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); d.undo(); return; }
      if (typing || modal || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (page !== 'today' || document.querySelector('.modal-bg')) return;
      const k = e.key.toLowerCase();
      const map: Record<string, DialerKey> = { '1': 'noanswer', '2': 'voicemail', '3': 'callback', '4': 'notint', '5': 'bad', '6': 'appt' };
      if (map[e.key]) { e.preventDefault(); act(map[e.key]); }
      else if (k === 'n') { e.preventDefault(); noteRef.current?.focus(); }
      else if (k === 'u') d.undo();
      else if (k === 'r') d.reSort();
      else if (k === 's' && current) { d.skip(current.id); setPicked(null); }
      else if ((e.key === 'Enter' || k === 'c') && current && !call) { e.preventDefault(); startCall(current, backupMode); }
      else if (e.key === 'Escape') setCountdown(null);
      else if (k === 'b' && current?.backup) setBackupMode(b => !b);
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

  // today's events: called-into count, ALP and the hourly chart
  const todayLog = useMemo(() => d.log.filter(e => sameDay(e.at, d.now, TZ)), [d.log, d.now]);
  const calledInto = useMemo(() => new Set(todayLog.filter(e => e.kind === 'Tag' && e.tag.startsWith('CALLED INTO')).map(e => e.contactId)).size
    + d.appts.filter(a => tagKind(a.contact.tag) === 'calledInto').length, [todayLog, d.appts]);
  const salesToday = d.sales.filter(x => sameDay(x.at, d.now, TZ));
  const alp = salesToday.reduce((a, x) => a + (x.standardAlp || x.trialAlp), 0);
  const hours = useMemo(() => {
    const h: { h: number; dials: number; connects: number }[] = [];
    for (let i = 9; i <= 21; i++) h.push({ h: i, dials: 0, connects: 0 });
    for (const e of todayLog) {
      const row = h.find(x => x.h === hourOf(e.at)); if (!row) continue;
      if (e.kind === 'Dial') row.dials += e.count;
      if (e.kind === 'Tag' && e.reach) row.connects++;
    }
    return h;
  }, [todayLog]);
  const best = useMemo(() => {
    let b: typeof hours[0] | null = null;
    for (const x of hours) if (x.dials >= 3 && (!b || x.connects / x.dials > b.connects / b.dials)) b = x;
    return b && b.connects ? `${hourLabel(b.h)}–${hourLabel(b.h + 1)}` : '';
  }, [hours]);

  const counts = useMemo(() => {
    const m: Record<Filter, number> = { All: 0, Callback: 0, NoShow: 0, NewNumber: 0, Retry: 0, Fresh: 0 };
    for (const r of d.today) { m.All++; m[groupOf(r.why)]++; }
    return m;
  }, [d.today]);
  const soldIds = useMemo(() => new Set(salesToday.map(x => x.contactId)), [salesToday]);
  const rows = d.today.map((r, i) => ({ ...r, n: i + 1 })).filter(r => filter === 'All' || groupOf(r.why) === filter);

  const exportCsv = () => {
    const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ['#', 'Why', 'First', 'Last', 'Phone', 'Backup', 'City', 'State', 'Zone', 'Company', 'Job', 'Dials', 'Last dialed', 'Next', 'Latest note'];
    const lines = d.today.map((r, i) => {
      const c = r.contact;
      return [i + 1, r.why, c.first, c.last, c.phone, c.backup, c.city, c.state, c.zone, c.company, c.job, c.dials,
        c.lastDialed ? mdTime(c.lastDialed, TZ) : '', c.callAt ? mdTime(c.callAt, TZ) : r.nextAction ? md(r.nextAction, TZ) : '',
        notesNewestFirst(c.notes)[0] ?? ''].map(esc).join(',');
    });
    saveText(`today-${md(d.now, TZ).replace('/', '-')}.csv`, [head.join(','), ...lines].join('\n'));
  };

  if (!d.ready) return <div className="empty">Loading…</div>;
  const s = d.stats;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const lines = current ? notesNewestFirst(current.notes) : [];
  const history = lines.filter(isHistoryNote), research = lines.filter(l => !isHistoryNote(l));
  const dialNum = current ? (backupMode && current.backup ? current.backup : current.phone || current.backup) : '';
  const otherNum = current ? (backupMode ? current.phone : current.backup) : '';
  const maxH = Math.max(4, ...hours.map(x => x.dials));
  const dateLine = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d.now);
  const states = new Set(d.today.map(r => r.contact.state));
  const lastSave = d.log.at(-1)?.at;

  // appointments plus today's closed-out sales and presentations
  type ApptLine = { id: string; at: number | null; name: string; company: string; pill: string; tone: string; open: boolean; ci: boolean };
  const apptLines: ApptLine[] = [
    ...d.appts.map(a => {
      const c = a.contact, ci = tagKind(c.tag) === 'calledInto';
      const [pill, tone] = ci ? ['Called into', 'blue'] : a.status.includes('show') ? ['Did they show?', 'amber']
        : a.status.includes('Confirm') ? [a.called ? 'Confirmed' : a.status.includes('tomorrow') ? 'Confirm tmrw' : 'Confirm', 'teal']
        : [a.status.replace('CALLED - ', ''), 'grey'];
      return { id: c.id, at: c.callAt, name: `${c.first} ${c.last}`, company: c.company, pill, tone, open: true, ci };
    }),
    ...salesToday.map(x => { const c = d.byId.get(x.contactId); return { id: x.contactId, at: x.at, name: c ? `${c.first} ${c.last}` : '', company: c?.company ?? '', pill: 'Sold', tone: 'green', open: false, ci: false }; }),
    ...d.noSales.filter(x => sameDay(x.at, d.now, TZ)).map(x => { const c = d.byId.get(x.contactId); return { id: x.contactId, at: x.at, name: c ? `${c.first} ${c.last}` : '', company: c?.company ?? '', pill: 'Presented', tone: 'violet', open: false, ci: false }; }),
  ];

  return (
    <div className="shell">
      <div className="demo-banner">Demo with made-up contacts. Changes stay in this browser only.</div>
      <header className="top">
        <div className="brand"><span className="dot">T</span><span className="wordmark">Truckers</span><span className="who">Demo Agent · Direct</span></div>
        <nav className="nav">
          {([['today', 'Today'], ['contacts', 'Contacts'], ['needs', 'Needs Number']] as const).map(([p, label]) => (
            <button key={p} className={page === p ? 'on' : ''} aria-current={page === p ? 'page' : undefined} onClick={() => setPage(p)}>{label}</button>
          ))}
          {['Appointments', 'Results', 'Team'].map(x => <button key={x} title="Coming in the next stages" disabled>{x}</button>)}
        </nav>
        <div className="tools">
          <div className="search">
            <Ico d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" size={15} />
            <input ref={searchRef} placeholder="Name, phone or company" value={q} onChange={e => setQ(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } }} />
            <span className="kc">/</span>
            {results.length > 0 && (
              <div className="results">
                {results.map(c => (
                  <button key={c.id} onClick={() => { setPicked(c.id); setQ(''); setPage('today'); }}>
                    <b>{c.first} {c.last}</b> <span className="hint">· {c.company} · {c.list}{c.tag ? ' · ' + tagShort(c.tag) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="iconbtn" aria-label="Switch day or night" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Ico d={theme === 'dark' ? 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z' : 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'} size={16} />
          </button>
          <span className="avatar">DA</span>
        </div>
      </header>

      {page === 'contacts' && <ContactsPage d={d} onDial={id => { setPicked(id); setPage('today'); }} />}
      {page === 'needs' && <NeedsPage d={d} />}
      {page === 'today' && <>
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{dateLine} · {states.size > 1 ? 'All states' : [...states][0] ?? 'All states'} · Pass {d.pass}</div>
          <h1>Today&rsquo;s Call Queue</h1>
          <div className="passbar"><div className="progress"><i style={{ width: pct + '%' }} /></div><span><b>{s.done}</b> of {s.total} dialed this pass</span></div>
        </div>
        <div className="strip">
          {([
            ['Left to dial', s.left, ''], ['Dials', s.dials, 'blue'], ['Connects', s.connects, 'blue'], ['Scheduled', s.scheduled, 'amber'],
            ['Called into', calledInto, ''], ['Presented', s.presented, ''], ['Sold', s.sold, 'green'], ['ALP today', money(alp), 'green'],
          ] as [string, string | number, string][]).map(([l, v, tone]) => (
            <div className="cell" key={l}><span>{l}</span><b className={tone}>{v}</b></div>
          ))}
        </div>
      </section>

      <main className="work">
        <div className="leftcol">
          <section className="panel queue">
            <div className="toolbar">
              <div className="tabs" role="tablist">
                {FILTERS.map(([f, label]) => (
                  <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                    {label} <span>{counts[f]}</span>
                  </button>
                ))}
              </div>
              <div className="tbtns">
                <button className={`btn auto ${auto ? 'on' : ''}`} onClick={() => {
                  if (auto) { setAuto(false); setCountdown(null); }
                  else { setAuto(true); if (current && !call) startCall(current); }
                }}><span className="led" />{auto ? (countdown != null ? `Next in ${countdown}…` : 'Auto-dial on') : 'Auto-dial'}</button>
                <button className="btn" onClick={d.reSort}>Re-sort</button>
                <button className="btn" onClick={exportCsv}>Export CSV</button>
              </div>
            </div>
            <div className="tscroll" ref={tableRef}>
              <table className="qt">
                <thead><tr>
                  <th className="num">#</th><th>Why</th><th>Contact</th><th>Phone</th><th>Location · Zone</th><th>Company — Role</th>
                  <th className="num">Dials</th><th className="num">Last</th><th className="num">Next</th><th>Notes (newest)</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const c = r.contact, isCur = c.id === current?.id, sold = soldIds.has(c.id) || c.tag.startsWith('SOLD');
                    const label = r.done ? `Done · ${baseWhy(r.why)}` : r.why;
                    return (
                      <tr key={c.id} data-row={c.id} className={`${r.done ? 'done' : ''} ${isCur ? 'cur' : ''} ${sold ? 'sold' : ''}`}
                          onClick={() => setPicked(c.id)} tabIndex={0} onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); setPicked(c.id); } }}>
                        <td className="num muted">{r.n}</td>
                        <td><span className={`pill ${sold ? 'Sold' : r.done ? 'Done' : chipClass(r.why) || 'Retry'}`}>{sold ? 'Sold' : label}</span></td>
                        <td className="strong">{c.first} {c.last}</td>
                        <td className="tnum">{c.phone || c.backup || '—'}</td>
                        <td>{c.city}, {c.state} · {c.zone}</td>
                        <td>{c.company}{c.job ? ` — ${c.job}` : ''}</td>
                        <td className="num">{c.dials}</td>
                        <td className="num muted">{c.lastDialed ? md(c.lastDialed, TZ) : '—'}</td>
                        <td className="num muted">{c.callAt ? md(c.callAt, TZ) : r.nextAction ? md(r.nextAction, TZ) : '—'}</td>
                        <td className="note muted">{(notesNewestFirst(c.notes)[0] ?? '').replace(/^(\d{1,2}\/\d{1,2}):\s*/, '$1 ')}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={10} className="emptyrow">Nothing in this group right now.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              <span>Showing {rows.length} of {d.today.length} · {s.done} done today</span>
              <span className="legend"><i className="sold" />Sold <i className="done" />Done today <i className="cur" />On the line</span>
            </div>
          </section>

          <div className="lower">
            <section className="panel appts">
              <div className="ph"><h2>Appointments &amp; called into</h2><span>{apptLines.length} today</span></div>
              {apptLines.map((a, i) => (
                <div className="aline" key={a.id + i}>
                  <span className="at">{a.at ? timeOnly(a.at) : '—'}</span>
                  <button className="an" onClick={() => setPicked(a.id)}>{a.name}</button>
                  <span className="ac">{a.company}</span>
                  <span className={`spill ${a.tone}`}>{a.pill}</span>
                  {a.open && (
                    <span className="aacts">
                      <button onClick={() => setModal({ kind: 'sold', id: a.id })}>Sold</button>
                      <button onClick={() => setModal({ kind: 'presented', id: a.id })}>Presented</button>
                      {!a.ci && <button onClick={() => d.outcome(a.id, 'noshow')}>No-show</button>}
                      {!a.ci && <button onClick={() => setModal({ kind: 'reschedule', id: a.id })}>Move</button>}
                    </span>
                  )}
                </div>
              ))}
              {!apptLines.length && <p className="hint pad16">No appointments today.</p>}
            </section>
            <section className="panel chart">
              <div className="ph"><h2>Dials &amp; connects by hour</h2><span>{best ? `Best window: ${best}` : 'Fills in as you dial'}</span></div>
              <div className="bars" role="img" aria-label="Dials and connects by hour today">
                {hours.map(x => (
                  <div className="bcol" key={x.h} title={`${hourLabel(x.h)}: ${x.dials} dials, ${x.connects} connects`}>
                    <div className="stack" style={{ height: `${(x.dials / maxH) * 100}%` }}>
                      <i className="c" style={{ height: x.dials ? `${(x.connects / x.dials) * 100}%` : 0 }} />
                    </div>
                    <span>{x.h % 2 ? hourLabel(x.h) : ''}</span>
                  </div>
                ))}
              </div>
              <div className="legend"><i className="dl" />Dials <i className="cn" />Connects</div>
            </section>
          </div>
        </div>

        <aside className="sidecol">
          <section className="panel line">
            {!current ? (
              <div className="pad16">
                <div className="eyebrow">On the line</div>
                <h2 className="serif">List finished</h2>
                <p className="hint">Everyone due this pass has been dialed. Re-sort to start a fresh pass with whoever is due again.</p>
                <button className="btn primary" onClick={d.reSort}>Re-sort Today</button>
              </div>
            ) : (<>
              <div className="lhead">
                <div className="eyebrow">On the line{position >= 0 ? ` · ${position + 1} of ${d.queue.length}` : ''}</div>
                {why && <span className={`pill ${chipClass(why) || 'Retry'}`}>{baseWhy(why)}</span>}
              </div>
              <h2 className="serif name">{current.first} {current.last}</h2>
              <div className="sub">{current.company}{current.job ? ` — ${current.job}` : ''}</div>
              <div className="sub muted">{current.city}, {current.state} · {ZONE_NAME[current.zone] ?? current.zone} · {localTime(current.zone, d.now)} local</div>

              {call?.id === current.id ? (
                <div className="callbtn live">
                  <span className="wave"><i /><i /><i /><i /></span>
                  <span>{dialNum}</span>
                  <small>{fmtSecs(Math.round((Date.now() - call.at) / 1000))}</small>
                </div>
              ) : (
                <button className="callbtn" disabled={!dialNum} onClick={() => startCall(current, backupMode)}>
                  <Ico d={IC.phone} size={20} /><span>{dialNum || 'No number'}</span>
                </button>
              )}
              <div className="numline">
                {otherNum ? <button className="linkish" onClick={() => setBackupMode(!backupMode)} title="Switch number (B)">{backupMode ? 'Main' : 'Backup'} {otherNum}</button> : <span />}
                <span>{current.dials} dials · last {current.lastDialed ? md(current.lastDialed, TZ) : 'never'}</span>
              </div>

              <div className="keys">
                {([
                  ['noanswer', '1', 'No answer'], ['voicemail', '2', 'Voicemail'], ['callback', '3', 'Callback'],
                  ['notint', '4', 'Not interested'], ['bad', '5', 'Bad number'], ['appt', '6', 'Appointment'],
                ] as [DialerKey, string, string][]).map(([k, n, label]) => (
                  <button key={k} className={`k ${k === 'appt' ? 'prime' : ''} ${pending === k ? 'armed' : ''}`} onClick={() => act(k)}>
                    {label}<small>{n}</small>
                  </button>
                ))}
              </div>

              {pending && (
                <div className="fieldset">
                  <label>{pending === 'appt' ? 'Appointment' : 'Callback'} time</label>
                  <div className="row2">
                    <input ref={whenRef} placeholder="e.g. fri 10am" value={when} onChange={e => setWhen(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') act(pending); if (e.key === 'Escape') setPending(null); }} />
                    <button className="btn primary" onClick={() => act(pending)}>Save</button>
                  </div>
                  <div className="sugg">
                    {preview && <span className="hint">{preview}</span>}
                    {['tomorrow 10am', 'tomorrow 6pm', 'fri 2pm', 'mon 9am'].map(x => <button key={x} onClick={() => setWhen(x)}>{x}</button>)}
                  </div>
                </div>
              )}
              <div className="fieldset">
                <label>Note</label>
                <input ref={noteRef} placeholder="Wife answered, call back after 6" value={noteText} onChange={e => setNoteText(e.target.value)}
                       onKeyDown={e => {
                         if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
                         if (e.key === 'Enter' && noteText.trim() && !pending) { d.note(current.id, noteText); setNoteText(''); }
                       }} />
                <div className="mini">
                  <span className="hint">Saved with the result, or press Enter to add it now.</span>
                  <span className="minibtns">
                    <button className="linkish" onClick={() => { d.skip(current.id); setPicked(null); }}>Skip</button>
                    <button className="linkish" disabled={!d.canUndo} onClick={d.undo}>Undo</button>
                  </span>
                </div>
              </div>

              <div className="hist">
                <div className="eyebrow">History</div>
                {history.length ? history.slice(0, 6).map((l, i) => {
                  const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/);
                  return <div className="hl" key={i}><span>{m ? m[1] : ''}</span><p>{m ? m[2] : l}</p></div>;
                }) : <p className="hint">No calls logged yet.</p>}
                {research.length > 0 && <p className="research">Research · {research.join(' ')}</p>}
              </div>
            </>)}
          </section>

          <section className="panel next">
            <div className="eyebrow">Up next</div>
            {d.queue.filter(r => r.contact.id !== current?.id).slice(0, 4).map(r => (
              <button className="nl" key={r.contact.id} onClick={() => setPicked(r.contact.id)}>
                <span>{r.contact.first} {r.contact.last}</span>
                <span className={`tx ${chipClass(r.why) || 'Retry'}`}>{r.why}</span>
              </button>
            ))}
            {d.queue.length <= 1 && <p className="hint">Nobody else is due right now.</p>}
            <button className="linkish reset" onClick={d.resetDemo}>Reset demo data</button>
          </section>
        </aside>
      </main>
      </>}

      <footer className="foot">
        <span><i className="dotok" />All changes saved in this browser{lastSave ? ` · last save ${timeOnly(lastSave)}` : ''}</span>
        {d.canUndo && <button className="linkish undo" onClick={d.undo}>Undo {UNDO_LABEL[d.undoLabel ?? ''] ?? d.undoLabel}</button>}
        <span className="keyshelp">1–6 result · C call · N note · / search · U undo · R re-sort · S skip</span>
      </footer>

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

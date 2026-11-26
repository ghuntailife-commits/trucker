'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialer } from '../src/app-store/useDialer';
import type { Contact } from '../src/rules/types';
import type { DialerKey } from '../src/rules/engine';
import { notesNewestFirst, isHistoryNote } from '../src/rules/notes';
import { tagShort, tagKind } from '../src/rules/tags';
import { mdTime, md, sameDay } from '../src/rules/time';
import { parseWhen } from '../src/rules/parseWhen';
import { reachByDial } from '../src/rules/stats';
import { QUALIFIERS } from '../src/rules/engine';

import { ContactsPage } from './ui/contacts';
import { NeedsPage } from './ui/needs';
import { AppointmentsPage } from './ui/appointments';
import { ResultsPage } from './ui/results';
import { REAL_SEED } from '../src/app-store/realSeed';
import { ResultForm, type ResultKind, type ResultInitial } from './ui/forms';
import type { AmendTarget } from '../src/rules/amend';
import { saleAlp } from '../src/rules/results';
import { TZ, ZONE_TZ, chipClass, localTime, Ico, IC, fmtSecs, ZONE_NAME, timeOnly, saveText } from './ui/shared';
import { useTeam, type Team } from '../src/app-store/useTeam';
import { pagesFor, viewers, type AgentId, type Page, type ViewerId } from '../src/team/agents';
import { TeamPage, HealthList } from './ui/team';
import { SettingsPage } from './ui/settings';
import { QuoText } from './ui/quo';
import { ProfileMenu, ShortcutsDialog, IntegrationsPage } from './ui/profile';
import { buildBrief, briefKind } from '../src/brief/brief';
import { MENU_PAGES } from '../src/team/agents';
import { healthCheck, healthCount } from '../src/team/health';
import type { TextKey } from '../src/quo/quo';

const PAGE_LABEL: Record<Page, string> = { today: 'Today', appts: 'Appointments', contacts: 'Contacts', needs: 'Needs Number', results: 'Results', team: 'Team', settings: 'Settings', integrations: 'Integrations' };
const ROLE_LABEL = { admin: 'admin', agent: 'agent', boss: 'results only' } as const;

/** Day or night, remembered in this browser. */
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
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
  return [theme, setTheme] as const;
}

export default function App() {
  const t = useTeam();
  const [theme, setTheme] = useTheme();
  const [now] = useState(() => Date.now());
  if (!t.ready) return <div className="empty">Loading…</div>;
  if (t.viewer === 'boss') return (
    <div className="shell">
      <div className="demo-banner">Demo: the boss&rsquo;s view. Results and totals for the team, no contact details. Austin&rsquo;s and Gracie&rsquo;s numbers are made up.</div>
      <header className="top">
        <div className="brand"><span className="dot">T</span><span className="wordmark">Truckers</span><span className="who">Boss · results only</span></div>
        <nav className="nav"><button className="on" aria-current="page">Team</button></nav>
        <div className="tools"><ProfileMenu t={t} theme={theme} setTheme={setTheme} items={[]} /></div>
      </header>
      <TeamPage t={t} now={now} />
    </div>
  );
  const agent = t.viewer as AgentId;
  // a rules change in Settings reloads the dialer with the new rules
  return <Today key={agent + JSON.stringify(t.team.rules)} t={t} agent={agent} theme={theme} setTheme={setTheme} />;
}

/** A sale or no-sale whose contact is gone (Production Desk): enough of a contact for the form header. */
function whoContact(m: { initial?: ResultInitial }): Contact | undefined {
  const w = m.initial?.sale?.who ?? m.initial?.noSale?.who;
  return w ? ({ id: '', first: w.first, last: w.last, phone: w.phone, backup: '', company: w.company, job: '', list: w.list } as unknown as Contact) : undefined;
}
type Modal = null | { kind: ResultKind; id: string; amend?: AmendTarget; initial?: ResultInitial };
type QuoModal = null | { id: string; apptAt?: number | null; first?: TextKey };
const UNDO_LABEL: Record<string, string> = { noanswer: 'No answer', voicemail: 'Voicemail', callback: 'Callback', notint: 'Not interested',
  bad: 'Bad number', appt: 'Appointment', note: 'note', sold: 'Sold', presented: 'Presented', noshow: 'No-show', reschedule: 'Move', confirm: 'Confirmed', tag: 'Qualifier' };
type Filter = 'All' | 'Callback' | 'FollowUp' | 'NoShow' | 'NewNumber' | 'Retry' | 'Fresh';
const FILTERS: [Filter, string][] = [['All', 'All'], ['Callback', 'Callbacks'], ['FollowUp', 'Follow-ups'], ['NoShow', 'No-shows'], ['NewNumber', 'New numbers'], ['Retry', 'Retry'], ['Fresh', 'Fresh']];
const baseWhy = (why: string) => why.replace(/^DONE TODAY - /, '');
const groupOf = (why: string): Filter => {
  const k = chipClass(baseWhy(why));
  return k === 'Callback' || k === 'FollowUp' || k === 'NoShow' || k === 'NewNumber' || k === 'Fresh' ? k : 'Retry';
};
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const hourOf = (t: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(t));
const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? 'a' : 'p');

function Today({ t, agent, theme, setTheme }: { t: Team; agent: AgentId; theme: 'light' | 'dark' | null; setTheme: (x: 'light' | 'dark') => void }) {
  const me = t.team.agents.find(a => a.id === agent)!;
  const d0 = useDialer(agent, t.cfg);
  // the monthly goal lives in Settings, so George can set everyone's
  const d = { ...d0, goal: me.goal, setGoal: (g: number) => { t.setAgent(agent, { goal: g }); d0.say(`Monthly goal set to $${g.toLocaleString('en-US')}.`); } };
  const pages = pagesFor(t.role);
  const quoOn = me.quo;
  const [quo, setQuo] = useState<QuoModal>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState<null | 'callback' | 'appt'>(null);
  const [when, setWhen] = useState('');
  const [email, setEmail] = useState('');
  const [noteText, setNoteText] = useState('');
  const [backupMode, setBackupMode] = useState(false);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [call, setCall] = useState<{ id: string; at: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('All');
  const [page, setPage0] = useState<Page>('today');
  const setPage = (p: Page) => setPage0(pages.includes(p) ? p : 'today');
  const [chartBy, setChartBy] = useState<'hour' | 'dial'>('hour');
  const [, tick] = useState(0);
  const whenRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);


  const current: Contact | undefined = (picked ? d.byId.get(picked) : undefined) ?? d.queue[0]?.contact;
  const currentRow = d.today.find(r => r.contact.id === current?.id);
  const why = currentRow?.why ?? (current ? tagShort(current.tag) : '');
  const position = current ? d.queue.findIndex(r => r.contact.id === current.id) : -1;

  // reset the action area when the contact changes, and keep its row in view inside the table
  useEffect(() => {
    setPending(null); setWhen(''); setEmail(''); setNoteText(''); setBackupMode(false);
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
    d.press(current.id, key, { when: key === 'callback' || key === 'appt' ? when : '', email: key === 'appt' ? email : '', note: noteText, backupMode });
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
      if (typing || modal || quo || e.ctrlKey || e.metaKey || e.altKey) return;
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
  const hourKey = Math.floor(d.now / 3_600_000);
  const findings = useMemo(() => (d.ready ? healthCheck({ contacts: d.contacts, sales: d.sales, noSales: d.noSales, now: d.now, tz: TZ }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.ready, d.contacts, d.sales, d.noSales, hourKey]);
  const hc = healthCount(findings);
  useEffect(() => {
    if (!healthOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setHealthOpen(false); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [healthOpen]);
  const preview = useMemo(() => {
    if (!when.trim()) return '';
    const w = parseWhen(when, d.now, TZ, false);
    return !w ? 'Could not read that time' : 'error' in w ? w.error : w.label;
  }, [when, d.now]);
  const farOut = useMemo(() => {
    if (pending !== 'appt' || !when.trim()) return false;
    const w = parseWhen(when, d.now, TZ, false);
    return !!w && !('error' in w) && w.date - d.now > d.cfg.apptSoonHours * 3_600_000;
  }, [when, d.now, pending, d.cfg.apptSoonHours]);

  // today's events: called-into count, ALP and the hourly chart
  const todayLog = useMemo(() => d.log.filter(e => sameDay(e.at, d.now, TZ)), [d.log, d.now]);
  const calledInto = useMemo(() => new Set(todayLog.filter(e => e.kind === 'Tag' && e.tag.startsWith('CALLED INTO')).map(e => e.contactId)).size
    + d.appts.filter(a => tagKind(a.contact.tag) === 'calledInto').length, [todayLog, d.appts]);
  const salesToday = d.sales.filter(x => sameDay(x.at, d.now, TZ));
  const alp = salesToday.reduce((a, x) => a + saleAlp(x), 0);
  const monthAlp = useMemo(() => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d.now);
    return d.sales.filter(x => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(x.at) === p).reduce((a, x) => a + saleAlp(x), 0); }, [d.sales, d.now]);
  // the agent's own no-show rate over the last 30 days, for the no-show brief
  const noShowRate = useMemo(() => { const from = d.now - 30 * 86_400_000;
    const tags = d.log.filter(e => e.kind === 'Tag' && e.at >= from).map(e => tagKind(e.tag));
    const ns = tags.filter(k => k === 'noshow').length, shown = tags.filter(k => k === 'presented' || k === 'sold').length;
    return ns + shown ? ns / (ns + shown) : 0; }, [d.log, d.now]);
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
    const m: Record<Filter, number> = { All: 0, Callback: 0, FollowUp: 0, NoShow: 0, NewNumber: 0, Retry: 0, Fresh: 0 };
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

  const exportAll = () => {
    const esc = (v: unknown) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const head = ['List', 'First', 'Last', 'Phone', 'Backup', 'City', 'State', 'Company', 'Job', 'Tag', 'Dials', 'Last dialed', 'Email', 'Notes'];
    const rowsOut = d.contacts.map(c => [c.list, c.first, c.last, c.phone, c.backup, c.city, c.state, c.company, c.job, tagShort(c.tag), c.dials,
      c.lastDialed ? mdTime(c.lastDialed, TZ) : '', c.email ?? '', c.notes].map(esc).join(','));
    saveText(`contacts-${me.name.toLowerCase()}-${md(d.now, TZ).replace('/', '-')}.csv`, [head.join(','), ...rowsOut].join('\n'));
  };
  if (!d.ready) return <div className="empty">Loading…</div>;
  const s = d.stats;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const lines = current ? notesNewestFirst(current.notes) : [];
  const bk = current ? briefKind(why) : null;
  const brief = current && bk ? buildBrief({ c: current, kind: bk, agent: me.name, now: d.now, tz: TZ, cfg: d.cfg, noShowRate,
    noSale: bk === 'followUp' ? [...d.noSales].reverse().find(n => n.contactId === current.id) : undefined }) : null;
  const history = lines.filter(isHistoryNote), research = lines.filter(l => !isHistoryNote(l));
  const dialNum = current ? (backupMode && current.backup ? current.backup : current.phone || current.backup) : '';
  const otherNum = current ? (backupMode ? current.phone : current.backup) : '';
  const maxH = Math.max(4, ...hours.map(x => x.dials));
  const byDial = reachByDial(d.log);
  const maxRate = Math.max(0.2, ...byDial.map(x => (x.dials ? x.reached / x.dials : 0)));
  const dateLine = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d.now);
  const states = new Set(d.today.map(r => r.contact.state));
  const lastSave = d.log.at(-1)?.at;

  // appointments plus today's closed-out sales and presentations
  type ApptLine = { id: string; at: number | null; name: string; company: string; pill: string; tone: string; open: boolean; ci: boolean; confirm?: boolean; phone?: string; first?: string; tomorrow?: boolean };
  const apptLines: ApptLine[] = [
    ...d.appts.map(a => {
      const c = a.contact, ci = tagKind(c.tag) === 'calledInto';
      const [pill, tone] = ci ? ['Called into', 'blue'] : a.status.includes('show') ? ['Did they show?', 'amber']
        : a.status.includes('Confirmed') ? [a.status.includes('tomorrow') ? 'Confirmed tmrw' : 'Confirmed', 'teal']
        : a.status.includes('Confirm') ? [a.status.includes('tomorrow') ? 'Confirm tmrw' : 'Confirm today', 'amber']
        : [a.status.replace('CALLED - ', ''), 'grey'];
      return { id: c.id, at: c.callAt, name: `${c.first} ${c.last}`, company: c.company, pill, tone, open: true, ci,
        confirm: a.status.includes('Confirm') && !a.status.includes('Confirmed'), phone: c.phone || c.backup, first: c.first,
        tomorrow: a.status.includes('tomorrow') };
    }),
    ...salesToday.map(x => { const c = d.byId.get(x.contactId); return { id: x.contactId, at: x.at, name: c ? `${c.first} ${c.last}` : '', company: c?.company ?? '', pill: 'Sold', tone: 'green', open: false, ci: false }; }),
    ...d.noSales.filter(x => sameDay(x.at, d.now, TZ)).map(x => { const c = d.byId.get(x.contactId); return { id: x.contactId, at: x.at, name: c ? `${c.first} ${c.last}` : '', company: c?.company ?? '', pill: 'Presented', tone: 'violet', open: false, ci: false }; }),
  ];

  return (
    <div className="shell">
      <div className="demo-banner">{REAL_SEED && agent === 'george' ? `Demo with your real contacts, copied from your sheet on ${md(REAL_SEED.builtAt, TZ)}. Changes stay in this browser and never touch your sheet.` : agent !== 'george' ? `Demo: ${me.name}\u2019s screen with made-up contacts on ${me.name}\u2019s states. Changes stay in this browser only.` : 'Demo with made-up contacts. Changes stay in this browser only.'}</div>
      <header className="top">
        <div className="brand"><span className="dot">T</span><span className="wordmark">Truckers</span><span className="who">{me.name} · {me.team}</span></div>
        <nav className="nav">
          {pages.filter(p => !MENU_PAGES.includes(p)).map(p => (
            <button key={p} className={page === p ? 'on' : ''} aria-current={page === p ? 'page' : undefined} onClick={() => setPage(p)}>{PAGE_LABEL[p]}</button>
          ))}
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
          <button className={`healthbtn ${hc.fix ? 'h-fix' : hc.check ? 'h-check' : 'h-ok'}`} onClick={() => setHealthOpen(true)}
            title="Daily health check: things in your contacts to fix or look at">
            <i />{hc.fix || hc.check ? `${hc.fix + hc.check} to check` : 'All clear'}
          </button>
          <ProfileMenu t={t} me={me} theme={theme} setTheme={setTheme} items={[
            { key: 'settings', label: 'Settings', sub: 'Goals, rules, Quo, coaching', onClick: () => setPage('settings'), hidden: !pages.includes('settings') },
            { key: 'integrations', label: 'Integrations', sub: 'Quo, Google, Claude AI', onClick: () => setPage('integrations') },
            { key: 'goal', label: 'My monthly goal', sub: `${money(monthAlp)} of ${money(me.goal)}`, onClick: () => setPage('results') },
            { key: 'keys', label: 'Keyboard shortcuts', onClick: () => setKeysOpen(true) },
            { key: 'export', label: 'Export my contacts', sub: `${d.contacts.length.toLocaleString('en-US')} as CSV`, onClick: exportAll },
            { key: 'reset', label: 'Reset demo data', sub: 'Back to the copy from your sheet', onClick: d.resetDemo },
          ]} />
        </div>
      </header>

      {page === 'contacts' && <ContactsPage d={d} onDial={id => { setPicked(id); setPage('today'); }} />}
      {page === 'needs' && <NeedsPage d={d} />}
      {page === 'team' && <TeamPage t={t} now={d.now} live={{ id: agent, data: { contacts: d.contacts, log: d.log, sales: d.sales, noSales: d.noSales } }}
        onViewAs={id => t.setViewer(id)} onDial={id => { setPicked(id); setPage('today'); }} />}
      {page === 'settings' && <SettingsPage t={t} />}
      {page === 'integrations' && <IntegrationsPage t={t} />}
      {page === 'results' && <ResultsPage d={d} onDial={id => { setPicked(id); setPage('today'); }} onResult={(kind, id, extra) => setModal({ kind, id, ...extra })} />}
      {page === 'appts' && <AppointmentsPage d={d} onDial={id => { setPicked(id); setPage('today'); }} onResult={(kind, id, extra) => setModal({ kind, id, ...extra })} />}
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
              <span>Showing {rows.length} of {d.today.length} · {s.done} done today · <span className="rankstat" title="Fresh contacts are ranked by how often contacts like them have booked, once enough have been dialed.">
                {d.scorer.ready ? 'fresh contacts ranked by your results' : `fresh ranking learns after ${d.scorer.need} dialed (${d.scorer.results} so far)`}</span></span>
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
                      {a.confirm && <button className="cf" onClick={() => d.confirm(a.id)}>Confirmed</button>}
                      {a.confirm && a.phone && a.at && quoOn && <button className="txt" onClick={() => setQuo({ id: a.id, apptAt: a.at, first: a.tomorrow ? 'confirmTomorrow' : 'confirmToday' })}>Text with Quo</button>}
                      {a.confirm && a.phone && a.at && !quoOn && <a className="txt" href={`sms:${a.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Hi ${a.first}, just a reminder about our appointment ${a.tomorrow ? 'tomorrow' : 'today'} at ${timeOnly(a.at)} ET. Talk soon!`)}`}>Text reminder</a>}
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
              <div className="ph"><h2>{chartBy === 'hour' ? <>Dials &amp; connects by hour</> : <>Reach by dial number</>}</h2>
                <div className="seg mini">
                  <button className={chartBy === 'hour' ? 'on' : ''} onClick={() => setChartBy('hour')}>By hour</button>
                  <button className={chartBy === 'dial' ? 'on' : ''} onClick={() => setChartBy('dial')}>By dial</button>
                </div></div>
              {chartBy === 'dial' ? <>
                <p className="hint chartnote">Of every 1st, 2nd, 3rd... dial, the share that reached someone. All time, dials 1 to 10 shown on their own.</p>
                <div className="bars dialbars" role="img" aria-label="Reach rate by dial number">
                  {byDial.map(x => {
                    const rate = x.dials ? x.reached / x.dials : 0;
                    return (
                      <div className="bcol" key={x.label} title={`Dial ${x.label}: ${x.reached} reached of ${x.dials} dials`}>
                        {x.dials > 0 && <em>{Math.round(rate * 100)}%</em>}
                        <div className="stack rate" style={{ height: `${(rate / maxRate) * 100}%` }} />
                        <span>{x.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="legend"><span>{byDial.reduce((a, x) => a + x.dials, 0)} dials logged · bars under 30 dials are early reads</span></div>
              </> : <>
              <p className="hint chartnote">{best ? `Best window today: ${best}` : 'Today, Eastern time. Fills in as you dial.'}</p>
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
              </>}
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
              {d.scorer.ready && currentRow?.category === 3 && d.scorer.reason(current) && <div className="match">Good match · {d.scorer.reason(current)}</div>}
              <div className="quals" role="group" aria-label="Quick qualifiers">
                {QUALIFIERS.map(q => {
                  const on = current.quals?.includes(q) ?? false;
                  return <button key={q} className={on ? 'on' : ''} aria-pressed={on} onClick={() => d.qual(current.id, q)}>{q}</button>;
                })}
              </div>

              {brief && (
                <div className={`brief b-${brief.kind}`} aria-label="Call brief">
                  <div className="bhead"><span className="eyebrow">Call brief</span><small title="At go-live Claude writes this from the notes">rules draft · AI at go-live</small></div>
                  <p><b>Who.</b> {brief.who}</p>
                  <p><b>Where it stands.</b> {brief.stands}</p>
                  <p className="open"><b>Open with.</b> {brief.openWith}</p>
                  {brief.watch.length > 0 && <ul>{brief.watch.map(w => <li key={w}>{w}</li>)}</ul>}
                </div>
              )}
              {call?.id === current.id ? (
                <div className="callbtn live">
                  <span className="wave"><i /><i /><i /><i /></span>
                  <span>{dialNum}</span>
                  <small>{fmtSecs(Math.round((Date.now() - call.at) / 1000))}</small>
                </div>
              ) : (
                <button className="callbtn" disabled={!dialNum} onClick={() => startCall(current, backupMode)}>
                  <Ico d={IC.phone} size={20} /><span>{dialNum || 'No number'}</span>{quoOn && dialNum && <small className="via">Quo</small>}
                </button>
              )}
              <div className="numline">
                {otherNum ? <button className="linkish" onClick={() => setBackupMode(!backupMode)} title="Switch number (B)">{backupMode ? 'Main' : 'Backup'} {otherNum}</button> : <span />}
                <span>{quoOn && dialNum && <button className="linkish quobtn" onClick={() => setQuo({ id: current.id, apptAt: tagKind(current.tag) === 'scheduled' ? current.callAt : null })}>Text with Quo</button>}
                  {current.dials} dials · last {current.lastDialed ? md(current.lastDialed, TZ) : 'never'}</span>
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
                    {farOut && <span className="warnline">More than 2 days out. Try to book it within 2 days.</span>}
                    {['tomorrow 10am', 'tomorrow 6pm', 'fri 2pm', 'mon 9am'].map(x => <button key={x} onClick={() => setWhen(x)}>{x}</button>)}
                  </div>
                  {pending === 'appt' && <>
                    <label>Email for the calendar invite <span className="opt">optional</span></label>
                    <input inputMode="email" autoComplete="off" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') act('appt'); if (e.key === 'Escape') setPending(null); }} />
                  </>}
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
        {page === 'today' && <span className="keyshelp">1–6 result · C call · N note · / search · U undo · R re-sort · S skip</span>}
      </footer>

      {modal && <ResultForm kind={modal.kind} contact={d.byId.get(modal.id) ?? whoContact(modal)} now={d.now} initial={modal.initial} onClose={() => setModal(null)}
        onSave={(form) => {
          if (modal.amend) d.amend(modal.amend, modal.kind === 'reschedule' ? 'scheduled' : modal.kind, form);
          else d.outcome(modal.id, modal.kind, form);
          setModal(null);
        }} />}
      {quo && d.byId.get(quo.id) && <QuoText c={d.byId.get(quo.id)!} agent={me} apptAt={quo.apptAt} first={quo.first} onClose={() => setQuo(null)}
        onSent={body => { d.note(quo.id, `Texted (Quo): "${body}"`); setQuo(null); }} />}
      {keysOpen && <ShortcutsDialog onClose={() => setKeysOpen(false)} />}
      {healthOpen && (
        <div className="drill-bg" onClick={e => { if (e.target === e.currentTarget) setHealthOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') setHealthOpen(false); }}>
          <aside className="drill" role="dialog" aria-label="Health check">
            <header><div><div className="eyebrow">Runs every morning</div><h2>Health check</h2>
              <p className="hint">{findings.length ? 'Things in your contacts worth a look. Nothing here changes on its own.' : 'All clear today.'}</p></div>
              <button className="iconbtn" aria-label="Close" onClick={() => setHealthOpen(false)}>✕</button></header>
            <div className="dlist pad16"><HealthList findings={findings} name={id => { const c = d.byId.get(id); return c ? `${c.first} ${c.last}` : id; }}
              onOpen={id => { setHealthOpen(false); setPicked(id); setPage('today'); }} /></div>
          </aside>
        </div>
      )}
      {d.toast && <div className={`toast ${d.toast.kind}`}>{d.toast.text}</div>}
    </div>
  );
}

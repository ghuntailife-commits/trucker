// Results: the old Results, Sales, No Sales, Best Times and Daily Summary tabs as one page with subtabs.
// Every number is computed from the Activity Log and the sale / no-sale records (src/reports/results.ts).
'use client';
import { useSort } from './sort';
import { useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import * as R from '../../src/reports/results';
import { reachByDial } from '../../src/rules/stats';
import { addDays, parts, startOfDay } from '../../src/rules/time';
import { TZ, saveText, Reach } from './shared';
import { ChangeResult, contactFor, type OnResult } from './appointments';
import { SOURCE_LABEL, type SaleRecord, type NoSaleRecord } from '../../src/rules/results';
import { OutsideSaleForm } from './forms';
import { Panel, Kpi, Legend, Columns, Rows, Donut, Split, Delta, fmt$, fmtK, pctTxt } from './charts';

type D = ReturnType<typeof useDialer>;
/** What a click on a chart opens: the sales and no-sales behind that bar, slice or row (indexes into d.sales / d.noSales). */
type DrillT = { title: string; sub?: string; sales: number[]; noSales: number[] };
/** Open the records matching these tests. */
type Pick = (title: string, s?: ((x: SaleRecord) => boolean) | null, n?: ((x: NoSaleRecord) => boolean) | null, sub?: string) => void;
const dayOf = (t: number) => startOfDay(t, TZ);
const wdOf = (t: number) => (parts(t, TZ).wd + 6) % 7;
type Tab = 'overview' | 'sales' | 'pres' | 'dialing' | 'history';
type RangeKind = 'month' | '30d' | 'all';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['pres', 'Presentations'], ['dialing', 'When & where to dial'], ['history', 'Daily history']];
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o });
const mdShort = f({ month: 'short', day: 'numeric' }), wdMd = f({ weekday: 'short', month: 'numeric', day: 'numeric' }), monthYear = f({ month: 'long', year: 'numeric' });
const wkLabel = (a: number, b: number) => { const e = parts(b - 1, TZ).d; return e === parts(a, TZ).d ? mdShort.format(a) : `${mdShort.format(a)}–${e}`; };
const rate = (b: { reached: number; dials: number }) => Math.min(1, R.pct(b.reached, b.dials));
const MIN = 30;   // trust a rate once it has about 30 dials

export function ResultsPage({ d, onDial, onResult, onText }: { d: D; onDial: (id: string) => void; onResult: OnResult; onText?: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('trucker-results-tab') as Tab) || 'overview'; } catch { return 'overview'; } });
  const [rk, setRk] = useState<RangeKind>('month');
  const [drill, setDrill] = useState<DrillT | null>(null);
  const pickR: Pick = (title, sp, np, sub) => setDrill({ title, sub,
    sales: sp ? d.sales.flatMap((x, i) => (sp(x) ? [i] : [])).reverse() : [],
    noSales: np ? d.noSales.flatMap((x, i) => (np(x) ? [i] : [])).reverse() : [] });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('trucker-results-tab', t); } catch { /* */ } };
  const first = d.log[0]?.at ?? d.now;
  const range = useMemo(() => R.rangeFor(rk, d.now, TZ, first), [rk, d.now, first]);
  const all = useMemo(() => R.rangeFor('all', d.now, TZ, first), [d.now, first]);
  const who = useMemo(() => {
    const fromLog = new Map(d.log.map(e => [e.contactId, e]));
    const recs = new Map([...d.sales, ...d.noSales].filter(x => x.who).map(x => [x.contactId, x.who!]));
    return (id: string): R.Who => {
      const c = d.byId.get(id);
      if (c) return { first: c.first, last: c.last, phone: c.phone || c.backup, company: c.company, list: c.list };
      const w = recs.get(id); if (w) return w;
      const e = fromLog.get(id);
      return { first: e?.first ?? '', last: e?.last ?? '', phone: e?.phone ?? '', company: '', list: e?.list ?? '' };
    };
  }, [d.byId, d.log, d.sales, d.noSales]);

  useTips();
  return (
    <div className="respage">
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{monthYear.format(d.now)} · What&rsquo;s working</div>
          <h1>Results</h1>
        </div>
        <div className="rtools">
          {tab !== 'sales' && tab !== 'history' && (
            <div className="seg mini" role="group" aria-label="Date range">
              {([['month', 'This month'], ['30d', 'Last 30 days'], ['all', 'All time']] as [RangeKind, string][]).map(([k, l]) =>
                <button key={k} className={rk === k ? 'on' : ''} onClick={() => setRk(k)}>{l}</button>)}
            </div>
          )}
        </div>
      </section>
      <nav className="subtabs" aria-label="Results sections">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => pick(k)}>{l}</button>)}
      </nav>
      <div className="rgrid">
        {tab === 'overview' && <Overview d={d} r={range} pick={pickR} />}
        {tab === 'sales' && <Sales d={d} who={who} all={all} pick={pickR} />}
        {tab === 'pres' && <Presentations d={d} r={range} who={who} pick={pickR} />}
        {tab === 'dialing' && <Dialing d={d} r={range} />}
        {tab === 'history' && <History d={d} />}
      </div>
      {drill && <Drill d={d} t={drill} who={who} onClose={() => setDrill(null)} onDial={id => { setDrill(null); onDial(id); }} onResult={onResult} onText={onText ? id => { setDrill(null); onText(id); } : undefined} />}
    </div>
  );
}

/** The side sheet a chart click opens: every sale and no-sale behind it. Click one for the dialer or to change it. */
function Drill({ d, t, who, onClose, onDial, onResult, onText }: { d: D; t: DrillT; who: (id: string) => R.Who; onClose: () => void; onDial: (id: string) => void; onResult: OnResult; onText?: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(t.sales.length + t.noSales.length === 1 ? (t.sales.length ? 's' + t.sales[0] : 'n' + t.noSales[0]) : null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-bg')) onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const items = [
    ...t.sales.map(i => ({ key: 's' + i, kind: 'sold' as const, i, rec: d.sales[i] as SaleRecord | NoSaleRecord | undefined })),
    ...t.noSales.map(i => ({ key: 'n' + i, kind: 'presented' as const, i, rec: d.noSales[i] as SaleRecord | NoSaleRecord | undefined })),
  ].filter(x => x.rec).sort((a, b) => b.rec!.at - a.rec!.at);
  const alp = t.sales.reduce((a, i) => a + (d.sales[i]?.alp ?? 0), 0);
  return (
    <div className="drill-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drill" role="dialog" aria-label={t.title}>
        <header><div><div className="eyebrow">{t.sub ?? 'Behind this number'}</div><h2>{t.title}</h2>
          <p className="hint">{[t.sales.length && `${t.sales.length} sale${t.sales.length > 1 ? 's' : ''} · ${fmt$(alp)} ALP`, t.noSales.length && `${t.noSales.length} no-sale${t.noSales.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Nothing here.'}</p></div>
          <button className="iconbtn" aria-label="Close" onClick={onClose}>✕</button></header>
        <div className="dlist">
          {items.map(({ key, kind, i, rec }) => {
            const w = rec!.who ?? who(rec!.contactId);
            const c = contactFor(d, { contactId: rec!.contactId, key, kind });
            const real = d.byId.has(rec!.contactId);
            const sale = kind === 'sold' ? rec as SaleRecord : null, ns = kind === 'presented' ? rec as NoSaleRecord : null;
            const phone = c?.phone || c?.backup || w.phone;
            return (
              <div className={`drow ${open === key ? 'on' : ''}`} key={key}>
                <button className="dhead" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
                  <span className="dd">{mdShort.format(rec!.at)}</span>
                  <span className="dn2"><b>{w.first} {w.last}</b><small>{[w.company, w.list].filter(Boolean).join(' · ')}</small></span>
                  {sale ? <span className={`dv ${sale.alpType === 'Trial' ? 'c-trial' : 'c-sold'}`}><b>{fmt$(sale.alp)}</b><small>{sale.alpType}</small></span>
                    : <span className="dv c-pres"><b>No sale</b><small>{ns!.objections.join(', ') || '—'}</small></span>}
                </button>
                {open === key && (
                  <div className="dbody">
                    {sale && <p className="hint">Monthly ${sale.monthly.toFixed(2)}{sale.wholeLife ? ` · whole life ${fmt$(sale.wholeLife)}` : ''}{sale.adb ? ` · ADB ${fmt$(sale.adb)}` : ''}{sale.email ? ` · ${sale.email}` : ''}{sale.note ? ` · ${sale.note}` : ''}</p>}
                    {ns && <p className="hint">{ns.reason || 'No reason written.'}{ns.followUp ? ` · follow up ${ns.followUp.slice(5).replace('-', '/')}` : ''}{ns.followUpNote ? ` (${ns.followUpNote})` : ''}</p>}
                    <div className="dacts">
                      {real && <button className="btn primary" onClick={() => onDial(rec!.contactId)}>Open in dialer</button>}
                      {phone && <Reach id={rec!.contactId} phone={phone} first={w.first} onText={real ? onText : undefined} />}
                      {!real && <span className="hint">From the Production Desk: not on a calling list.</span>}
                    </div>
                    {c && <ChangeResult at={rec!.at} target={{ from: kind, index: i }} c={c} d={d} onResult={onResult} onDone={onClose} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/** One floating box that shows any [data-tip] under the pointer (or the last tapped one on a phone). */
export function useTips() {
  useEffect(() => {
    const box = document.createElement('div');
    box.className = 'tipbox'; box.style.display = 'none'; document.body.appendChild(box);
    const show = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el || !el.dataset.tip) { box.style.display = 'none'; return; }
      box.textContent = el.dataset.tip; box.style.display = 'block';
      const w = box.offsetWidth, h = box.offsetHeight;
      box.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px';
      box.style.top = (e.clientY - h - 14 < 8 ? e.clientY + 18 : e.clientY - h - 14) + 'px';
    };
    const hide = () => { box.style.display = 'none'; };
    document.addEventListener('pointermove', show); document.addEventListener('pointerdown', show); addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('pointermove', show); document.removeEventListener('pointerdown', show); removeEventListener('scroll', hide, true); box.remove(); };
  }, []);
}

// ---------- Overview ----------
function Overview({ d, r, pick }: { d: D; r: R.Range; pick: Pick }) {
  const fu = R.funnel(d.log, d.sales, r);
  const alp = d.sales.filter(s => s.at >= r.from && s.at < r.to).reduce((a, s) => a + s.alp, 0);
  const tips = useMemo(() => R.insights(d.log, d.sales, d.now, TZ, d.goal), [d.log, d.sales, d.now, d.goal]);
  const days = R.daily(d.log, d.sales, r.label === 'All time' ? { ...r, from: Math.max(r.from, addDays(d.now, -59, TZ)) } : r, TZ);
  const big = days.reduce((m, x) => (x.dials > m.dials ? x : m), days[0]);
  const weeks = R.presentedByWeek(d.log, d.sales, r, TZ).map(w => ({ ...w, f: R.funnel(d.log, d.sales, { from: w.from, to: w.to, label: '' }) }));
  const l7 = R.lastSeven(d.log, d.sales, d.now, TZ);
  const out = R.dialOutcomes(d.log, r);
  const answered = fu.presented + fu.noShows;
  const steps: [string, number, string][] = [['Dials', fu.dials, 'dials'], ['Connects', fu.connects, 'connects'], ['Scheduled', fu.scheduled, 'sched'], ['Presented', fu.presented, 'pres'], ['Sold', fu.sold, 'sold']];
  const drops = steps.slice(1).map((s, i) => ({ name: `${steps[i][0]} → ${s[0]}`, kept: R.pct(s[1], steps[i][1]) }));
  const worst = drops.slice(1).reduce((m, x) => (x.kept < m.kept ? x : m), drops[1]);
  return <>
    <div className="span2 kgrid">
      <Kpi label="Dial → connect" value={pctTxt(fu.connects, fu.dials)} sub={`${fu.connects.toLocaleString()} connects of ${fu.dials.toLocaleString()} dials`} tone="c-connects" />
      <Kpi label="Dial → scheduled" value={fu.dials ? (100 * fu.scheduled / fu.dials).toFixed(1) + '%' : '—'} sub={`${fu.scheduled} appointments set`} tone="c-sched" />
      <Kpi label="Scheduled → presented" value={pctTxt(fu.presented, fu.scheduled)} sub={`${fu.presented} presented`} tone="c-pres" />
      <Kpi label="Closing rate" value={pctTxt(fu.sold, fu.presented)} sub={`${fu.sold} sales from ${fu.presented} presentations`} tone="c-sold" />
      <Kpi label="No-shows" value={fu.noShows} sub="booked, did not show" />
      <Kpi label="No-show rate" value={pctTxt(fu.noShows, answered)} sub="of appointments answered" tone={R.pct(fu.noShows, answered) > .4 ? 'c-noshow' : ''} />
      <Kpi label="Dials per sale" value={fu.sold ? Math.round(fu.dials / fu.sold) : '—'} sub={fu.dials ? `${fmt$(alp / fu.dials)} ALP per dial` : ''} />
      <Kpi label="ALP per sale" value={fu.sold ? fmt$(alp / fu.sold) : '—'} sub={`${fmt$(alp)} total`} tone="c-sold" />
    </div>
    <Panel title="Funnel" meta={`${r.label} · dial to sale`} foot={worst && <>Biggest drop · <b>{worst.name}</b> · only {Math.round(worst.kept * 100)}% make it through</>}>
      <Rows head={['Stage', 'Count', '', 'Kept']} rows={steps.map(([l, n, h], i) => ({ label: l, n: n.toLocaleString(), frac: R.pct(n, fu.dials) ** .35, hue: h as never,
        right: i ? pctTxt(n, steps[i - 1][1]) : '', tip: `${l}: ${n.toLocaleString()}` }))} />
    </Panel>
    <Panel title="What the numbers say" meta="Updates as you dial" className="insights">
      <ol>{tips.map((t, i) => <li key={i}><b>{i + 1}</b><p>{t}</p></li>)}</ol>
      {!tips.length && <p className="hint">Needs a few more days of dialing.</p>}
    </Panel>

    <Panel span={2} title="Daily production" meta={<Legend items={[['dials', 'Dials'], ['connects', 'Connects']]} />}
      foot={big && big.dials > 0 && <>Biggest dial day · <b>{mdShort.format(big.day)}</b> · {big.dials} dials</>}>
      <Columns height={170} labelEvery={Math.ceil(days.length / 8)} onPick={i => pick(wdMd.format(days[i].day), s => dayOf(s.at) === days[i].day, n => dayOf(n.at) === days[i].day, 'Sales and no-sales that day')} cols={days.map(x => ({
        label: String(parts(x.day, TZ).d), tip: `${wdMd.format(x.day)}: ${x.dials} dials, ${x.connects} connects (${pctTxt(x.connects, x.dials)})`,
        on: startOfDay(d.now, TZ) === x.day,
        bars: [{ v: x.dials, hue: 'dials' }, { v: x.connects, hue: 'connects' }] }))} />
    </Panel>
    <Panel title="Conversion trend" meta={<Legend items={[['connects', 'Connect %'], ['sold', 'Close %']]} />}>
      <div className="trend">
        <div className="tr hd"><span>Week</span><span /><span>Rate</span><span>Dials</span></div>
        {weeks.map(w => {
          const c = R.pct(w.f.connects, w.f.dials), k = R.pct(w.sold, w.presented);
          return (
            <div className="tr" key={w.from}>
              <span>{wkLabel(w.from, w.to)}</span>
              <span className="pair"><i className="connects" style={{ width: c * 100 + '%' }} data-tip={`Connect rate ${pctTxt(w.f.connects, w.f.dials)}`} /><i className="sold" style={{ width: k * 100 + '%' }} data-tip={`Close rate ${pctTxt(w.sold, w.presented)} (${w.sold} of ${w.presented})`} /></span>
              <span className="rates"><b className="c-connects">{pctTxt(w.f.connects, w.f.dials)}</b><b className="c-sold">{pctTxt(w.sold, w.presented)}</b></span>
              <span className="n">{w.f.dials}</span>
            </div>
          );
        })}
      </div>
    </Panel>
    <Panel title="Last 7 days vs the 7 before" meta={`${mdShort.format(l7.from)} – ${mdShort.format(l7.to)}`}
      foot={<>Connect rate {pctTxt(l7.now.connects, l7.now.dials)} (was {pctTxt(l7.before.connects, l7.before.dials)}) · Close rate {pctTxt(l7.now.sold, l7.now.presented)} (was {pctTxt(l7.before.sold, l7.before.presented)})</>}>
      <div className="vs">
        <div className="vr hd"><span /><span>Last 7</span><span>Before</span><span>Change</span></div>
        {([['Dials', 'dials'], ['Connects', 'connects'], ['Scheduled', 'scheduled'], ['Presented', 'presented'], ['Sold', 'sold'], ['Sale ALP', 'alp']] as const).map(([l, k]) => (
          <div className="vr" key={k}><span>{l}</span><b>{k === 'alp' ? fmt$(l7.now[k]) : l7.now[k].toLocaleString()}</b><span className="muted">{k === 'alp' ? fmt$(l7.before[k]) : l7.before[k].toLocaleString()}</span><Delta now={l7.now[k]} before={l7.before[k]} /></div>
        ))}
      </div>
    </Panel>

    <Panel span={2} title="Where the dials went" meta={`${out.dials.toLocaleString()} dials · ${r.label}`}
      foot={<>{pctTxt(fu.connects, fu.dials)} of dials reach a person. Of those {fu.connects} people, {out.rows[0].count} booked, {out.rows[2].count} asked for a callback and {out.rows[4].count} hung up.</>}>
      <Split parts={out.rows.map(x => ({ label: x.label, count: x.count, cls: 'o-' + x.key }))} />
      <div className="olist">{out.rows.map(x => <span key={x.key}><i className={`sw o-${x.key}`} />{x.label}<b>{x.count.toLocaleString()}</b><em>{pctTxt(x.count, out.dials)}</em></span>)}</div>
    </Panel>
    <ReachByDialPanel d={d} r={r} span={2} />
  </>;
}

function ReachByDialPanel({ d, r, span = 1 }: { d: D; r: R.Range; span?: number }) {
  const b = reachByDial(d.log.filter(e => e.at >= r.from && e.at < r.to));
  const best = b.filter(x => x.dials >= MIN).reduce<typeof b[0] | null>((m, x) => (!m || rate(x) > rate(m) ? x : m), null);
  return (
    <Panel span={span} title="Reach by dial number" meta="Dials 1 to 10 on their own"
      foot={best && <>Hottest · <b>dial {best.label}</b> · {pctTxt(best.reached, best.dials)} reached. Grey bars have fewer than {MIN} dials.</>}>
      <Columns height={140} max={1} showValues={false} cols={b.map(x => ({ label: x.label, sub: x.dials ? pctTxt(x.reached, x.dials) : '', dim: x.dials < MIN,
        tip: `Dial ${x.label}: ${x.reached} reached of ${x.dials} (${pctTxt(x.reached, x.dials)})`,
        bars: [{ v: rate(x), hue: x.dials < MIN ? 'muted' : 'connects' }] }))} />
    </Panel>
  );
}

// ---------- Sales ----------
function Sales({ d, who, all, pick }: { d: D; who: (id: string) => R.Who; all: R.Range; pick: Pick }) {
  const s = R.salesSummary(d.sales, d.log, d.now, TZ, d.goal);
  const [showAll, setShowAll] = useState(false);
  const [editGoal, setEditGoal] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list0 = R.salesIn(d.sales, all, who);
  const { sorted: list, th } = useSort(list0, { at: x => x.at, name: x => `${x.who.last} ${x.who.first}`, phone: x => x.who.phone, co: x => x.who.company,
    alp: x => x.alp, monthly: x => x.monthly, type: x => x.alpType, wl: x => x.wholeLife || null, adb: x => x.adb || null, email: x => x.email, note: x => x.note });
  const monthSales = R.salesIn(d.sales, s.month, who);
  const top = [...monthSales].sort((a, b) => b.alp - a.alp).slice(0, 8);
  const src = R.salesBySource(d.sales, who);
  const cum = R.cumulative(d.sales, d.now, TZ, d.goal);
  const byWd = R.salesByWeekday(d.sales, TZ), byT = R.salesByTime(d.sales, TZ);
  const bestWd = byWd.reduce((m, x) => (x.count > m.count ? x : m), byWd[0]);
  const bestT = byT.reduce((m, x) => (x.count > m.count ? x : m), byT[0]);
  const bestDay = cum.reduce((m, x) => (x.std + x.trial > m.std + m.trial ? x : m), cum[0]);
  const goalPct = R.pct(s.alp, s.goal);
  const inMonth = (x: { at: number }) => x.at >= s.month.from && x.at < s.month.to;
  const dayAt = (n: number) => addDays(s.month.from, n - 1, TZ);
  const one = (x: R.SaleView) => pick(`${x.who.first} ${x.who.last}`, y => y.at === x.at && y.contactId === x.contactId, null, `${x.alpType} sale · ${mdShort.format(x.at)}`);
  const saveGoal = () => { const g = Number(String(editGoal).replace(/[$,\s]/g, '')); if (g > 0) d.setGoal(Math.round(g)); setEditGoal(null); };
  return <>
    {adding && <OutsideSaleForm now={d.now} onClose={() => setAdding(false)} onSave={d.addOutsideSale} />}
    <Panel span={4} title="Latest sales" meta={<span className="lsmeta">Showing {Math.min(showAll ? list.length : 12, list.length)} of {list.length}
      <button className="btn sm primary" onClick={() => setAdding(true)} title="A sale from a company lead, referral or other source">+ Add a sale</button></span>}
      foot={<><button className="linkish" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show the latest 12' : 'Show all'}</button>
        <button className="linkish" onClick={() => saveText('sales.csv', salesCsv(list))}>Export CSV</button></>}>
      <div className="tscroll">
        <table className="rt">
          <thead><tr>{th('at', 'Date', '', -1)}{th('name', 'Client')}{th('phone', 'Phone')}{th('co', 'Union / company')}{th('alp', 'ALP', 'r')}{th('monthly', 'Monthly', 'r')}{th('type', 'Type')}{th('wl', 'Whole life', 'r')}{th('adb', 'ADB', 'r')}{th('email', 'Email')}{th('note', 'Notes')}</tr></thead>
          <tbody>{(showAll ? list : list.slice(0, 12)).map((x, i) => (
            <tr key={i} className="pick" onClick={() => one(x)}><td className="c-dials">{mdShort.format(x.at)}</td><td><b>{x.who.first} {x.who.last}</b>{x.source && <span className="spill violet mini">{SOURCE_LABEL[x.source]}</span>}</td><td className="muted num">{x.who.phone}</td><td>{x.who.company}</td>
              <td className={`r num ${x.alpType === 'Trial' ? 'c-trial' : 'c-sold'}`}><b>{fmt$(x.alp)}</b></td><td className="r num muted">${x.monthly.toFixed(2)}</td>
              <td className={x.alpType === 'Trial' ? 'c-trial' : 'c-sold'}>{x.alpType}</td><td className="r num">{x.wholeLife ? fmt$(x.wholeLife) : ''}</td><td className="r num">{x.adb ? fmt$(x.adb) : ''}</td>
              <td className="muted">{x.email}</td><td className="muted">{x.note}{x.calledInto ? (x.note ? ' · ' : '') + 'Called into' : ''}</td></tr>
          ))}</tbody>
        </table>
        {!list.length && <p className="hint pad16">No sales yet.</p>}
      </div>
    </Panel>

    <Panel span={2} title={`${s.month.label} ALP`} meta={editGoal == null
      ? <button className="linkish goal" onClick={() => setEditGoal(String(s.goal))}>Monthly goal {fmt$(s.goal)} ✎</button>
      : <span className="goaled"><input autoFocus inputMode="decimal" value={editGoal} onChange={e => setEditGoal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditGoal(null); }} /><button className="btn sm" onClick={saveGoal}>Save</button></span>}>
      <div className="bigrow"><b className="c-sold herob">{fmt$(s.alp)}</b><b className="c-dials">{Math.round(goalPct * 100)}%</b></div>
      <div className="meter"><i className="sold" style={{ width: Math.min(goalPct, 1) * 100 + '%' }} /><span className="pacemark" style={{ left: `${100 * s.dayNo / s.daysIn}%` }} title="Even pace for today" /></div>
      <div className="mrow"><span>{s.count > 0 && <><button className="linkish" onClick={() => pick(`${s.month.label} sales`, inMonth)}>See all {s.count} sales</button> · </>}{s.toGo > 0 ? <>{fmt$(s.toGo)} to go · {fmt$(s.perDayNeeded)}/day needed</> : 'Goal reached'}</span><span>On pace for {fmt$(s.pace)}</span></div>
    </Panel>
    <Panel title="Trial ALP"><b className="herob c-trial">{fmt$(s.trial.alp)}</b><div className="meter"><i className="trial" style={{ width: R.pct(s.trial.alp, s.alp) * 100 + '%' }} /></div><div className="mrow"><span>{s.trial.count} sales · {pctTxt(s.trial.alp, s.alp)} of ALP</span>{s.trial.count > 0 && <button className="linkish" onClick={() => pick(`Trial sales · ${s.month.label}`, x => inMonth(x) && x.alpType === 'Trial')}>See them</button>}</div></Panel>
    <Panel title="Standard ALP"><b className="herob c-sold">{fmt$(s.standard.alp)}</b><div className="meter"><i className="sold" style={{ width: R.pct(s.standard.alp, s.alp) * 100 + '%' }} /></div><div className="mrow"><span>{s.standard.count} sales · {pctTxt(s.standard.alp, s.alp)} of ALP</span>{s.standard.count > 0 && <button className="linkish" onClick={() => pick(`Standard sales · ${s.month.label}`, x => inMonth(x) && x.alpType === 'Standard')}>See them</button>}</div></Panel>

    <div className="span2 kgrid k4">
      <Kpi label="Sales this month" value={s.count} sub={`${s.today.count} today · ${s.allTime} all time`} />
      <Kpi label="Avg ALP per sale" value={s.count ? fmt$(s.avg) : '—'} sub={`Biggest ${fmt$(s.biggest)}`} />
      <Kpi label="Close rate" value={pctTxt(s.count, s.presented)} sub={`${s.count} sold of ${s.presented} presented`} tone="c-dials" />
      <Kpi label="Monthly premium" value={fmt$(s.monthly)} sub={`${fmt$(s.today.alp)} ALP written today`} tone="c-sold" />
    </div>
    <Panel title="Biggest sales this month" meta={s.month.label} foot={s.count > 0 && <>Average sale · <b>{fmt$(s.avg)}</b> · Top sale is {pctTxt(s.biggest, s.alp)} of the month</>}>
      <div className="rank">{top.map((x, i) => (
        <div className="rk pick" key={i} role="button" tabIndex={0} onClick={() => one(x)} onKeyDown={e => { if (e.key === 'Enter') one(x); }} data-tip={`${x.who.first} ${x.who.last}: ${x.alpType} ${fmt$(x.alp)}`}><span className="muted">{i + 1}</span><span>{x.who.first} {x.who.last}</span>
          <span className="track"><i className={x.alpType === 'Trial' ? 'trial' : 'sold'} style={{ width: R.pct(x.alp, top[0].alp) * 100 + '%' }} /></span><b className="num">{fmt$(x.alp)}</b></div>
      ))}</div>
    </Panel>
    <Panel title="Where the sales come from" meta="ALP by list · all time" foot={src[0] && <>Top source · <b>{src[0].label}</b> · {pctTxt(src[0].alp, src.reduce((a, x) => a + x.alp, 0))} of all ALP</>}>
      <Rows head={['List', 'Sales', '', 'ALP']} hue="dials" onPick={i => pick(`Sales from ${src[i].label}`, x => (who(x.contactId).list || '(none)') === src[i].label, null, 'All time')} rows={src.map(x => ({ label: x.label, n: x.count, frac: R.pct(x.alp, src[0].alp), right: fmt$(x.alp) }))} />
    </Panel>

    <Panel span={2} title="Cumulative ALP" meta={<span className="goalkey">- - - Goal {fmt$(s.goal)}</span>}
      foot={<span className={s.aheadOfPace >= 0 ? 'up' : 'down'}>{s.aheadOfPace >= 0 ? '▲' : '▼'} {fmt$(Math.abs(s.aheadOfPace))} {s.aheadOfPace >= 0 ? 'ahead of' : 'behind'} goal pace</span>}>
      <div className="goalwrap">
        <Columns height={170} labelEvery={7} max={Math.max(s.goal, s.alp)} onPick={i => pick(`${s.month.label.slice(0, 3)} ${cum[i].day}`, x => dayOf(x.at) === dayAt(cum[i].day), null, `${fmt$(cum[i].total ?? 0)} written by the end of the day`)} cols={cum.map(x => ({ label: String(x.day), on: x.day === s.dayNo,
          tip: x.total == null ? `${x.day}: still to come · goal pace ${fmt$(x.goalPace)}` : `${s.month.label} ${x.day}: ${fmt$(x.total)} so far · goal pace ${fmt$(x.goalPace)}`,
          bars: [{ v: x.total ?? 0, hue: 'dials' }] }))} />
        <svg className="paceline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="100" x2="100" y2={100 - 100 * s.goal / Math.max(s.goal, s.alp)} /></svg>
      </div>
    </Panel>
    <Panel span={2} title="ALP by day" meta={<Legend items={[['sold', 'Standard'], ['trial', 'Trial']]} />}
      foot={bestDay && bestDay.std + bestDay.trial > 0 && <>Best day · <b>{s.month.label.slice(0, 3)} {bestDay.day}</b> · {fmt$(bestDay.std + bestDay.trial)}</>}>
      <Columns height={170} labelEvery={7} stacked onPick={i => pick(`${s.month.label.slice(0, 3)} ${cum[i].day}`, x => dayOf(x.at) === dayAt(cum[i].day), null, 'Sales that day')} cols={cum.map(x => ({ label: String(x.day), on: x.day === s.dayNo,
        tip: `${s.month.label} ${x.day}: ${fmt$(x.std + x.trial)}` + (x.trial ? ` (trial ${fmt$(x.trial)})` : ''),
        bars: [{ v: x.std, hue: 'sold' }, { v: x.trial, hue: 'trial' }] }))} />
    </Panel>
    <Panel span={2} title="Sales by weekday" meta="All time" foot={bestWd.count > 0 && <>Best day · <b>{bestWd.label}</b> · {bestWd.count} sales</>}>
      <Columns height={150} showValues onPick={i => pick(`Sales on ${R.WEEKDAYS[i]}`, x => wdOf(x.at) === i, null, 'All time')} cols={byWd.map(x => ({ label: x.label, sub: x.alp ? fmtK(x.alp) : '', tip: `${x.label}: ${x.count} sales, ${fmt$(x.alp)}`,
        bars: [{ v: x.count, hue: x.count === bestWd.count && x.count > 0 ? 'pres' : 'sched' }] }))} />
    </Panel>
    <Panel span={2} title="Sales by time of day" meta="Eastern · all time" foot={bestT.count > 0 && <>Most sales close · <b>{bestT.label}</b> · {bestT.count} sales</>}>
      <Columns height={150} showValues onPick={i => pick(`Sales at ${R.TIME_BLOCKS[i][2]}`, x => { const h = parts(x.at, TZ).h; return h >= R.TIME_BLOCKS[i][0] && h < R.TIME_BLOCKS[i][1]; }, null, 'Eastern · all time')} cols={byT.map(x => ({ label: x.label, sub: x.alp ? fmtK(x.alp) : '', tip: `${x.label}: ${x.count} sales, ${fmt$(x.alp)}`,
        bars: [{ v: x.count, hue: x.count === bestT.count && x.count > 0 ? 'pres' : 'trial' }] }))} />
    </Panel>
  </>;
}

function salesCsv(list: R.SaleView[]) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Date', 'First', 'Last', 'Phone', 'Union / Company', 'List', 'ALP', 'Monthly Premium', 'ALP Type', 'Whole Life', 'ADB', 'Email', 'Notes', 'Called into'];
  return [head, ...list.map(x => [new Date(x.at).toISOString(), x.who.first, x.who.last, x.who.phone, x.who.company, x.who.list, x.alp, x.monthly, x.alpType, x.wholeLife, x.adb, x.email, x.note, x.calledInto ? 'Yes' : ''])]
    .map(r => r.map(q).join(',')).join('\n');
}

// ---------- Presentations ----------
function Presentations({ d, r, who, pick }: { d: D; r: R.Range; who: (id: string) => R.Who; pick: Pick }) {
  const fu = R.funnel(d.log, d.sales, r);
  const weeks = R.presentedByWeek(d.log, d.sales, r, TZ);
  const ob = R.objections(d.noSales, r);
  const top = ob.rows.reduce((m, x) => (x.count > m.count ? x : m), ob.rows[0]);
  const recent = d.noSales.filter(n => n.at >= r.from && n.at < r.to).sort((a, b) => b.at - a.at).slice(0, 12);
  const fups0 = R.followUps(d.noSales, d.now, TZ);
  const { sorted: recentS, th: rth } = useSort(recent, { at: n => n.at, name: n => `${who(n.contactId).last} ${who(n.contactId).first}`, obj: n => n.objections.join(', ') });
  const { sorted: fups, th: fth } = useSort(fups0, { due: n => n.due, name: n => `${who(n.contactId).last} ${who(n.contactId).first}`, phone: n => who(n.contactId).phone,
    obj: n => n.objections.join(', '), note: n => n.followUpNote || n.reason });
  const wkStart = addDays(startOfDay(d.now, TZ), -((parts(d.now, TZ).wd + 6) % 7), TZ);
  const week = Array.from({ length: 7 }, (_, i) => {
    const a = addDays(wkStart, i, TZ), b = addDays(a, 1, TZ);
    const sold = d.sales.filter(s => s.at >= a && s.at < b).length;
    const pres = d.log.filter(e => e.at >= a && e.at < b && e.kind === 'Tag' && /^(PRESENTED|SOLD)/.test(e.tag)).length;
    return { a, sold, no: Math.max(pres - sold, 0), future: a > d.now };
  });
  const wk = week.reduce((m, x) => ({ sold: m.sold + x.sold, no: m.no + x.no }), { sold: 0, no: 0 });
  const wkAlp = d.sales.filter(s => s.at >= wkStart).reduce((a, s) => a + s.alp, 0);
  const steps: [string, number, string][] = [['Dials', fu.dials, 'dials'], ['Connects', fu.connects, 'connects'], ['Scheduled', fu.scheduled, 'sched'], ['Presented', fu.presented, 'pres'], ['Sold', fu.sold, 'sold']];
  const alp = d.sales.filter(s => s.at >= r.from && s.at < r.to).reduce((a, s) => a + s.alp, 0);
  const inR = (x: { at: number }) => x.at >= r.from && x.at < r.to;
  const [objSel, setObjSel] = useState<number | null>(null);
  const oneNs = (n: NoSaleRecord) => { const w = who(n.contactId); pick(`${w.first} ${w.last}`, null, y => y === n, `No sale · ${mdShort.format(n.at)}`); };
  return <>
    <Panel span={2} title="Production funnel" meta={`${r.label} · conversion from the step before`}
      foot={<>1 sale per {fu.sold ? Math.round(fu.dials / fu.sold) : '—'} dials · {fu.presented ? fmt$(alp / fu.presented) : '—'} ALP per presentation · {fu.dials ? fmt$(alp / fu.dials) : '—'} per dial</>}>
      <div className="pfun">{steps.map(([l, n, h], i) => (
        <div className="pf" key={l}><span className={i === 4 ? 'c-sold' : ''}>{l}</span><b>{n.toLocaleString()}</b>
          <span className="track"><i className={h} style={{ width: (i ? R.pct(n, steps[i - 1][1]) : 1) * 100 + '%' }} /></span><em className={`c-${h}`}>{i ? pctTxt(n, steps[i - 1][1]) : ''}</em></div>
      ))}</div>
    </Panel>
    <Panel span={2} title="Presented vs sold" meta={<Legend items={[['sched', 'Presented'], ['sold', 'Sold']]} />}>
      <div className="trend pv">
        <div className="tr hd"><span>Week</span><span /><span>Count</span><span>Close</span></div>
        {weeks.map(w => {
          const mx = Math.max(1, ...weeks.map(x => x.presented));
          return (
            <div className="tr pick" key={w.from} role="button" tabIndex={0} onClick={() => pick(`Week of ${wkLabel(w.from, w.to)}`, x => x.at >= w.from && x.at < w.to, x => x.at >= w.from && x.at < w.to, 'Presentations that week')}><span>{wkLabel(w.from, w.to)}</span>
              <span className="pair"><i className="sched" style={{ width: 100 * w.presented / mx + '%' }} data-tip={`${w.presented} presented`} /><i className="sold" style={{ width: 100 * w.sold / mx + '%' }} data-tip={`${w.sold} sold`} /></span>
              <span className="rates"><b className="c-sched">{w.presented}</b><b className="c-sold">{w.sold}</b></span><span className="n big">{pctTxt(w.sold, w.presented)}</span></div>
          );
        })}
      </div>
    </Panel>
    <Panel span={2} title="What is costing you the sale" meta={`${ob.logged} no-sales logged`} foot={top && top.count > 0 && <>Top objection · <b>{top.label}</b></>}>
      <Donut total={ob.logged} sel={objSel} onPick={i => { setObjSel(i); pick(ob.rows[i].label, null, n => inR(n) && n.objections.includes(ob.rows[i].label), `Objection · ${r.label}`); }} rows={ob.rows.map((x, i) => ({ ...x, slot: i + 1 }))} center={<><b>{ob.logged}</b><span>no-sales</span></>} />
    </Panel>
    <Panel span={2} title="Presentations this week" meta={`${mdShort.format(wkStart)} – ${mdShort.format(addDays(wkStart, 6, TZ))}`}
      foot={<>{wk.sold + wk.no} presented · {wk.sold} sold · {pctTxt(wk.sold, wk.sold + wk.no)} close · {fmt$(wkAlp)} ALP</>}>
      <Columns height={150} stacked showValues max={Math.max(3, ...week.map(x => x.sold + x.no))} onPick={i => pick(wdMd.format(week[i].a), x => dayOf(x.at) === week[i].a, x => dayOf(x.at) === week[i].a, 'Presentations that day')} cols={week.map(x => ({ label: f({ weekday: 'short' }).format(x.a), on: startOfDay(d.now, TZ) === x.a,
        sub: x.future ? '–' : `${x.sold} of ${x.sold + x.no}`, tip: `${wdMd.format(x.a)}: ${x.sold} sold, ${x.no} no sale`,
        bars: [{ v: x.sold, hue: 'sold' }, { v: x.no, hue: 'noshow' }] }))} />
      <Legend items={[['sold', 'Sale'], ['noshow', 'No sale']]} />
    </Panel>
    <Panel span={2} title="Recent no-sales" meta={`${recent.length} shown`} foot="Every no-sale, with its follow-up date and notes, is on the contact's history too.">
      <div className="tscroll"><table className="rt">
        <thead><tr>{rth('at', 'Date', '', -1)}{rth('name', 'Client')}{rth('obj', 'What stopped it')}</tr></thead>
        <tbody>{recentS.map((n, i) => { const w = who(n.contactId); return (
          <tr key={i} className="pick" onClick={() => oneNs(n)}><td className="c-dials">{mdShort.format(n.at)}</td><td><b>{w.first} {w.last}</b></td><td><span className="c-pres">{n.objections.join(', ')}</span>{n.reason && <span className="muted"> · {n.reason}</span>}</td></tr>); })}</tbody>
      </table>{!recent.length && <p className="hint pad16">No no-sales in this range.</p>}</div>
    </Panel>
    <Panel span={2} title="Follow-ups due" meta="From no-sale forms · soonest first">
      <div className="tscroll"><table className="rt">
        <thead><tr>{fth('due', 'Date')}{fth('name', 'Client')}{fth('phone', 'Phone')}{fth('obj', 'Objections')}{fth('note', 'Notes')}</tr></thead>
        <tbody>{fups.map((n, i) => { const w = who(n.contactId); const late = n.due < startOfDay(d.now, TZ); return (
          <tr key={i} className="pick" onClick={() => oneNs(d.noSales.find(y => y.at === n.at && y.contactId === n.contactId)!)}><td className={late ? 'c-noshow' : 'c-dials'}>{wdMd.format(n.due)}{late ? ' · late' : ''}</td><td><b>{w.first} {w.last}</b></td><td className="muted num">{w.phone}</td>
            <td className="c-pres">{n.objections.join(', ')}</td><td className="muted">{n.followUpNote || n.reason}</td></tr>); })}</tbody>
      </table>{!fups.length && <p className="hint pad16">No follow-ups due.</p>}</div>
    </Panel>
  </>;
}

// ---------- When & where to dial ----------
function Dialing({ d, r }: { d: D; r: R.Range }) {
  const fu = R.funnel(d.log, d.sales, r);
  const hrs = R.reachByHour(d.log, r, TZ), wds = R.reachByWeekday(d.log, r, TZ), lists = R.reachByList(d.log, r).filter(x => x.dials > 0);
  const dn = R.reachByDialNo(d.log, r), [fr, rt] = R.freshVsRetry(d.log, r), grid = R.heatmap(d.log, r, TZ);
  const bad = R.dialOutcomes(d.log, r).rows.find(x => x.key === 'bad')!.count;
  const best = <T extends R.Bucket>(a: T[]) => a.filter(x => x.dials >= MIN).reduce<T | null>((m, x) => (!m || rate(x) > rate(m) ? x : m), null);
  const bh = best(hrs), bw = best(wds), bd = best(dn);
  const cells = grid.flat(), bc = cells.filter(c => c.dials >= 10).reduce<R.Bucket | null>((m, x) => (!m || rate(x) > rate(m) ? x : m), null);
  const maxRate = Math.max(.01, ...cells.filter(c => c.dials >= 10).map(rate));
  const maxHr = Math.max(...hrs.map(rate), .01), maxWd = Math.max(...wds.map(rate), .01), maxL = Math.max(...lists.map(rate), .01), maxDn = Math.max(...dn.map(rate), .01);
  return <>
    <Panel title="Reach rate" meta={`${r.label} · reached ÷ dials`}>
      <b className="herob c-connects">{pctTxt(fu.connects, fu.dials)}</b>
      <p className="muted">{fu.connects.toLocaleString()} reached of {fu.dials.toLocaleString()} dials</p>
      <div className="kv"><span>Bad numbers</span><b>{bad}</b><span>First dials</span><b>{fr.dials.toLocaleString()}</b><span>Retry dials</span><b>{rt.dials.toLocaleString()}</b></div>
    </Panel>
    <Panel title="Fresh vs retry" meta="Reach rate">
      {[fr, rt].map((x, i) => <div className="fvr" key={x.key}><div><span>{x.label}</span><b className="c-connects">{pctTxt(x.reached, x.dials)}</b></div>
        <div className="track"><i className={i ? 'connects' : 'dials'} style={{ width: rate(x) / Math.max(rate(fr), rate(rt), .01) * 100 + '%' }} data-tip={`${x.reached} of ${x.dials}`} /></div></div>)}
      <p className="muted small">{rate(rt) > rate(fr) * 1.2 ? `Retries are reaching noticeably more people (${pctTxt(rt.reached, rt.dials)} vs ${pctTxt(fr.reached, fr.dials)}). Work retries before fresh.` : 'Fresh and retry reach about the same share.'}</p>
    </Panel>
    <Panel title="By dial number" meta="Reach rate" foot={bd && <>Hottest · <b>{bd.label}</b></>}>
      <Rows rows={dn.map(x => ({ label: x.label, frac: rate(x) / maxDn, right: pctTxt(x.reached, x.dials), dim: x.dials < MIN, hue: 'connects', tip: `${x.reached} of ${x.dials}` }))} />
    </Panel>
    <Panel title="By weekday" meta="Reach rate" foot={bw && <>Hottest · <b>{bw.label}</b></>}>
      <Rows rows={wds.map(x => ({ label: x.label, frac: rate(x) / maxWd, right: x.dials ? pctTxt(x.reached, x.dials) : '', dim: x.dials < MIN, hue: 'connects', tip: `${x.reached} of ${x.dials} dials` }))} />
    </Panel>

    <Panel span={2} title="By hour of day" meta="Eastern" foot={bh && <>Best hour with {MIN}+ dials · <b>{bh.label}</b> · {pctTxt(bh.reached, bh.dials)} reached</>}>
      <Rows head={['Hour', 'Dials', 'Reach rate', 'Rate']} rows={hrs.map(x => ({ label: x.label, n: x.dials, frac: rate(x) / maxHr, right: x.dials ? pctTxt(x.reached, x.dials) : '',
        dim: x.dials < MIN, hue: bh && x.key === bh.key ? 'sold' : 'dials', tip: `${x.label}: ${x.reached} reached of ${x.dials}` }))} />
    </Panel>
    <Panel span={2} title="By list" meta={r.label} foot={`Trust a row once it has about ${MIN} dials. Grey bars have fewer.`}>
      <Rows head={['List', 'Dials', 'Reach rate', 'Rate']} rows={lists.map(x => ({ label: x.label, n: x.dials, frac: rate(x) / maxL, right: x.dials ? pctTxt(x.reached, x.dials) : '',
        dim: x.dials < MIN, hue: 'dials', tip: `${x.label}: ${x.reached} reached of ${x.dials}` }))} />
    </Panel>

    <Panel span={4} title="When to dial" meta="Reach rate · Eastern" foot={<>{bc && <>Best slot · <b>{bc.label}</b> · {pctTxt(bc.reached, bc.dials)} of {bc.dials} dials reached. </>}Each tile is the share of dials that reached someone. Dots are slots with fewer than 10 dials.</>}>
      <div className="heat">
        <span />{R.WEEKDAYS.map(w => <span className="hh" key={w}>{w}</span>)}
        {grid.map((row, i) => [
          <span className="hl" key={'h' + i}>{R.hourLabel(7 + i)}</span>,
          ...row.map(c => {
            const v = c.dials >= 10 ? rate(c) / maxRate : 0;
            return <span key={c.key} className={`cell ${c.dials === 0 ? 'none' : c.dials < 10 ? 'few' : v > .55 ? 'hot' : ''}`} style={c.dials >= 10 ? { ['--a' as string]: (0.12 + 0.88 * v).toFixed(2) } : undefined}
              data-tip={c.dials ? `${c.label}: ${c.reached} of ${c.dials} reached (${pctTxt(c.reached, c.dials)})` : `${c.label}: no dials`}>
              {c.dials >= 10 ? pctTxt(c.reached, c.dials) : c.dials ? '·' : ''}</span>;
          }),
        ])}
      </div>
    </Panel>
    <ReachByDialPanel d={d} r={r} span={4} />
  </>;
}

// ---------- Daily history ----------
function History({ d }: { d: D }) {
  const [n, setN] = useState(14);
  const r: R.Range = { from: addDays(startOfDay(d.now, TZ), -(n - 1), TZ), to: addDays(startOfDay(d.now, TZ), 1, TZ), label: '' };
  const rows0 = R.daily(d.log, d.sales, r, TZ).reverse();
  const cols: [string, (x: R.DayRow) => string | number, string?][] = [
    ['Dials', x => x.dials], ['Connects', x => x.connects], ['Connect %', x => (x.dials ? pctTxt(x.connects, x.dials) : '–'), 'c-connects'],
    ['Scheduled', x => x.scheduled], ['Presented', x => x.presented], ['Sold', x => x.sold], ['Close %', x => (x.presented ? pctTxt(x.sold, x.presented) : '–'), 'c-sold'],
    ['Sale ALP', x => (x.alp ? fmt$(x.alp) : '–'), 'c-sold'], ['Monthly', x => (x.monthly ? fmt$(x.monthly) : '–')], ['Callbacks', x => x.callbacks], ['No-shows', x => x.noShows],
    ['Hung up', x => x.hungUp], ['Bad #', x => x.bad], ['DNC', x => x.dnc], ['Imported', x => x.imported],
  ];
  // sort by the real number behind each column (percent and dollar columns show text)
  const raw: Record<string, (x: R.DayRow) => number | null> = { 'Connect %': x => x.dials ? x.connects / x.dials : null, 'Close %': x => x.presented ? x.sold / x.presented : null,
    'Sale ALP': x => x.alp, Monthly: x => x.monthly };
  const { sorted: rows, th } = useSort(rows0, Object.fromEntries([['day', (x: R.DayRow) => x.day], ...cols.map(c => [c[0], raw[c[0]] ?? ((x: R.DayRow) => c[1](x))])]));
  const csv = () => saveText('daily-history.csv', [['Day', ...cols.map(c => c[0])], ...rows.map(x => [wdMd.format(x.day), ...cols.map(c => c[1](x))])]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  return (
    <Panel span={4} title="Daily history" meta={<span className="seg mini">{[7, 14, 30].map(k => <button key={k} className={n === k ? 'on' : ''} onClick={() => setN(k)}>Last {k} days</button>)}</span>}
      foot={<button className="linkish" onClick={csv}>Export CSV</button>}>
      <div className="tscroll"><table className="rt dayhist">
        <thead><tr>{th('day', 'Day', '', -1)}{cols.map(c => th(c[0], c[0], 'r'))}</tr></thead>
        <tbody>{rows.map(x => (
          <tr key={x.day} className={x.dials || x.sold || x.presented || x.imported ? '' : 'quiet'}><td>{wdMd.format(x.day)}</td>{cols.map(c => { const v = c[1](x); return <td key={c[0]} className={`r num ${v && v !== '–' ? c[2] ?? '' : 'muted'}`}>{v === 0 ? '–' : v}</td>; })}</tr>
        ))}</tbody>
      </table></div>
    </Panel>
  );
}

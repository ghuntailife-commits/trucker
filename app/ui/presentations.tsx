'use client';
// Coaching > Presentations (George, 2026-11-27): Google Meet presentations Claude has read, with the outcome, objections
// and answers, the close, and why it didn't close. Agents see their own; George sees everyone.
import { useEffect, useMemo, useState } from 'react';
import type { Contact } from '../../src/rules/types';
import type { AgentSetting } from '../../src/team/agents';
import { presSums, type PresRow } from '../../src/meet/present';
import { demoPresentations } from '../../src/meet/presDemo';
import { matchContact } from '../../src/quo/quo';
import { LIVE } from '../../src/live/supabase';
import { loadPresentations } from '../../src/live/coachClient';
import type { GoogleCal } from '../../src/live/useGoogleCalendar';
import { connectGoogleCalendar } from '../../src/live/supabase';
import { Panel, Kpi, Rows, pctTxt } from './charts';
import { TZ } from './shared';

const md = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const DAY = 86_400_000;
const tone = (o: string) => (o === 'Sold' ? 'green' : o === 'Follow-up set' ? 'amber' : o === 'No sale' ? 'red' : 'grey');

export function PresentationsView({ me, who, admin, agents, contacts, now, days, cal }: {
  me: AgentSetting; who: string; admin: boolean; agents: AgentSetting[]; contacts: Contact[]; now: number; days: 7 | 30; cal?: GoogleCal;
}) {
  const [rows, setRows] = useState<(PresRow & { agentId: string })[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const since = now - days * DAY;
  useEffect(() => {
    let alive = true; setErr('');
    if (!LIVE) { setRows(demoPresentations(me.id, now).filter(r => r.at >= since)); return; }
    setRows(null);
    loadPresentations(who === 'all' ? null : who, since).then(r => { if (alive) setRows(r); }).catch(e => { if (alive) { setErr(e.message); setRows([]); } });
    return () => { alive = false; };
  }, [who, days, cal?.meet.saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => presSums(rows ?? []), [rows]);
  const name = (id: string) => agents.find(a => a.id === id)?.name ?? id;
  const contactOf = (r: PresRow & { agentId: string }) => (r.agentId === me.id ? matchContact(contacts, r.phone) : undefined);
  if (rows === null) return <div className="empty">Loading presentations…</div>;
  const maxOb = Math.max(1, ...s.objections.map(o => o.n));

  return (
    <div className="rgrid">
      {err && <p className="warnline span4">{err}</p>}
      {cal?.meet.status === 'reconnect' && <p className="warnline span4">Google hasn&rsquo;t given Dispatch permission to read your Meet transcripts yet.{' '}
        <button className="btn sm primary" onClick={() => void connectGoogleCalendar()}>Allow Meet transcripts</button></p>}
      <div className="span4 kgrid k4">
        <Kpi label="Presentations read" value={s.total} sub={`From Google Meet · last ${days} days`} />
        <Kpi label="Sold" value={pctTxt(s.sold, s.total)} sub={`${s.sold} of ${s.total}`} tone="c-sold" />
        <Kpi label="Follow-up set" value={s.followUp} sub={`${s.noSale} said no`} tone="c-pres" />
        <Kpi label="Asked for the sale" value={pctTxt(s.asked, s.total)} sub={`${s.asked} of ${s.total} presentations`} />
      </div>
      <Panel span={2} title="Objections in presentations">
        {s.objections.length ? <Rows hue="pres" head={['Objection', 'Times', '', '']} rows={s.objections.map(o => ({ label: o.label, n: o.n, frac: o.n / maxOb, right: '' }))} />
          : <p className="hint pad16">None yet.</p>}
      </Panel>
      <Panel span={2} title="Why they didn't close" meta="Claude's read, most important first">
        {rows.some(r => r.tags?.whyNot.length) ? <ul className="tiplist">{rows.filter(r => r.tags?.whyNot.length).slice(0, 6).map(r => { const x = contactOf(r);
          return <li key={r.id}><span className="muted">{md.format(r.at)} · {x ? `${x.first} ${x.last}` : r.title}</span>{r.tags!.whyNot.map((w, i) => <span key={i}>{w}</span>)}</li>; })}</ul>
          : <p className="hint pad16">Nothing yet.</p>}
      </Panel>
      <Panel span={4} title="Presentation by presentation" meta="Newest first · click one for the full read">
        {!rows.length && <p className="hint pad16">No presentations read yet. When a Google Meet presentation is recorded with a transcript, the transcript lands on the calendar event and Dispatch reads it within about 15 minutes. It needs Google Calendar connected on the Appointments page, and the event must be the contact&rsquo;s appointment or have their name or phone in the title.</p>}
        <div className="przlist">{rows.map(r => { const t = r.tags!, x = contactOf(r), on = open === r.id; return (
          <article key={r.id} className={`prz ${on ? "on" : ""}`}>
            <button className="przhead" onClick={() => setOpen(on ? null : r.id)}>
              <span className="muted">{md.format(r.at)}</span>{who === 'all' && <span>{name(r.agentId)}</span>}
              <b>{x ? `${x.first} ${x.last}` : r.title}</b>
              <span className={`spill mini ${tone(t.presOutcome)}`}>{t.presOutcome}</span>
              <span className="muted przsum">{r.note}</span>
            </button>
            {on && <div className="przbody">
              <p>{r.note}</p>
              {t.whyNot.length > 0 && <><div className="eyebrow">Why it didn&rsquo;t close</div><ul>{t.whyNot.map((w, i) => <li key={i}>{w}</li>)}</ul></>}
              <div className="eyebrow">The close</div>
              <p><b className={t.closeAsked ? 'c-sold' : 'c-pres'}>{t.closeAsked ? 'Asked for the sale.' : 'Did not clearly ask for the sale.'}</b> {t.closeHow}</p>
              {t.exchanges.length > 0 && <><div className="eyebrow">Objections and answers</div>
                <table className="rt"><thead><tr><th>Objection</th><th>They said</th><th>You said</th><th>Result</th></tr></thead>
                  <tbody>{t.exchanges.map((e, i) => <tr key={i}><td className="c-pres">{e.objection}</td><td>&ldquo;{e.contactSaid}&rdquo;</td><td>&ldquo;{e.agentSaid}&rdquo;</td>
                    <td><span className={`spill mini ${e.result === 'saved' ? 'green' : e.result === 'lost' ? 'red' : 'grey'}`}>{e.result}</span></td></tr>)}</tbody></table></>}
              {t.products.length > 0 && <p className="muted">Coverage talked about: {t.products.join(', ')}</p>}
              {t.wentWell && <p><b className="c-sold">Went well:</b> {t.wentWell}</p>}
              {t.tryNext && <p><b className="c-pres">Try next:</b> {t.tryNext}</p>}
              {r.doc && <p><a href={r.doc} target="_blank" rel="noreferrer">Open the transcript</a></p>}
            </div>}
          </article>); })}</div>
        {LIVE && cal && cal.status === 'connected' && <p className="hint pad16">Checks your own calendar every 15 minutes. <button className="linkish" onClick={() => void cal.meetSync()}>Check now</button></p>}
      </Panel>
    </div>
  );
}

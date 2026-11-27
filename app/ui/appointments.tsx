// Appointments page: the week on one screen (appointments, callbacks, follow-ups and results), what needs a result,
// and the details and actions for the one picked. Replaces the APPOINTMENTS calendar check and the sync menu.
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { tagKind } from '../../src/rules/tags';
import { addDays, parts, startOfDay, DAY_MS } from '../../src/rules/time';
import { notesNewestFirst } from '../../src/rules/notes';
import { LIVE, connectGoogleCalendar } from '../../src/live/supabase';
import type { GoogleCal } from '../../src/live/useGoogleCalendar';
import { calendarItems, weekStart, eventFor, toIcs, type CalItem } from '../../src/calendar/events';
import { TZ, ZONE_NAME, saveText, timeOnly, localTime, NoteText, Reach } from './shared';
import { WeekGrid } from './weekGrid';
import { NewEvent } from './newEvent';
import { useMyEvents } from '../../src/app-store/useMyEvents';
import type { MyEvent } from '../../src/calendar/myEvents';
import { BLOCK_MS, isOpen } from '../../src/calendar/grid';
import { addNote } from '../../src/rules/engine';
import type { ResultKind, ResultInitial } from './forms';
import type { AmendTarget } from '../../src/rules/amend';

type D = ReturnType<typeof useDialer>;
export type OnResult = (kind: ResultKind, id: string, extra?: { amend?: AmendTarget; initial?: ResultInitial }) => void;

/** The saved result behind a card, if it is one: sold, presented (or its follow-up), or a no-show. */
function resultTarget(it: Pick<CalItem, 'key' | 'kind'>): AmendTarget | null {
  const i = Number(it.key.slice(1));
  if (it.kind === 'sold') return { from: 'sold', index: i };
  if (it.kind === 'presented' || it.kind === 'followup') return { from: 'presented', index: i };
  if (it.kind === 'noshow') return { from: 'noshow', index: i };
  return null;
}
/** The contact for a card; for a sale or no-sale whose contact is gone (Production Desk), a stand-in from the record. */
export function contactFor(d: D, it: Pick<CalItem, 'contactId' | 'key' | 'kind'>): Contact | undefined {
  const c = d.byId.get(it.contactId); if (c) return c;
  const t = resultTarget(it);
  const w = t?.from === 'sold' ? d.sales[t.index]?.who : t?.from === 'presented' ? d.noSales[t.index]?.who : undefined;
  return w ? ({ id: it.contactId, first: w.first, last: w.last, phone: w.phone, backup: '', company: w.company, job: '', list: w.list,
    city: '', state: '', tag: '', notes: '', zone: '' } as unknown as Contact) : undefined;
}
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o });
const dayHead = fmt({ weekday: 'short' }), dayNum = fmt({ month: 'short', day: 'numeric' }), longDay = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const whenFull = fmt({ weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const TONE: Record<CalItem['kind'], string> = { appt: 'blue', callback: 'amber', followup: 'grey', sold: 'green', presented: 'violet', noshow: 'red' };
const pillTone = (it: CalItem) => it.kind === 'appt' ? (it.label === 'Confirmed' ? 'teal' : it.label === 'Booked' ? 'blue' : 'amber') : TONE[it.kind];

/** onQuoText: when the agent has Quo, reminders open the Quo text box instead of the computer's own texting app. */
export function AppointmentsPage({ agent, d, cal, onDial, onResult, onQuoText, onText }: { agent: string; d: D; cal?: GoogleCal; onDial: (id: string) => void; onResult: OnResult; onQuoText?: (id: string, at: number, tomorrow: boolean) => void; onText?: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const mine = useMyEvents(agent);
  const [creating, setCreating] = useState<{ at: number; edit?: MyEvent } | null>(null);
  const start = addDays(weekStart(d.now, TZ), offset * 7, TZ);
  const end = addDays(start, 7, TZ);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i, TZ));
  const today = startOfDay(d.now, TZ);
  // Calendar (hours, 30-minute blocks, drag to move) or the old list of cards. Remembered per computer.
  const [view, setView] = useState<'grid' | 'list'>('grid');
  useEffect(() => { try { if (localStorage.getItem('dispatch-appt-view') === 'list') setView('list'); } catch { /* */ } }, []);
  const pickView = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem('dispatch-appt-view', v); } catch { /* */ } };

  const items = useMemo(() => calendarItems(d.contacts, d.sales, d.noSales, d.log, start, end, d.now, TZ),
    [d.contacts, d.sales, d.noSales, d.log, start, end, d.now]);
  const byDay = days.map(t => items.filter(it => it.at >= t && it.at < addDays(t, 1, TZ)));
  const picked = items.find(it => it.key === sel) ?? null;
  const c = picked ? contactFor(d, picked) : undefined;

  // what still needs a result or a time, from any week
  const needs = useMemo(() => d.contacts.filter(x => {
    const k = tagKind(x.tag);
    return (k === 'scheduled' && (x.callAt == null || x.callAt < today)) || k === 'calledInto';
  }), [d.contacts, today]);

  const held = items.filter(it => it.kind === 'sold' || it.kind === 'presented').length;
  const noShows = items.filter(it => it.kind === 'noshow').length;
  const upcoming = items.filter(it => it.kind === 'appt' && it.at >= d.now);
  const stats: [string, string | number, string][] = [
    ['Booked ahead', upcoming.length, 'blue'],
    ['Confirmed', upcoming.filter(it => it.label === 'Confirmed').length, ''],
    ['Callbacks', items.filter(it => it.kind === 'callback').length, 'amber'],
    ['Showed', held, ''],
    ['No-shows', noShows, ''],
    ['Show rate', held + noShows ? Math.round(100 * held / (held + noShows)) + '%' : '—', 'green'],
    ['Sold', items.filter(it => it.kind === 'sold').length, 'green'],
  ];

  // Only booked appointments and callbacks can be dragged, and only while they're still open.
  const canMove = (it: CalItem) => {
    const x = d.byId.get(it.contactId); if (!x) return false;
    const k = tagKind(x.tag);
    return (it.kind === 'appt' && k === 'scheduled') || (it.kind === 'callback' && k === 'callback');
  };
  const moveTo = (it: CalItem, at: number) => {
    const x = d.byId.get(it.contactId); if (!x || !canMove(it)) return;
    if (at < d.now) return d.say('That time has already passed. Drop it on a time still ahead.', 'warn');
    setSel(it.key);
    if (it.kind === 'appt') return d.outcome(x.id, 'reschedule', { when: at });
    const md = fmt({ month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    d.batch('Move callback', { changed: [{ ...x, callAt: at, notes: addNote(x.notes, `${fmt({ month: 'numeric', day: 'numeric' }).format(d.now)}: Callback moved to ${md.format(at)}`) }] },
      `${x.first} ${x.last}: callback moved to ${md.format(at)}.`);
  };

  // New event button: the next open half hour from now (within working hours), else tomorrow 9 AM.
  const nextOpen = () => {
    const taken = d.contacts.filter(x => x.callAt != null && x.callAt > d.now && (tagKind(x.tag) === 'scheduled' || tagKind(x.tag) === 'callback')).map(x => x.callAt!);
    const busy = mine.events.map(e => ({ start: e.start, len: e.mins * 60_000 }));
    let t = Math.ceil((d.now + 15 * 60_000) / BLOCK_MS) * BLOCK_MS;
    for (let i = 0; i < 48 * 14; i++, t += BLOCK_MS) {
      const h = (t - startOfDay(t, TZ)) / 3_600_000;
      if (h >= 9 && h < 20 && isOpen(taken, t, busy)) return t;
    }
    return startOfDay(d.now, TZ) + DAY_MS + 9 * 3_600_000;
  };
  const pickedMine = sel?.startsWith('m') ? mine.events.find(e => 'm' + e.id === sel) : undefined;

  const downloadWeek = () => {
    const evs = d.contacts.filter(x => x.callAt != null && x.callAt >= Math.max(start, d.now) && x.callAt < end
      && (tagKind(x.tag) === 'scheduled' || tagKind(x.tag) === 'callback'))
      .map(x => ({ ...eventFor(x, tagKind(x.tag) === 'scheduled' ? 'appt' : 'callback', x.callAt!, { email: x.email }), uid: `${x.id}-${x.callAt}` }));
    if (!evs.length) return d.say('Nothing upcoming this week to add.', 'warn');
    saveText(`appointments-${dayNum.format(start).replace(' ', '-')}.ics`, toIcs(evs, Date.now()), 'text/calendar');
  };

  return (
    <div className="apptpage">
      <section className="hero">
        <div className="title">
          <div className="eyebrow">{longDay.format(d.now)}</div>
          <h1>Appointments</h1>
          <p className="lede">Your week: appointments, callbacks and follow-ups, with results as they come in.</p>
        </div>
        <div className="strip s7">{stats.map(([k, v, tone]) => <div className="cell" key={k}><span>{k}</span><b className={tone}>{v}</b></div>)}</div>
      </section>

      <div className="weekbar">
        <div className="seg mini">
          <button onClick={() => setOffset(o => o - 1)} aria-label="Previous week">‹</button>
          <button className={offset === 0 ? 'on' : ''} onClick={() => setOffset(0)}>This week</button>
          <button onClick={() => setOffset(o => o + 1)} aria-label="Next week">›</button>
        </div>
        <b className="wk">{dayNum.format(start)} – {dayNum.format(addDays(start, 6, TZ))}</b>
        <div className="seg mini">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => pickView('grid')}>Calendar</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')}>List</button>
        </div>
        <button className="btn primary" onClick={() => setCreating({ at: nextOpen() })}>+ New event</button>
        <span className="grow" />
        {LIVE && cal ? <GcalStatus cal={cal} /> : <span className="gcal" title="In the live app, appointments go on your Google Calendar automatically.">Google Calendar: live app only</span>}
        {(!LIVE || cal?.status !== 'connected') && <button className="btn" onClick={downloadWeek}>Add week to my calendar</button>}
      </div>

      <main className="apptwork">
        {view === 'grid' ? <WeekGrid days={days} items={items} mine={mine.events} onMoveMine={(id, at) => { mine.move(id, at); setSel('m' + id); d.say(`Moved to ${whenFull.format(at)}.`); }}
          onSlot={at => at < d.now - BLOCK_MS ? d.say('That time has passed. Pick a time still ahead.', 'warn') : setCreating({ at })} today={today} now={d.now} sel={sel} onPick={setSel} canMove={canMove} onMove={moveTo}
          tone={pillTone} nameOf={it => { const x = contactFor(d, it); return { name: x ? `${x.first} ${x.last}` : 'Deleted contact', company: x?.company ?? '' }; }} /> :
        <section className="panel week">
          {days.map((t, i) => {
            const isToday = t === today, past = t < today;
            return (
              <div key={t} className={`wday ${isToday ? 'today' : ''} ${past ? 'past' : ''} ${byDay[i].length ? '' : 'blank'}`}>
                <div className="wh"><span>{dayHead.format(t)}</span><b>{parts(t, TZ).d}</b>{isToday && <em>Today</em>}</div>
                {byDay[i].map(it => {
                  const x = contactFor(d, it);
                  return (
                    <button key={it.key} className={`ev ${it.kind} ${sel === it.key ? 'on' : ''}`} onClick={() => setSel(it.key)}>
                      <span className="t">{it.allDay ? 'Any time' : timeOnly(it.at)}</span>
                      <span className="n">{x ? `${x.first} ${x.last}` : 'Deleted contact'}</span>
                      <span className="co">{x?.company}</span>
                      <span className={`spill ${pillTone(it)}`}>{it.label}</span>
                    </button>
                  );
                })}
                {!byDay[i].length && <p className="none">Nothing</p>}
              </div>
            );
          })}
        </section>}

        <aside className="apptside">
          <section className="panel adetail">
            {pickedMine ? <MineDetail e={pickedMine} onEdit={() => setCreating({ at: pickedMine.start, edit: pickedMine })}
                onDelete={() => { mine.remove(pickedMine.id); setSel(null); d.say(`Deleted “${pickedMine.title}”.`); }} />
              : picked && c ? <Detail it={picked} c={c} d={d} onDial={onDial} onResult={onResult} onQuoText={onQuoText} onText={onText} />
              : <div className="pad16"><div className="eyebrow">Details</div><p className="hint">Pick anything on the week to see the contact, confirm it, or record how it went.{view === 'grid' ? ' Drag a block to a new time. Click open time to book a contact there or block it off for yourself.' : ''}</p></div>}
          </section>
          <section className="panel needs2">
            <div className="ph"><h2>Needs a result</h2><span>{needs.length}</span></div>
            {needs.map(x => {
              const ci = tagKind(x.tag) === 'calledInto';
              return (
                <div className="aline" key={x.id}>
                  <span className="at">{x.callAt ? fmt({ month: 'numeric', day: 'numeric' }).format(x.callAt) : '—'}</span>
                  <button className="an" onClick={() => onDial(x.id)}>{x.first} {x.last}</button>
                  <span className={`spill ${ci ? 'blue' : x.callAt == null ? 'red' : 'amber'}`}>{ci ? 'Called into' : x.callAt == null ? 'No time' : 'Did they show?'}</span>
                  <span className="aacts show">
                    <button onClick={() => onResult('sold', x.id)}>Sold</button>
                    <button onClick={() => onResult('presented', x.id)}>Presented</button>
                    {!ci && <button onClick={() => d.outcome(x.id, 'noshow')}>No-show</button>}
                    {!ci && <button onClick={() => onResult('reschedule', x.id)}>{x.callAt == null ? 'Set time' : 'Move'}</button>}
                  </span>
                </div>
              );
            })}
            {!needs.length && <p className="hint pad16">All caught up.</p>}
          </section>
        </aside>
      </main>
      {creating && <NewEvent at={creating.at} edit={creating.edit} contacts={d.contacts} onClose={() => setCreating(null)}
        onBook={(id, kind, at, email) => { d.book(id, kind, at, email); setSel((kind === 'appt' ? 'a' : 'c') + id); }}
        onSave={e => { if (creating.edit) { mine.update(creating.edit.id, e); d.say(`Saved “${e.title}”.`); } else { mine.add(e); d.say(`Added “${e.title}” on ${whenFull.format(e.start)}.`); } }} />}
    </div>
  );
}

function MineDetail({ e, onEdit, onDelete }: { e: MyEvent; onEdit: () => void; onDelete: () => void }) {
  return <div className="pad16">
    <div className="eyebrow">My event</div>
    <h2 className="dn">{e.title}</h2>
    <dl className="dl">
      <dt>When</dt><dd>{whenFull.format(e.start)} – {timeOnly(e.start + e.mins * 60_000)} ET</dd>
      {e.note && <><dt>Note</dt><dd>{e.note}</dd></>}
    </dl>
    <div className="dacts"><button className="btn" onClick={onEdit}>Edit</button><button className="btn" onClick={onDelete}>Delete</button></div>
    <p className="hint">Drag it on the calendar to move it.</p>
  </div>;
}

function Detail({ it, c, d, onDial, onResult, onQuoText, onText }: { it: CalItem; c: Contact; d: D; onDial: (id: string) => void; onResult: OnResult; onQuoText?: (id: string, at: number, tomorrow: boolean) => void; onText?: (id: string) => void }) {
  const phone = c.phone || c.backup;
  const open = tagKind(c.tag) === 'scheduled' && it.kind === 'appt';
  const soon = open && it.at >= d.now && it.at < startOfDay(d.now, TZ) + 2 * DAY_MS;
  const confirmed = it.label === 'Confirmed';
  const tomorrow = it.at >= startOfDay(d.now, TZ) + DAY_MS;
  const notes = notesNewestFirst(c.notes).slice(0, 4);
  const target = resultTarget(it);
  const ics = () => saveText(`${c.first}-${c.last}.ics`.toLowerCase(),
    toIcs([{ ...eventFor(c, it.kind === 'callback' ? 'callback' : 'appt', it.at, { email: c.email }), uid: `${c.id}-${it.at}` }], Date.now()), 'text/calendar');
  return (
    <div className="pad16">
      <div className="eyebrow">{it.label}{it.detail ? ' · ' + it.detail : ''}</div>
      <h2 className="dn">{c.first} {c.last}</h2>
      <p className="dsub">{[c.company, c.job].filter(Boolean).join(' — ')}</p>
      <div className="dacts reachrow"><Reach id={c.id} phone={phone} first={c.first} onText={d.byId.has(c.id) ? onText : undefined} /></div>
      <dl className="dl">
        <dt>When</dt><dd>{it.allDay ? fmt({ weekday: 'short', month: 'numeric', day: 'numeric' }).format(it.at) : whenFull.format(it.at) + ' ET'}
          {!it.allDay && c.zone && c.zone !== 'ET' && ZONE_NAME[c.zone] ? <span className="hint"> · {localTime(c.zone, it.at)} {ZONE_NAME[c.zone]}</span> : null}</dd>
        <dt>Phone</dt><dd>{phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a> : <span className="hint">No number</span>}</dd>
        <dt>Where</dt><dd>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</dd>
        {c.email && <><dt>Email</dt><dd>{c.email}</dd></>}
        {!!c.quals?.length && <><dt>Notes</dt><dd>{c.quals.join(' · ')}</dd></>}
      </dl>
      {open && (
        <div className="dacts">
          {soon && !confirmed && <button className="btn primary" onClick={() => d.confirm(c.id)}>Confirmed</button>}
          {soon && phone && onQuoText && <button className="btn" onClick={() => onQuoText(c.id, it.at, !!tomorrow)}>Text reminder</button>}
          {soon && phone && !onQuoText && <a className="btn" href={`sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Hi ${c.first}, just a reminder about our appointment ${tomorrow ? 'tomorrow' : 'today'} at ${timeOnly(it.at)} ET. Talk soon!`)}`}>Text reminder</a>}
          <button className="btn go" onClick={() => onResult('sold', c.id)}>Sold</button>
          <button className="btn" onClick={() => onResult('presented', c.id)}>Presented</button>
          <button className="btn" onClick={() => d.outcome(c.id, 'noshow')}>No-show</button>
          <button className="btn" onClick={() => onResult('reschedule', c.id)}>Move</button>
        </div>
      )}
      {it.kind === 'callback' && tagKind(c.tag) === 'callback' && (
        <div className="dacts">
          <button className="btn go" onClick={() => onResult('sold', c.id)}>Sold</button>
          <button className="btn" onClick={() => onResult('presented', c.id)}>Presented</button>
          <button className="btn" onClick={() => onResult('reschedule', c.id)}>Book appointment</button>
        </div>
      )}
      {target && <ChangeResult at={it.at} target={target} c={c} d={d} onResult={onResult} />}
      <div className="dacts sub2">
        {d.byId.has(c.id) && <button className="linkish" onClick={() => onDial(c.id)}>Open in dialer</button>}
        {(it.kind === 'appt' || it.kind === 'callback') && it.at >= d.now && <button className="linkish" onClick={ics}>Add to my calendar</button>}
      </div>
      {notes.length > 0 && <div className="hist"><div className="eyebrow">History</div>
        {notes.map((l, i) => { const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/); return <div className="hl" key={i}><span>{m ? m[1] : ''}</span><p><NoteText text={m ? m[2] : l} /></p></div>; })}</div>}
    </div>
  );
}

/** Change a result that was already saved: switch it to another result, or fix the details of the same one. */
export function ChangeResult({ at, target, c, d, onResult, onDone }: { at: number; target: AmendTarget; c: Contact; d: D; onResult: OnResult; onDone?: () => void }) {
  const name = `${c.first} ${c.last}`;
  const sale = target.from === 'sold' ? d.sales[target.index] : undefined;
  const noSale = target.from === 'presented' ? d.noSales[target.index] : undefined;
  const when = fmt({ month: 'numeric', day: 'numeric' }).format(at);
  const opts: { k: 'sold' | 'presented' | 'noshow' | 'reschedule'; label: string; cls: string }[] = [
    { k: 'sold', label: target.from === 'sold' ? 'Edit sale' : 'Sold', cls: 'go' },
    { k: 'presented', label: target.from === 'presented' ? 'Edit no-sale' : 'Presented, not sold', cls: '' },
    ...(target.from !== 'noshow' ? [{ k: 'noshow' as const, label: 'No-show', cls: '' }] : []),
    { k: 'reschedule', label: 'Book again', cls: '' },
  ];
  const go = (k: typeof opts[number]['k']) => {
    onDone?.();
    if (k === 'noshow') return d.amend(target, 'noshow');
    const title = k === 'reschedule' ? `Book again: ${name}` : k === target.from ? `Edit ${when} ${k === 'sold' ? 'sale' : 'no-sale'}: ${name}`
      : `Change ${when} to ${k === 'sold' ? 'sold' : 'presented, not sold'}: ${name}`;
    onResult(k, c.id, { amend: target, initial: { title, sale: k === 'sold' ? sale : undefined, noSale: k === 'presented' ? noSale : undefined } });
  };
  return (
    <div className="change">
      <div className="eyebrow">Change this result</div>
      <div className="dacts">{opts.map(o => <button key={o.k} className={`btn ${o.cls}`} onClick={() => go(o.k)}>{o.label}</button>)}</div>
      <p className="hint">Fixes it everywhere: Sales, Results and the contact&rsquo;s history. Undo puts it back.</p>
    </div>
  );
}

/** Google Calendar on the Appointments page: connect, or what it's doing (George, 2026-11-26). */
function GcalStatus({ cal }: { cal: GoogleCal }) {
  if (cal.status === 'checking') return <span className="gcal">Google Calendar…</span>;
  if (cal.status === 'connected') return <span className="gcal on" title={`Booked appointments and callbacks are kept on ${cal.email ?? 'your'} Google Calendar. Moves in Google Calendar come back here.`}>
    <i />Google Calendar on{cal.lastSync ? ` · synced ${new Date(cal.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
    <button className="linkish" onClick={() => void cal.sync()}>Sync now</button></span>;
  return <span className="gcal">
    {cal.status === 'reconnect' ? 'Google Calendar needs reconnecting' : cal.status === 'error' ? <span className="warnline" title={cal.error}>Calendar: {cal.error}</span> : 'Google Calendar is off'}
    <button className="btn primary sm" onClick={() => void connectGoogleCalendar()}>{cal.status === 'reconnect' ? 'Reconnect' : 'Connect Google Calendar'}</button></span>;
}

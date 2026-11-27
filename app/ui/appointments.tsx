// Appointments page: the week on one screen (appointments, callbacks, follow-ups and results), what needs a result,
// and the details and actions for the one picked. Replaces the APPOINTMENTS calendar check and the sync menu.
'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { tagKind } from '../../src/rules/tags';
import { addDays, parts, startOfDay, DAY_MS } from '../../src/rules/time';
import { notesNewestFirst } from '../../src/rules/notes';
import { LIVE, connectGoogleCalendar } from '../../src/live/supabase';
import type { GoogleCal } from '../../src/live/useGoogleCalendar';
import { calendarItems, weekStart, eventFor, toIcs, type CalItem } from '../../src/calendar/events';
import { TZ, TZ_ABBR, TZ_NAME, ZONE_NAME, saveText, timeOnly, localTime, NoteText, Reach } from './shared';
import { WeekGrid } from './weekGrid';
import { NewEvent } from './newEvent';
import { useMyEvents } from '../../src/app-store/useMyEvents';
import { eventNote } from '../../src/brief/text';
import { factsByTopic, lastCallNotes } from '../../src/brief/profile';
import { useAiBrief } from '../../src/live/useAiBrief';
import { occurrencesBetween, REPEAT_LABEL, type MyEvent, type Occurrence } from '../../src/calendar/myEvents';
import { BLOCK_MS, nextOpenings, type WorkHours } from '../../src/calendar/grid';
import { Dialog } from './shared';
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
export function AppointmentsPage({ agent, agentName = '', d, cal, onDial, onResult, onQuoText, onText, open, onOpened }: { agent: string; agentName?: string; d: D; cal?: GoogleCal; onDial: (id: string) => void; onResult: OnResult; onQuoText?: (id: string, at: number, tomorrow: boolean) => void; onText?: (id: string) => void;
  /** from Home: open this contact's appointment card (George, 2026-11-27) */ open?: { id: string; at: number | null } | null; onOpened?: () => void }) {
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const mine = useMyEvents(agent);
  const [creating, setCreating] = useState<{ at: number; edit?: Occurrence } | null>(null);
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
  // opened from Home: go to that week and pick the contact's appointment (or whatever they have that week)
  useEffect(() => {
    if (!open) return;
    const at = open.at ?? d.now;
    const want = Math.round((weekStart(at, TZ) - weekStart(d.now, TZ)) / (7 * 86_400_000));
    if (want !== offset) { setOffset(want); return; }
    const mineHere = items.filter(it => it.contactId === open.id);
    const it = mineHere.find(x => x.kind === 'appt') ?? mineHere.sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
    if (it) setSel(it.key);
    onOpened?.();
  }, [open, offset, items]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // The agent's own Google Calendar events (busy, read only), when Google Calendar is connected.
  const gEvents = useMemo(() => (cal?.others ?? []).filter(e => !e.allDay), [cal?.others]);
  const gBusy = gEvents.map(e => ({ start: e.start, len: Math.max(BLOCK_MS, e.end - e.start) }));
  const pickedG = sel?.startsWith('g') ? gEvents.find(e => 'g' + e.id === sel) : undefined;
  // Own events, with repeats spread out: this week for the calendar, the next two weeks for openings and clashes.
  const occ = useMemo(() => occurrencesBetween(mine.events, start, end, TZ), [mine.events, start, end]);
  const soon = useMemo(() => occurrencesBetween(mine.events, d.now - DAY_MS, d.now + 15 * DAY_MS, TZ), [mine.events, d.now]);
  // Open times inside the agent's working hours (George, 2026-11-26): New event starts at the first one, and
  // "Next 3 openings" lists three to offer a contact on the call.
  const openings = (n: number) => {
    const taken = d.contacts.filter(x => x.callAt != null && x.callAt > d.now && (tagKind(x.tag) === 'scheduled' || tagKind(x.tag) === 'callback')).map(x => x.callAt!);
    return nextOpenings(n, d.now, mine.hours, taken, [...soon.map(e => ({ start: e.start, len: e.mins * 60_000 })), ...gBusy], t => startOfDay(t, TZ), t => parts(t, TZ).wd);
  };
  const nextOpen = () => openings(1)[0] ?? startOfDay(d.now, TZ) + DAY_MS + mine.hours.start * 60_000;
  const [showOpen, setShowOpen] = useState(false);
  const [editHours, setEditHours] = useState(false);
  const pickedMine = sel?.startsWith('m') ? occ.find(e => 'm' + e.id === sel) : undefined;
  const seriesOf = (o: Occurrence) => mine.events.find(e => e.id === o.seriesId);
  const moveMine = (id: string, at: number) => {
    const o = occ.find(e => e.id === id); if (!o) return;
    if (o.repeat) { mine.moveOne(o, at); setSel(null); d.say(`Moved this one to ${whenFull.format(at)}. The other repeats stay put.`); }
    else { mine.move(id, at); setSel('m' + id); d.say(`Moved to ${whenFull.format(at)}.`); }
  };
  const resizeMine = (id: string, mins: number) => {
    const o = occ.find(e => e.id === id); if (!o) return;
    if (o.repeat) { mine.resizeOne(o, mins); setSel(null); } else { mine.update(id, { mins }); setSel('m' + id); }
    d.say(`Now ${mins < 60 ? `${mins} minutes` : `${mins / 60} hour${mins === 60 ? '' : 's'}`}${o.repeat ? ' (just this one)' : ''}.`);
  };

  // Delete (George, 2026-11-26): your own events go away (with Undo); a contact's appointment or callback is
  // cancelled, which puts them back in the calling list with a note. Undo for those is the usual Undo at the bottom.
  const [undoMine, setUndoMine] = useState<{ text: string; undo: () => void } | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  /** A repeating event: `all` deletes every repeat, otherwise just this one. */
  const deleteMine = (o: Occurrence, all = false) => {
    setSel(null);
    if (o.repeat && !all) { mine.skipOne(o); setUndoMine({ text: `Deleted “${o.title}” on ${whenFull.format(o.start)}.`, undo: () => mine.unskip(o) }); d.say(`Deleted this “${o.title}”. The other repeats stay.`); return; }
    const s = seriesOf(o); if (!s) return;
    mine.remove(s.id); setUndoMine({ text: `Deleted “${s.title}”${s.repeat ? ' and all its repeats' : ''}.`, undo: () => { const { id: _id, ...rest } = s; mine.add(rest); } });
    d.say(`Deleted “${s.title}”${s.repeat ? ' and all its repeats' : ''}.`);
  };
  const saveMine = (e: Omit<MyEvent, 'id'>) => {
    const o = creating?.edit;
    if (!o) { mine.add(e); d.say(`Added “${e.title}” on ${whenFull.format(e.start)}${e.repeat ? `, ${REPEAT_LABEL[e.repeat].toLowerCase()}` : ''}.`); return; }
    const s = seriesOf(o);
    if (s?.repeat && e.repeat) {   // a series: keep its first date, shift its time (or day) by however much this one moved
      const delta = e.start - o.start;
      mine.update(s.id, { ...e, start: s.start + delta, skip: delta ? [] : s.skip });
    } else mine.update(o.seriesId, { ...e, skip: undefined });
    d.say(`Saved “${e.title}”.`);
  };
  const cancelItem = (it: CalItem) => {
    const x = d.byId.get(it.contactId); if (!x || !canMove(it)) return;
    const what = it.kind === 'appt' ? 'Appointment' : 'Callback';
    d.batch(`Cancel ${what.toLowerCase()}`, { changed: [{ ...x, tag: '', callAt: null, confirmedAt: null,
      notes: addNote(x.notes, `${fmt({ month: 'numeric', day: 'numeric' }).format(d.now)}: ${what} for ${whenFull.format(it.at)} cancelled`) }] },
      `${x.first} ${x.last}: ${what.toLowerCase()} cancelled. They're back in your calling list.`);
    setSel(null);
  };
  // Delete or Backspace removes whatever is picked on the calendar (not while typing)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); return; }
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || creating || !sel) return;
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (pickedMine) { e.preventDefault(); deleteMine(pickedMine); return; }
      const it = items.find(x => x.key === sel);
      if (it && canMove(it)) { e.preventDefault(); cancelItem(it); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const downloadWeek = () => {
    const evs = d.contacts.filter(x => x.callAt != null && x.callAt >= Math.max(start, d.now) && x.callAt < end
      && (tagKind(x.tag) === 'scheduled' || tagKind(x.tag) === 'callback'))
      .map(x => ({ ...eventFor(x, tagKind(x.tag) === 'scheduled' ? 'appt' : 'callback', x.callAt!, { email: x.email, note: eventNote(x, d.now, !!x.email?.trim()) }), uid: `${x.id}-${x.callAt}` }));
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
        <span className="openwrap">
          <button className="btn" onClick={() => setShowOpen(o => !o)} aria-expanded={showOpen}>Next 3 openings</button>
          {showOpen && <OpeningsPop times={openings(3)} hours={mine.hours} onClose={() => setShowOpen(false)} onPick={t => { setShowOpen(false); setCreating({ at: t }); }}
            onHours={() => { setShowOpen(false); setEditHours(true); }} onCopied={() => d.say('Copied. Paste it into a text, or read it out.')} />}
        </span>
        <span className="grow" />
        {LIVE && cal ? <GcalStatus cal={cal} /> : <span className="gcal" title="In the live app, appointments go on your Google Calendar automatically.">Google Calendar: live app only</span>}
        {(!LIVE || cal?.status !== 'connected') && <button className="btn" onClick={downloadWeek}>Add week to my calendar</button>}
      </div>

      <main className="apptwork">
        {view === 'grid' ? <WeekGrid days={days} items={items} mine={occ} outside={gEvents} hours={mine.hours} onResizeMine={resizeMine} onMoveMine={moveMine}
          onMenu={(key, x, y) => setMenu({ key, x, y })}
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
            {pickedG ? <div className="pad16"><div className="eyebrow">Google Calendar</div><h2 className="dn">{pickedG.title}</h2>
                <dl className="dl"><dt>When</dt><dd>{whenFull.format(pickedG.start)} – {timeOnly(pickedG.end)} {TZ_ABBR}</dd></dl>
                <p className="hint">From your Google Calendar. Shown here as busy time; change it in Google Calendar.</p></div>
              : pickedMine ? <MineDetail e={pickedMine} onEdit={() => setCreating({ at: pickedMine.start, edit: pickedMine })}
                onDelete={all => deleteMine(pickedMine, all)} />
              : picked && c ? <Detail agentName={agentName} it={picked} c={c} d={d} onDial={onDial} onResult={onResult} onQuoText={onQuoText} onText={onText} onCancel={canMove(picked) ? () => cancelItem(picked) : undefined} />
              : <div className="pad16">{undoMine && <p className="undoline">{undoMine.text} <button className="linkish" onClick={() => { undoMine.undo(); setUndoMine(null); }}>Undo</button></p>}<div className="eyebrow">Details</div><p className="hint">Pick anything on the week to see the contact, confirm it, or record how it went.{view === 'grid' ? ' Drag a block to a new time. Click open time to book a contact there or block it off for yourself.' : ''}</p></div>}
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
      {menu && <BlockMenu at={menu} onClose={() => setMenu(null)} entries={(() => {
        const ev = occ.find(e => 'm' + e.id === menu.key), it = items.find(x => x.key === menu.key), x = it ? d.byId.get(it.contactId) : undefined;
        const phone = x ? (x.phone || x.backup).replace(/[^\d+]/g, '') : '';
        if (ev) return ev.repeat ? [['Edit every repeat', () => setCreating({ at: ev.start, edit: ev })], ['Delete this one', () => deleteMine(ev), 'danger'], ['Delete all repeats', () => deleteMine(ev, true), 'danger']]
          : [['Edit', () => setCreating({ at: ev.start, edit: ev })], ['Delete', () => deleteMine(ev), 'danger']];
        if (!it || !x) return [];
        const open = canMove(it);
        return [
          ...(phone ? [['Call', () => { location.href = `tel:${phone}`; }], ['Text', () => onText ? onText(x.id) : (location.href = `sms:${phone}`)]] : []),
          ...(it.kind === 'appt' && open && it.at >= d.now && it.label !== 'Confirmed' ? [['Mark confirmed', () => d.confirm(x.id)]] : []),
          ...(open ? [['Move…', () => onResult('reschedule', x.id)]] : []),
          ['Open in dialer', () => onDial(x.id)],
          ...(open ? [[it.kind === 'appt' ? 'Cancel appointment' : 'Remove callback', () => cancelItem(it), 'danger']] : []),
        ] as [string, () => void, string?][];
      })()} />}
      {creating && <NewEvent at={creating.at} edit={creating.edit} contacts={d.contacts}
        clash={(at, mins, skip) => {
          const end = at + mins * 60_000;
          const c2 = d.contacts.find(x => x.id !== skip && x.callAt != null && (tagKind(x.tag) === 'scheduled' || tagKind(x.tag) === 'callback') && x.callAt < end && x.callAt + BLOCK_MS > at);
          if (c2) return `${c2.first} ${c2.last} (${tagKind(c2.tag) === 'scheduled' ? 'appointment' : 'callback'}) at ${timeOnly(c2.callAt!)}`;
          const e2 = soon.find(e => e.seriesId !== creating.edit?.seriesId && e.start < end && e.start + e.mins * 60_000 > at);
          if (e2) return `“${e2.title}” at ${timeOnly(e2.start)}`;
          const g2 = gEvents.find(e => e.start < end && e.end > at);
          return g2 ? `“${g2.title}” on your Google Calendar at ${timeOnly(g2.start)}` : '';
        }} onClose={() => setCreating(null)}
        onBook={(id, kind, at, email) => { d.book(id, kind, at, email); setSel((kind === 'appt' ? 'a' : 'c') + id); }}
        onSave={saveMine} />}
      {editHours && <HoursDialog hours={mine.hours} onClose={() => setEditHours(false)} onSave={h => { mine.setHours(h); d.say('Working hours saved.'); }} />}
    </div>
  );
}

/** Right-click menu on a calendar block. Closes on any click elsewhere or Escape. */
function BlockMenu({ at, entries, onClose }: { at: { x: number; y: number }; entries: [string, () => void, string?][]; onClose: () => void }) {
  useEffect(() => {
    const off = () => onClose();
    window.addEventListener('pointerdown', off); window.addEventListener('scroll', off, true); window.addEventListener('resize', off);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off); };
  }, [onClose]);
  if (!entries.length) return null;
  const x = Math.min(at.x, window.innerWidth - 200), y = Math.min(at.y, window.innerHeight - entries.length * 34 - 16);
  return <div className="ctxmenu" style={{ left: x, top: y }} role="menu" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
    {entries.map(([label, run, tone]) => <button key={label} role="menuitem" className={tone ?? ''} onClick={() => { onClose(); run(); }}>{label}</button>)}
  </div>;
}

/** A delete link that asks once, inline (no pop-up). */
function ConfirmDelete({ label, onYes }: { label: string; onYes: () => void }) {
  const [ask, setAsk] = useState(false);
  return ask ? <span className="confdel">Sure? <button className="linkish danger" onClick={() => { setAsk(false); onYes(); }}>Yes, {label.toLowerCase()}</button>
    <button className="linkish" onClick={() => setAsk(false)}>Keep it</button></span>
    : <button className="linkish danger" onClick={() => setAsk(true)}>{label}</button>;
}

function MineDetail({ e, onEdit, onDelete }: { e: Occurrence; onEdit: () => void; onDelete: (all?: boolean) => void }) {
  return <div className="pad16">
    <div className="eyebrow">My event</div>
    <h2 className="dn">{e.title}</h2>
    <dl className="dl">
      <dt>When</dt><dd>{whenFull.format(e.start)} – {timeOnly(e.start + e.mins * 60_000)} {TZ_ABBR}</dd>
      {e.repeat && <><dt>Repeats</dt><dd>{REPEAT_LABEL[e.repeat]}</dd></>}
      {e.note && <><dt>Note</dt><dd>{e.note}</dd></>}
    </dl>
    <div className="dacts"><button className="btn" onClick={onEdit}>{e.repeat ? 'Edit every repeat' : 'Edit'}</button>
      <button className="btn danger" onClick={() => onDelete()}>{e.repeat ? 'Delete this one' : 'Delete'}</button>
      {e.repeat && <button className="btn danger" onClick={() => onDelete(true)}>Delete all repeats</button>}</div>
    <p className="hint">Drag it on the calendar to move it. Delete key works too.</p>
  </div>;
}

function Detail({ agentName, it, c, d, onDial, onResult, onQuoText, onText, onCancel }: { agentName: string; it: CalItem; c: Contact; d: D; onDial: (id: string) => void; onResult: OnResult; onQuoText?: (id: string, at: number, tomorrow: boolean) => void; onText?: (id: string) => void; onCancel?: () => void }) {
  const phone = c.phone || c.backup;
  const open = tagKind(c.tag) === 'scheduled' && it.kind === 'appt';
  const soon = open && it.at >= d.now && it.at < startOfDay(d.now, TZ) + 2 * DAY_MS;
  const confirmed = it.label === 'Confirmed';
  const tomorrow = it.at >= startOfDay(d.now, TZ) + DAY_MS;
  const notes = notesNewestFirst(c.notes).slice(0, 4);
  const target = resultTarget(it);
  const ics = () => saveText(`${c.first}-${c.last}.ics`.toLowerCase(),
    toIcs([{ ...eventFor(c, it.kind === 'callback' ? 'callback' : 'appt', it.at, { email: c.email, note: eventNote(c, d.now, !!c.email?.trim()) }), uid: `${c.id}-${it.at}` }], Date.now()), 'text/calendar');
  return (
    <div className="pad16">
      <div className="eyebrow">{it.label}{it.detail ? ' · ' + it.detail : ''}</div>
      <h2 className="dn">{c.first} {c.last}</h2>
      <p className="dsub">{[c.company, c.job].filter(Boolean).join(' — ')}</p>
      <div className="dacts reachrow"><Reach id={c.id} phone={phone} first={c.first} onText={d.byId.has(c.id) ? onText : undefined} /></div>
      <dl className="dl">
        <dt>When</dt><dd>{it.allDay ? fmt({ weekday: 'short', month: 'numeric', day: 'numeric' }).format(it.at) : whenFull.format(it.at) + ' ' + TZ_ABBR}
          {!it.allDay && c.zone && c.zone !== TZ_ABBR && ZONE_NAME[c.zone] ? <span className="hint"> · {localTime(c.zone, it.at)} {ZONE_NAME[c.zone]}</span> : null}</dd>
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
          {/* a callback whose time has passed: they didn't pick up, or it was a set call they missed (George, 2026-11-27) */}
          {it.at <= d.now && <button className="btn" onClick={() => d.press(c.id, 'noanswer')}>No answer</button>}
          {it.at <= d.now && <button className="btn" onClick={() => d.outcome(c.id, 'noshow')}>No-show</button>}
        </div>
      )}
      {target && <ChangeResult at={it.at} target={target} c={c} d={d} onResult={onResult} />}
      {(it.kind === 'appt' || it.kind === 'callback') && it.at >= d.now - 3_600_000 && d.byId.has(c.id) && <Prep c={c} kind={it.kind === 'appt' ? 'appt' : 'callback'} agentName={agentName} now={d.now} />}
      <div className="dacts sub2">
        {d.byId.has(c.id) && <button className="linkish" onClick={() => onDial(c.id)}>Open in dialer</button>}
        {(it.kind === 'appt' || it.kind === 'callback') && it.at >= d.now && <button className="linkish" onClick={ics}>Add to my calendar</button>}
        {onCancel && <ConfirmDelete label={it.kind === 'appt' ? 'Cancel appointment' : 'Remove callback'} onYes={onCancel} />}
      </div>
      {notes.length > 0 && <div className="hist"><div className="eyebrow">History</div>
        {notes.map((l, i) => { const m = l.match(/^(\d{1,2}\/\d{1,2}):\s*(.*)$/); return <div className="hl" key={i}><span>{m ? m[1] : ''}</span><p><NoteText text={m ? m[2] : l} /></p></div>; })}</div>}
    </div>
  );
}

/** Prep for a booked appointment or callback (George, 2026-11-27): Claude's brief, the last call's AI notes and
 * what the calls taught us about the person. The same notes go on the calendar event (unless the client is invited). */
function Prep({ c, kind, agentName, now }: { c: Contact; kind: 'appt' | 'callback'; agentName: string; now: number }) {
  const last = lastCallNotes(c.notes), known = factsByTopic(c.profile, now);
  const ai = useAiBrief(c, kind, agentName, now, TZ);
  if (!ai.b && !ai.busy && !last && !known.length) return null;
  return <div className="brief b-known prep">
    <div className="bhead"><span className="eyebrow">Prep</span><small>{ai.b ? 'written by Claude' : ai.busy ? 'Claude is writing…' : ''}</small></div>
    {ai.b && <><p><b>Who.</b> {ai.b.who}</p><p><b>Where it stands.</b> {ai.b.stands}</p><p className="open"><b>Open with.</b> {ai.b.openWith}</p>
      {ai.b.watch.length > 0 && <ul>{ai.b.watch.map(w => <li key={w}>{w}</li>)}</ul>}</>}
    {last && <p className="blast"><b>Last call · {last.day}.</b> {last.text}</p>}
    {known.length > 0 && <div className="bknown"><span className="eyebrow">What we know</span>
      <dl>{known.map(g => <Fragment key={g.topic}><dt>{g.topic}</dt><dd>{g.items.map(f => f.fact).join(' · ')}</dd></Fragment>)}</dl></div>}
  </div>;
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
  if (cal.status === 'connected') return <span className="gcal on" title={`Booked appointments and callbacks are kept on ${cal.email ?? 'your'} Google Calendar. Moves in Google Calendar come back here, and your other Google events show here as busy time.`}>
    <i />Google Calendar on{cal.lastSync ? ` · synced ${new Date(cal.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
    <button className="linkish" onClick={() => void cal.sync()}>Sync now</button>
    {cal.meet.status === 'reconnect' && <button className="linkish" title="So Dispatch can read your Google Meet transcripts for presentation coaching" onClick={() => void connectGoogleCalendar()}>Allow Meet transcripts</button>}</span>;
  return <span className="gcal">
    {cal.status === 'reconnect' ? 'Google Calendar needs reconnecting' : cal.status === 'error' ? <span className="warnline" title={cal.error}>Calendar: {cal.error}</span> : 'Google Calendar is off'}
    <button className="btn primary sm" onClick={() => void connectGoogleCalendar()}>{cal.status === 'reconnect' ? 'Reconnect' : 'Connect Google Calendar'}</button></span>;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hm = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const spoken = fmt({ weekday: 'short', hour: 'numeric', minute: '2-digit' });
const hoursLine = (h: WorkHours) => `${h.days.length === 7 ? 'Every day' : h.days.map(x => WD[x]).join(', ')} · ${hm(h.start)}–${hm(h.end)}`;

/** The next three open half hours inside working hours, with a line to read out or text. */
function OpeningsPop({ times, hours, onPick, onClose, onHours, onCopied }: { times: number[]; hours: WorkHours; onPick: (t: number) => void; onClose: () => void; onHours: () => void; onCopied: () => void }) {
  useEffect(() => {
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('.openwrap')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const words = times.map(t => spoken.format(t));
  const line = words.length ? `I have ${words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : words[0]} (${TZ_NAME} time). Which works best?` : '';
  return <div className="openpop" role="dialog" aria-label="Next openings">
    {times.map(t => <div key={t} className="opt"><span>{whenFull.format(t)}</span><button className="btn sm" onClick={() => onPick(t)}>Book</button></div>)}
    {!times.length && <p className="hint">No open time in the next two weeks inside your working hours.</p>}
    {line && <><p className="say">{line}</p>
      <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(line).then(onCopied, () => {}); }}>Copy this line</button></>}
    <p className="hint">Working hours: {hoursLine(hours)}. <button className="linkish" onClick={onHours}>Change</button></p>
  </div>;
}

/** The agent's working hours: time outside them is greyed out on the calendar and skipped for openings. */
function HoursDialog({ hours, onSave, onClose }: { hours: WorkHours; onSave: (h: WorkHours) => void; onClose: () => void }) {
  const [start, setStart] = useState(hours.start), [end, setEnd] = useState(hours.end);
  const [days, setDays] = useState<number[]>(hours.days);
  const times = Array.from({ length: 37 }, (_, i) => 5 * 60 + i * 30);   // 5:00 AM to 11:00 PM
  const ok = end > start && days.length > 0;
  return <Dialog title="My working hours" onClose={onClose}>
    <div className="newev">
      <div className="nerow">
        <label><span>Start ({TZ_ABBR})</span><select value={start} onChange={e => setStart(+e.target.value)}>{times.map(m => <option key={m} value={m}>{hm(m)}</option>)}</select></label>
        <label><span>End ({TZ_ABBR})</span><select value={end} onChange={e => setEnd(+e.target.value)}>{times.map(m => <option key={m} value={m}>{hm(m)}</option>)}</select></label>
      </div>
      <div><span className="hint">Days I work</span>
        <div className="daypick">{[1, 2, 3, 4, 5, 6, 0].map(x => <button key={x} className={`chip ${days.includes(x) ? 'on' : ''}`}
          onClick={() => setDays(ds => ds.includes(x) ? ds.filter(y => y !== x) : [...ds, x].sort())}>{WD[x]}</button>)}</div></div>
      {end <= start && <p className="clash">End has to be after start.</p>}
      <p className="hint">Time outside these hours is greyed out. You can still book there if you need to.</p>
      <div className="bar"><span className="muted" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok} onClick={() => { onSave({ start, end, days }); onClose(); }}>Save</button></div>
    </div>
  </Dialog>;
}

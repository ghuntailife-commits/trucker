'use client';
// New event on the Appointments calendar (George, 2026-11-26): book a contact's appointment or callback at a
// time, or block time for yourself (lunch, team meeting). Opens from a click on open time or the New event button.
import { useMemo, useState } from 'react';
import type { Contact } from '../../src/rules/types';
import type { MyEvent } from '../../src/calendar/myEvents';
import { EVENT_LENGTHS, REPEAT_LABEL, type Repeat } from '../../src/calendar/myEvents';
import { parts, zoned } from '../../src/rules/time';
import { tagShort } from '../../src/rules/tags';
import { Dialog, TZ, TZ_ABBR, timeOnly } from './shared';

type Kind = 'appt' | 'callback' | 'mine';
const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (t: number) => { const p = parts(t, TZ); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const minOf = (t: number) => { const p = parts(t, TZ); return p.h * 60 + p.mi; };
const TIMES = Array.from({ length: 34 }, (_, i) => 6 * 60 + i * 30);   // 6:00 AM to 10:30 PM, agent's time
const label = (m: number) => { const h = Math.floor(m / 60); return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
const lengthLabel = (m: number) => m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`;

export function NewEvent({ at, contacts, edit, onClose, onBook, onSave, clash }: {
  at: number; contacts: Contact[]; edit?: MyEvent; onClose: () => void;
  /** What's already at that time, if anything (double-booking warning). */
  clash?: (at: number, mins: number, skipContact?: string) => string;
  onBook: (id: string, kind: 'appt' | 'callback', at: number, email?: string) => void;
  onSave: (e: Omit<MyEvent, 'id'>) => void;
}) {
  const [kind, setKind] = useState<Kind>(edit ? 'mine' : 'appt');
  const [date, setDate] = useState(dateOf(edit?.start ?? at));
  const [min, setMin] = useState(minOf(edit?.start ?? at));
  const [q, setQ] = useState('');
  const [who, setWho] = useState<Contact | null>(null);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState(edit?.title ?? '');
  const [mins, setMins] = useState(edit?.mins ?? 60);
  const [note, setNote] = useState(edit?.note ?? '');
  const [repeat, setRepeat] = useState<Repeat | ''>(edit?.repeat ?? '');

  const when = useMemo(() => { const [y, m, d] = date.split('-').map(Number); return y ? zoned(y, m, d, Math.floor(min / 60), min % 60, TZ) : NaN; }, [date, min]);
  const found = useMemo(() => {
    const n = q.toLowerCase().trim(), digits = n.replace(/\D/g, '');
    if (n.length < 2) return [];
    return contacts.filter(c => `${c.first} ${c.last} ${c.company}`.toLowerCase().includes(n)
      || (digits.length >= 3 && `${c.phone}${c.backup}`.replace(/\D/g, '').includes(digits))).slice(0, 8);
  }, [q, contacts]);
  const times = TIMES.includes(min) ? TIMES : [...TIMES, min].sort((a, b) => a - b);
  const ok = !Number.isNaN(when) && (kind === 'mine' ? true : !!who);
  const save = () => {
    if (!ok) return;
    if (kind === 'mine') onSave({ title: title.trim() || 'Busy', start: when, mins, note: note.trim() || undefined, repeat: repeat || undefined });
    else onBook(who!.id, kind, when, kind === 'appt' && email.trim() ? email.trim() : undefined);
    onClose();
  };

  return <Dialog title={edit ? 'Edit event' : 'New event'} onClose={onClose}>
    <div className="newev">
      {!edit && <div className="seg mini">
        {([['appt', 'Appointment'], ['callback', 'Callback'], ['mine', 'My own event']] as [Kind, string][]).map(([k, l]) =>
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
      </div>}
      <div className="nerow">
        <label><span>Day</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label><span>Time ({TZ_ABBR})</span><select value={min} onChange={e => setMin(+e.target.value)}>{times.map(m => <option key={m} value={m}>{label(m)}</option>)}</select></label>
        {kind === 'mine' && <label><span>How long</span><select value={mins} onChange={e => setMins(+e.target.value)}>{EVENT_LENGTHS.map(m => <option key={m} value={m}>{lengthLabel(m)}</option>)}</select></label>}
      </div>
      {kind === 'mine' ? <>
        <label className="nefull"><span>What</span><input autoFocus placeholder="Lunch, team meeting, kids' game…" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} /></label>
        <div className="nerow">
          <label><span>Repeats</span><select value={repeat} onChange={e => setRepeat(e.target.value as Repeat | '')}>
            <option value="">Doesn’t repeat</option>{(Object.keys(REPEAT_LABEL) as Repeat[]).map(r => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}</select></label>
          <label><span>Note (optional)</span><input value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        <p className="hint">Shows on your calendar as busy time. Only you see it.{edit?.repeat ? ' Changes here apply to every repeat. To change just one, drag it on the calendar.' : ''}</p>
      </> : who ? <div className="newho">
        <div><b>{who.first} {who.last}</b><small>{[who.company, [who.city, who.state].filter(Boolean).join(', '), who.phone].filter(Boolean).join(' · ')}</small>
          {who.tag && <small>Now: {tagShort(who.tag)}</small>}</div>
        <button className="linkish" onClick={() => setWho(null)}>Change</button>
        {kind === 'appt' && <label className="nefull"><span>Email for the invite (optional)</span><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>}
      </div> : <>
        <label className="nefull"><span>Contact</span><input autoFocus placeholder="Type a name, company or phone" value={q} onChange={e => setQ(e.target.value)} /></label>
        <div className="nelist">
          {found.map(c => <button key={c.id} onClick={() => { setWho(c); setEmail(c.email ?? ''); }}>
            <b>{c.first} {c.last}</b><small>{[c.company, c.state, c.phone].filter(Boolean).join(' · ')}{c.tag ? ` · ${tagShort(c.tag)}` : ''}</small></button>)}
          {q.trim().length >= 2 && !found.length && <p className="hint">No contact matches. Add them on Contacts first.</p>}
        </div>
      </>}
      {(() => { const hit = !Number.isNaN(when) && clash ? clash(when, kind === 'mine' ? mins : 30, who?.id) : ''; return hit ? <p className="clash">Heads up: this overlaps {hit}. You can still save it.</p> : null; })()}
      {!Number.isNaN(when) && when < Date.now() - 30 * 60_000 && <p className="clash">That time has already passed.</p>}
      <div className="bar">
        <span className="muted">{!Number.isNaN(when) && `${new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(when)} at ${timeOnly(when)} ${TZ_ABBR}`}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok} onClick={save}>{kind === 'mine' ? (edit ? 'Save' : 'Add to calendar') : kind === 'appt' ? 'Book appointment' : 'Set callback'}</button>
      </div>
    </div>
  </Dialog>;
}

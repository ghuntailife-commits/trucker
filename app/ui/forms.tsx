// The result forms: Sold, Presented (not sold) and Move appointment. Same fields and checks as the sheet's popups,
// with a preview of the note that will be saved before anything is written.
'use client';
import { useState } from 'react';
import type { Contact } from '../../src/rules/types';
import { OBJECTIONS, checkSale, checkNoSale, saleNote, noSaleNote, type SaleRecord, type NoSaleRecord } from '../../src/rules/results';
import { parseWhen } from '../../src/rules/parseWhen';
import { DAY_MS } from '../../src/rules/time';
import { Dialog, TZ } from './shared';

export type ResultKind = 'sold' | 'presented' | 'reschedule';
export type ResultSave = { sale?: Omit<SaleRecord, 'at' | 'contactId' | 'calledInto'>; noSale?: Omit<NoSaleRecord, 'at' | 'contactId' | 'calledInto'>; when?: number };

/** Values to start from when changing a result that was already saved. */
export type ResultInitial = { sale?: SaleRecord; noSale?: NoSaleRecord; title?: string };

export function ResultForm({ kind, contact, now, onClose, onSave, initial }: {
  kind: ResultKind; contact?: Contact; now: number; onClose: () => void; onSave: (f: ResultSave) => void; initial?: ResultInitial;
}) {
  const who = contact ? `${contact.first} ${contact.last}` : '';
  const sub = contact ? [contact.phone || contact.backup, [contact.company, contact.job].filter(Boolean).join(' - ')].filter(Boolean).join(' · ') : '';
  if (kind === 'sold') return <SoldForm who={who} sub={sub} email={contact?.email ?? ''} now={now} onClose={onClose} onSave={onSave} init={initial?.sale} title={initial?.title} />;
  if (kind === 'presented') return <NoSaleForm who={who} sub={sub} now={now} onClose={onClose} onSave={onSave} init={initial?.noSale} title={initial?.title} />;
  return <MoveForm who={who} contact={contact} now={now} onClose={onClose} onSave={onSave} title={initial?.title} />;
}

type P = { who: string; sub: string; now: number; onClose: () => void; onSave: (f: ResultSave) => void };

function Money({ label, value, set, hint, autoFocus }: { label: string; value: string; set: (v: string) => void; hint?: string; autoFocus?: boolean }) {
  return (
    <label className="fld">
      <span>{label}{hint && <em> {hint}</em>}</span>
      <span className="money"><i>$</i><input inputMode="decimal" autoComplete="off" value={value} onChange={e => set(e.target.value)} autoFocus={autoFocus} /></span>
    </label>
  );
}

const amt = (n?: number) => (n ? String(n) : '');
function SoldForm({ who, sub, email: email0, now, onClose, onSave, init, title }: P & { email: string; init?: SaleRecord; title?: string }) {
  const [type, setType] = useState<string>(init?.alpType ?? '');
  const [alp, setAlp] = useState(amt(init?.alp)); const [mo, setMo] = useState(amt(init?.monthly)); const [wl, setWl] = useState(amt(init?.wholeLife)); const [adb, setAdb] = useState(amt(init?.adb));
  const [email, setEmail] = useState(init?.email || email0); const [note, setNote] = useState(init?.note ?? '');
  const [err, setErr] = useState('');
  const r = checkSale({ type, alp, monthly: mo, wholeLife: wl, adb, email, note });
  const save = () => { if ('error' in r) return setErr(r.error); onSave({ sale: r.ok }); };
  return (
    <Dialog title={title ?? `Sale: ${who}`} onClose={onClose}>
      <form className="rform" onSubmit={e => { e.preventDefault(); save(); }}>
        <p className="sub">{sub}</p>
        <label className="fld"><span>ALP type</span></label>
        <div className="seg two">
          {(['Trial', 'Standard'] as const).map(t => <button type="button" key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
        </div>
        <div className="grid2">
          <Money label="ALP" value={alp} set={setAlp} />
          <Money label="Monthly premium" value={mo} set={setMo} />
          <Money label="Whole life coverage" value={wl} set={setWl} />
          <Money label="ADB amount" hint="blank if none" value={adb} set={setAdb} />
        </div>
        <label className="fld"><span>Email <em>optional</em></span><input inputMode="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="fld"><span>Notes <em>optional</em></span><textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <div className="preview">{'ok' in r ? <>Will save: <b>{saleNote(r.ok, now, TZ)}</b></> : <span className={err ? 'err' : ''}>{err || 'Fill in the ALP type and amounts.'}</span>}</div>
        <div className="bar"><button type="button" className="btn" onClick={onClose}>Skip for now</button><button className="btn go">Save sale</button></div>
      </form>
    </Dialog>
  );
}

function NoSaleForm({ who, sub, now, onClose, onSave, init, title }: P & { init?: NoSaleRecord; title?: string }) {
  const [on, setOn] = useState<string[]>(init?.objections ?? []);
  const [reason, setReason] = useState(init?.reason ?? ''); const [fu, setFu] = useState(init?.followUp ?? ''); const [fuNote, setFuNote] = useState(init?.followUpNote ?? '');
  const [err, setErr] = useState('');
  const r = checkNoSale({ objections: on, reason, followUp: fu, followUpNote: fuNote });
  const save = () => { if ('error' in r) return setErr(r.error); onSave({ noSale: r.ok }); };
  const flip = (o: string) => setOn(v => (v.includes(o) ? v.filter(x => x !== o) : [...v, o]));
  return (
    <Dialog title={title ?? `No sale: ${who}`} onClose={onClose}>
      <form className="rform" onSubmit={e => { e.preventDefault(); save(); }}>
        <p className="sub">{sub}</p>
        <label className="fld"><span>Objections encountered</span></label>
        <div className="chips">{OBJECTIONS.map(o => <button type="button" key={o} className={on.includes(o) ? 'on' : ''} aria-pressed={on.includes(o)} onClick={() => flip(o)}>{o}</button>)}</div>
        <label className="fld"><span>Reason it did not close</span><textarea rows={2} maxLength={1000} placeholder="What actually stopped the sale?" value={reason} onChange={e => setReason(e.target.value)} /></label>
        <div className="grid2">
          <label className="fld"><span>Follow-up date <em>optional</em></span><input type="date" value={fu} onChange={e => setFu(e.target.value)} /></label>
          <label className="fld"><span>Follow-up notes <em>optional</em></span><input value={fuNote} maxLength={1000} onChange={e => setFuNote(e.target.value)} /></label>
        </div>
        <div className="preview">{'ok' in r ? <>Will save: <b>{noSaleNote(r.ok, now, TZ)}</b></> : <span className={err ? 'err' : ''}>{err || 'Pick an objection or write what stopped it.'}</span>}</div>
        <div className="bar"><button type="button" className="btn" onClick={onClose}>Skip for now</button><button className="btn primary">Save</button></div>
      </form>
    </Dialog>
  );
}

function MoveForm({ who, contact, now, onClose, onSave, title }: { who: string; contact?: Contact; now: number; onClose: () => void; onSave: (f: ResultSave) => void; title?: string }) {
  const [when, setWhen] = useState(''); const [err, setErr] = useState('');
  const w = when.trim() ? parseWhen(when, now, TZ, false) : null;
  const ok = w && !('error' in w) ? w : null;
  const save = () => { if (!ok) return setErr(w && 'error' in w ? w.error : 'Type a time like thu 6pm.'); onSave({ when: ok.date }); };
  return (
    <Dialog title={title ?? `Move appointment: ${who}`} onClose={onClose}>
      <form className="rform" onSubmit={e => { e.preventDefault(); save(); }}>
        {contact?.callAt != null && <p className="sub">Now booked for {new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(contact.callAt)}</p>}
        <label className="fld"><span>New appointment time</span><input value={when} onChange={e => { setWhen(e.target.value); setErr(''); }} placeholder="e.g. thu 6pm" autoFocus /></label>
        <div className="preview">{ok ? <>Will move to <b>{ok.label}</b>{ok.date - now > 2 * DAY_MS && <span className="warnline"> · more than 2 days out</span>}</> : <span className={err ? 'err' : ''}>{err || 'The calendar event moves with it.'}</span>}</div>
        <div className="bar"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Move</button></div>
      </form>
    </Dialog>
  );
}

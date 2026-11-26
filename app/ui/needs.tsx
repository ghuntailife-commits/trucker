'use client';
// Needs Number: type the numbers you found, review what will be saved, then save them all at once.
import { useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { notesNewestFirst } from '../../src/rules/notes';
import { needsGroup, planNeeds, returnCannotFind, type NeedsEntry, type NeedsGroup, type NeedsPlanLine } from '../../src/contacts/needs';
import { TZ, Dialog } from './shared';
import type { NumberSheet } from '../../src/app-store/useNumberSheet';
import { CHECK_EVERY_MIN } from '../../src/app-store/useNumberSheet';
import { BANNER, LEFT_HEAD, LEFT_TITLE, LEFT_TYPE, RIGHT_HEAD, RIGHT_TITLE, RIGHT_TYPE, WIDTHS, FIRST_DATA_ROW, isDone, isOpen, leftValues, needsLook, planSend, rightValues, tone, type SendPlan, type SheetRow } from '../../src/numbers/sheet';
import { mdTime } from '../../src/rules/time';
import { Toggle } from './settings';

type D = ReturnType<typeof useDialer>;
type Tab = NeedsGroup | 'sheet';
const TABS: [Tab, string, string][] = [
  ['needs', 'Needs a number', 'No phone number yet. Type the number you found, or mark Cannot find.'],
  ['newNumber', 'Needs a new number', 'The number on file was marked bad. Type a new one to put them back in the lists.'],
  ['cannotFind', 'Cannot find', 'Nobody could find a number. Send them back to Needs Number to search again.'],
  ['sheet', 'Number sheet', 'Your own Google Sheet for finding numbers. Numbers found there are checked and saved to the contact on their own.'],
];
const DRAFT = 'trucker-needs-draft';
const blank = (id: string): NeedsEntry => ({ id, phone: '', backup: '', note: '', cannotFind: false });
const typed = (e: NeedsEntry) => !!(e.phone.trim() || e.backup.trim() || e.note.trim() || e.cannotFind);

export function NeedsPage({ d, ns }: { d: D; ns: NumberSheet }) {
  const [tab, setTab] = useState<Tab>('needs');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sendPlan, setSendPlan] = useState<SendPlan | null>(null);
  const sheetRows = ns.sheet?.rows ?? [];
  const onSheet = useMemo(() => new Set(sheetRows.filter(r => !isDone(r)).map(r => r.id)), [sheetRows]);
  const waiting = sheetRows.filter(isOpen).length, look = sheetRows.filter(needsLook).length;
  const [draft, setDraft] = useState<Record<string, NeedsEntry>>({});
  const [review, setReview] = useState<NeedsPlanLine[] | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<Contact[] | null>(null);

  // typed entries survive a refresh (this browser only)
  useEffect(() => { try { const r = localStorage.getItem(DRAFT); if (r) setDraft(JSON.parse(r)); } catch { /* */ } }, []);
  useEffect(() => { try { localStorage.setItem(DRAFT, JSON.stringify(draft)); } catch { /* */ } }, [draft]);

  const groups = useMemo(() => {
    const m: Record<NeedsGroup, Contact[]> = { needs: [], newNumber: [], cannotFind: [] };
    for (const c of d.contacts) { const g = needsGroup(c); if (g) m[g].push(c); }
    // like the sheet: UPS contacts last, then by list and original order
    const ups = (c: Contact) => (/^ups\b/i.test(c.company) ? 1 : 0);
    for (const k of Object.keys(m) as NeedsGroup[]) m[k].sort((a, b) => ups(a) - ups(b) || a.list.localeCompare(b.list) || a.seq - b.seq);
    return m;
  }, [d.contacts]);
  const entries = Object.values(draft).filter(typed);
  const set = (id: string, patch: Partial<NeedsEntry>) => setDraft(x => ({ ...x, [id]: { ...(x[id] ?? blank(id)), ...patch } }));

  const openReview = () => setReview(planNeeds(entries, d.contacts, d.now, TZ));
  const save = () => {
    if (!review) return;
    const ok = review.filter(x => x.ok);
    d.batch('Needs Number save', { changed: ok.map(x => x.contact!) }, `Saved ${ok.length} contact${ok.length === 1 ? '' : 's'}.${review.length > ok.length ? ` ${review.length - ok.length} not saved: they stay typed so you can fix them.` : ''}`);
    setDraft(x => { const n = { ...x }; for (const o of ok) delete n[o.id]; return n; });
    setReview(null);
  };
  const rows = tab === 'sheet' ? [] : groups[tab];
  const pickable = rows.filter(c => !onSheet.has(c.id));
  const pick = (id: string, on: boolean) => setPicked(x => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <>
      <section className="hero">
        <div className="title">
          <div className="eyebrow">Find numbers here or on your number sheet</div>
          <h1>Needs Number</h1>
          <div className="passbar"><span>{TABS.find(t => t[0] === tab)![2]}</span></div>
        </div>
        <div className="strip s4">
          {([['Needs a number', groups.needs.length, 'blue'], ['Needs a new number', groups.newNumber.length, 'amber'],
            ['On number sheet', waiting, 'green'], ['Needs a look', look, look ? 'red' : '']] as [string, number, string][])
            .map(([l, v, tone]) => <div className="cell" key={l}><span>{l}</span><b className={tone}>{v}</b></div>)}
        </div>
      </section>

      <main className="work single">
        <section className="panel queue">
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {TABS.map(([g, label]) => <button key={g} role="tab" aria-selected={tab === g} className={tab === g ? 'on' : ''} onClick={() => setTab(g)}>{label} <span className={g === 'sheet' && look ? 'warnct' : ''}>{g === 'sheet' ? (look ? `${look} to look at` : waiting) : groups[g].length}</span></button>)}
            </div>
            <div className="tbtns">
              {tab === 'sheet' ? <SheetTools ns={ns} />
                : tab === 'cannotFind'
                ? <button className="btn" disabled={!rows.length} onClick={() => setConfirmReturn(rows)}>Return all to Needs Number</button>
                : <>
                  <button className="btn" disabled={!picked.size} onClick={() => setSendPlan(planSend([...picked], d.contacts, sheetRows, d.now, TZ))}>Send {picked.size || ''} to number sheet</button>
                  <button className="btn" disabled={!entries.length} onClick={() => setDraft({})}>Clear typed</button>
                  <button className="btn primary" disabled={!entries.length} onClick={openReview}>Review and save {entries.length || ''}</button>
                </>}
            </div>
          </div>
          {tab === 'sheet' ? <SheetGrid ns={ns} /> : <div className="tscroll tall">
            <table className="qt needs">
              <thead><tr>
                {tab !== 'cannotFind' && <th className="pickc"><input type="checkbox" aria-label="Pick all for the number sheet" checked={!!pickable.length && pickable.every(c => picked.has(c.id))}
                  onChange={e => setPicked(x => { const n = new Set(x); for (const c of pickable) { if (e.target.checked) n.add(c.id); else n.delete(c.id); } return n; })} /></th>}
                <th>Contact</th><th>Company — Role</th><th>Location</th><th className="num">Dials</th><th>Notes (newest)</th>
                {tab === 'cannotFind' ? <th /> : <><th>{tab === 'newNumber' ? 'New number' : 'Phone'}</th>{tab === 'needs' && <th>Backup</th>}<th>Note</th><th>Cannot find</th></>}
              </tr></thead>
              <tbody>
                {rows.map(c => {
                  const e = draft[c.id] ?? blank(c.id);
                  return (
                    <tr key={c.id} className={typed(e) ? 'typed' : ''}>
                      {tab !== 'cannotFind' && <td className="pickc">{onSheet.has(c.id) ? <span className="onsheet" title="Waiting on the number sheet">✓</span>
                        : <input type="checkbox" aria-label={`Send ${c.first} ${c.last} to the number sheet`} checked={picked.has(c.id)} onChange={ev => pick(c.id, ev.target.checked)} />}</td>}
                      <td className="strong">{c.first} {c.last}{onSheet.has(c.id) && <span className="spill green mini">On sheet</span>}{c.linkedin && /^https:\/\//.test(c.linkedin) && <> <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="li">in</a></>}</td>
                      <td>{c.company}{c.job ? ` — ${c.job}` : ''}</td>
                      <td>{c.city}{c.city ? ', ' : ''}{c.state}</td>
                      <td className="num">{c.dials}</td>
                      <td className="note muted" title={c.notes}>{(notesNewestFirst(c.notes)[0] ?? '').replace(/^(\d{1,2}\/\d{1,2}):\s*/, '$1 ') || (c.tag ? `Bad: ${c.phone}` : '')}</td>
                      {tab === 'cannotFind'
                        ? <td className="num"><button className="btn sm" onClick={() => setConfirmReturn([c])}>Return</button></td>
                        : <>
                          <td className="in"><input inputMode="tel" placeholder="Number" disabled={e.cannotFind} value={e.phone} onChange={ev => set(c.id, { phone: ev.target.value })} /></td>
                          {tab === 'needs' && <td className="in"><input inputMode="tel" placeholder="Backup" disabled={e.cannotFind} value={e.backup} onChange={ev => set(c.id, { backup: ev.target.value })} /></td>}
                          <td className="in wide"><input placeholder="Where you found it" value={e.note} onChange={ev => set(c.id, { note: ev.target.value })} /></td>
                          <td className="in"><label className="check"><input type="checkbox" aria-label={`No number found for ${c.first} ${c.last}`} checked={e.cannotFind} onChange={ev => set(c.id, { cannotFind: ev.target.checked, phone: '', backup: '' })} /></label></td>
                        </>}
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={9} className="emptyrow">{tab === 'needs' ? 'Every contact has a number.' : tab === 'newNumber' ? 'No bad numbers waiting.' : 'Nobody is on the Cannot Find list.'}</td></tr>}
              </tbody>
            </table>
          </div>}
          <div className="tfoot">{tab === 'sheet'
            ? <><span>{sheetRows.length} row{sheetRows.length === 1 ? '' : 's'} · checked every {CHECK_EVERY_MIN} minutes{ns.sheet?.lastCheck ? ` · last checked ${mdTime(ns.sheet.lastCheck, TZ)}` : ''}</span>
              <span>Demo: a pretend sheet in this browser. At go-live it is a real Google Sheet only you (and your number finder) can open.</span></>
            : <><span>{rows.length} contact{rows.length === 1 ? '' : 's'}{tab !== 'cannotFind' ? ' · tick contacts to send them to your number sheet, or type numbers here' : ''}</span>
              <span>A new number is dialed first for its next two dials.</span></>}</div>
        </section>
      </main>

      {review && (
        <Dialog title="Review before saving" onClose={() => setReview(null)} wide>
          <p><b>{review.filter(x => x.ok).length}</b> will be saved{review.some(x => !x.ok) ? <>, <b>{review.filter(x => !x.ok).length}</b> will not</> : ''}.</p>
          <div className="plan">
            {review.map(x => {
              const e = draft[x.id];
              return <div key={x.id} className={x.ok ? 'ok' : 'no'}><span>{x.ok ? '✓' : '✕'}</span><b>{x.name}</b>
                <em>{x.result}{x.ok && e && (e.phone || e.backup) ? `: ${[e.phone, e.backup].filter(Boolean).join(' / ')}` : ''}</em></div>;
            })}
          </div>
          <div className="bar"><button className="btn" onClick={() => setReview(null)}>Back</button>
            <button className="btn primary" disabled={!review.some(x => x.ok)} onClick={save}>Save {review.filter(x => x.ok).length}</button></div>
        </Dialog>
      )}
      {sendPlan && (
        <Dialog title="Send to your number sheet?" onClose={() => setSendPlan(null)} wide>
          <p><b>{sendPlan.send.length}</b> will be added to the sheet{sendPlan.skip.length ? <>, <b>{sendPlan.skip.length}</b> won't</> : ''}. Each row gets the contact's name, company, city, LinkedIn, old numbers and latest note, plus empty Phone, Backup, Where found and Cannot find columns for the finder.</p>
          <div className="plan">
            {sendPlan.send.map(r => <div key={r.id} className="ok"><span>✓</span><b>{r.first} {r.last}</b><em>{[r.company, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}{r.old ? ` · bad: ${r.old}` : ''}</em></div>)}
            {sendPlan.skip.map((x, i) => <div key={'s' + i} className="no"><span>✕</span><b>{x.name}</b><em>{x.reason}</em></div>)}
          </div>
          <div className="bar"><button className="btn" onClick={() => setSendPlan(null)}>Back</button>
            <button className="btn primary" disabled={!sendPlan.send.length} onClick={() => {
              ns.send(sendPlan.send); setPicked(new Set()); setSendPlan(null);
              d.say(`Sent ${sendPlan.send.length} to your number sheet. Numbers found there are saved on their own.`);
            }}>Send {sendPlan.send.length}</button></div>
        </Dialog>
      )}
      {confirmReturn && (
        <Dialog title={`Return ${confirmReturn.length} contact${confirmReturn.length === 1 ? '' : 's'} to Needs Number?`} onClose={() => setConfirmReturn(null)}>
          <p>They go back on the Needs a number list so someone searches again. Their notes stay; only the Cannot Find mark is cleared.</p>
          <div className="bar"><button className="btn" onClick={() => setConfirmReturn(null)}>Cancel</button>
            <button className="btn primary" onClick={() => {
              d.batch('return Cannot Find', { changed: confirmReturn.map(returnCannotFind) }, `Returned ${confirmReturn.length} to Needs Number.`);
              setConfirmReturn(null);
            }}>Return {confirmReturn.length}</button></div>
        </Dialog>
      )}
    </>
  );
}


function SheetTools({ ns }: { ns: NumberSheet }) {
  const last = ns.sheet?.uploads.at(-1);
  return <>
    <label className="autobad" title="When a number is marked bad, its contact goes on the sheet by itself">
      <Toggle on={!!ns.sheet?.autoBad} onChange={ns.setAutoBad} label="Send new bad numbers automatically" /> <span>Send new bad numbers</span></label>
    {last && <button className="btn" onClick={() => ns.undo(last)} title={`Undo the ${last.after.length} saved at ${mdTime(last.at, TZ)}`}>Undo last upload ({last.after.length})</button>}
    <button className="btn" onClick={ns.demoFill} title="Demo only: fills a few waiting rows with fictional 555 numbers, one Cannot find and one number that is already on another contact">Pretend finder (demo)</button>
    <button className="btn primary" onClick={() => ns.check(false)}>Check sheet now</button>
  </>;
}

const LETTERS = Array.from({ length: 24 }, (_, i) => String.fromCharCode(65 + i));

/** The number sheet, drawn like the Google Sheet it will be: same banner, sections, columns, widths and yellow cells. */
function SheetGrid({ ns }: { ns: NumberSheet }) {
  const all = (ns.sheet?.rows ?? []).map((r, i) => [r, i] as const);
  const L = all.filter(([r]) => r.side === 'needs'), R = all.filter(([r]) => r.side === 'newNumber');
  const n = Math.max(L.length, R.length, 12);
  const looks = all.filter(([r]) => needsLook(r));
  const cells = (x: readonly [SheetRow, number] | undefined, left: boolean) => {
    const head = left ? LEFT_HEAD : RIGHT_HEAD, typeCols = left ? LEFT_TYPE : RIGHT_TYPE;
    if (!x) return head.map((_, c) => <td key={(left ? 'l' : 'r') + c} className={typeCols.includes(c) ? 'y' : ''} />);
    const [r, i] = x, t = tone(r), vals = left ? leftValues(r) : rightValues(r);
    const field = (c: number): 'phone' | 'backup' | 'finder' => c === 0 ? 'phone' : c === 1 && left ? 'backup' : 'finder';
    return vals.map((v, c) => {
      const yellow = typeCols.includes(c), editable = yellow && !isDone(r);
      return <td key={(left ? 'l' : 'r') + c} className={`t-${t} ${yellow ? 'y' : ''}`} title={c === 0 && r.status ? r.status : undefined}>
        {editable ? <input aria-label={`${head[c]} for ${r.first} ${r.last}`} value={v} onChange={e => ns.edit(i, { [field(c)]: e.target.value })} />
          : left && c === 8 && v ? <a href={v} target="_blank" rel="noopener noreferrer">{v}</a> : v}
        {c === 0 && r.status && <i className="gnote" />}
      </td>;
    });
  };
  return (
    <>
      <div className="gsheet" role="region" aria-label="Number sheet (pretend Google Sheet)">
        <table className="gs" style={{ width: 40 + WIDTHS.reduce((a, b) => a + b, 0) }}>
          <colgroup><col style={{ width: 40 }} />{WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr><th />{LETTERS.map(l => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>
            <tr><th>1</th><td colSpan={24} className="b1">{BANNER[0]}</td></tr>
            <tr><th>2</th><td colSpan={24} className="b2">{BANNER[1].replace('(hover for why)', '(point at the phone cell for why)')}</td></tr>
            <tr><th>3</th><td colSpan={12} className="b3">{LEFT_TITLE}</td><td colSpan={12} className="b3">{RIGHT_TITLE}</td></tr>
            <tr className="gh"><th>4</th>{[...LEFT_HEAD, ...RIGHT_HEAD].map((h, i) => <td key={i}>{h}</td>)}</tr>
            {Array.from({ length: n }, (_, k) => <tr key={k}><th>{FIRST_DATA_ROW + k}</th>{cells(L[k], true)}{cells(R[k], false)}</tr>)}
          </tbody>
        </table>
      </div>
      {looks.length > 0 && <div className="looks"><b>Needs a look</b>{looks.map(([r, i]) => <div key={i}><span>{r.first} {r.last}</span><em>{r.status.replace(/^Not added: /, '')}</em></div>)}</div>}
    </>
  );
}

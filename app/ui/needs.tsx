'use client';
// Needs Number: type the numbers you found, review what will be saved, then save them all at once.
import { useEffect, useMemo, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { notesNewestFirst } from '../../src/rules/notes';
import { needsGroup, planNeeds, returnCannotFind, type NeedsEntry, type NeedsGroup, type NeedsPlanLine } from '../../src/contacts/needs';
import { TZ, Dialog } from './shared';

type D = ReturnType<typeof useDialer>;
const TABS: [NeedsGroup, string, string][] = [
  ['needs', 'Needs a number', 'No phone number yet. Type the number you found, or mark Cannot find.'],
  ['newNumber', 'Needs a new number', 'The number on file was marked bad. Type a new one to put them back in the lists.'],
  ['cannotFind', 'Cannot find', 'Nobody could find a number. Send them back to Needs Number to search again.'],
];
const DRAFT = 'trucker-needs-draft';
const blank = (id: string): NeedsEntry => ({ id, phone: '', backup: '', note: '', cannotFind: false });
const typed = (e: NeedsEntry) => !!(e.phone.trim() || e.backup.trim() || e.note.trim() || e.cannotFind);

export function NeedsPage({ d }: { d: D }) {
  const [tab, setTab] = useState<NeedsGroup>('needs');
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
  const rows = groups[tab];

  return (
    <>
      <section className="hero">
        <div className="title">
          <div className="eyebrow">Find numbers · then save them all at once</div>
          <h1>Needs Number</h1>
          <div className="passbar"><span>{TABS.find(t => t[0] === tab)![2]}</span></div>
        </div>
        <div className="strip s4">
          {([['Needs a number', groups.needs.length, 'blue'], ['Needs a new number', groups.newNumber.length, 'amber'],
            ['Cannot find', groups.cannotFind.length, ''], ['Typed, not saved', entries.length, 'green']] as [string, number, string][])
            .map(([l, v, tone]) => <div className="cell" key={l}><span>{l}</span><b className={tone}>{v}</b></div>)}
        </div>
      </section>

      <main className="work single">
        <section className="panel queue">
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {TABS.map(([g, label]) => <button key={g} role="tab" aria-selected={tab === g} className={tab === g ? 'on' : ''} onClick={() => setTab(g)}>{label} <span>{groups[g].length}</span></button>)}
            </div>
            <div className="tbtns">
              {tab === 'cannotFind'
                ? <button className="btn" disabled={!rows.length} onClick={() => setConfirmReturn(rows)}>Return all to Needs Number</button>
                : <>
                  <button className="btn" disabled={!entries.length} onClick={() => setDraft({})}>Clear typed</button>
                  <button className="btn primary" disabled={!entries.length} onClick={openReview}>Review and save {entries.length || ''}</button>
                </>}
            </div>
          </div>
          <div className="tscroll tall">
            <table className="qt needs">
              <thead><tr>
                <th>Contact</th><th>Company — Role</th><th>Location</th><th className="num">Dials</th><th>Notes (newest)</th>
                {tab === 'cannotFind' ? <th /> : <><th>{tab === 'newNumber' ? 'New number' : 'Phone'}</th>{tab === 'needs' && <th>Backup</th>}<th>Note</th><th>Cannot find</th></>}
              </tr></thead>
              <tbody>
                {rows.map(c => {
                  const e = draft[c.id] ?? blank(c.id);
                  return (
                    <tr key={c.id} className={typed(e) ? 'typed' : ''}>
                      <td className="strong">{c.first} {c.last}{c.linkedin && /^https:\/\//.test(c.linkedin) && <> <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="li">in</a></>}</td>
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
          </div>
          <div className="tfoot"><span>{rows.length} contact{rows.length === 1 ? '' : 's'}{tab !== 'cannotFind' ? ' · typed entries are kept until you save' : ''}</span>
            <span>A new number is dialed first for its next two dials.</span></div>
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


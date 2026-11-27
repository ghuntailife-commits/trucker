'use client';
// The agent's own say over Today (George, 2026-11-26): call next, add to Today, replace, pause, rest 75 days,
// resume, send back to the library, and their own Today settings. Shared by Today, Contacts and anywhere a contact shows.
import { useEffect, useState } from 'react';
import type { useDialer } from '../../src/app-store/useDialer';
import type { Contact } from '../../src/rules/types';
import { holdLabel, isHeld, REST_DAYS } from '../../src/rules/hold';
import { DEFAULT_CONFIG } from '../../src/rules/config';
import { Dialog, TZ } from './shared';

type D = ReturnType<typeof useDialer>;
export type MenuEntry = [string, () => void, string?];

/** Right-click (or ⋯) menu. Closes on a click elsewhere, scroll or Escape. */
export function CtxMenu({ at, entries, onClose }: { at: { x: number; y: number }; entries: MenuEntry[]; onClose: () => void }) {
  useEffect(() => {
    const t0 = Date.now();
    const off = () => onClose();
    const scrolled = () => { if (Date.now() - t0 > 250) onClose(); };   // the click that opened it can scroll the list a little
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', off); window.addEventListener('scroll', scrolled, true); window.addEventListener('resize', off); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('scroll', scrolled, true); window.removeEventListener('resize', off); window.removeEventListener('keydown', key); };
  }, [onClose]);
  if (!entries.length) return null;
  const x = Math.min(at.x, window.innerWidth - 220), y = Math.min(at.y, window.innerHeight - entries.length * 34 - 16);
  return <div className="ctxmenu" style={{ left: x, top: y }} role="menu" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
    {entries.map(([label, run, tone]) => <button key={label} role="menuitem" className={tone ?? ''} onClick={() => { onClose(); run(); }}>{label}</button>)}
  </div>;
}

/** What an agent can do with one of their contacts, as menu entries. `onToday` = the contact is on Today right now. */
export function contactEntries(d: D, c: Contact, opts: { onToday: boolean; askRemove: (ids: string[]) => void }): MenuEntry[] {
  const now = Date.now(), held = isHeld(c, now), pinned = d.pins.some(p => p.id === c.id);
  return [
    ['Call next', () => d.pin(c.id, true)],
    ...(!opts.onToday ? [['Add to Today', () => d.pin(c.id)] as MenuEntry] : []),
    ...(opts.onToday ? [[pinned ? 'Take off Today' : 'Replace (off Today today)', () => (pinned ? d.unpin(c.id) : d.replace(c.id))] as MenuEntry] : []),
    ...(held ? [[`Resume (${holdLabel(c, now, TZ).toLowerCase()})`, () => d.resume(c.id)] as MenuEntry]
      : [['Pause until I resume', () => d.hold(c.id, 'pause')] as MenuEntry, [`Rest ${REST_DAYS} days`, () => d.hold(c.id, 'rest')] as MenuEntry]),
    ['Remove from my contacts…', () => opts.askRemove([c.id]), 'danger'],
  ];
}

const REASONS = ['Long-time no-show', 'Not my state', 'Wrong person', 'Too many tries'];
export function RemoveDialog({ d, ids, agentName, onClose }: { d: D; ids: string[]; agentName: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const names = ids.map(id => d.byId.get(id)).filter(Boolean).map(c => `${c!.first} ${c!.last}`);
  return <Dialog title={names.length === 1 ? `Remove ${names[0]} from your contacts?` : `Remove ${names.length} contacts?`} onClose={onClose}>
    <div className="newev">
      <p className="hint">They go back to the contact library with all their notes and call history, so they can be given to someone else. Undo works right after.</p>
      <div className="chips">{REASONS.map(r => <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}</div>
      <label className="nefull"><span>Why (optional)</span><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Helps whoever gets them next" /></label>
      <div className="bar"><span className="muted" />
        <button className="btn" onClick={onClose}>Keep</button>
        <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); await d.removeToLibrary(ids, reason.trim(), agentName); onClose(); }}>{busy ? 'Removing…' : 'Remove'}</button>
      </div>
    </div>
  </Dialog>;
}

/** The agent's own Today settings on top of the team rules: how many, the fresh/retry mix, which lists. */
export function TodaySettings({ d, onClose }: { d: D; onClose: () => void }) {
  const p = d.prefs;
  const lists = [...new Set(d.contacts.map(c => c.list))].filter(l => l !== 'Hardcards').sort();
  const [size, setSize] = useState(p.listSize ?? DEFAULT_CONFIG.listSize);
  const [mix, setMix] = useState<number | null>(p.freshShare ?? null);
  const [off, setOff] = useState<Set<string>>(new Set(p.offLists ?? []));
  const count = (l: string) => d.contacts.filter(c => c.list === l).length;
  const save = () => { d.setPrefs({ listSize: size, freshShare: mix ?? undefined, offLists: [...off] }); d.reSort(); d.say('Today settings saved. Your list was re-sorted.'); onClose(); };
  return <Dialog title="My Today" onClose={onClose}>
    <div className="newev">
      <label><span>Contacts on Today: <b>{size}</b></span><input type="range" min={25} max={200} step={25} value={size} onChange={e => setSize(+e.target.value)} /></label>
      <label><span>Mix: {mix == null ? 'team setting (changes through the day)' : `${Math.round(mix * 100)}% fresh contacts, ${100 - Math.round(mix * 100)}% retries`}</span>
        <input type="range" min={0.1} max={0.9} step={0.05} value={mix ?? 0.3} onChange={e => setMix(+e.target.value)} /></label>
      {mix != null && <button className="linkish" onClick={() => setMix(null)}>Use the team setting</button>}
      <div><span className="hint">Lists on Today</span>
        <div className="chips">{lists.map(l => <button key={l} className={`chip ${off.has(l) ? '' : 'on'}`} onClick={() => setOff(s => { const n = new Set(s); if (n.has(l)) n.delete(l); else n.add(l); return n; })}>
          {off.has(l) ? '○' : '✓'} {l} <small>{count(l)}</small></button>)}</div></div>
      <p className="hint">Callbacks, appointments and follow-ups still come first. Right-click any contact to call them next, add them, pause them or rest them.</p>
      <div className="bar"><span className="muted" />
        <button className="btn" onClick={() => { d.setPrefs({}); d.reSort(); onClose(); }}>Reset to team rules</button>
        <button className="btn primary" onClick={save}>Save</button></div>
    </div>
  </Dialog>;
}

/** Shows when a contact is paused or resting, with Resume. */
export function HoldNote({ d, c }: { d: D; c: Contact }) {
  const l = holdLabel(c, Date.now(), TZ);
  return l ? <p className="holdnote">{l}. Off your Today list. <button className="linkish" onClick={() => d.resume(c.id)}>Resume</button></p> : null;
}

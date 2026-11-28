'use client';
// Ring my cell (George, 2026-11-27): the agent's own phone rings for Dispatch calls. Saved per agent.
import { useEffect, useState } from 'react';
import { loadState, saveState } from '../../src/app-store/store';
import { cellKey, cellReady, type CellPref } from '../../src/twilio/cell';
import { Dialog } from './shared';

export function useCellPref(agent: string) {
  const [pref, setPref] = useState<CellPref>({ on: false, cell: '' });
  useEffect(() => { let alive = true; loadState<CellPref>(cellKey(agent)).then(p => { if (alive && p) setPref({ on: !!p.on, cell: p.cell ?? '' }); }).catch(() => {}); return () => { alive = false; }; }, [agent]);
  const save = (p: CellPref) => { setPref(p); saveState(cellKey(agent), p); };
  return { pref, ready: cellReady(pref), save };
}

const fmt = (v: string) => { const d = v.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v; };

export function RingCellDialog({ pref, onSave, onClose }: { pref: CellPref; onSave: (p: CellPref) => void; onClose: () => void }) {
  const [cell, setCell] = useState(pref.cell);
  const [on, setOn] = useState(pref.on || !pref.cell);
  const ok = cellReady({ on: true, cell });
  return (
    <Dialog title="Ring my cell" onClose={onClose}>
      <div className="ringcell">
        <p>When this is on, pressing Call rings <b>your phone</b> first. Pick up, you hear who you&rsquo;re calling, and Dispatch connects them. Your phone shows the contact&rsquo;s local Dispatch number.</p>
        <p>Calls coming in ring <b>your computer and your phone together</b>. Answer on whichever is closer. Your phone shows the caller&rsquo;s own number and you hear their name first.</p>
        <label className="fld"><span>Your cell</span><input inputMode="tel" value={cell} onChange={e => setCell(e.target.value)} onBlur={e => setCell(fmt(e.target.value))} placeholder="(615) 555-0100" /></label>
        <label className="chk"><input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /> Ring my cell for Dispatch calls</label>
        <p className="hint">Notes, recordings, transcripts and dial counts work the same as calls on the computer. The sound bars only move on computer calls.</p>
        {!ok && cell.trim() && <p className="warnline">That isn&rsquo;t a full 10-digit number.</p>}
      </div>
      <div className="bar">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok && on} onClick={() => { onSave({ on, cell: fmt(cell) }); onClose(); }}>Save</button>
      </div>
    </Dialog>
  );
}

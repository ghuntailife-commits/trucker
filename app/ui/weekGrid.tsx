'use client';
// The Appointments week as a real calendar (George, 2026-11-26): hours down the side, every appointment a
// 30-minute block, open time left empty, appointments, callbacks and your own events dragged to a new half hour,
// and a click on open time to create an event there.
import { useEffect, useRef, useState } from 'react';
import type { CalItem } from '../../src/calendar/events';
import type { MyEvent } from '../../src/calendar/myEvents';
import { hourRange, lanes, snapSlot, isOpen, SLOT_MIN, BLOCK_MS } from '../../src/calendar/grid';
import { timeOnly, TZ } from './shared';

const SLOT_PX = 26;
const dayHead = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' });
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
const short = (t: number) => timeOnly(t).replace(/\s?[AP]M$/, '');

type Drag = { key: string; x0: number; y0: number; grab: number; moved: boolean; day: number; slot: number };
/** One block on the grid: a contact's appointment/callback/result, or one of the agent's own events. */
type Block = { key: string; at: number; len: number; name: string; company: string; label: string; kind: string; tone: string; movable: boolean };

export function WeekGrid({ days, items, mine, today, now, sel, onPick, canMove, onMove, onMoveMine, onSlot, onMenu, nameOf, tone }: {
  days: number[]; items: CalItem[]; mine: MyEvent[]; today: number; now: number; sel: string | null;
  onPick: (key: string) => void; canMove: (it: CalItem) => boolean; onMove: (it: CalItem, at: number) => void;
  onMoveMine: (id: string, at: number) => void; onSlot: (at: number) => void; onMenu: (key: string, x: number, y: number) => void;
  nameOf: (it: CalItem) => { name: string; company: string }; tone: (it: CalItem) => string;
}) {
  const dayOf = (at: number) => days.findIndex((t, i) => at >= t && at < (days[i + 1] ?? t + 86_400_000));
  const allDay = items.filter(it => it.allDay);
  const blocks: Block[] = [
    ...items.filter(it => !it.allDay).map(it => { const n = nameOf(it); return { key: it.key, at: it.at, len: BLOCK_MS, name: n.name, company: n.company, label: it.label, kind: it.kind, tone: tone(it), movable: canMove(it) }; }),
    ...mine.map(e => ({ key: 'm' + e.id, at: e.start, len: e.mins * 60_000, name: e.title, company: e.note ?? '', label: 'My event', kind: 'mine', tone: 'grey', movable: true })),
  ].filter(b => dayOf(b.at) >= 0);
  const minsOf = (at: number) => Math.round((at - days[dayOf(at)]) / 60_000);
  const [first, last] = hourRange(blocks.flatMap(b => [minsOf(b.at), minsOf(b.at) + b.len / 60_000 - SLOT_MIN]));
  const slots = (last - first) * (60 / SLOT_MIN);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<{ day: number; slot: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const slotAt = (day: number, slot: number) => days[day] + (first * 60 + slot * SLOT_MIN) * 60_000;
  const where = (x: number, y: number, grab: number) => {
    let day = -1;
    cols.current.forEach((el, i) => { const r = el?.getBoundingClientRect(); if (r && x >= r.left && x < r.right) day = i; });
    if (day < 0) return null;
    const r = cols.current[day]!.getBoundingClientRect();
    return { day, slot: snapSlot(((y - r.top - grab) / SLOT_PX) * SLOT_MIN, first, last) };
  };

  // scroll to about an hour before now (or 8 AM) the first time
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const nowMin = Math.round((now - today) / 60_000);
    const target = nowMin > first * 60 && nowMin < last * 60 ? nowMin - 60 : 8 * 60;
    el.scrollTop = Math.max(0, ((target - first * 60) / SLOT_MIN) * SLOT_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!drag) return;
    document.body.classList.add('dragging');
    window.getSelection()?.removeAllRanges();
    const move = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      e.preventDefault();
      const moved = d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 5;
      const w = moved ? where(e.clientX, e.clientY, d.grab) : null;
      setDrag({ ...d, moved, ...(w ?? {}) });
    };
    const up = () => {
      const d = dragRef.current; setDrag(null);
      if (!d) return;
      const b = blocks.find(x => x.key === d.key);
      if (!d.moved || !b) { onPick(d.key); return; }
      const at = slotAt(d.day, d.slot);
      if (at === b.at) { onPick(d.key); return; }
      if (b.kind === 'mine') onMoveMine(b.key.slice(1), at);
      else { const it = items.find(x => x.key === b.key); if (it) onMove(it, at); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { document.body.classList.remove('dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const startDrag = (e: React.PointerEvent, b: Block) => {
    if (e.button !== 0 || !b.movable) return;
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({ key: b.key, x0: e.clientX, y0: e.clientY, grab: Math.min(e.clientY - r.top, SLOT_PX - 4), moved: false, day: dayOf(b.at), slot: Math.round((minsOf(b.at) - first * 60) / SLOT_MIN) });
  };

  const nowMin = (now - today) / 60_000;
  const dragging = drag?.moved ? blocks.find(x => x.key === drag.key) : undefined;
  const ghostAt = dragging && drag ? slotAt(drag.day, drag.slot) : 0;

  return (
    <section className="panel wgrid">
      <div className="wg-head">
        <div className="wg-gut" />
        {days.map(t => <div key={t} className={`wg-dh ${t === today ? 'today' : ''}`}><span>{dayHead.format(t)}</span><b>{dayNum.format(t)}</b>{t === today && <em>Today</em>}</div>)}
      </div>
      {allDay.length > 0 && <div className="wg-all">
        <div className="wg-gut"><span>Any time</span></div>
        {days.map((t, i) => <div key={t} className="wg-allday">
          {allDay.filter(it => dayOf(it.at) === i).map(it => { const n = nameOf(it); return (
            <button key={it.key} className={`wg-chip ${it.kind} ${sel === it.key ? 'on' : ''}`} onClick={() => onPick(it.key)} onContextMenu={e => { e.preventDefault(); onPick(it.key); onMenu(it.key, e.clientX, e.clientY); }} title={`${n.name} · ${it.label}`}>
              {n.name} <i className={`spill ${tone(it)}`}>{it.label}</i></button>); })}
        </div>)}
      </div>}
      <div className="wg-body" ref={scroller}>
        <div className="wg-gut wg-hours" style={{ height: slots * SLOT_PX }}>
          {Array.from({ length: last - first }, (_, h) => <span key={h} style={{ top: h * 2 * SLOT_PX }}>{hourLabel(first + h)}</span>)}
        </div>
        {days.map((t, i) => {
          const here = blocks.filter(b => dayOf(b.at) === i);
          const lay = lanes(here.map(b => ({ key: b.key, start: b.at, len: b.len })));
          const others = here.filter(b => b.key !== drag?.key);
          const starts = others.filter(b => b.kind !== 'mine').map(b => b.at);
          const busy = others.filter(b => b.kind === 'mine').map(b => ({ start: b.at, len: b.len }));
          const free = (at: number) => isOpen(starts, at, busy);
          const past = t < today;
          const hoverAt = hover?.day === i ? slotAt(i, hover.slot) : 0;
          return (
            <div key={t} ref={el => { cols.current[i] = el; }} className={`wg-col ${t === today ? 'today' : ''} ${past ? 'past' : ''}`} style={{ height: slots * SLOT_PX }}
              onMouseMove={e => { if (drag) return; const r = e.currentTarget.getBoundingClientRect(); const slot = Math.floor((e.clientY - r.top) / SLOT_PX); setHover(slot >= 0 && slot < slots ? { day: i, slot } : null); }}
              onMouseLeave={() => setHover(null)}
              onClick={e => { if (drag || e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); const slot = Math.floor((e.clientY - r.top) / SLOT_PX); if (slot >= 0 && slot < slots) onSlot(slotAt(i, slot)); }}>
              {Array.from({ length: slots }, (_, s) => <div key={s} className={`wg-slot ${s % 2 ? 'half' : ''}`} style={{ top: s * SLOT_PX, height: SLOT_PX }} />)}
              {hoverAt > 0 && !drag && hoverAt >= now && free(hoverAt) &&
                <div className="wg-open" style={{ top: hover!.slot * SLOT_PX, height: SLOT_PX }}>+ {timeOnly(hoverAt)} open</div>}
              {t === today && nowMin >= first * 60 && nowMin <= last * 60 && <div className="wg-now" style={{ top: ((nowMin - first * 60) / SLOT_MIN) * SLOT_PX }} />}
              {here.map(b => {
                const l = lay.get(b.key) ?? { lane: 0, of: 1 };
                const top = ((minsOf(b.at) - first * 60) / SLOT_MIN) * SLOT_PX;
                const h = Math.max(1, b.len / BLOCK_MS) * SLOT_PX;
                return (
                  <button key={b.key} type="button"
                    className={`wg-ev ${b.kind} ${sel === b.key ? 'on' : ''} ${b.movable ? 'movable' : ''} ${b.len > BLOCK_MS ? 'tall' : ''} ${drag?.key === b.key && drag.moved ? 'lifted' : ''}`}
                    style={{ top: top + 1, height: h - 2, left: `calc(${(100 / l.of) * l.lane}% + 2px)`, width: `calc(${100 / l.of}% - 4px)` }}
                    title={`${timeOnly(b.at)}${b.len > BLOCK_MS ? '–' + timeOnly(b.at + b.len) : ''} · ${b.name}${b.company ? ' · ' + b.company : ''} · ${b.label}${b.movable ? '\nDrag to move' : ''}`}
                    onPointerDown={e => startDrag(e, b)}
                    onContextMenu={e => { e.preventDefault(); onPick(b.key); onMenu(b.key, e.clientX, e.clientY); }}
                    onClick={() => { if (!b.movable) onPick(b.key); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onPick(b.key); }}>
                    <b>{short(b.at)}</b> <span>{b.name}</span>
                    {l.of === 1 && b.kind !== 'mine' && <i className={`dot ${b.tone}`} />}
                  </button>
                );
              })}
              {dragging && drag?.day === i && (() => {
                const bad = ghostAt < now, ok = free(ghostAt);
                return <div className={`wg-ghost ${bad ? 'bad' : ok ? '' : 'busy'}`} style={{ top: drag.slot * SLOT_PX + 1, height: Math.max(1, dragging.len / BLOCK_MS) * SLOT_PX - 2 }}>
                  {timeOnly(ghostAt)} · {dragging.name}{bad ? ' (past)' : ok ? '' : ' (overlaps)'}</div>;
              })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}

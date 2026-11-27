'use client';
// The Appointments week as a real calendar (George, 2026-11-26): hours down the side, every appointment a
// 30-minute block, open time left empty, and appointments and callbacks dragged to a new half hour.
import { useEffect, useRef, useState } from 'react';
import type { CalItem } from '../../src/calendar/events';
import { hourRange, lanes, snapSlot, isOpen, SLOT_MIN } from '../../src/calendar/grid';
import { timeOnly, TZ } from './shared';

const SLOT_PX = 26;
const dayHead = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' });
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

type Drag = { key: string; x0: number; y0: number; grab: number; moved: boolean; day: number; slot: number };

export function WeekGrid({ days, items, today, now, sel, onPick, canMove, onMove, nameOf, tone }: {
  days: number[]; items: CalItem[]; today: number; now: number; sel: string | null;
  onPick: (key: string) => void; canMove: (it: CalItem) => boolean; onMove: (it: CalItem, at: number) => void;
  nameOf: (it: CalItem) => { name: string; company: string }; tone: (it: CalItem) => string;
}) {
  const dayOf = (at: number) => days.findIndex((t, i) => at >= t && at < (days[i + 1] ?? t + 86_400_000));
  const timed = items.filter(it => !it.allDay);
  const allDay = items.filter(it => it.allDay);
  const minsOf = (it: CalItem) => Math.round((it.at - days[dayOf(it.at)]) / 60_000);
  const [first, last] = hourRange(timed.filter(it => dayOf(it.at) >= 0).map(minsOf));
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
      const it = items.find(x => x.key === d.key);
      if (!d.moved || !it) { onPick(d.key); return; }
      const at = slotAt(d.day, d.slot);
      if (at !== it.at) onMove(it, at); else onPick(d.key);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { document.body.classList.remove('dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const startDrag = (e: React.PointerEvent, it: CalItem) => {
    if (e.button !== 0) return;
    if (!canMove(it)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const day = dayOf(it.at);
    setDrag({ key: it.key, x0: e.clientX, y0: e.clientY, grab: e.clientY - r.top, moved: false, day, slot: Math.round((minsOf(it) - first * 60) / SLOT_MIN) });
  };

  const nowMin = (now - today) / 60_000;
  const dragging = drag?.moved ? items.find(x => x.key === drag.key) : undefined;
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
            <button key={it.key} className={`wg-chip ${it.kind} ${sel === it.key ? 'on' : ''}`} onClick={() => onPick(it.key)} title={`${n.name} · ${it.label}`}>
              {n.name} <i className={`spill ${tone(it)}`}>{it.label}</i></button>); })}
        </div>)}
      </div>}
      <div className="wg-body" ref={scroller}>
        <div className="wg-gut wg-hours" style={{ height: slots * SLOT_PX }}>
          {Array.from({ length: last - first }, (_, h) => <span key={h} style={{ top: h * 2 * SLOT_PX }}>{hourLabel(first + h)}</span>)}
        </div>
        {days.map((t, i) => {
          const mine = timed.filter(it => dayOf(it.at) === i);
          const lay = lanes(mine.map(it => ({ key: it.key, start: it.at })));
          const starts = mine.filter(it => it.key !== drag?.key).map(it => it.at);
          const past = t < today;
          return (
            <div key={t} ref={el => { cols.current[i] = el; }} className={`wg-col ${t === today ? 'today' : ''} ${past ? 'past' : ''}`} style={{ height: slots * SLOT_PX }}
              onMouseMove={e => { if (drag) return; const r = e.currentTarget.getBoundingClientRect(); const slot = Math.floor((e.clientY - r.top) / SLOT_PX); setHover(slot >= 0 && slot < slots ? { day: i, slot } : null); }}
              onMouseLeave={() => setHover(null)}>
              {Array.from({ length: slots }, (_, s) => <div key={s} className={`wg-slot ${s % 2 ? 'half' : ''}`} style={{ top: s * SLOT_PX, height: SLOT_PX }} />)}
              {hover?.day === i && !drag && slotAt(i, hover.slot) >= now && isOpen(starts, slotAt(i, hover.slot)) &&
                <div className="wg-open" style={{ top: hover.slot * SLOT_PX, height: SLOT_PX }}>Open · {timeOnly(slotAt(i, hover.slot))}</div>}
              {t === today && nowMin >= first * 60 && nowMin <= last * 60 && <div className="wg-now" style={{ top: ((nowMin - first * 60) / SLOT_MIN) * SLOT_PX }} />}
              {mine.map(it => {
                const n = nameOf(it), l = lay.get(it.key) ?? { lane: 0, of: 1 };
                const top = ((minsOf(it) - first * 60) / SLOT_MIN) * SLOT_PX;
                const movable = canMove(it);
                return (
                  <button key={it.key} type="button"
                    className={`wg-ev ${it.kind} ${sel === it.key ? 'on' : ''} ${movable ? 'movable' : ''} ${drag?.key === it.key && drag.moved ? 'lifted' : ''}`}
                    style={{ top: top + 1, height: SLOT_PX - 2, left: `calc(${(100 / l.of) * l.lane}% + 2px)`, width: `calc(${100 / l.of}% - 4px)` }}
                    title={`${timeOnly(it.at)} · ${n.name}${n.company ? ' · ' + n.company : ''} · ${it.label}${movable ? '\nDrag to move' : ''}`}
                    onPointerDown={e => startDrag(e, it)}
                    onClick={() => { if (!movable) onPick(it.key); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onPick(it.key); }}>
                    <b>{timeOnly(it.at).replace(/\s?[AP]M$/, '')}</b> <span>{n.name}</span>
                    {l.of === 1 && <i className={`dot ${tone(it)}`} />}
                  </button>
                );
              })}
              {dragging && drag?.day === i && <div className={`wg-ghost ${ghostAt < now ? 'bad' : isOpen(starts, ghostAt) ? '' : 'busy'}`} style={{ top: drag.slot * SLOT_PX + 1, height: SLOT_PX - 2 }}>
                {timeOnly(ghostAt)} · {nameOf(dragging).name}{ghostAt < now ? ' (past)' : isOpen(starts, ghostAt) ? '' : ' (overlaps)'}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

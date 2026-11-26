// Small chart pieces for the Results pages. Plain HTML and SVG so they stay sharp, follow day/night,
// and every mark shows its exact numbers on hover (data-tip).
'use client';
import type { ReactNode } from 'react';

export const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtK = (n: number) => (n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : fmt$(n));
export const pctTxt = (a: number, b: number) => (b > 0 ? Math.round(100 * a / b) + '%' : '—');

/** Series colors by meaning, the same on every chart (see globals.css --s-*). */
export type Hue = 'dials' | 'connects' | 'sched' | 'pres' | 'sold' | 'trial' | 'noshow' | 'callback' | 'muted' | 'a1' | 'a2' | 'a3';

export function Panel({ title, meta, children, foot, span = 1, className = '' }: { title: ReactNode; meta?: ReactNode; children: ReactNode; foot?: ReactNode; span?: number; className?: string }) {
  return (
    <section className={`panel rp span${span} ${className}`}>
      <div className="rph"><h3>{title}</h3>{meta && <span>{meta}</span>}</div>
      <div className="rpb">{children}</div>
      {foot && <div className="rpf">{foot}</div>}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = '' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return <div className="kpi"><span>{label}</span><b className={tone}>{value}</b>{sub && <small>{sub}</small>}</div>;
}

export function Legend({ items }: { items: [Hue, string][] }) {
  return <span className="lg">{items.map(([h, l]) => <span key={l}><i className={`sw ${h}`} />{l}</span>)}</span>;
}

/** Props that make a chart mark clickable: it opens the records behind it. */
const pickable = (on?: () => void, label?: string) => on ? {
  role: 'button', tabIndex: 0, 'aria-label': label, onClick: on,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on(); } },
} : {};

/** Vertical columns. Each column can hold up to two series side by side, or stacked. Click a column to open what's in it. */
export function Columns({ cols, height = 150, stacked = false, labelEvery = 1, max: max0, ref, showValues = false, onPick, sel }: {
  cols: { label: string; sub?: string; tip?: string; bars: { v: number; hue: Hue; tip?: string }[]; dim?: boolean; on?: boolean; empty?: boolean }[];
  height?: number; stacked?: boolean; labelEvery?: number; max?: number; ref?: { v: number; label: string }; showValues?: boolean;
  onPick?: (i: number) => void; sel?: number | null;
}) {
  const max = Math.max(max0 ?? 0, ref?.v ?? 0, ...cols.map(c => (stacked ? c.bars.reduce((a, b) => a + b.v, 0) : Math.max(0, ...c.bars.map(b => b.v)))), 1);
  return (
    <div className={`cols ${onPick ? 'picks' : ''}`} style={{ ['--h' as string]: height + 'px' }}>
      <div className="plot">
        {ref && <div className="refline" style={{ bottom: `${100 * ref.v / max}%` }}><span>{ref.label}</span></div>}
        {cols.map((c, i) => {
          const tot = c.bars.reduce((a, b) => a + b.v, 0);
          const pick = onPick && !c.empty && tot > 0 ? () => onPick(i) : undefined;
          return (
            <div className={`col ${c.dim ? 'dim' : ''} ${c.on ? 'on' : ''} ${sel === i ? 'sel' : ''} ${pick ? 'pick' : ''}`} key={i} data-tip={c.tip}
              {...pickable(pick, c.tip)}>
              {stacked
                ? tot > 0 && <div className="stack" style={{ height: `${100 * tot / max}%` }}>
                    {c.bars.filter(b => b.v > 0).map((b, j) => <i key={j} className={`bar ${b.hue}`} style={{ flexGrow: b.v }} data-tip={b.tip} />)}
                    {showValues && <em>{tot}</em>}
                  </div>
                : c.bars.map((b, j) => (
                  <i key={j} className={`bar ${b.hue}`} style={{ height: `${100 * b.v / max}%` }} data-tip={b.tip}>
                    {showValues && b.v > 0 && <em>{b.v}</em>}
                  </i>
                ))}
            </div>
          );
        })}
      </div>
      <div className="xax">{cols.map((c, i) => <span key={i}>{i % labelEvery === 0 || (i === cols.length - 1 && i % labelEvery >= labelEvery / 2) ? c.label : ''}{c.sub && <small>{c.sub}</small>}</span>)}</div>
    </div>
  );
}

/** Rows with a label, a count, a bar and a rate: the sheet's "by hour / by state" tables. */
export function Rows({ rows, head, hue = 'dials', onPick }: {
  rows: { label: string; n?: ReactNode; frac: number; right: ReactNode; dim?: boolean; hue?: Hue; tip?: string }[];
  head?: [string, string, string, string]; hue?: Hue; onPick?: (i: number) => void;
}) {
  return (
    <div className="rows">
      {head && <div className="rr hd"><span>{head[0]}</span><span>{head[1]}</span><span>{head[2]}</span><span>{head[3]}</span></div>}
      {rows.map((r, i) => (
        <div className={`rr ${onPick ? 'pick' : ''}`} key={r.label} data-tip={r.tip} {...pickable(onPick ? () => onPick(i) : undefined, r.label)}>
          <span className="l">{r.label}</span><span className="n">{r.n}</span>
          <span className="track"><i className={`${r.dim ? 'muted' : r.hue ?? hue}`} style={{ width: `${Math.max(0, Math.min(1, r.frac)) * 100}%` }} /></span>
          <span className="v">{r.right}</span>
        </div>
      ))}
    </div>
  );
}

/** A donut with a 2px gap between slices, and its table beside it. */
export function Donut({ rows, total, center, onPick, sel }: { rows: { label: string; count: number; slot: number }[]; total: number; center?: ReactNode;
  onPick?: (i: number) => void; sel?: number | null }) {
  const r = 70, w = 26, c = 2 * Math.PI * r;
  const sum = rows.reduce((a, x) => a + x.count, 0) || 1;
  let acc = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" role="img" aria-label="Share of objections">
        <circle cx="90" cy="90" r={r} className="ring" strokeWidth={w} fill="none" />
        {rows.map((x, i) => {
          if (x.count <= 0) return null;
          const len = c * x.count / sum, gap = Math.min(2, len / 3);
          const el = <circle key={x.label} cx="90" cy="90" r={r} fill="none" strokeWidth={sel === i ? w + 8 : w}
            className={`slot${x.slot} ${onPick ? 'pick' : ''} ${sel != null && sel !== i ? 'fade' : ''}`} onClick={onPick ? () => onPick(i) : undefined}
            data-tip={`${x.label}: ${x.count} (${pctTxt(x.count, total)})`}
            strokeDasharray={`${Math.max(len - gap, 0)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)" />;
          acc += len;
          return el;
        })}
        {center && <foreignObject x="45" y="62" width="90" height="56"><div className="dc">{center}</div></foreignObject>}
      </svg>
      <div className="dtable">
        <div className="dr hd"><span>Objection</span><span>Count</span><span>Share</span></div>
        {rows.map((x, i) => <div className={`dr ${onPick && x.count ? 'pick' : ''} ${sel === i ? 'sel' : ''}`} key={x.label} {...pickable(onPick && x.count ? () => onPick(i) : undefined, x.label)}><span><i className={`sw slot${x.slot}`} />{x.label}</span><span>{x.count}</span><span>{pctTxt(x.count, total)}</span></div>)}
      </div>
    </div>
  );
}

/** One bar split into parts (where the dials went). */
export function Split({ parts }: { parts: { label: string; count: number; cls: string }[] }) {
  const tot = parts.reduce((a, p) => a + p.count, 0) || 1;
  return (
    <div className="split">
      {parts.filter(p => p.count > 0).map(p => <i key={p.label} className={p.cls} style={{ flexGrow: p.count }} data-tip={`${p.label}: ${p.count.toLocaleString('en-US')} · ${pctTxt(p.count, tot)}`} />)}
    </div>
  );
}

export function Delta({ now, before, money = false }: { now: number; before: number; money?: boolean }) {
  if (!before) return <span className="dl0">{now ? 'new' : '—'}</span>;
  const d = (now - before) / before, up = d >= 0;
  return <span className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}%{money ? '' : ''}</span>;
}

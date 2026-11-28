'use client';
// Sound bars on the live call button (George, 2026-11-28): on a Dispatch call they follow the real voices
// (Twilio reports how loud the agent's mic and the contact are, about 10 times a second). The contact's
// voice shows green, the agent's white. On Quo calls there is no sound to read, so the bars just breathe.
import { useEffect, useRef, type MutableRefObject } from 'react';

const SHAPE = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];

export function LiveWave({ level }: { level?: MutableRefObject<{ i: number; o: number }> | null }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!level || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const bars = Array.from(box.current?.children ?? []) as HTMLElement[];
    const h = SHAPE.map(() => 4);
    let raf = 0, t0 = performance.now();
    const tick = (now: number) => {
      const { i, o } = level.current;
      const loud = Math.max(i, o);
      // speech sits around 0.02 to 0.3, so lift the quiet end
      const v = Math.min(1, Math.sqrt(loud) * 1.7);
      const t = (now - t0) / 1000;
      const them = o >= i;
      box.current?.classList.toggle('them', them && v > 0.08);
      box.current?.classList.toggle('me', !them && v > 0.08);
      bars.forEach((b, k) => {
        const wobble = 0.75 + 0.25 * Math.sin(t * 9 + k * 1.7) * Math.sin(t * 5.3 + k);
        const target = 4 + 20 * v * SHAPE[k] * wobble;
        h[k] += (target - h[k]) * (target > h[k] ? 0.45 : 0.18);   // quick up, soft down
        b.style.height = `${h[k].toFixed(1)}px`;
      });
      raf = requestAnimationFrame(tick);
    };
    box.current?.classList.add('voice');
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return <span className="wave lw" ref={box} aria-hidden>{SHAPE.map((_, k) => <i key={k} />)}</span>;
}

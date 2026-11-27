// Morning Wisdom library checks (George's brief, Step 8 quality checks).
import { describe, expect, it } from 'vitest';
import { WISDOM, WISDOM_THEMES, wisdomOfDay } from '../src/home/wisdom';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const plain = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

describe('Morning Wisdom library', () => {
  it('has unique ids, no duplicate quotes, and every field filled', () => {
    expect(new Set(WISDOM.map(w => w.id)).size).toBe(WISDOM.length);
    expect(new Set(WISDOM.map(w => plain(w.text))).size).toBe(WISDOM.length);
    for (const w of WISDOM) for (const k of ['text', 'by', 'source', 'meaning', 'reflect', 'intent'] as const) expect(w[k].trim(), `${w.id} ${k}`).not.toBe('');
  });
  it('keeps explanations and reflections about 20 to 45 words, intentions short', () => {
    for (const w of WISDOM) {
      expect(words(w.meaning), w.id).toBeGreaterThanOrEqual(15); expect(words(w.meaning), w.id).toBeLessThanOrEqual(45);
      expect(words(w.reflect), w.id).toBeGreaterThanOrEqual(15); expect(words(w.reflect), w.id).toBeLessThanOrEqual(45);
      expect(words(w.intent), w.id).toBeLessThanOrEqual(12);
    }
    expect(new Set(WISDOM.map(w => plain(w.reflect))).size).toBe(WISDOM.length);
    expect(new Set(WISDOM.map(w => plain(w.meaning))).size).toBe(WISDOM.length);
  });
  it('names a translator for every translation and uses the King James Version for scripture', () => {
    for (const w of WISDOM) {
      if (w.kind === 'translation') expect(w.source, w.id).toMatch(/trans\.|rendered/);
      if (w.kind === 'spoken') expect(w.source, w.id).toMatch(/\d{4}, at \d/);
      if (/^\d? ?[A-Z][a-z]+ \d+:\d/.test(w.by)) expect(w.source, w.id).toBe('King James Version');
    }
  });
  it('covers all 12 themes with at least 8 entries each', () => {
    for (const [t] of WISDOM_THEMES) expect(WISDOM.filter(w => w.theme === t).length, t).toBeGreaterThanOrEqual(8);
  });
  it('changes theme every day, walks every entry, and is the same all day', () => {
    const seen = new Set<string>();
    let last = '';
    for (let i = 0; i < 2000; i++) {
      const w = wisdomOfDay(2027, 1, 1 + i, 'George');
      expect(w.theme).not.toBe(last); last = w.theme; seen.add(w.id);
    }
    expect(seen.size).toBe(WISDOM.length);
    expect(wisdomOfDay(2026, 11, 27, 'George')).toEqual(wisdomOfDay(2026, 11, 27, 'George'));
  });
});

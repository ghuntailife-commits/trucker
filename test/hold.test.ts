import { describe, expect, it } from 'vitest';
import { hold, resume, isHeld, holdLabel, REST_DAYS } from '../src/rules/hold';
import { buildToday } from '../src/rules/today';
import { DEFAULT_CONFIG } from '../src/rules/config';
import type { Contact } from '../src/rules/types';

const tz = 'America/New_York', now = Date.UTC(2026, 10, 27, 16);
const c0 = { id: 'a', list: 'Texas', tag: '', dials: 0, first: 'Avery', last: 'Test', phone: '(214) 555-0100', job: '', company: 'Acme', city: 'Dallas', state: 'TX',
  backup: '', notes: '', lastDialed: null, status: '', callAt: null, linkedin: '', zone: 'CT', newNumberMark: null, callbackTries: 0, noShowTries: 0, swapMemo: null, seq: 1 } as Contact;
const ctx = { now, snap: 0, savedOrder: [] };

describe('pause and rest', () => {
  it('rests for 75 days, then the contact comes back by itself', () => {
    const r = hold(c0, 'rest', now, tz);
    expect(isHeld(r, now)).toBe(true); expect(holdLabel(r, now, tz)).toMatch(/^Resting until /);
    expect(r.notes).toMatch(/Rested by you for 75 days/);
    expect(isHeld(r, now + REST_DAYS * 86_400_000 + 1)).toBe(false);
  });
  it('pauses until resumed, and Today leaves held contacts out', () => {
    const p = hold(c0, 'pause', now, tz);
    expect(holdLabel(p, now + 1e12, tz)).toBe('Paused');
    const cfg = { ...DEFAULT_CONFIG, callHours: null };
    expect(buildToday([c0], ctx, cfg).length).toBe(1);
    expect(buildToday([p], ctx, cfg).length).toBe(0);
    const back = resume(p, now, tz);
    expect(isHeld(back, now)).toBe(false); expect(back.notes).toMatch(/Pause ended by you/);
    expect(buildToday([back], ctx, cfg).length).toBe(1);
  });
});

// The call brief. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { buildBrief, briefKind, readResearch } from '../src/brief/brief';
import { TAGS } from '../src/rules/tags';

const cfg = { callbackTries: 3, noShowTries: 4 };
const now = et(26, 10);

describe('call brief', () => {
  it('only callbacks, follow-ups and no-shows get one', () => {
    expect(briefKind('Callback')).toBe('callback');
    expect(briefKind('Follow-up · 11/20')).toBe('followUp');
    expect(briefKind('No-show · 11/25')).toBe('noshow');
    expect(briefKind('Fresh')).toBeNull();
    expect(briefKind('Retry')).toBeNull();
  });
  it('reads age, years at the job and an old backup from the research notes', () => {
    const r = readResearch('Matched Avery Quinn Test, 41, Dallas, TX - sole result. LinkedIn: Driver at Acme since May 2015. Backup number is dated (Aug 2024). | 11/21: Callback Sat 11/21 3:30 PM');
    expect(r).toEqual({ age: 41, since: 'May 2015', oldBackup: 'Aug 2024' });
  });
  it('callback: times they asked for, the try count, and when to call', () => {
    const c = contact({ first: 'Avery', tag: TAGS.callback, callbackTries: 1, callAt: et(24, 20, 30),
      notes: 'Matched Avery Test, 41, Dallas, TX. Driver at Acme since May 2015. | 11/21: Callback Sat 11/21 3:30 PM | 11/24: Callback Tue 11/24 8:30 PM | 11/25: Callback try 1 of 3, no answer' });
    const b = buildBrief({ c, kind: 'callback', agent: 'Sam', now, tz: TZ, cfg });
    expect(b.who).toBe('Avery, 41, Dallas TX. Driver at Acme Freight since May 2015, 11 years in.');
    expect(b.stands).toContain('Asked for a callback 2 times');
    expect(b.stands).toContain('try 2 of 3');
    expect(b.openWith).toContain("it's Sam, calling back like you asked");
    expect(b.watch[0]).toMatch(/outside work hours/);
  });
  it('follow-up: what stopped the sale, how late it is, and an opener that fits', () => {
    const c = contact({ first: 'Riley', tag: TAGS.presented, notes: 'Riley Test, 24, Dallas, TX. | 11/19: Presented, no sale - Timing' });
    const b = buildBrief({ c, kind: 'followUp', agent: 'Sam', now, tz: TZ, cfg,
      noSale: { at: et(19, 13), contactId: c.id, objections: ['Timing'], reason: 'Need to get account number', followUp: '2026-11-20', followUpNote: '', calledInto: false } });
    expect(b.stands).toBe('Presented 11/19, no sale (Timing: Need to get account number). Follow-up was set for 11/20, 6 days ago.');
    expect(b.openWith).toContain('needed your account number');
    expect(b.watch[0]).toMatch(/waiting on paperwork/);
  });
  it('no-show: the missed time, the try count, and evenings for a daytime booking', () => {
    const c = contact({ first: 'Quinn', tag: TAGS.noshow, noShowTries: 1,
      notes: 'Quinn Test, 37, Dallas, TX. | 11/23: Scheduled Tue 11/24 10:00 AM | 11/24: No-showed (appt 11/24 10:00 AM) | 11/25: No-show try 1 of 4, no answer' });
    const b = buildBrief({ c, kind: 'noshow', agent: 'Sam', now, tz: TZ, cfg, noShowRate: 0.45 });
    expect(b.stands).toBe('Missed the appointment on 11/24 (appt 11/24 10:00 AM). No-show try 2 of 4.');
    expect(b.openWith).toContain('Is evening better');
    expect(b.watch.join(' ')).toMatch(/Offer after 6 PM/);
    expect(b.watch.join(' ')).toMatch(/45%/);
  });
});

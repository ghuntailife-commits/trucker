// Every follow-up rule in brief section 6, checked against how the v27 sheet behaves.
import { describe, it, expect } from 'vitest';
import { dial, disposition, setPhone, quickNote, dialerAction, backupTry, knownBad } from '../src/rules/engine';
import { TAGS } from '../src/rules/tags';
import { nextAction, whyLabel } from '../src/rules/schedule';
import { parseWhen } from '../src/rules/parseWhen';
import { DEFAULT_CONFIG as CFG } from '../src/rules/config';
import { DAY_MS, startOfDay, zoned } from '../src/rules/time';
import { contact, et, MIN, TZ } from './helpers';

/** Dial the same contact k times, one day apart, starting on day d. */
function dialTimes(c: ReturnType<typeof contact>, k: number, d = 2) {
  let x = c;
  for (let i = 0; i < k; i++) x = dial(x, et(d + i, 10), CFG).contact;
  return x;
}

describe('Dial +1', () => {
  it('adds a dial, stamps Last dialed and logs one Dial row', () => {
    const r = dial(contact(), et(2, 10));
    expect(r.contact.dials).toBe(1);
    expect(r.contact.lastDialed).toBe(et(2, 10));
    expect(r.events.map(e => e.kind)).toEqual(['Dial']);
  });
  it('ignores a second Dial +1 within 2 minutes as a double click', () => {
    const a = dial(contact(), et(2, 10)).contact;
    const b = dial(a, et(2, 10) + 119_000);
    expect(b.ignored).toBe(true);
    expect(b.contact.dials).toBe(1);
    expect(b.events).toHaveLength(0);
  });
  it('counts a dial again after 2 minutes', () => {
    const a = dial(contact(), et(2, 10)).contact;
    expect(dial(a, et(2, 10) + 2 * MIN).contact.dials).toBe(2);
  });
});

describe('Callback tries', () => {
  const cb = (callAt: number) => contact({ tag: TAGS.callback, callAt, dials: 2, lastDialed: et(1, 9), status: 'Good' });
  it('does not count a try while the callback day is still in the future', () => {
    const r = dial(cb(et(5, 14)), et(3, 10));
    expect(r.contact.callbackTries).toBe(0);
    expect(r.contact.tag).toBe(TAGS.callback);
  });
  it('counts tries 1 and 2 with dated notes, keeps the tag', () => {
    let x = dial(cb(et(3, 9)), et(3, 10)).contact;
    expect(x.callbackTries).toBe(1);
    expect(x.notes).toBe('11/3: Callback try 1 of 3, no answer');
    x = dial(x, et(4, 10)).contact;
    expect(x.callbackTries).toBe(2);
    expect(x.tag).toBe(TAGS.callback);
  });
  it('after the 3rd miss clears the tag and Call At, back to normal retries', () => {
    let x = cb(et(3, 9));
    for (let d = 3; d <= 5; d++) x = dial(x, et(d, 10)).contact;
    expect(x.tag).toBe('');
    expect(x.callAt).toBeNull();
    expect(x.callbackTries).toBe(0);
    expect(x.notes.endsWith('11/5: Callback try 3 of 3, no answer - back to normal retries')).toBe(true);
  });
  it('a new callback time from the quick note box restarts the count', () => {
    const x = dial(cb(et(3, 9)), et(3, 10)).contact;
    const y = quickNote(x, 'tomorrow 2pm', et(3, 10, 5)).contact;
    expect(y.callbackTries).toBe(0);
    expect(y.callAt).toBe(et(4, 14));
  });
});

describe('No-show tries', () => {
  const ns = () => contact({ tag: TAGS.noshow, dials: 3, lastDialed: et(1, 9), status: 'Good' });
  it('counts 3 tries and keeps the tag', () => {
    let x = ns();
    for (let d = 2; d <= 4; d++) x = dial(x, et(d, 10)).contact;
    expect(x.noShowTries).toBe(3);
    expect(x.tag).toBe(TAGS.noshow);
  });
  it('after the 4th try goes back to normal retries', () => {
    let x = ns();
    for (let d = 2; d <= 5; d++) x = dial(x, et(d, 10)).contact;
    expect(x.tag).toBe('');
    expect(x.callAt).toBeNull();
    expect(x.notes.endsWith('11/5: No-show try 4 of 4, no answer - back to normal retries')).toBe(true);
  });
  it('a no-show disposition adds a dated note with the real appointment time', () => {
    const c = contact({ tag: TAGS.scheduled, callAt: et(4, 18), dials: 2, lastDialed: et(3, 9), status: 'Good' });
    const r = disposition(c, TAGS.noshow, et(5, 9), CFG, { apptAt: et(4, 19, 30) });
    expect(r.contact.notes).toBe('11/4: No-showed (appt 11/4 7:30 PM)');
    expect(whyLabel(r.contact, et(5, 9))).toBe('No-show · 11/4');
    expect(r.contact.callAt).toBeNull();
  });
  it('a new tag restarts the no-show count', () => {
    let x = ns();
    x = dial(x, et(2, 10)).contact;
    expect(x.noShowTries).toBe(1);
    x = disposition(x, TAGS.noshow, et(3, 10)).contact;
    expect(x.noShowTries).toBe(0);
  });
});

describe('Main and backup numbers', () => {
  const withBackup = (over = {}) => contact({ backup: '(214) 555-0999', ...over });
  it('after 7 dials with nobody reached, main and backup swap (status Backup)', () => {
    const c = withBackup();
    const main = c.phone;
    const x6 = dialTimes(c, 6);
    expect(x6.phone).toBe(main);
    const r = dial(x6, et(20, 10));
    expect(r.contact.phone).toBe('(214) 555-0999');
    expect(r.contact.backup).toBe(main);
    expect(r.contact.status).toBe('Backup');
    expect(r.contact.newNumberMark).toBe(7);
    expect(r.events.map(e => e.kind)).toEqual(['Dial', 'Swap']);
    expect(r.contact.notes).toBe('11/20: Main number had 7 dials, no one reached - now dialing the backup');
  });
  it('after 7 more on the backup they swap back and the contact rests', () => {
    const c = withBackup();
    const main = c.phone;
    let x = dialTimes(c, 7);          // swap at dial 7 (day 8)
    x = dialTimes(x, 6, 10);          // dials 8..13
    expect(x.status).toBe('Backup');
    const r = dial(x, et(20, 10));    // dial 14
    expect(r.contact.phone).toBe(main);
    expect(r.contact.status).toBe('');
    expect(r.contact.newNumberMark).toBe(14.5);
    expect(r.contact.callAt).toBe(et(20, 10) + 7 * DAY_MS);
    expect(r.contact.notes.endsWith('11/20: Backup number had 7 dials, no one reached - numbers back in their original positions, resting until 11/27')).toBe(true);
  });
  it('the rest ends when the contact is dialed again', () => {
    const x = withBackup({ dials: 14, newNumberMark: 14.5, callAt: et(27, 10), lastDialed: et(20, 10) });
    const r = dial(x, et(27, 11));
    expect(r.contact.callAt).toBeNull();
    expect(r.contact.dials).toBe(15);
  });
  it('a contact whose main number is Good never swaps on dials', () => {
    const x = dialTimes(withBackup({ status: 'Good' }), 10);
    expect(x.status).toBe('Good');
    expect(x.backup).toBe('(214) 555-0999');
  });
  it('a tagged contact never swaps on dials', () => {
    const x = withBackup({ tag: TAGS.notInterested, dials: 6, lastDialed: et(1, 9) });
    expect(dial(x, et(5, 10)).contact.phone).toBe(x.phone);
  });
  it('does not swap to a backup already known to be bad', () => {
    const x = withBackup({ notes: 'Bad number: (214) 555-0999' });
    expect(dialTimes(x, 9).status).toBe('');
  });
  it('a disposition right after the swapping dial puts the numbers back', () => {
    const c = withBackup();
    const main = c.phone;
    const x6 = dialTimes(c, 6);
    const swapped = dial(x6, et(20, 10)).contact;
    const r = disposition(swapped, TAGS.notInterested, et(20, 10, 3));
    expect(r.contact.phone).toBe(main);
    expect(r.contact.backup).toBe('(214) 555-0999');
    expect(r.contact.notes).toBe('');
    expect(r.contact.dials).toBe(7);  // already dialed today: no extra dial
  });
  it('a disposition 20+ minutes after the swap keeps the swap', () => {
    const swapped = dial(dialTimes(withBackup(), 6), et(20, 10)).contact;
    const r = disposition(swapped, TAGS.notInterested, et(20, 10, 25));
    expect(r.contact.phone).toBe('(214) 555-0999');
  });
});

describe('Bad numbers', () => {
  it('bad main with a good backup: the backup becomes main with new-number priority', () => {
    const c = contact({ backup: '(214) 555-0888', dials: 3, lastDialed: et(1, 9) });
    const main = c.phone;
    const r = disposition(c, TAGS.bad, et(5, 10));
    expect(r.promoted).toBe(true);
    expect(r.contact.phone).toBe('(214) 555-0888');
    expect(r.contact.backup).toBe(main);
    expect(r.contact.status).toBe('Backup');
    expect(r.contact.tag).toBe('');
    expect(r.contact.newNumberMark).toBe(4);
    expect(knownBad(r.contact.notes, main)).toBe(true);
  });
  it('bad backup (in the main spot): numbers go back and the contact rests', () => {
    const c = contact({ phone: '(214) 555-0888', backup: '(214) 555-0101', status: 'Backup', dials: 9, lastDialed: et(1, 9), newNumberMark: 7 });
    const r = disposition(c, TAGS.bad, et(5, 10));
    expect(r.dropped).toBe(true);
    expect(r.contact.phone).toBe('(214) 555-0101');
    expect(r.contact.backup).toBe('(214) 555-0888');
    expect(r.contact.status).toBe('');
    expect(r.contact.tag).toBe('');
    expect(r.contact.callAt).toBe(et(5, 10) + 7 * DAY_MS);
    expect(knownBad(r.contact.notes, '(214) 555-0888')).toBe(true);
  });
  it('bad backup when the original is also known bad: both cleared, goes to Needs Number', () => {
    const c = contact({ phone: '(214) 555-0888', backup: '(214) 555-0101', status: 'Backup', notes: 'Bad number: (214) 555-0101', dials: 9, lastDialed: et(1, 9) });
    const r = disposition(c, TAGS.bad, et(5, 10));
    expect(r.contact.phone).toBe('');
    expect(r.contact.backup).toBe('');
    expect(r.contact.tag).toBe('');
    expect(r.contact.notes.endsWith('11/5: Both numbers bad - needs a new number')).toBe(true);
  });
  it('bad main when the backup is already known bad: both cleared (brief section 6)', () => {
    const c = contact({ backup: '(214) 555-0777', notes: 'Bad number: (214) 555-0777', dials: 2, lastDialed: et(1, 9) });
    const r = disposition(c, TAGS.bad, et(5, 10));
    expect(r.contact.phone).toBe('');
    expect(r.contact.backup).toBe('');
    expect(r.dropped).toBe(true);
  });
  it('bad main and no backup: status Bad, tag stays (Needs New Number)', () => {
    const r = disposition(contact({ dials: 1, lastDialed: et(1, 9) }), TAGS.bad, et(5, 10));
    expect(r.contact.status).toBe('Bad');
    expect(r.contact.tag).toBe(TAGS.bad);
  });
  it('refuses a replacement number already marked bad', () => {
    const c = contact({ phone: '', notes: 'Bad number: (214) 555-0444' });
    expect(setPhone(c, '(214) 555-0444', et(5, 10)).refused).toMatch(/already marked bad/);
  });
  it('bad backup in dialer backup mode removes only the backup', () => {
    const c = contact({ backup: '(214) 555-0333', dials: 3 });
    const r = backupTry(c, 'bad', et(5, 10));
    expect(r.contact.backup).toBe('');
    expect(r.contact.phone).toBe(c.phone);
    expect(r.contact.dials).toBe(3);
    expect(r.events.map(e => e.kind)).toEqual(['Dial', 'Tag']);
  });
});

describe('New numbers', () => {
  it('a typed number gets priority for its next 2 dials and no "Unverified" status', () => {
    const r = setPhone(contact({ phone: '', dials: 5 }), '(214) 555-0222', et(5, 10));
    expect(r.contact.newNumberMark).toBe(5);
    expect(r.contact.status).toBe('');
  });
});

describe('Dispositions count as the day\'s dial once', () => {
  it('first disposition of the day adds a dial', () => {
    const r = disposition(contact({ dials: 2, lastDialed: et(1, 9) }), TAGS.notInterested, et(5, 10));
    expect(r.contact.dials).toBe(3);
    expect(r.events.map(e => e.kind)).toEqual(['Dial', 'Tag']);
    expect(r.contact.status).toBe('Good');
  });
  it('Dial +1 then a disposition the same day: still one dial', () => {
    const a = dial(contact({ dials: 2, lastDialed: et(1, 9) }), et(5, 10)).contact;
    const r = disposition(a, TAGS.callback, et(5, 10, 1), CFG, { when: et(6, 14) });
    expect(r.contact.dials).toBe(3);
    expect(r.contact.callAt).toBe(et(6, 14));
  });
  it.each([TAGS.noshow, TAGS.sold, TAGS.presented, TAGS.given])('%s does not count as a dial', tag => {
    const r = disposition(contact({ dials: 2, lastDialed: et(1, 9) }), tag, et(5, 10));
    expect(r.contact.dials).toBe(2);
  });
  it('Do not call and Given to another agent set status Do Not Call', () => {
    expect(disposition(contact(), TAGS.dnc, et(5, 10)).contact.status).toBe('Do Not Call');
    expect(disposition(contact(), TAGS.given, et(5, 10)).contact.status).toBe('Do Not Call');
  });
  it('scheduled keeps Call At, other tags clear it', () => {
    const c = contact({ tag: TAGS.scheduled, callAt: et(8, 18) });
    expect(disposition(c, TAGS.scheduled, et(5, 10)).contact.callAt).toBe(et(8, 18));
    expect(disposition(c, TAGS.presented, et(8, 20)).contact.callAt).toBeNull();
  });
});

describe('Next action dates', () => {
  it('fresh contacts have none', () => expect(nextAction(contact(), et(5, 10))).toBeNull());
  it('untagged: last dialed + retry days by dial count', () => {
    expect(nextAction(contact({ dials: 1, lastDialed: et(5, 16) }), et(5, 17))).toBe(startOfDay(et(6, 0), TZ));
    expect(nextAction(contact({ dials: 5, lastDialed: et(5, 16) }), et(5, 17))).toBe(startOfDay(et(7, 0), TZ));
    expect(nextAction(contact({ dials: 7, lastDialed: et(5, 16) }), et(5, 17))).toBe(startOfDay(et(8, 0), TZ));
    expect(nextAction(contact({ dials: 12, lastDialed: et(5, 16) }), et(5, 17))).toBe(startOfDay(et(12, 0), TZ));
  });
  it('tagged: by tag; Call At wins; bad / do not call have none', () => {
    expect(nextAction(contact({ tag: TAGS.notInterested, dials: 1, lastDialed: et(1, 9) }), et(1, 10)))
      .toBe(zoned(2027, 1, 15, 0, 0, TZ)); // 75 calendar days after 11/1
    expect(nextAction(contact({ tag: TAGS.callback, dials: 1, lastDialed: et(1, 9), callAt: et(3, 14) }), et(1, 10)))
      .toBe(startOfDay(et(3, 0), TZ));
    expect(nextAction(contact({ tag: TAGS.bad, dials: 1, lastDialed: et(1, 9) }), et(1, 10))).toBeNull();
  });
});

describe('Quick note box', () => {
  it('plain text becomes a dated note', () => {
    const r = quickNote(contact(), 'left vm', et(5, 10));
    expect(r.contact.notes).toBe('11/5: left vm');
    expect(r.contact.tag).toBe('');
  });
  it('a time sets a callback (and counts as the day\'s dial)', () => {
    const r = quickNote(contact({ dials: 1, lastDialed: et(1, 9) }), 'fri 10am', et(5, 10)); // 11/5/2026 is a Thursday
    expect(r.contact.tag).toBe(TAGS.callback);
    expect(r.contact.callAt).toBe(et(6, 10));
    expect(r.contact.dials).toBe(2);
    expect(r.contact.notes).toBe('11/5: Callback Fri 11/6 10:00 AM');
  });
  it('note @ time does both', () => {
    const r = quickNote(contact(), 'wife answered @ tomorrow 2pm', et(5, 10));
    expect(r.contact.notes).toBe('11/5: Callback Fri 11/6 2:00 PM - wife answered');
  });
  it('refuses a time in the past and saves nothing', () => {
    const c = contact();
    const r = quickNote(c, '11/1 2pm', et(5, 10));
    expect(r.refused).toMatch(/already passed/);
    expect(r.contact).toBe(c);
  });
  it('does not set a callback on a contact with another tag', () => {
    const r = quickNote(contact({ tag: TAGS.notInterested }), 'tomorrow 2pm', et(5, 10));
    expect(r.contact.tag).toBe(TAGS.notInterested);
    expect(r.message).toMatch(/NOT set/);
  });
});

describe('Reading times', () => {
  const now = et(5, 10); // Thu 11/5/2026 10:00 AM
  const at = (s: string) => { const w = parseWhen(s, now, TZ, false); return w && 'date' in w ? w.date : w; };
  it.each([
    ['tomorrow 2pm', et(6, 14)], ['fri 10:30am', et(6, 10, 30)], ['11/9 2pm', et(9, 14)], ['in 2 days', et(7, 10)],
    ['3pm', et(5, 15)], ['9am', et(6, 9)], ['noon', et(5, 12)], ['thu 9am', et(12, 9)], ['tonight', et(5, 18)],
  ])('%s', (s, want) => expect(at(s)).toBe(want));
  it('handles the daylight-saving change', () => {
    const w = parseWhen('11/2 9am', et(1, 8), TZ, false); // clocks fall back on 11/1/2026
    expect(w && 'date' in w && new Date(w.date).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });
});

describe('Dialer buttons', () => {
  it('voicemail logs a dial and a dated note', () => {
    const r = dialerAction(contact(), 'voicemail', et(5, 10));
    expect(r.contact.dials).toBe(1);
    expect(r.contact.notes).toBe('11/5: Left voicemail');
  });
  it('a second press within 2 minutes is ignored', () => {
    const a = dialerAction(contact(), 'noanswer', et(5, 10)).contact;
    expect(dialerAction(a, 'noanswer', et(5, 10, 1)).ignored).toBe(true);
  });
  it('callback needs a time', () => {
    expect(dialerAction(contact(), 'callback', et(5, 10)).refused).toMatch(/callback time/);
    const r = dialerAction(contact(), 'callback', et(5, 10), CFG, { when: 'tomorrow 2pm', note: 'busy driving' });
    expect(r.contact.callAt).toBe(et(6, 14));
    expect(r.contact.notes).toBe('11/5: Callback Fri 11/6 2:00 PM - busy driving');
  });
  it('appointment on the backup number makes it the main number', () => {
    const c = contact({ backup: '(214) 555-0666' });
    const r = dialerAction(c, 'appt', et(5, 10), CFG, { when: 'sat 11am', backupMode: true });
    expect(r.contact.phone).toBe('(214) 555-0666');
    expect(r.contact.backup).toBe(c.phone);
    expect(r.contact.tag).toBe(TAGS.scheduled);
    expect(r.contact.callAt).toBe(et(7, 11));
  });
});

describe('Undo', () => {
  it('restoring the snapshot gives back the exact contact', () => {
    const c = contact({ backup: '(214) 555-0555', dials: 6, lastDialed: et(1, 9) });
    const snapshot = structuredClone(c);
    const r = dial(c, et(5, 10));
    expect(r.contact).not.toEqual(c);
    expect(c).toEqual(snapshot);   // the rules never change the original copy
  });
});

describe('Connects', () => {
  it('a Tag row is a connect unless bad number, no-show, presented, sold or given away', async () => {
    const { isReach } = await import('../src/rules/engine');
    expect([TAGS.callback, TAGS.notInterested, TAGS.dnc, TAGS.scheduled, TAGS.calledInto].every(isReach)).toBe(true);
    expect([TAGS.bad, TAGS.noshow, TAGS.presented, TAGS.sold, TAGS.given].some(isReach)).toBe(false);
  });
});

describe('Hung up, Called into and Do not call buttons (George, 2026-11-26)', () => {
  it('tag the contact and say what happened in the notes', () => {
    const h = dialerAction(contact(), 'hungup', et(5, 10));
    expect(h.contact.tag).toBe(TAGS.notInterested); expect(h.contact.notes).toContain('Hung up');
    const ci = dialerAction(contact(), 'calledinto', et(5, 10));
    expect(ci.contact.tag).toBe(TAGS.calledInto); expect(ci.contact.notes).toContain('Called into');
    const d = dialerAction(contact(), 'dnc', et(5, 10));
    expect(d.contact.tag).toBe(TAGS.dnc); expect(d.contact.notes).toContain('Do Not Call');
  });
});

// Moving data from a v27 sheet. All rows below are made up.
import { describe, it, expect } from 'vitest';
import { sheetDate, rowToContact, migrateSheet, deriveTries } from '../src/migrate/fromSheet';
import { TAGS } from '../src/rules/tags';
import { et } from './helpers';

// A..W: Tag, Dials, Dial+1, First, Last, Phone, Job, Company, City, State, Backup, Notes, Last dialed, Next, Status,
//       Call At, LinkedIn, Zone, Callable, Order, Phone to call, Why, New-number mark
const row = (o: Partial<Record<number, string | number>>) => Array.from({ length: 23 }, (_, i) => o[i] ?? '');
const serial = (d: number, h: number, mi = 0) => 46327 + (d - 1) + (h * 60 + mi) / 1440; // 46327 = 11/1/2026

describe('Sheet dates', () => {
  it('reads Sheets serial numbers as Eastern time', () => {
    expect(sheetDate(serial(5, 14, 30))).toBe(et(5, 14, 30));
  });
  it('reads date strings', () => {
    expect(sheetDate('11/5/2026 2:30 PM')).toBe(et(5, 14, 30));
    expect(sheetDate('11/5/2026')).toBe(et(5, 0));
  });
  it('blank is no date', () => expect(sheetDate('')).toBeNull());
});

describe('State tab rows', () => {
  it('maps every column', () => {
    const c = rowToContact('Texas', 7, row({ 0: TAGS.callback, 1: 3, 3: 'Pat', 4: 'Sample', 5: '214-555-0100', 6: 'Driver',
      7: 'Acme Freight', 8: 'Dallas', 9: 'TX', 10: '214-555-0101', 11: 'note', 12: serial(4, 9), 14: 'Good',
      15: serial(6, 14), 16: 'https://example.com/in/pat', 17: 'CT', 22: 2 }))!;
    expect(c).toMatchObject({ list: 'Texas', tag: TAGS.callback, dials: 3, first: 'Pat', phone: '214-555-0100',
      backup: '214-555-0101', lastDialed: et(4, 9), callAt: et(6, 14), status: 'Good', zone: 'CT', newNumberMark: 2, seq: 7 });
  });
  it('drops "Unverified" status', () => {
    expect(rowToContact('Texas', 3, row({ 3: 'A', 5: '1', 14: 'Unverified' }))!.status).toBe('');
  });
  it('skips blank rows', () => expect(rowToContact('Texas', 3, row({}))).toBeNull());
});

describe('Whole sheet', () => {
  const tabs = [
    { list: 'Texas', rows: [
      row({ 3: 'Pat', 4: 'Sample', 5: '214-555-0100', 1: 2 }),
      row({}),
      row({ 3: 'Lee', 4: 'Example', 5: '', 11: 'no number yet' }),
      row({ 0: TAGS.noshow, 3: 'Sam', 4: 'Demo', 5: '214-555-0102', 1: 4, 11: '11/3: No-showed (appt 11/3 6:00 PM)', 12: serial(5, 10) }),
    ] },
    { list: 'Georgia', rows: [row({ 3: 'Kim', 4: 'Test', 5: '(214) 555-0100' })] },
  ];
  const log = [
    [serial(2, 9), 'Texas', 'Pat', 'Sample', '214-555-0100', 'Dial', 1, '', 1, 3],
    [serial(3, 9), 'Texas', 'Pat', 'Sample', '214-555-0100', 'Dial', 1, '', 2, 3],
    [serial(3, 19), 'Texas', 'Sam', 'Demo', '214-555-0102', 'Tag', 1, TAGS.noshow, 3, 6],
    [serial(4, 10), 'Texas', 'Sam', 'Demo', '214-555-0102', 'Dial', 1, '', 4, 6],
    [serial(5, 10), 'Texas', 'Gone', 'Person', '214-555-0199', 'Dial', 1, '', 1, 40],
  ];
  const { contacts, report } = migrateSheet(tabs, log);
  it('counts contacts per tab and skips blank rows', () => {
    expect(report.perList).toEqual([
      { list: 'Texas', sheetRows: 4, contacts: 3, withPhone: 2, tagged: 1, needsNumber: 1 },
      { list: 'Georgia', sheetRows: 1, contacts: 1, withPhone: 1, tagged: 0, needsNumber: 0 },
    ]);
  });
  it('matches log rows to contacts by tab and name', () => {
    expect(report.logRows).toBe(5);
    expect(report.logMatched).toBe(4);
    expect(report.logUnmatched).toBe(1);
  });
  it('rebuilds the no-show try count from the log', () => {
    expect(contacts.find(c => c.first === 'Sam')!.noShowTries).toBe(1);
  });
  it('flags the same number on two contacts', () => {
    expect(report.duplicatePhones).toEqual([{ phone: '2145550100', who: ['Pat Sample (Texas row 3)', 'Kim Test (Georgia row 3)'] }]);
  });
});

describe('Callback try count from the log', () => {
  it('only counts dials on or after the callback day, at most 2', () => {
    const c = rowToContact('Texas', 3, row({ 0: TAGS.callback, 3: 'A', 4: 'B', 5: '1', 15: serial(4, 14) }))!;
    const log = [
      { at: et(2, 9), list: 'Texas', first: 'A', last: 'B', phone: '1', kind: 'Tag', count: 1, tag: TAGS.callback, dials: 1, row: 3 },
      { at: et(3, 9), list: 'Texas', first: 'A', last: 'B', phone: '1', kind: 'Dial', count: 1, tag: '', dials: 2, row: 3 },
      { at: et(4, 15), list: 'Texas', first: 'A', last: 'B', phone: '1', kind: 'Dial', count: 1, tag: '', dials: 3, row: 3 },
    ];
    expect(deriveTries(c, log).callbackTries).toBe(1);
  });
});

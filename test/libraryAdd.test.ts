import { describe, it, expect } from 'vitest';
import { libraryFromTable, planLibraryAdd, fromSheet } from '../src/library/library';
import { parseTable } from '../src/contacts/csv';

const id = (i: number) => `x${i}`;
describe('adding to the contact library', () => {
  it('reads a CSV by its headers, in any order', () => {
    const rows = parseTable('Company,Full Name,State,Phone\nMade Up Freight,Pat Example,Texas,(555) 555-0100\n');
    const [c] = libraryFromTable(rows, id);
    expect([c.first, c.last, c.company, c.state, c.phone]).toEqual(['Pat', 'Example', 'Made Up Freight', 'TX', '(555) 555-0100']);
  });
  it('leaves out contacts already given out, with no state, or already known', () => {
    const sheet = fromSheet('Texas', [['First', 'Last', 'Phone', 'Job', 'Company', 'City', 'State', 'LinkedIn', 'Backup', 'Notes', 'Given to', 'Date given'],
      ['Pat', 'One', '555-555-0101', '', 'Sample Co', 'Austin', 'TX', '', '', '', '', ''],
      ['Sam', 'Two', '555-555-0102', '', 'Sample Co', 'Austin', 'TX', '', '', '', 'Austin', '11/20/2026'],
      ['Lee', 'Three', '555-555-0103', '', 'Sample Co', 'Austin', 'TX', '', '', '', '', ''],
      ['Kim', 'Four', '555-555-0104', '', 'Sample Co', 'Austin', 'Nowhere', '', '', '', '', '']], id);
    const mine = [{ phone: '5555550103', backup: '', first: 'Lee', last: 'Three', company: 'Sample Co' }];
    const p = planLibraryAdd(sheet, [], mine);
    expect(p.add.map(c => c.first)).toEqual(['Pat', 'Kim']);   // Kim keeps the tab's state (Texas)
    expect(p.skipped.map(s => s.why)).toEqual(['Already given to Austin', 'Already in the library or with an agent']);
    expect(planLibraryAdd(p.add, p.add).add).toEqual([]);      // running it twice adds nothing
  });
});

describe('Needs Number CSV round trip', () => {
  it('fills numbers back by ID or by name, and finds UPS by search', async () => {
    const { needsCsvRows, matchNeedsCsv, needsSearch } = await import('../src/contacts/needs');
    const mk = (id: string, first: string, last: string, company: string) => ({ id, first, last, company, job: 'Driver', city: 'Austin', state: 'TX', list: 'Texas', linkedin: '' }) as never;
    const a = mk('c1', 'Pat', 'One', 'UPS'), b = mk('c2', 'Sam', 'Two', 'Made Up Freight');
    const rows = needsCsvRows([a, b]);
    rows[1][9] = '(555) 555-0101';
    rows.push(['', 'Sam', 'Two', 'Made Up Freight', '', '', '', '', '', '555-555-0102', '', 'Found online']);
    rows[2][9] = '';                                          // c2 by ID has no number; the name row below has one
    const m = matchNeedsCsv(rows, [a, b]);
    expect(m.entries.map(e => [e.id, e.phone, e.note])).toEqual([['c1', '(555) 555-0101', 'From CSV'], ['c2', '555-555-0102', 'Found online']]);
    expect(m.noNumber).toBe(1);
    expect(needsSearch(a, 'ups')).toBe(true); expect(needsSearch(b, 'ups')).toBe(false);
  });
});

// The number sheet sync. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { TAGS } from '../src/rules/tags';
import { fromGrid, isOpen, needsLook, newlyBad, planSend, readSheet, rowFor, toGrid, undoUpload, withStatus } from '../src/numbers/sheet';

const now = et(26, 17, 50);
const noNum = (over = {}) => contact({ phone: '', backup: '', ...over });

describe('number sheet', () => {
  it('sends only contacts that need a number and are not already waiting, each to its section', () => {
    const a = noNum({ first: 'Avery', linkedin: 'https://www.linkedin.com/in/avery-test' }), b = noNum({ first: 'Blake' }), c = contact({ first: 'Casey' });
    const bad = contact({ first: 'Drew', tag: TAGS.bad, phone: '(214) 555-0199', notes: '11/25: Bad number' });
    const sheet = [rowFor(b)];
    const p = planSend([a.id, b.id, c.id, bad.id], [a, b, c, bad], sheet, now, TZ);
    expect(p.send.map(r => [r.first, r.side])).toEqual([['Avery', 'needs'], ['Drew', 'newNumber']]);
    expect(p.send[0]).toMatchObject({ linkedin: 'https://www.linkedin.com/in/avery-test', tab: 'Texas', rowNo: String(a.seq) });
    expect(p.send[1]).toMatchObject({ old: '(214) 555-0199', notes: '11/25: Bad number' });
    expect(p.skip).toEqual([{ name: 'Blake Person', reason: 'Already on the sheet.' }, { name: 'Casey Person', reason: 'Has a number now.' }]);
    expect(newlyBad([a, bad], sheet)).toEqual([bad.id]);
  });

  it('lays rows out like the Needs Number tab and reads them back', () => {
    const rows = [rowFor(noNum({ first: 'L1' })), rowFor(contact({ first: 'R1', tag: TAGS.bad })), rowFor(noNum({ first: 'L2' }))];
    rows[0].phone = '214 555 0100'; rows[1].finder = 'Cannot find - 3 results';
    const grid = toGrid(rows);
    expect(grid).toHaveLength(2);
    expect(grid[0][2]).toBe('L1'); expect(grid[0][13]).toBe('R1'); expect(grid[1][2]).toBe('L2'); expect(grid[1][13]).toBe('');
    expect(grid[0][24]).toBe(rows[0].id); expect(grid[0][25]).toBe(rows[1].id);
    const back = fromGrid(grid);
    expect(back.rows.map(r => r.first)).toEqual(['L1', 'L2', 'R1']);
    expect(back.places).toEqual([{ side: 'needs', sheetRow: 5 }, { side: 'needs', sheetRow: 6 }, { side: 'newNumber', sheetRow: 5 }]);
    expect(back.rows[0]).toEqual(rows[0]); expect(back.rows[2]).toEqual(rows[1]);
  });

  it('adds good numbers, marks Cannot Find, and explains the rest', () => {
    const a = noNum({ first: 'Avery' }), b = noNum({ first: 'Blake' }), c = noNum({ first: 'Casey' });
    const taken = contact({ first: 'Taylor', phone: '(214) 555-0177' }), e = noNum({ first: 'Emery' });
    const sheet = [a, b, c, e].map(rowFor);
    sheet[0] = { ...sheet[0], phone: '214-555-0101', finder: 'LinkedIn + city' };
    sheet[1] = { ...sheet[1], finder: 'Cannot find - 3 results, none match' };
    sheet[2] = { ...sheet[2], phone: '(214) 555-0177' };
    sheet[3] = { ...sheet[3], phone: '555-01' };
    const r = readSheet(sheet, [a, b, c, e, taken], now, TZ);
    expect(r.changed.map(x => x.first)).toEqual(['Avery', 'Blake']);
    expect(r.changed[0].phone).toBe('(214) 555-0101');
    expect(r.changed[0].zone).toBe('CT');
    expect(r.changed[0].notes).toContain('Number from number sheet: LinkedIn + city');
    expect(r.changed[1].status).toBe('Cannot Find');
    expect(r.changed[1].notes).toContain('Number sheet: 3 results, none match');
    expect(r.status.get(0)).toBe('Added 11/26 5:50 PM');
    expect(r.status.get(1)).toBe('Marked Cannot Find 11/26 5:50 PM');
    expect(r.status.get(2)).toMatch(/^Not added: \(214\) 555-0177 is already on/);
    expect(r.status.get(3)).toBe('Not added: the phone is not 10 digits.');
    const after = withStatus(sheet, r.status);
    expect(after.filter(needsLook).length).toBe(2);
    expect(after.filter(isOpen).length).toBe(0);
    const again = readSheet(after, [...r.changed, c, e, taken], now, TZ);
    expect(again.changed).toEqual([]);
    expect(again.status.size).toBe(0);
  });

  it('never puts a number on the wrong person', () => {
    const a = noNum({ first: 'Avery' });
    const moved = { ...rowFor(a), first: 'Someone', last: 'Else', phone: '214-555-0102' };
    const lost = { ...rowFor(a), id: '', phone: '214-555-0103' };
    const r = readSheet([moved, lost], [a], now, TZ);
    expect(r.changed).toEqual([]);
    expect(r.status.get(0)).toMatch(/doesn't match Avery Person/);
    expect(r.status.get(1)).toMatch(/Contact ID cell is empty/);
  });

  it('undo puts back contacts nobody touched since', () => {
    const a = noNum({ first: 'Avery' }), b = noNum({ first: 'Blake' });
    const sheet = [a, b].map(rowFor);
    sheet[0].phone = '214-555-0104'; sheet[1].phone = '214-555-0105';
    const r = readSheet(sheet, [a, b], now, TZ);
    const bEdited = { ...r.changed[1], notes: r.changed[1].notes + ' | 11/26: called' };
    const u = undoUpload(r.upload!, [r.changed[0], bEdited], et(26, 18), TZ);
    expect(u.restore).toEqual([a]);
    expect(u.kept).toEqual(['Blake Person']);
    expect(u.status.get(0)).toMatch(/^Undone/);
  });
});

describe('number sheet on Google', () => {
  it('saves first, then writes status, colour and note under the header', async () => {
    const { syncNumberSheet } = await import('../src/numbers/google');
    const a = noNum({ first: 'Avery' });
    const calls: { url: string; body?: string }[] = [];
    const order: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (!init?.body) return new Response(JSON.stringify({ values: toGrid([{ ...rowFor(a), phone: '214-555-0106' }]) }));
      order.push('write'); return new Response('{}');
    }) as typeof fetch;
    const r = await syncNumberSheet('tok', 'SHEET', 7, [a], now, TZ, async () => { order.push('save'); }, f);
    expect(r.changed[0].phone).toBe('(214) 555-0106');
    expect(order).toEqual(['save', 'write', 'write']);
    expect(decodeURIComponent(calls[0].url)).toContain("/SHEET/values/'Needs Number'!A5:AB");
    expect(JSON.parse(calls[1].body!).data).toEqual([{ range: "'Needs Number'!AA5", values: [['Added 11/26 5:50 PM']] }]);
    const reqs = JSON.parse(calls[2].body!).requests;
    expect(reqs[0].updateCells.rows[0].values[0].note).toBe('Added 11/26 5:50 PM');
    expect(reqs[1].repeatCell.range).toMatchObject({ sheetId: 7, startRowIndex: 4, startColumnIndex: 0, endColumnIndex: 12 });
  });
});

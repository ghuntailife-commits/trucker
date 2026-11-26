// The number sheet sync. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { TAGS } from '../src/rules/tags';
import { fromValues, isOpen, needsLook, newlyBad, planSend, readSheet, rowFor, toValues, undoUpload, withStatus } from '../src/numbers/sheet';

const now = et(26, 17, 50);
const noNum = (over = {}) => contact({ phone: '', backup: '', ...over });

describe('number sheet', () => {
  it('sends only contacts that need a number and are not already waiting', () => {
    const a = noNum({ first: 'Avery' }), b = noNum({ first: 'Blake' }), c = contact({ first: 'Casey' });
    const bad = contact({ first: 'Drew', tag: TAGS.bad, phone: '(214) 555-0199' });
    const sheet = [rowFor(b, now, TZ)];
    const p = planSend([a.id, b.id, c.id, bad.id], [a, b, c, bad], sheet, now, TZ);
    expect(p.send.map(r => r.first)).toEqual(['Avery', 'Drew']);
    expect(p.send[1].bad).toBe('(214) 555-0199');
    expect(p.skip).toEqual([{ name: 'Blake Person', reason: 'Already on the sheet.' }, { name: 'Casey Person', reason: 'Has a number now.' }]);
    expect(newlyBad([a, bad], sheet)).toEqual([bad.id]);
  });

  it('round-trips through sheet cells', () => {
    const r = { ...rowFor(noNum(), now, TZ), phone: '214 555 0100', cannotFind: false };
    expect(fromValues(toValues(r))).toEqual(r);
    expect(fromValues(['x', '', '', '', '', '', '', '', '', '', '', '', '', '', 'x']).cannotFind).toBe(true);
  });

  it('adds good numbers, marks Cannot Find, and explains the rest', () => {
    const a = noNum({ first: 'Avery' }), b = noNum({ first: 'Blake' }), c = noNum({ first: 'Casey' });
    const taken = contact({ first: 'Taylor', phone: '(214) 555-0177' }), e = noNum({ first: 'Emery' });
    const sheet = [a, b, c, e].map(x => rowFor(x, now, TZ));
    sheet[0] = { ...sheet[0], phone: '214-555-0101', found: 'LinkedIn + city' };
    sheet[1] = { ...sheet[1], cannotFind: true, found: '3 results, none match' };
    sheet[2] = { ...sheet[2], phone: '(214) 555-0177' };
    sheet[3] = { ...sheet[3], phone: '555-01' };
    const r = readSheet(sheet, [a, b, c, e, taken], now, TZ);
    expect(r.changed.map(x => x.first)).toEqual(['Avery', 'Blake']);
    expect(r.changed[0].phone).toBe('(214) 555-0101');
    expect(r.changed[0].notes).toContain('Number from number sheet: LinkedIn + city');
    expect(r.changed[1].status).toBe('Cannot Find');
    expect(r.status.get(0)).toBe('Added 11/26 5:50 PM');
    expect(r.status.get(1)).toBe('Marked Cannot Find 11/26 5:50 PM');
    expect(r.status.get(2)).toMatch(/^Not added: \(214\) 555-0177 is already on/);
    expect(r.status.get(3)).toBe('Not added: the phone is not 10 digits.');
    const after = withStatus(sheet, r.status);
    expect(after.filter(needsLook).length).toBe(2);
    expect(after.filter(isOpen).length).toBe(0);
    // a second read changes nothing that was already added
    const again = readSheet(after, [...r.changed, c, e, taken], now, TZ);
    expect(again.changed).toEqual([]);
    expect(again.status.size).toBe(0);
  });

  it('never puts a number on the wrong person', () => {
    const a = noNum({ first: 'Avery' });
    const moved = { ...rowFor(a, now, TZ), first: 'Someone', last: 'Else', phone: '214-555-0102' };
    const lost = { ...rowFor(a, now, TZ), id: '', phone: '214-555-0103' };
    const r = readSheet([moved, lost], [a], now, TZ);
    expect(r.changed).toEqual([]);
    expect(r.status.get(0)).toMatch(/doesn't match Avery Person/);
    expect(r.status.get(1)).toMatch(/Contact ID cell is empty/);
  });

  it('undo puts back contacts nobody touched since', () => {
    const a = noNum({ first: 'Avery' }), b = noNum({ first: 'Blake' });
    const sheet = [a, b].map(x => ({ ...rowFor(x, now, TZ) }));
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
  it('saves first, then writes Status to column P under the header', async () => {
    const { syncNumberSheet } = await import('../src/numbers/google');
    const a = noNum({ first: 'Avery' });
    const calls: { url: string; body?: string }[] = [];
    const order: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (init?.method === 'GET') return new Response(JSON.stringify({ values: [toValues({ ...rowFor(a, now, TZ), phone: '214-555-0106' })] }));
      order.push('status'); return new Response('{}');
    }) as typeof fetch;
    const r = await syncNumberSheet('tok', 'SHEET', [a], now, TZ, async () => { order.push('save'); }, f);
    expect(r.changed[0].phone).toBe('(214) 555-0106');
    expect(order).toEqual(['save', 'status']);
    expect(calls[0].url).toContain('/SHEET/values/Numbers!A2:P');
    expect(JSON.parse(calls[1].body!).data).toEqual([{ range: 'Numbers!P2', values: [['Added 11/26 5:50 PM']] }]);
  });
});

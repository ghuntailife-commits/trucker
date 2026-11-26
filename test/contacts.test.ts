import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { fmtPhone, splitPhones } from '../src/contacts/phones';
import { parseState } from '../src/contacts/states';
import { parseTable, toCsv } from '../src/contacts/csv';
import { planImport } from '../src/contacts/importer';
import { needsGroup, planNeeds, returnCannotFind } from '../src/contacts/needs';
import { TAGS } from '../src/rules/tags';
import { knownBad } from '../src/rules/engine';

const now = et(26, 10);
const ids = (i: number) => 'new' + i;

describe('phones and states', () => {
  it('formats 10 and 11 digit numbers, refuses others', () => {
    expect(fmtPhone('214.555.0101')).toBe('(214) 555-0101');
    expect(fmtPhone('1-214-555-0101')).toBe('(214) 555-0101');
    expect(fmtPhone('555-0101')).toBeNull();
  });
  it('splits several numbers and drops repeats', () => {
    expect(splitPhones('214-555-0101 / (214) 555-0101 or 214 555 0102')).toEqual(['(214) 555-0101', '(214) 555-0102']);
  });
  it('reads state names and abbreviations', () => {
    expect(parseState('tx')).toMatchObject({ abbr: 'TX', name: 'Texas', zone: 'CT' });
    expect(parseState('Georgia')?.abbr).toBe('GA');
    expect(parseState('Narnia')).toBeNull();
  });
  it('known bad numbers match however they are written', () => {
    expect(knownBad('11/20: x | Bad number: 214-555-0101', '(214) 555-0101')).toBe(true);
    expect(knownBad('Bad number: 214-555-0101', '(214) 555-0102')).toBe(false);
  });
});

describe('csv', () => {
  it('reads tab-separated pastes and quoted csv', () => {
    expect(parseTable('a\tb\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseTable('"Smith, Jr",x\n"say ""hi""",y')).toEqual([['Smith, Jr', 'x'], ['say "hi"', 'y']]);
  });
  it('round-trips', () => { expect(parseTable(toCsv([['a,b', 'c"d', '']]))).toEqual([['a,b', 'c"d', '']]); });
});

describe('import', () => {
  const existing = [contact({ first: 'Avery', last: 'Stone', company: 'Lonestar Freight', phone: '(214) 555-0150' }),
    contact({ first: 'Blake', last: 'Moss', phone: '(214) 555-0151', tag: TAGS.dnc })];
  it('imports to the state list and skips duplicates by phone, by name+company, and Do Not Call', () => {
    const rows = parseTable([
      'First,Last,Phone,Job,Company,City,State,LinkedIn,Backup,Notes',
      'Casey,Reed,214-555-0160,Driver,Red River,Dallas,TX,,,',
      'Dana,Cole,214.555.0150,Driver,X,Dallas,TX,,,',
      'avery,STONE,,Driver,Lonestar Freight,Dallas,Texas,,,',
      'Eli,Ray,,Driver,Y,Macon,GA,,214-555-0151,',
      'Fin,Lee,,Driver,Z,Macon,Atlantis,,,',
      'Gus,Hall,call 555,Driver,Z,Macon,GA,,,',
      'Hal,Ives,214-555-0160,Driver,Z,Macon,GA,,,',
    ].join('\n'));
    const r = planImport(rows, existing, { now, nextId: ids });
    expect(r.map(x => x.ok)).toEqual([true, false, false, false, false, true, false]);
    expect(r[0].contact).toMatchObject({ list: 'Texas', state: 'TX', zone: 'CT', phone: '(214) 555-0160', status: '' });
    expect(r[1].result).toMatch(/duplicate of Avery Stone/);
    expect(r[2].result).toMatch(/duplicate of Avery Stone/);
    expect(r[3].result).toMatch(/Do Not Call/);
    expect(r[4].result).toMatch(/unknown state/);
    expect(r[5].contact?.notes).toBe('Phone on list: call 555');
    expect(r[5].result).toMatch(/Needs Number/);
    expect(r[6].result).toMatch(/this import/);
  });
  it('Hardcards import puts everyone on the Hardcards list', () => {
    const r = planImport([['Ida', 'Fox', '', 'Local 89', 'Spouse', 'Mobile', 'AL']], [], { now, nextId: ids, hardcards: true });
    expect(r[0].contact?.list).toBe('Hardcards');
  });
});

describe('needs number', () => {
  it('sorts contacts into the three lists', () => {
    expect(needsGroup(contact({ phone: '' }))).toBe('needs');
    expect(needsGroup(contact({ tag: TAGS.bad, status: 'Bad' }))).toBe('newNumber');
    expect(needsGroup(contact({ phone: '', status: 'Cannot Find' }))).toBe('cannotFind');
    expect(needsGroup(contact())).toBeNull();
    expect(needsGroup(contact({ phone: '', tag: TAGS.dnc }))).toBeNull();
  });
  it('saves a number with new-number priority, refuses bad, duplicate and short numbers', () => {
    const a = contact({ phone: '', dials: 3 }), b = contact({ phone: '', notes: 'Bad number: 214-555-0170' }), other = contact({ phone: '(214) 555-0171' });
    const c = contact({ phone: '' }), d = contact({ phone: '' });
    const plan = planNeeds([
      { id: a.id, phone: '214-555-0172', backup: '', note: 'Muse: found via LinkedIn', cannotFind: false },
      { id: b.id, phone: '(214) 555-0170', backup: '', note: '', cannotFind: false },
      { id: c.id, phone: '214-555-0171', backup: '', note: '', cannotFind: false },
      { id: d.id, phone: '555-0101', backup: '', note: '', cannotFind: false },
    ], [a, b, c, d, other], now, TZ);
    expect(plan[0]).toMatchObject({ ok: true });
    expect(plan[0].contact).toMatchObject({ phone: '(214) 555-0172', newNumberMark: 3, notes: 'Muse: found via LinkedIn' });
    expect(plan[1].result).toMatch(/already marked a bad number/);
    expect(plan[2].result).toMatch(/already on/);
    expect(plan[3]).toMatchObject({ ok: false, result: 'main number is not 10 digits' });
  });
  it('a new number for a bad-number contact clears the tag', () => {
    const a = contact({ tag: TAGS.bad, status: 'Bad', phone: '(214) 555-0180' });
    const [p] = planNeeds([{ id: a.id, phone: '214-555-0181', backup: '', note: '', cannotFind: false }], [a], now, TZ);
    expect(p.contact).toMatchObject({ tag: '', status: '', phone: '(214) 555-0181' });
  });
  it('the same number typed twice in one batch is caught', () => {
    const a = contact({ phone: '' }), b = contact({ phone: '' });
    const p = planNeeds([a, b].map(x => ({ id: x.id, phone: '214-555-0190', backup: '', note: '', cannotFind: false })), [a, b], now, TZ);
    expect(p.map(x => x.ok)).toEqual([true, false]);
  });
  it('Cannot Find marks and returns, keeping notes', () => {
    const a = contact({ phone: '', notes: 'old' });
    const [p] = planNeeds([{ id: a.id, phone: '', backup: '', note: 'tried Muse', cannotFind: true }], [a], now, TZ);
    expect(p.contact?.status).toBe('Cannot Find');
    expect(p.contact?.notes).toBe('old | CANNOT FIND 11/26 - tried Muse');
    expect(returnCannotFind(p.contact!)).toMatchObject({ status: '', notes: 'old | CANNOT FIND 11/26 - tried Muse' });
  });
});

import { planEdit } from '../src/contacts/edit';
describe('edit', () => {
  const fields = (c: ReturnType<typeof contact>) => ({ first: c.first, last: c.last, phone: c.phone, backup: c.backup, job: c.job,
    company: c.company, city: c.city, state: c.state, linkedin: c.linkedin });
  it('lists the changes and formats numbers', () => {
    const a = contact({ dials: 4 });
    const p = planEdit(a, { ...fields(a), phone: '205 555 0111', state: 'Alabama' }, [a]);
    expect(p.error).toBe('');
    expect(p.changes.map(x => x.field)).toEqual(['phone', 'state']);
    expect(p.contact).toMatchObject({ phone: '(205) 555-0111', state: 'AL', zone: 'CT', newNumberMark: 4 });
  });
  it('refuses duplicates, known bad numbers and bad states', () => {
    const a = contact({ notes: 'Bad number: 205-555-0112' }), b = contact({ phone: '(205) 555-0113' });
    expect(planEdit(a, { ...fields(a), phone: '2055550112' }, [a, b]).error).toMatch(/already marked/);
    expect(planEdit(a, { ...fields(a), phone: '2055550113' }, [a, b]).error).toMatch(/already on/);
    expect(planEdit(a, { ...fields(a), state: 'Atlantis' }, [a, b]).error).toMatch(/not a US state/);
  });
});

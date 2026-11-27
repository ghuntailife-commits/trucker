// Live storage parts and the switch-over's sheet reading. All rows are made up.
import { describe, it, expect } from 'vitest';
import { split, join, ownerOf } from '../src/live/parts';
import { mergeCells } from '../src/live/sheets';
import { buildAgentData, isListHeader } from '../src/migrate/agentSheet';

const HEAD = ['Tag', 'Dials', 'Dial +1', 'First Name', 'Last Name', 'Phone', 'Job Title', 'Company', 'City', 'State', 'Backup Number', 'Notes', 'Last Dialed'];

describe('parts', () => {
  const state = { v: 1, goal: 10000, sales: [{ at: 5 }], contacts: [{ id: 'a', list: 'Texas' }, { id: 'b', list: 'Ohio' }, { id: 'c', list: 'Texas' }],
    log: [{ at: Date.UTC(2026, 9, 3) }, { at: Date.UTC(2026, 10, 2) }, { at: Date.UTC(2026, 10, 9) }] };
  it('splits by list and month and joins back the same', () => {
    const p = split(state);
    expect(Object.keys(p).sort()).toEqual(['c:Ohio', 'c:Texas', 'l:2026-10', 'l:2026-11', 'rest']);
    const back = join(JSON.parse(JSON.stringify(p))) as typeof state;
    expect(back.log).toEqual(state.log);
    expect(back.sales).toEqual(state.sales);
    expect(back.goal).toBe(10000);
    expect(back.contacts.map(c => c.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('keeps other values whole', () => { expect(join(split({ v: 1, agents: [] }))).toEqual({ v: 1, agents: [] }); });
  it('knows whose data a key is', () => {
    expect(ownerOf('dispatch-agent-austin')).toBe('austin');
    expect(ownerOf('dispatch-inbox-braga')).toBe('braga');
    expect(ownerOf('trucker-numsheet-gracie')).toBe('gracie');
    expect(ownerOf('trucker-team-v1')).toBe('shared');
    expect(ownerOf('dispatch-library-v1')).toBe('george');
  });
});

describe('reading a sheet', () => {
  it('uses exact serial numbers only for dates and times', () => {
    const m = mergeCells([['11/4/2026 8:02:40', '713-259-0416', '3', '$690.84']], [[46330.335185, '713-259-0416', 3, 690.84]]);
    expect(m[0]).toEqual([46330.335185, '713-259-0416', '3', '$690.84']);
  });
  it('spots contact-list tabs by their header', () => {
    expect(isListHeader(HEAD)).toBe(true);
    expect(isListHeader(['Timestamp', 'Tab'])).toBe(false);
  });
  it('builds contacts, history to the second, sales and no-sales', () => {
    const d = buildAgentData({
      lists: [{ list: 'Ohio', rows: [HEAD, ['', '2', '', 'Pat', 'Sample', '(555) 010-0001', 'Driver', 'Acme', 'Akron', 'OH', '', 'note', '11/20/2026 2:05:37 PM']] }],
      log: [['11/20/2026 2:05:37 PM', 'Ohio', 'Pat', 'Sample', '(555) 010-0001', 'Dial', '1', '', '2', '3']],
      sales: [['11/21/2026 6:00 PM', 'Ohio', 'Pat', 'Sample', '(555) 010-0001', 'Acme', '$900.00', '$75.00', '', '$20,000', '', 'Standard']],
      noSales: [],
    });
    expect(d.contacts).toHaveLength(1);
    expect(d.contacts[0].id).toBe('Ohio|3');
    expect(d.contacts[0].lastDialed! % 60_000).toBe(37_000);
    expect(d.log.filter(e => e.kind === 'Dial')).toHaveLength(1);
    expect(d.log[0].contactId).toBe('Ohio|3');
    expect(d.sales[0]).toMatchObject({ contactId: 'Ohio|3', alp: 900 });
  });
});

describe('readAgentSheet (Google is faked)', () => {
  it('finds the lists by header and reads log, sales and no sales, read only', async () => {
    const { readAgentSheet } = await import('../src/live/sheets');
    const tabs: Record<string, unknown[][]> = {
      Ohio: [HEAD, ['', '1', '', 'Pat', 'Sample', '(555) 010-0001', '', '', '', 'OH', '', '', '11/20/2026 2:05:37 PM']],
      Rules: [['Rule', 'Value']], Notes: [['Something else']],
      'Activity Log': [['11/20/2026 2:05:37 PM', 'Ohio', 'Pat', 'Sample', '(555) 010-0001', 'Dial', '1', '', '1', '3']],
      Sales: [], 'No Sales': [],
    };
    const methods: string[] = [];
    const fake = async (url: string, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      const u = new URL(url);
      if (!u.pathname.includes('values')) return new Response(JSON.stringify({ properties: { title: 'Pat Truckers' }, sheets: Object.keys(tabs).map(title => ({ properties: { title } })) }));
      const raw = u.searchParams.get('valueRenderOption') === 'UNFORMATTED_VALUE';
      const valueRanges = u.searchParams.getAll('ranges').map(r => {
        const [, name, rng] = r.match(/^'(.+)'!(.+)$/)!;
        const rows = (tabs[name.replace(/''/g, "'")] ?? []).slice(0, rng.endsWith('2') && /A2:W2$/.test(rng) ? 1 : undefined)
          .map(row => row.map(v => raw && typeof v === 'string' && /\d\/\d+\/\d{4}/.test(v) ? 46346.587 : v));
        return { range: r, values: rows };
      });
      return new Response(JSON.stringify({ valueRanges }));
    };
    const orig = globalThis.fetch; globalThis.fetch = fake as typeof fetch;
    try {
      const t = await readAgentSheet('token', 'sheet-id');
      expect(t.lists.map(l => l.list)).toEqual(['Ohio']);
      expect(t.log).toHaveLength(1);
      expect(typeof t.log[0][0]).toBe('number');
      const d = buildAgentData(t);
      expect(d.contacts).toHaveLength(1);
      expect(d.log.filter(e => e.kind === 'Dial')[0].contactId).toBe('Ohio|3');
      expect(methods.every(m => m === 'GET')).toBe(true);
    } finally { globalThis.fetch = orig; }
  });
});

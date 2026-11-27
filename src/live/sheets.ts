// Reads a Truckers sheet for the switch-over, read only, with the admin's Google sign-in.
// Every request here is a GET: nothing can be written to a sheet from this file.
import { isListHeader, NOT_LISTS, type Cell, type SheetTabs } from '../migrate/agentSheet';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const REGISTRY_ID = '1-FZMbygnsUq8IN46kpfF7ettrqS01F8VaSf2w8z5-G8';

/** Called when Google says to slow down, so the screen can say "waiting". */
export let onWait: (() => void) | null = null;
export function setOnWait(f: (() => void) | null) { onWait = f; }

const q = (t: string) => `'${t.replace(/'/g, "''")}'`;

async function get<T>(token: string, url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json() as Promise<T>;
    // Google allows about 60 reads a minute: on "too many" wait for the minute to roll over, then try again
    if (r.status === 429 && i < 6) { onWait?.(); await new Promise(res => setTimeout(res, 20_000 * (i + 1))); continue; }
    if (r.status >= 500 && i < 4) { await new Promise(res => setTimeout(res, 1500 * 2 ** i)); continue; }
    const body = await r.text().catch(() => '');
    if (r.status === 401) throw new Error('Google sign-in expired. Click "Connect Google Sheets" again.');
    if (r.status === 403) {
      let why = '';
      try { why = JSON.parse(body).error?.message ?? ''; } catch { why = body.slice(0, 200); }
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(why)) throw new Error('The Google Sheets API is not turned on in your Google Cloud project (APIs & Services > Library > Google Sheets API > Enable).');
      if (/insufficient|scope/i.test(why)) throw new Error('Google did not give permission to read spreadsheets. Click the button again, and on Google’s screen tick the box that lets Dispatch see your spreadsheets.');
      throw new Error(`Google refused: ${why || 'no access to this sheet'}`);
    }
    throw new Error(`Google Sheets said ${r.status}: ${body.slice(0, 200)}`);
  }
}

type Batch = { valueRanges: { range: string; values?: Cell[][] }[] };
function batchUrl(id: string, ranges: string[], unformatted: boolean) {
  const p = new URLSearchParams();
  ranges.forEach(r => p.append('ranges', r));
  p.set('valueRenderOption', unformatted ? 'UNFORMATTED_VALUE' : 'FORMATTED_VALUE');
  if (unformatted) p.set('dateTimeRenderOption', 'SERIAL_NUMBER');
  return `${API}/${id}/values:batchGet?${p}`;
}

/** Text as the sheet shows it, except dates and times, which come as exact serial numbers so the seconds survive. */
export function mergeCells(shown: Cell[][], raw: Cell[][]): Cell[][] {
  return shown.map((row, i) => row.map((v, j) => {
    const n = raw[i]?.[j];
    return typeof n === 'number' && typeof v === 'string' && /\d[/:]\d/.test(v) ? n : v;
  }));
}

async function readRanges(token: string, id: string, ranges: string[]): Promise<Cell[][][]> {
  const out: Cell[][][] = [];
  for (let i = 0; i < ranges.length; i += 12) {
    const chunk = ranges.slice(i, i + 12);
    const [a, b] = await Promise.all([get<Batch>(token, batchUrl(id, chunk, false)), get<Batch>(token, batchUrl(id, chunk, true))]);
    a.valueRanges.forEach((vr, k) => out.push(mergeCells(vr.values ?? [], b.valueRanges[k]?.values ?? [])));
  }
  return out;
}

/** One agent's whole sheet: every contact list, the Activity Log, Sales and No Sales. */
export async function readAgentSheet(token: string, id: string): Promise<SheetTabs & { title: string }> {
  const meta = await get<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(token,
    `${API}/${id}?fields=properties(title),sheets(properties(title))`);
  const titles = meta.sheets.map(s => s.properties.title);
  const candidates = titles.filter(t => !NOT_LISTS.has(t));
  const headers = candidates.length ? await get<Batch>(token, batchUrl(id, candidates.map(t => `${q(t)}!A2:W2`), false)) : { valueRanges: [] };
  const lists = candidates.filter((_, i) => isListHeader(headers.valueRanges[i]?.values?.[0]));
  const extra = ['Activity Log', 'Sales', 'No Sales'].filter(t => titles.includes(t));
  const ranges = [...lists.map(t => `${q(t)}!A2:W`), ...extra.map(t => `${q(t)}!A2:N`)];
  const vals = await readRanges(token, id, ranges);
  const tab = (name: string) => { const i = extra.indexOf(name); return i < 0 ? [] : vals[lists.length + i]; };
  return { title: meta.properties.title, lists: lists.map((list, i) => ({ list, rows: vals[i] })),
    log: tab('Activity Log'), sales: tab('Sales'), noSales: tab('No Sales') };
}

/** Name → email from the Truckers Registry (column A name, column J email). */
export async function readRegistryEmails(token: string): Promise<Record<string, string>> {
  const r = await get<{ values?: Cell[][] }>(token, `${API}/${REGISTRY_ID}/values/${encodeURIComponent("'Agents'!A1:N")}`);
  const out: Record<string, string> = {};
  for (const row of r.values ?? []) {
    const name = String(row[0] ?? '').trim(), email = String(row[9] ?? '').trim();
    if (name && /@/.test(email)) out[name.toLowerCase()] = email;
  }
  return out;
}

export const LEAD_LIBRARY_ID = '1DiRw9KhXndEe0HSrA0yorLjoSI9oRmgnFOVkpZmJW9Y';
/** Every tab of the Lead Library sheet (A: First … L: Date given), read only. */
export async function readLeadLibrary(token: string): Promise<{ tab: string; rows: string[][] }[]> {
  const meta = await get<{ sheets: { properties: { title: string } }[] }>(token, `${API}/${LEAD_LIBRARY_ID}?fields=sheets(properties(title))`);
  const tabs = meta.sheets.map(s => s.properties.title);
  const vals = await readRanges(token, LEAD_LIBRARY_ID, tabs.map(t => `${q(t)}!A1:L`));
  return tabs.map((tab, i) => ({ tab, rows: vals[i].map(r => r.map(c => String(c ?? ''))) }));
}

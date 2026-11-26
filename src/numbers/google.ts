// Server only. Talks to each agent's number sheet through the Google Sheets API (v4), with the agent's own Google
// sign-in token (scope: https://www.googleapis.com/auth/drive.file, so the app can only open sheets it made itself).
// The app makes a NEW sheet per agent, laid out like the Needs Number tab on George Truckers. It never opens or
// writes any existing sheet.
import { BANNER, FIRST_DATA_ROW, LEFT_HEAD, LEFT_TITLE, LEFT_TYPE, RIGHT_HEAD, RIGHT_TITLE, RIGHT_TYPE, WIDTHS, fromGrid, leftValues,
  readSheet, rightValues, tone, withStatus, type Place, type SheetRow, type SyncResult } from './sheet';
import type { Contact } from '../rules/types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const TAB = 'Needs Number';
const Q = `'${TAB}'`;
type Fetch = typeof fetch;
const YELLOW = { red: 1, green: 0.96862745, blue: 0.8 }, GREY_HEAD = { red: 0.898, green: 0.898, blue: 0.898 };
const TONE_BG = { added: { red: 0.85, green: 0.92, blue: 0.83 }, look: { red: 0.96, green: 0.8, blue: 0.8 }, done: { red: 0.94, green: 0.94, blue: 0.94 } } as const;

async function call<T>(f: Fetch, token: string, url: string, body?: unknown, method?: string): Promise<T> {
  const r = await f(url, { method: method ?? (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Google Sheets ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
const values = (f: Fetch, token: string, id: string, data: { range: string; values: string[][] }[]) =>
  data.length ? call(f, token, `${API}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data }) : Promise.resolve();

/** Makes the agent's number sheet, formatted like the Needs Number tab. Returns its ID and tab ID. */
export async function createNumberSheet(token: string, agentName: string, f: Fetch = fetch): Promise<{ id: string; sheetId: number }> {
  const made = await call<{ spreadsheetId: string; sheets: { properties: { sheetId: number } }[] }>(f, token, API, {
    properties: { title: `${agentName} - Number sheet (Trucker app)` },
    sheets: [{ properties: { title: TAB, gridProperties: { frozenRowCount: 4, columnCount: 28, rowCount: 1000 } } }],
  });
  const id = made.spreadsheetId, sheetId = made.sheets[0].properties.sheetId;
  await values(f, token, id, [
    { range: `${Q}!A1`, values: [[BANNER[0]]] }, { range: `${Q}!A2`, values: [[BANNER[1]]] },
    { range: `${Q}!A3`, values: [[LEFT_TITLE]] }, { range: `${Q}!M3`, values: [[RIGHT_TITLE]] },
    { range: `${Q}!A4:X4`, values: [[...LEFT_HEAD, ...RIGHT_HEAD]] },
  ]);
  const range = (r0: number, r1: number, c0: number, c1: number) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const fill = (r: ReturnType<typeof range>, color: object) => ({ repeatCell: { range: r, cell: { userEnteredFormat: { backgroundColor: color } }, fields: 'userEnteredFormat.backgroundColor' } });
  const warn = (c0: number, c1: number) => ({ addProtectedRange: { protectedRange: { range: range(4, 1000, c0, c1), warningOnly: true,
    description: 'Filled by the Trucker app. Type only in the yellow columns.' } } });
  const typeCols = [...LEFT_TYPE, ...RIGHT_TYPE.map(i => i + 12)];
  await call(f, token, `${API}/${id}:batchUpdate`, { requests: [
    { mergeCells: { range: range(0, 1, 0, 24), mergeType: 'MERGE_ALL' } }, { mergeCells: { range: range(1, 2, 0, 24), mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: range(2, 3, 0, 12), mergeType: 'MERGE_ALL' } }, { mergeCells: { range: range(2, 3, 12, 24), mergeType: 'MERGE_ALL' } },
    { repeatCell: { range: range(0, 4, 0, 24), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
    fill(range(3, 4, 0, 24), GREY_HEAD),
    ...typeCols.map(c => fill(range(4, 1000, c, c + 1), YELLOW)),
    ...WIDTHS.map((px, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    // Y-AB: contact IDs and what the app did, hidden like the old tab's helper columns
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 24, endIndex: 28 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    ...[[2, 11], [12, 23], [24, 28]].map(([a, b]) => warn(a, b)),
  ] });
  return { id, sheetId };
}

export async function readRows(token: string, id: string, f: Fetch = fetch): Promise<{ rows: SheetRow[]; places: Place[] }> {
  const r = await call<{ values?: string[][] }>(f, token, `${API}/${id}/values/${encodeURIComponent(`${Q}!A${FIRST_DATA_ROW}:AB`)}`);
  return fromGrid(r.values ?? []);
}

/** Adds sent contacts under the last row of their section (left: needs a number, right: needs a new number). */
export async function sendRows(token: string, id: string, rows: SheetRow[], f: Fetch = fetch) {
  if (!rows.length) return;
  const { places } = await readRows(token, id, f);
  const next = { needs: FIRST_DATA_ROW, newNumber: FIRST_DATA_ROW };
  for (const p of places) next[p.side] = Math.max(next[p.side], p.sheetRow + 1);
  const data: { range: string; values: string[][] }[] = [];
  for (const r of rows) {
    const n = next[r.side]++;
    if (r.side === 'needs') data.push({ range: `${Q}!A${n}:L${n}`, values: [leftValues(r)] }, { range: `${Q}!Y${n}`, values: [[r.id]] });
    else data.push({ range: `${Q}!M${n}:X${n}`, values: [rightValues(r)] }, { range: `${Q}!Z${n}`, values: [[r.id]] });
  }
  await values(f, token, id, data);
}

/** Writes what happened (hidden AA/AB), colours the row (green saved, red needs a look, grey done) and puts the
 *  reason in a note on the phone cell, so the finder can hover to see it. */
export async function writeStatus(token: string, id: string, sheetId: number, rows: SheetRow[], places: Place[], status: Map<number, string>, f: Fetch = fetch) {
  if (!status.size) return;
  const after = withStatus(rows, status);
  const data = [...status].map(([i, s]) => ({ range: `${Q}!${places[i].side === 'needs' ? 'AA' : 'AB'}${places[i].sheetRow}`, values: [[s]] }));
  await values(f, token, id, data);
  const requests = [...status.keys()].flatMap(i => {
    const p = places[i], t = tone(after[i]), c0 = p.side === 'needs' ? 0 : 12, r0 = p.sheetRow - 1;
    const bg = t === 'added' || t === 'look' || t === 'done' ? TONE_BG[t] : null;
    const out: object[] = [{ updateCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c0 + 1 },
      rows: [{ values: [{ note: after[i].status }] }], fields: 'note' } }];
    if (bg) out.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r0 + 1, startColumnIndex: c0, endColumnIndex: c0 + 12 },
      cell: { userEnteredFormat: { backgroundColor: bg } }, fields: 'userEnteredFormat.backgroundColor' } });
    return out;
  });
  await call(f, token, `${API}/${id}:batchUpdate`, { requests });
}

/** One sync: read the sheet, work out the changes, save them (the caller's `save`, which also keeps `upload` for undo),
 *  and only then write back, so a failed save never shows "Added" on the sheet. Read and write are seconds apart. */
export async function syncNumberSheet(token: string, id: string, sheetId: number, contacts: Contact[], now: number, tz: string,
  save: (r: SyncResult) => Promise<void>, f: Fetch = fetch): Promise<SyncResult> {
  const { rows, places } = await readRows(token, id, f);
  const r = readSheet(rows, contacts, now, tz);
  if (r.changed.length) await save(r);
  await writeStatus(token, id, sheetId, rows, places, r.status, f);
  return r;
}

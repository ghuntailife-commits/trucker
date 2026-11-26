// Server only. Talks to each agent's number sheet through the Google Sheets API (v4), with the agent's own Google
// sign-in token (scope: https://www.googleapis.com/auth/drive.file, so the app can only open sheets it made).
// The app makes a NEW sheet per agent. It never opens or writes any existing sheet.
import { HEAD, fromValues, readSheet, toValues, type SheetRow, type SyncResult } from './sheet';
import type { Contact } from '../rules/types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TAB = 'Numbers';
type Fetch = typeof fetch;

async function call<T>(f: Fetch, token: string, url: string, body?: unknown): Promise<T> {
  const r = await f(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Google Sheets ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

/** Makes the agent's number sheet: header row frozen, and a warning if anyone edits the columns the app fills. */
export async function createNumberSheet(token: string, agentName: string, f: Fetch = fetch): Promise<string> {
  const made = await call<{ spreadsheetId: string; sheets: { properties: { sheetId: number } }[] }>(f, token, API, {
    properties: { title: `${agentName} - Number sheet (Trucker app)` },
    sheets: [{ properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } }],
  });
  const id = made.spreadsheetId, sheetId = made.sheets[0].properties.sheetId;
  await call(f, token, `${API}/${id}/values/${TAB}!A1:P1:append?valueInputOption=RAW`, { values: [HEAD] });
  // the finder fills L-O; A-K and P belong to the app, so editing them shows a warning
  const warn = (start: number, end: number, description: string) => ({ addProtectedRange: { protectedRange: {
    range: { sheetId, startColumnIndex: start, endColumnIndex: end }, warningOnly: true, description } } });
  await call(f, token, `${API}/${id}:batchUpdate`, { requests: [
    warn(0, 11, 'Filled by the Trucker app. The Contact ID ties each row to its contact.'),
    warn(15, 16, 'The Trucker app writes what happened here.'),
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
  ] });
  return id;
}

export async function appendRows(token: string, id: string, rows: SheetRow[], f: Fetch = fetch) {
  if (!rows.length) return;
  await call(f, token, `${API}/${id}/values/${TAB}!A:P:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: rows.map(toValues) });
}

export async function readRows(token: string, id: string, f: Fetch = fetch): Promise<SheetRow[]> {
  const r = await call<{ values?: string[][] }>(f, token, `${API}/${id}/values/${TAB}!A2:P`);
  return (r.values ?? []).map(fromValues);
}

/** Writes Status (column P). Row 0 is sheet row 2, under the header. */
export async function writeStatus(token: string, id: string, status: Map<number, string>, f: Fetch = fetch) {
  if (!status.size) return;
  await call(f, token, `${API}/${id}/values:batchUpdate`, { valueInputOption: 'RAW',
    data: [...status].map(([i, s]) => ({ range: `${TAB}!P${i + 2}`, values: [[s]] })) });
}

/** One sync: read the sheet, work out the changes, save them (the caller's `save`, which also keeps `upload` for undo),
 *  and only then write Status back, so a failed save never shows "Added" on the sheet. */
export async function syncNumberSheet(token: string, id: string, contacts: Contact[], now: number, tz: string,
  save: (r: SyncResult) => Promise<void>, f: Fetch = fetch): Promise<SyncResult> {
  const rows = await readRows(token, id, f);
  const r = readSheet(rows, contacts, now, tz);
  if (r.changed.length) await save(r);
  await writeStatus(token, id, r.status, f);
  return r;
}

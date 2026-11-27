// Splits a saved state into parts so a change re-saves only what changed: one part per contact list,
// one per month of the activity log, and one for everything else. Pure functions, tested in test/parts.test.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const month = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Which person a storage key belongs to ('shared' = team settings everyone can read). */
export function ownerOf(key: string, admin = 'george'): string {
  const m = key.match(/^(?:dispatch-agent|dispatch-inbox|dispatch-lic|dispatch-coach|dispatch-events|trucker-numsheet)-(.+?)(?:-v\d+)?$/);
  if (m) return m[1];
  if (key === 'trucker-team-v1') return 'shared';
  return admin;
}

export function split(value: unknown): Record<string, unknown> {
  const v = value as Obj;
  if (!v || typeof v !== 'object' || !Array.isArray(v.contacts) || !Array.isArray(v.log)) return { all: value };
  const parts: Record<string, unknown> = {};
  const lists: Record<string, unknown[]> = {};
  for (const c of v.contacts) (lists[c.list] ??= []).push(c);
  for (const [l, cs] of Object.entries(lists)) parts[`c:${l}`] = cs;
  const logs: Record<string, unknown[]> = {};
  for (const e of v.log) (logs[month(e.at)] ??= []).push(e);
  for (const [m, es] of Object.entries(logs)) parts[`l:${m}`] = es;
  const { contacts: _c, log: _l, ...rest } = v;
  parts.rest = { ...rest, order: Object.keys(lists) };
  return parts;
}

export function join(parts: Record<string, unknown>): unknown {
  if ('all' in parts) return parts.all;
  const rest = parts.rest as Obj | undefined;
  if (!rest) return null;
  const { order = [], ...others } = rest;
  const lists = Object.keys(parts).filter(k => k.startsWith('c:')).map(k => k.slice(2));
  const sorted = [...order.filter((l: string) => lists.includes(l)), ...lists.filter(l => !order.includes(l))];
  const contacts = sorted.flatMap(l => parts[`c:${l}`] as unknown[]);
  const log = Object.keys(parts).filter(k => k.startsWith('l:')).sort().flatMap(k => parts[k] as Obj[]).sort((a, b) => a.at - b.at);
  return { ...others, contacts, log };
}

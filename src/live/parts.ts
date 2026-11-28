// Splits a saved state into parts so a change re-saves only what changed: one part per contact list,
// one per month of the activity log, and one for everything else. Pure functions, tested in test/parts.test.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const month = (t: number) => new Date(t).toISOString().slice(0, 7);

/** Which person a storage key belongs to ('shared' = team settings everyone can read). */
export function ownerOf(key: string, admin = 'george'): string {
  const m = key.match(/^(?:dispatch-agent|dispatch-inbox|dispatch-cell|dispatch-sig|dispatch-lic|dispatch-coach|dispatch-events|dispatch-libreturn|dispatch-tz|dispatch-findtoday|trucker-numsheet)-(.+?)(?:-v\d+)?$/);
  if (m) return m[1];
  if (key === 'trucker-team-v1' || key === 'dispatch-team-playbook' || key === 'dispatch-team-teach') return 'shared';
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

/**
 * Someone else saved this part since this screen last saved it (George, 2026-11-27: Ivan's open screen kept wiping
 * contacts the admin imported). Keep their changes and lay ours on top, contact by contact: `base` is what this
 * screen last saved, `mine` what it has now, `theirs` what is in the database. Contact lists merge by id (our edits
 * and removals win, contacts only they have stay); history months keep every line from both.
 */
export function mergePart(part: string, base: unknown, mine: unknown, theirs: unknown): unknown {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return mine;
  if (part.startsWith('l:')) {
    const k = (e: Obj) => `${e.at}|${e.contactId}|${e.kind}|${e.tag ?? ''}`;
    const seen = new Set((mine as Obj[]).map(k));
    return [...(mine as Obj[]), ...(theirs as Obj[]).filter(e => !seen.has(k(e)))].sort((a, b) => a.at - b.at);
  }
  if (!part.startsWith('c:')) return mine;
  const b = new Map((Array.isArray(base) ? base as Obj[] : []).map(c => [c.id, JSON.stringify(c)]));
  const m = new Map((mine as Obj[]).map(c => [c.id, c]));
  const out: Obj[] = [];
  const used = new Set<string>();
  for (const t of theirs as Obj[]) {
    const my = m.get(t.id);
    if (my) { out.push(b.get(t.id) === JSON.stringify(my) ? t : my); used.add(t.id); }   // unchanged here: take theirs
    else if (!b.has(t.id)) out.push(t);                                                    // only they have it: keep
    // else: this screen removed it: leave it out
  }
  for (const c of mine as Obj[]) if (!used.has(c.id)) out.push(c);                         // new here
  return out;
}

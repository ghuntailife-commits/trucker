// Admin search across every agent's contacts (George, 2026-11-27: "search ALL leads in ALL agents possession. only me
// as admin"). The server slims each contact to what the search and the results table need. Pure, tested in test/allSearch.test.ts.
import type { Contact } from '../rules/types';

export interface SlimContact {
  a: string;            // agent id
  id: string; n: string; p: string; b: string; co: string; j: string; ci: string; st: string; l: string;
  t: string; d: number; ld: number | null; ca: number | null; e?: string;
}

export const toSlim = (c: Contact, agent: string): SlimContact => ({
  a: agent, id: c.id, n: `${c.first ?? ''} ${c.last ?? ''}`.trim(), p: c.phone ?? '', b: c.backup ?? '', co: c.company ?? '', j: c.job ?? '',
  ci: c.city ?? '', st: c.state ?? '', l: c.list ?? '', t: c.tag ?? '', d: c.dials ?? 0, ld: c.lastDialed ?? null, ca: c.callAt ?? null,
  ...(c.email ? { e: c.email } : {}),
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@. ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Every word must match name, company, job, city, state, list or email; 4+ digits match either phone number. */
export function searchAll(rows: SlimContact[], q: string, agent?: string, limit = 300): { hits: SlimContact[]; total: number } {
  const digits = q.replace(/\D/g, '');
  const words = norm(q.replace(/[\d()+-]/g, ' ')).split(' ').filter(Boolean);
  if (!words.length && digits.length < 4) return { hits: [], total: 0 };
  const hits: SlimContact[] = [];
  let total = 0;
  for (const r of rows) {
    if (agent && r.a !== agent) continue;
    if (digits.length >= 4 && !(r.p + ' ' + r.b).replace(/\D/g, '').includes(digits) && !(r.p.replace(/\D/g, '') + r.b.replace(/\D/g, '')).includes(digits)) continue;
    if (digits.length > 0 && digits.length < 4 && !words.length) continue;
    if (words.length) {
      const hay = norm(`${r.n} ${r.co} ${r.j} ${r.ci} ${r.st} ${r.l} ${r.e ?? ''}`);
      if (!words.every(w => hay.includes(w))) continue;
    }
    total++;
    if (hits.length < limit) hits.push(r);
  }
  // exact name starts first, then most recently worked
  const ql = norm(q);
  hits.sort((x, y) => Number(!x.n.toLowerCase().startsWith(ql)) - Number(!y.n.toLowerCase().startsWith(ql)) || (y.ld ?? 0) - (x.ld ?? 0));
  return { hits, total };
}

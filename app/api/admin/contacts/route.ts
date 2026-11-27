// Every agent's contacts, slimmed for the admin search (George only, 2026-11-27).
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { toSlim, type SlimContact } from '../../../../src/admin/allSearch';
import type { Contact } from '../../../../src/rules/types';

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    if (me.role !== 'admin') return NextResponse.json({ error: 'Only the admin can search every agent.' }, { status: 403 });
    const out: SlimContact[] = [];
    for (let from = 0; ; from += 50) {
      const { data, error } = await db.from('kv').select('key,part,value').like('key', 'dispatch-agent-%').like('part', 'c:%').order('key').order('part').range(from, from + 49);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const r of data ?? []) {
        const agent = String(r.key).replace(/^dispatch-agent-/, '').replace(/-v\d+$/, '');
        for (const c of (Array.isArray(r.value) ? r.value : []) as Contact[]) out.push(toSlim(c, agent));
      }
      if (!data || data.length < 50) break;
    }
    return NextResponse.json({ at: Date.now(), contacts: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

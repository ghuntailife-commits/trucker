// Top dialers today (George, 2026-11-28): an agent's screen posts its own numbers for the day here; everyone reads
// kv dispatch-team-board (one part per agent, owner "shared"). Only your own numbers, under your own name.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../src/live/server';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const b = await req.json() as { day?: number; dials?: number; connects?: number; booked?: number; last?: number };
    const n = (v: unknown) => Math.max(0, Math.min(5000, Math.round(Number(v) || 0)));
    const name = (await teamSettings(db))?.agents.find(a => a.id === me.agentId)?.name ?? me.agentId;
    const value = { agent: me.agentId, name, day: Math.round(Number(b.day) || 0), dials: n(b.dials), connects: n(b.connects), booked: n(b.booked),
      at: Math.min(Date.now(), Number(b.last) || Date.now()) };
    const { error } = await db.from('kv').upsert({ key: 'dispatch-team-board', part: me.agentId, owner: 'shared', value, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

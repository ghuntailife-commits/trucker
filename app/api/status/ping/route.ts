// Each open Dispatch screen checks in every 2 minutes: who, which build, whose data it shows, whether its last save
// worked. The admin's System status page reads these (George, 2026-11-27).
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const b = await req.json() as { screen?: string; build?: string; viewing?: string; save?: string; saveError?: string; page?: string };
    const screen = String(b.screen ?? 'x').slice(0, 40);
    await db.from('kv').upsert({ key: 'dispatch-status-ping', part: `${me.agentId}:${screen}`, owner: 'george', updated_at: new Date().toISOString(),
      value: { agent: me.agentId, at: Date.now(), build: String(b.build ?? '').slice(0, 80), viewing: String(b.viewing ?? me.agentId).slice(0, 40),
        save: String(b.save ?? '').slice(0, 20), saveError: b.saveError ? String(b.saveError).slice(0, 300) : undefined, page: String(b.page ?? '').slice(0, 20),
        ua: (req.headers.get('user-agent') ?? '').slice(0, 160) } }, { onConflict: 'key,part' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

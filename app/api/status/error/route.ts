// A screen that crashed reports what broke (app/error.tsx). Kept for the admin, newest per agent (George, 2026-11-28).
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const b = await req.json() as { message?: string; stack?: string; page?: string };
    await db.from('kv').upsert({ key: 'dispatch-status-error', part: me.agentId, owner: 'george', updated_at: new Date().toISOString(),
      value: { agent: me.agentId, at: Date.now(), message: String(b.message ?? '').slice(0, 500), stack: String(b.stack ?? '').slice(0, 2000),
        page: String(b.page ?? '').slice(0, 60), ua: (req.headers.get('user-agent') ?? '').slice(0, 160) } }, { onConflict: 'key,part' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Saves an agent's Google Calendar connection (the refresh token from their Google sign-in) or reports it.
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { googleKeys } from '../../../../src/calendar/google';

export async function GET(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const agent = new URL(req.url).searchParams.get('agent') || me.agentId;
    if (agent !== me.agentId && me.role !== 'admin') return NextResponse.json({ error: 'Not yours.' }, { status: 403 });
    const { data, error } = await db.from('google_tokens').select('email,updated_at').eq('agent_id', agent).maybeSingle();
    if (error) return NextResponse.json({ connected: false, setup: /google_tokens/.test(error.message) ? 'Run the calendar SQL in Supabase first.' : error.message });
    return NextResponse.json({ connected: !!data, email: data?.email ?? null, keys: (() => { const k = googleKeys(); return !!(k.id && k.secret); })() });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { refreshToken, email, disconnect } = await req.json() as { refreshToken?: string; email?: string; disconnect?: boolean };
    if (disconnect) { await db.from('google_tokens').delete().eq('agent_id', me.agentId); return NextResponse.json({ ok: true, connected: false }); }
    if (!refreshToken) return NextResponse.json({ error: 'Google did not send a long-term sign-in. Click Connect again and allow calendar access.' }, { status: 400 });
    const { error } = await db.from('google_tokens').upsert({ agent_id: me.agentId, refresh_token: refreshToken, email: email ?? null, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: /google_tokens/.test(error.message) ? 'Run the calendar SQL in Supabase first.' : error.message }, { status: 500 });
    return NextResponse.json({ ok: true, connected: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

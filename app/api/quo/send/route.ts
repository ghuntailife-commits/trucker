// Sends one text through Quo for the signed-in agent. The Quo key stays here on the server.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { checkText, sendTextRequest } from '../../../../src/quo/quo';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    const { to, content } = await req.json() as { to: string; content: string };
    const agent = (await teamSettings(db))?.agents.find(a => a.id === me.agentId);
    if (!agent?.quo) return NextResponse.json({ error: 'Quo is not turned on for you in Settings.' }, { status: 400 });
    const t = { from: agent.quoNumber ?? '', to, content };
    const problem = checkText(t);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const key = process.env.QUO_API_KEY;
    if (!key) return NextResponse.json({ error: 'QUO_API_KEY is not set on Vercel.' }, { status: 500 });
    const { url, init } = sendTextRequest(t, key);
    const r = await fetch(url, init);
    const body = await r.text();
    if (!r.ok) return NextResponse.json({ error: `Quo said ${r.status}: ${body.slice(0, 300)}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Sends one text through Quo for the signed-in agent. The Quo key stays here on the server.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { checkText, sendTextRequest } from '../../../../src/quo/quo';
import { quoNumbers } from '../../../../src/team/agents';
import { quoKeyFor } from '../../../../src/quo/keys';
import { lineIn, pickFrom } from '../../../../src/quo/localMatch';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { to, content } = await req.json() as { to: string; content: string };
    const agent = (await teamSettings(db))?.agents.find(a => a.id === me.agentId);
    if (!agent?.quo) return NextResponse.json({ error: 'Quo is not turned on for you in Settings.' }, { status: 400 });
    // Local match: the line they texted on before, else the agent's number closest to the contact.
    const mine = quoNumbers(agent.quoNumber);
    let last: string | null = null;
    const d = String(to ?? '').replace(/\D/g, '').slice(-10);
    if (mine.length > 1 && d.length === 10) {
      const { data } = await db.from('quo_events').select('payload').eq('agent_id', agent.id).like('type', 'message.%').like('phone', `%${d}`).order('at', { ascending: false }).limit(1);
      last = data?.[0] ? lineIn(data[0].payload, mine) : null;
    }
    const pick = pickFrom(mine, to, last);
    const t = { from: pick.from, to, content };
    const problem = checkText(t);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const key = quoKeyFor(agent.id);
    if (!key) return NextResponse.json({ error: 'No Quo API key on Vercel for you yet.' }, { status: 500 });
    const { url, init } = sendTextRequest(t, key);
    const r = await fetch(url, init);
    const body = await r.text();
    if (!r.ok) return NextResponse.json({ error: `Quo said ${r.status}: ${body.slice(0, 300)}` }, { status: 502 });
    return NextResponse.json({ ok: true, from: pick.from, why: pick.why });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

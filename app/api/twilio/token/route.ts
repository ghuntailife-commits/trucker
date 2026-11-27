// The browser's pass to call through Twilio as the signed-in agent (George, 2026-11-27).
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { accessToken, twilioEnv, twilioMissing } from '../../../../src/twilio/twilio';

export async function POST(req: Request) {
  try {
    const env = twilioEnv();
    if (!env) return NextResponse.json({ error: `Twilio is not set up on Vercel yet (missing ${twilioMissing().join(', ')}).` }, { status: 400 });
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const team = await teamSettings(db);
    const agent = team?.agents.find(a => a.id === me.agentId);
    if (!agent?.twilio) return NextResponse.json({ error: 'Calling through Dispatch is not turned on for you in Settings.' }, { status: 400 });
    return NextResponse.json({ token: accessToken(env, agent.id, Date.now()), identity: agent.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

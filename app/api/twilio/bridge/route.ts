// Ring my cell (George, 2026-11-27): Dispatch rings the agent's own phone from the contact's local number, and
// when they pick up it says who, then connects the contact (bridge-twiml). Also hangs that call up from the screen.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { DAILY_CAP, dialsToday, lastFromFor, publicUrl, readCell, teamTwilioNumbers, twilioApi } from '../../../../src/twilio/server';
import { twilioE164 } from '../../../../src/twilio/twilio';
import { cellReady } from '../../../../src/twilio/cell';
import { pickFrom } from '../../../../src/quo/localMatch';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const body = await req.json() as { to?: string; name?: string; hangup?: string };
    if (body.hangup) {
      if (!/^CA[0-9a-f]{32}$/i.test(body.hangup)) return NextResponse.json({ error: 'Not a call.' }, { status: 400 });
      await twilioApi(`/Calls/${body.hangup}.json`, { form: { Status: 'completed' } }).catch(() => { /* already over */ });
      return NextResponse.json({ ok: true });
    }
    const team = await teamSettings(db);
    const agent = team?.agents.find(a => a.id === me.agentId);
    if (!agent?.twilio) return NextResponse.json({ error: 'Calling through Dispatch is not turned on for you in Settings.' }, { status: 400 });
    const pref = await readCell(db, agent.id);
    if (!cellReady(pref)) return NextResponse.json({ error: 'Add your cell number under Ring my cell first.' }, { status: 400 });
    const to = twilioE164(body.to ?? '');
    if (!to) return NextResponse.json({ error: 'That number is not a full 10-digit number.' }, { status: 400 });
    const pool = teamTwilioNumbers(team);
    const used = await dialsToday(db).catch(() => ({}));
    const { from } = pickFrom(pool, to, await lastFromFor(db, to), { used, cap: team?.twilioDailyCap ?? DAILY_CAP });
    if (!from) return NextResponse.json({ error: 'Add your Dispatch numbers in Settings first.' }, { status: 400 });
    const { base } = publicUrl(req);
    const q = new URLSearchParams({ a: agent.id, p: to, f: twilioE164(from), n: String(body.name ?? '').slice(0, 60) });
    // your cell shows the contact's local Dispatch number; 18 seconds so it stops before your own voicemail answers
    const c = await twilioApi<{ sid: string }>('/Calls.json', { form: { To: twilioE164(pref.cell), From: twilioE164(from), Url: `${base}/api/twilio/bridge-twiml?${q}`, Timeout: '18',
      // only used when you don't pick up, so the screen stops showing the call
      StatusCallback: `${base}/api/twilio/status?a=${encodeURIComponent(agent.id)}&p=${encodeURIComponent(to)}&cell=1`, StatusCallbackEvent: 'completed' } });
    await db.from('quo_events').upsert({ id: `call.dialed:${c.sid}`, agent_id: agent.id, type: 'call.dialed', call_id: c.sid, phone: to, at: new Date().toISOString(),
      applied: true, payload: { source: 'twilio', from: twilioE164(from), cell: true } }, { onConflict: 'id', ignoreDuplicates: true });
    return NextResponse.json({ ok: true, sid: c.sid });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

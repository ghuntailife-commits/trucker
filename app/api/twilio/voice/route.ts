// Twilio asks here what to do with a call: one the agent starts in Dispatch (from "client:<agent>"), or someone
// calling one of the team's numbers (George, 2026-11-27). Set as the TwiML App's Voice URL and each number's Voice URL.
import { adminDb, teamSettings } from '../../../../src/live/server';
import { readTwilio, teamTwilioNumbers, lastAgentFor, xml, dialsToday, DAILY_CAP } from '../../../../src/twilio/server';
import { inboundTwiml, outboundTwiml, twilioE164 } from '../../../../src/twilio/twilio';
import { pickFrom } from '../../../../src/quo/localMatch';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const { p, base } = tw;
  const db = adminDb();
  const team = await teamSettings(db);
  const pool = teamTwilioNumbers(team);
  if ((p.From ?? '').startsWith('client:')) {
    const agent = p.From.slice(7);
    const to = twilioE164(p.To ?? '');
    if (!to || !team?.agents.some(a => a.id === agent && a.twilio)) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number cannot be called.</Say></Response>');
    const used = await dialsToday(db).catch(() => ({}));
    // the number this contact already knows us by (a past Dispatch call or text), unless it is resting for the day
    const { data: last } = await db.from('quo_events').select('payload').in('type', ['call.dialed', 'message.sent']).like('phone', `%${to.slice(-10)}`)
      .order('at', { ascending: false }).limit(1);
    const lastFrom = (last?.[0] as { payload?: { from?: string } } | undefined)?.payload?.from ?? null;
    const { from } = pickFrom(pool, to, lastFrom, { used, cap: team?.twilioDailyCap ?? DAILY_CAP });
    if (!from) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Add a Twilio number in Dispatch settings first.</Say></Response>');
    // counted for the spam watch (applied: the screen's pull skips it)
    await db.from('quo_events').upsert({ id: `call.dialed:${p.CallSid}`, agent_id: agent, type: 'call.dialed', call_id: p.CallSid, phone: to, at: new Date().toISOString(),
      applied: true, payload: { source: 'twilio', from: twilioE164(from) } }, { onConflict: 'id', ignoreDuplicates: true });
    return xml(outboundTwiml({ to, callerId: twilioE164(from), base, agent, contactPhone: to, record: team?.twilioRecord !== false, notice: team?.twilioNotice !== false }));
  }
  // someone calling in: show it on the agent's screen, ring their Dispatch, else take a message
  const from = twilioE164(p.From ?? '') || p.From || '';
  const agent = await lastAgentFor(db, team, from) ?? team?.agents.find(a => a.role === 'admin' && a.twilio)?.id ?? null;
  if (agent) await db.from('quo_events').upsert({ id: `call.ringing:${p.CallSid}`, agent_id: agent, type: 'call.ringing', call_id: p.CallSid, phone: from,
    at: new Date().toISOString(), applied: true, payload: { source: 'twilio', type: 'call.ringing', data: { object: { id: p.CallSid, direction: 'incoming' } } } }, { onConflict: 'id', ignoreDuplicates: true });
  return xml(inboundTwiml({ agent, base, from }));
}

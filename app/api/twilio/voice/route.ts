// Twilio asks here what to do with a call: one the agent starts in Dispatch (from "client:<agent>"), or someone
// calling one of the team's numbers (George, 2026-11-27). Set as the TwiML App's Voice URL and each number's Voice URL.
import { adminDb, teamSettings } from '../../../../src/live/server';
import { readTwilio, teamTwilioNumbers, lastAgentFor, xml, dialsToday, DAILY_CAP, readCell, contactName } from '../../../../src/twilio/server';
import { cellReady } from '../../../../src/twilio/cell';
import { inboundTwiml, outboundTwiml, twilioE164 } from '../../../../src/twilio/twilio';
import { pickFrom } from '../../../../src/quo/localMatch';

/** A lookup that answers in time, or the fallback. */
function within<T>(ms: number, p: PromiseLike<T>, fallback: T): Promise<T> {
  return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
}

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const { p, base } = tw;
  const db = adminDb();
  const team = await within(5000, teamSettings(db), null);
  const pool = teamTwilioNumbers(team);
  if ((p.From ?? '').startsWith('client:')) {
    const agent = p.From.slice(7);
    const to = twilioE164(p.To ?? '');
    if (!to || !team?.agents.some(a => a.id === agent && a.twilio)) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number cannot be called.</Say></Response>');
    // Twilio gives up after 15 seconds, so these lookups get 4 seconds together; a slow database just means the
    // usual local-number pick (George, 2026-11-28: calls failed with 11200 while the database was busy)
    const [used, lastFrom] = await Promise.all([
      within(4000, dialsToday(db), {} as Record<string, number>),
      // the number this contact already knows us by (a past Dispatch call or text), unless it is resting for the day
      within(4000, (async () => {
        const { data: last } = await db.from('quo_events').select('payload').in('type', ['call.dialed', 'message.sent']).eq('phone', to)
          .gte('at', new Date(Date.now() - 120 * 86_400_000).toISOString()).order('at', { ascending: false }).limit(1);
        return (last?.[0] as { payload?: { from?: string } } | undefined)?.payload?.from ?? null;
      })(), null),
    ]);
    const { from } = pickFrom(pool, to, lastFrom, { used, cap: team?.twilioDailyCap ?? DAILY_CAP });
    if (!from) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Add a Twilio number in Dispatch settings first.</Say></Response>');
    // counted for the spam watch (applied: the screen's pull skips it)
    await within(3000, db.from('quo_events').upsert({ id: `call.dialed:${p.CallSid}`, agent_id: agent, type: 'call.dialed', call_id: p.CallSid, phone: to, at: new Date().toISOString(),
      applied: true, payload: { source: 'twilio', from: twilioE164(from) } }, { onConflict: 'id', ignoreDuplicates: true }).then(() => null), null);
    return xml(outboundTwiml({ to, callerId: twilioE164(from), base, agent, contactPhone: to, record: team?.twilioRecord !== false, notice: team?.twilioNotice !== false }));
  }
  // someone calling in: show it on the agent's screen, ring their Dispatch, else take a message
  const from = twilioE164(p.From ?? '') || p.From || '';
  const agent = await within(4000, lastAgentFor(db, team, from), null) ?? team?.agents.find(a => a.role === 'admin' && a.twilio)?.id ?? null;
  if (agent) await within(2000, db.from('quo_events').upsert({ id: `call.ringing:${p.CallSid}`, agent_id: agent, type: 'call.ringing', call_id: p.CallSid, phone: from,
    at: new Date().toISOString(), applied: true, payload: { source: 'twilio', type: 'call.ringing', data: { object: { id: p.CallSid, direction: 'incoming' } } } }, { onConflict: 'id', ignoreDuplicates: true }).then(() => null), null);
  // ring my cell: the cell rings with the computer, and hears who is calling
  const pref = agent ? await within(2000, readCell(db, agent), null) : null;
  if (agent && cellReady(pref)) {
    const name = await within(2000, contactName(db, agent, from), '');
    return xml(inboundTwiml({ agent, base, from, cell: twilioE164(pref.cell), name }));
  }
  return xml(inboundTwiml({ agent, base, from }));
}

// The agent answered their cell for a Dispatch call: say who it is, then dial the contact like a computer call.
import { adminDb, teamSettings } from '../../../../src/live/server';
import { readTwilio, xml } from '../../../../src/twilio/server';
import { outboundTwiml, twilioE164 } from '../../../../src/twilio/twilio';
import { bridgeTwiml } from '../../../../src/twilio/cell';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const q = tw.q, agent = q.get('a') ?? '', to = twilioE164(q.get('p') ?? ''), callerId = twilioE164(q.get('f') ?? '');
  if (!to || !callerId) return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, that call could not be placed.</Say></Response>');
  const team = await teamSettings(adminDb());
  return xml(bridgeTwiml(q.get('n') ?? '', outboundTwiml({ to, callerId, base: tw.base, agent, contactPhone: to,
    record: team?.twilioRecord !== false, notice: team?.twilioNotice !== false })));
}

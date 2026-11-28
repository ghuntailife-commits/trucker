// What the agent hears on their cell before an incoming Dispatch call connects ("Dispatch call from Sam Sample").
import { readTwilio, xml } from '../../../../src/twilio/server';
import { whisperTwiml } from '../../../../src/twilio/cell';
export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  return xml(whisperTwiml(tw.q.get('n') ?? ''));
}

// What the contact hears when they answer, before the agent is connected: "This call may be recorded."
import { xml } from '../../../../src/twilio/server';
import { NOTICE_TWIML } from '../../../../src/twilio/twilio';
export async function POST() { return xml(NOTICE_TWIML); }

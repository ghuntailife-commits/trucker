// Texts coming in to Dispatch's numbers, and Twilio's report when a text we sent was not delivered (George,
// 2026-11-27). Set automatically as the "Dispatch" messaging service's incoming address by /api/twilio/sms.
import { adminDb, teamSettings } from '../../../../src/live/server';
import { lastAgentFor, readTwilio, xml } from '../../../../src/twilio/server';
import { failedRow, inboundRow } from '../../../../src/twilio/sms';
import { twilioE164 } from '../../../../src/twilio/twilio';

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const db = adminDb();
  if (tw.q.get('status')) {
    const row = failedRow(tw.p, tw.q.get('a') || null);
    if (row) { const { error } = await db.from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true }); if (error) console.error('twilio sms status:', error.message); }
    return xml(EMPTY);
  }
  const team = await teamSettings(db);
  const from = twilioE164(tw.p.From ?? '') || tw.p.From || '';
  const agent = await lastAgentFor(db, team, from) ?? team?.agents.find(a => a.role === 'admin' && a.twilio)?.id ?? null;
  const row = inboundRow(tw.p, agent);
  if (row) { const { error } = await db.from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true }); if (error) console.error('twilio sms in:', error.message); }
  return xml(EMPTY);   // no automatic reply (Twilio answers STOP / HELP itself)
}

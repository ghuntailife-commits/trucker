// Twilio's voicemail check on auto-dial calls (George, 2026-11-28): it reports whether a person or a machine
// picked up. Stored so the agent's screen, which is waiting on the call, can log a voicemail by itself.
import { NextResponse } from 'next/server';
import { adminDb } from '../../../../src/live/server';
import { readTwilio } from '../../../../src/twilio/server';
import { amdRow } from '../../../../src/twilio/twilio';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const row = amdRow(tw.p, tw.q.get('a') ?? '', tw.q.get('r') ?? '', tw.q.get('p') ?? tw.p.To ?? '');
  if (row) {
    const { error } = await adminDb().from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('twilio amd: could not store', error.message);
  }
  return NextResponse.json({ ok: true });
}

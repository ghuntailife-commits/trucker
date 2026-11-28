// A call recording or a voicemail is ready (George, 2026-11-27): the contact gets a link that plays it.
import { NextResponse } from 'next/server';
import { adminDb } from '../../../../src/live/server';
import { readTwilio } from '../../../../src/twilio/server';
import { recordingRow, twilioEnv } from '../../../../src/twilio/twilio';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const row = recordingRow(tw.p, tw.q.get('a') ?? '', tw.q.get('p') ?? '', tw.base, twilioEnv()!.apiSecret, tw.q.get('vm') === '1');
  if (row) {
    const { error } = await adminDb().from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('twilio recording: could not store', error.message);
  }
  return NextResponse.json({ ok: true });
}

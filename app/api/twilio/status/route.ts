// Twilio reports how a call to a contact went (George, 2026-11-27). Stored like Quo's events, so the contact gets
// "Dispatch call: 2m 03s" and the dial counts.
import { NextResponse } from 'next/server';
import { adminDb } from '../../../../src/live/server';
import { readTwilio } from '../../../../src/twilio/server';
import { statusRow } from '../../../../src/twilio/twilio';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const row = statusRow(tw.p, tw.q.get('a') ?? '', tw.q.get('p') ?? tw.p.To ?? '');
  if (row) {
    const { error } = await adminDb().from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('twilio status: could not store', error.message);
  }
  return NextResponse.json({ ok: true });
}

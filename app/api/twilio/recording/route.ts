// A call recording or a voicemail is ready (George, 2026-11-27): the contact gets a link that plays it.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings } from '../../../../src/live/server';
import { startTranscript } from '../../../../src/twilio/intel';
import { readTwilio } from '../../../../src/twilio/server';
import { recordingRow, twilioEnv } from '../../../../src/twilio/twilio';

export async function POST(req: Request) {
  const tw = await readTwilio(req);
  if (!tw) return new Response('not from Twilio', { status: 403 });
  const row = recordingRow(tw.p, tw.q.get('a') ?? '', tw.q.get('p') ?? '', tw.base, twilioEnv()!.apiSecret, tw.q.get('vm') === '1');
  if (row) {
    const { error } = await adminDb().from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('twilio recording: could not store', error.message);
    // then a transcript, for the call notes and coaching (Settings > Dispatch calling > Transcribe calls)
    const db = adminDb();
    const team = await teamSettings(db);
    if (team?.twilioTranscribe !== false && tw.p.RecordingSid && Number(tw.p.RecordingDuration ?? 0) >= (tw.q.get('vm') === '1' ? 3 : 20)) {   // short hang-ups aren't worth a transcript (George, 2026-11-28: cost)
      await startTranscript(tw.base, tw.p.RecordingSid, { agent: tw.q.get('a') ?? '', phone: tw.q.get('p') ?? '', callSid: tw.p.CallSid ?? '', voicemail: tw.q.get('vm') === '1' })
        .catch(e => console.error('twilio recording: transcript not started', (e as Error).message));
    }
  }
  return NextResponse.json({ ok: true });
}

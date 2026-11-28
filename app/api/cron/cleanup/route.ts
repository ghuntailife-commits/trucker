// Daily cleanup (George, 2026-11-28): retries AI call notes that failed, and Twilio recordings older than 90 days are removed so storage stays cheap.
// The AI call notes and transcripts Dispatch saved stay; only the audio goes (its old "Call recording" link stops playing).
import { NextResponse } from 'next/server';
import { twilioApi } from '../../../../src/twilio/server';
import { twilioEnv } from '../../../../src/twilio/twilio';
import { adminDb } from '../../../../src/live/server';
import { repairNotes } from '../../../../src/quo/repair';

export const maxDuration = 60;
const KEEP_DAYS = 90;

type Page = { recordings?: { sid: string; date_created: string }[] };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, auth = req.headers.get('authorization');
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get('user-agent') ?? '');
  if (!fromCron) return NextResponse.json({ ok: true, cleanup: `daily: Twilio recordings older than ${KEEP_DAYS} days` });
  const start = Date.now();
  // first: AI call notes that failed yesterday get another try (about 25 seconds)
  const notes = await repairNotes(adminDb(), 25_000).catch(e => ({ error: (e as Error).message }));
  if (!twilioEnv()) return NextResponse.json({ ok: true, notes, skipped: 'Twilio not set up' });

  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const before = new Date(cutoff).toISOString().slice(0, 10);
  let removed = 0, failed = 0;
  try {
    while (Date.now() - start < 45_000) {
      const page = await twilioApi<Page>(`/Recordings.json?DateCreated%3C=${before}&PageSize=100`);
      const list = (page.recordings ?? []).filter(r => Date.parse(r.date_created) < cutoff);
      if (!list.length) break;
      for (const r of list) {
        if (Date.now() - start > 50_000) break;
        try { await twilioApi(`/Recordings/${r.sid}.json`, { method: 'DELETE' }); removed++; } catch { failed++; }
      }
      if (failed > 20) break;
    }
    return NextResponse.json({ ok: true, notes, removed, failed });
  } catch (e) { return NextResponse.json({ error: (e as Error).message, removed }, { status: 500 }); }
}

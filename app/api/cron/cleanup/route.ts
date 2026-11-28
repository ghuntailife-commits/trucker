// Daily cleanup (George, 2026-11-28): Twilio recordings older than 90 days are removed so storage stays cheap.
// The AI call notes and transcripts Dispatch saved stay; only the audio goes (its old "Call recording" link stops playing).
import { NextResponse } from 'next/server';
import { twilioApi } from '../../../../src/twilio/server';
import { twilioEnv } from '../../../../src/twilio/twilio';

export const maxDuration = 60;
const KEEP_DAYS = 90;

type Page = { recordings?: { sid: string; date_created: string }[] };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, auth = req.headers.get('authorization');
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get('user-agent') ?? '');
  if (!fromCron) return NextResponse.json({ ok: true, cleanup: `daily: Twilio recordings older than ${KEEP_DAYS} days` });
  if (!twilioEnv()) return NextResponse.json({ ok: true, skipped: 'Twilio not set up' });
  const start = Date.now();
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
    return NextResponse.json({ ok: true, removed, failed });
  } catch (e) { return NextResponse.json({ error: (e as Error).message, removed }, { status: 500 }); }
}

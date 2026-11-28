// Twilio Voice Intelligence says a Dispatch call's transcript is ready (George, 2026-11-27). We read it back from
// Twilio with the team's key (so only a transcript that really exists in our account is used), then Claude writes
// the call notes and coaching tags, stored like a Quo transcript.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb } from '../../../../src/live/server';
import { dialogueFrom, parseKey, readTranscript } from '../../../../src/twilio/intel';
import { transcriptText } from '../../../../src/quo/events';
import { tagTranscript } from '../../../../src/quo/tagCall';

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  let sid = '';
  try { sid = (JSON.parse(raw) as { transcript_sid?: string }).transcript_sid ?? ''; }
  catch { sid = new URLSearchParams(raw).get('transcript_sid') ?? ''; }
  if (!/^GT[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ ok: true, ignored: true });
  try {
    const t = await readTranscript(sid);
    if (t.status && t.status !== 'completed') return NextResponse.json({ ok: true, status: t.status });
    const k = parseKey(t.key);
    const dialogue = dialogueFrom(t.sentences, k.voicemail);
    const payload = { source: 'twilio', type: 'call.transcript.completed', data: { object: { id: sid, dialogue } } };
    let ai: string | null = null, tags: unknown = null;
    const text = transcriptText(payload);
    if (text.length > 40 && process.env.ANTHROPIC_API_KEY) {
      try { const got = await tagTranscript(new Anthropic(), text); ai = got?.note || null; tags = got?.tags ?? null; }
      catch (e) { console.error('twilio transcript: notes failed', (e as Error).message); }
    }
    const row: Record<string, unknown> = { id: `call.transcript.completed:${sid}`, agent_id: k.agent || null, type: 'call.transcript.completed', call_id: k.callSid || null,
      phone: k.phone, at: new Date().toISOString(), applied: false, payload, ai_note: ai };
    const db = adminDb();
    let { error } = await db.from('quo_events').upsert(tags ? { ...row, ai_tags: tags } : row, { onConflict: 'id', ignoreDuplicates: true });
    if (error && tags && /ai_tags/.test(error.message)) ({ error } = await db.from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    console.log('twilio transcript: stored', sid, 'agent', k.agent, 'lines', dialogue.length, 'ai note', !!ai);
    return NextResponse.json({ ok: true });
  } catch (e) { console.error('twilio transcript:', (e as Error).message); return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

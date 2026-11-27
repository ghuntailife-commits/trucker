// Quo calls this when a call ends, a text comes in, or a recording, transcript or summary is ready.
// Each event is checked against Quo's signing key, matched to the agent whose Quo number it was, and stored.
// Transcripts get short call notes written by Claude. The agent's Dispatch puts them on the contact's notes.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, teamSettings, agentByNumber } from '../../../../src/live/server';
import { verifySignature } from '../../../../src/quo/quo';
import { quoParts, transcriptText, NOTE_PROMPT } from '../../../../src/quo/events';

export async function POST(req: Request) {
  const raw = await req.text();
  const signing = process.env.QUO_SIGNING_KEY;
  if (!signing) return NextResponse.json({ error: 'QUO_SIGNING_KEY is not set on Vercel' }, { status: 500 });
  const sig = req.headers.get('openphone-signature') ?? req.headers.get('quo-signature');
  if (!(await verifySignature(sig, raw, signing))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'not JSON' }, { status: 400 }); }
  const ev = quoParts(body);
  if (!ev) return NextResponse.json({ ok: true, ignored: true });

  const db = adminDb();
  let agentId: string | null = null, phone = ev.them;
  if (ev.ours) agentId = agentByNumber(await teamSettings(db), ev.ours)?.id ?? null;
  if ((!agentId || !phone) && ev.callId) {
    // transcripts and summaries only name the call: take the agent and number from that call's other events
    const { data } = await db.from('quo_events').select('agent_id,phone').eq('call_id', ev.callId).not('agent_id', 'is', null).limit(1);
    if (data?.[0]) { agentId ??= data[0].agent_id; phone ||= data[0].phone; }
  }

  let ai: string | null = null;
  if (ev.type === 'call.transcript.completed' && process.env.ANTHROPIC_API_KEY) {
    const text = transcriptText(body, ev.ours);
    if (text.length > 40) {
      try {
        const client = new Anthropic();
        const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 600, system: NOTE_PROMPT,
          messages: [{ role: 'user', content: `Call transcript:\n\n${text.slice(0, 60_000)}` }] });
        ai = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim() || null;
      } catch (e) { ai = null; console.error('call notes failed', (e as Error).message); }
    }
  }

  const { error } = await db.from('quo_events').upsert({ id: `${ev.type}:${ev.id}`, agent_id: agentId, type: ev.type, call_id: ev.callId,
    phone, at: new Date(ev.at).toISOString(), payload: body, ai_note: ai }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // a transcript or summary that arrived before its call: give it this call's agent and number now
  if (agentId && ev.callId) await db.from('quo_events').update({ agent_id: agentId, phone }).eq('call_id', ev.callId).is('agent_id', null);
  return NextResponse.json({ ok: true });
}

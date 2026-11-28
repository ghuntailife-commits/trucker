// Quo calls this when a call ends, a text comes in, or a recording, transcript or summary is ready.
// Each event is checked against Quo's signing key, matched to the agent whose Quo number it was, and stored.
// Transcripts get short call notes written by Claude. The agent's Dispatch puts them on the contact's notes.
import { NextResponse } from 'next/server';

export const maxDuration = 60;   // Claude's call notes can take longer than the default limit
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, teamSettings, agentByNumber } from '../../../../src/live/server';
import { verifySignature, verifyStandard } from '../../../../src/quo/quo';
import { quoParts, quoNumberId, transcriptText } from '../../../../src/quo/events';
import { type CallTags } from '../../../../src/quo/coach';
import { tagTranscript } from '../../../../src/quo/tagCall';
import { quoWorkspaces, type QuoWorkspace } from '../../../../src/quo/keys';

/** The agent's Quo number from Quo's id for it (PN...), asked from Quo once per server start. */
const numberIds = new Map<string, string>();
async function numberFromId(pn: string, apiKey: string): Promise<string> {
  if (!pn || !apiKey) return '';
  if (!numberIds.has(pn)) {
    try {
      const r = await fetch('https://api.openphone.com/v1/phone-numbers', { headers: { Authorization: apiKey } });
      const j = await r.json();
      for (const n of j?.data ?? []) if (n?.id && n?.number) numberIds.set(n.id, n.number);
    } catch (e) { console.error('quo phone numbers failed', (e as Error).message); }
  }
  return numberIds.get(pn) ?? '';
}

export async function POST(req: Request) {
  const raw = await req.text();
  console.log('quo webhook', raw.length, 'bytes', JSON.stringify(raw.slice(0, 120)));
  // George's workspace or an agent's own Quo workspace (Gracie): whichever signing key matches says whose it is
  const spaces = quoWorkspaces().filter(w => w.signing);
  if (!spaces.length) return NextResponse.json({ error: 'QUO_SIGNING_KEY is not set on Vercel' }, { status: 500 });
  const sig = req.headers.get('openphone-signature') ?? req.headers.get('quo-signature');
  let ws: QuoWorkspace | null = null;
  for (const w of spaces) {
    const ok = req.headers.get('webhook-signature')
      ? await verifyStandard(req.headers.get('webhook-id'), req.headers.get('webhook-timestamp'), req.headers.get('webhook-signature'), raw, w.signing).catch(() => false)
      : await verifySignature(sig, raw, w.signing).catch(() => false);
    if (ok) { ws = w; break; }
  }
  if (!ws) {
    console.error('quo webhook: signature did not match', [...req.headers.keys()].join(','));
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'not JSON' }, { status: 400 }); }
  const ev = quoParts(body);
  if (!ev) { console.log('quo webhook: ignored', (body as { type?: string })?.type); return NextResponse.json({ ok: true, ignored: true }); }

  const db = adminDb();
  let agentId: string | null = null, phone = ev.them;
  const team = await teamSettings(db);
  if (ev.ours) agentId = agentByNumber(team, ev.ours)?.id ?? null;
  if (!agentId) { const n = await numberFromId(quoNumberId(body), ws.apiKey || process.env.QUO_API_KEY || ''); if (n) agentId = agentByNumber(team, n)?.id ?? null; }
  if (!agentId && ws.agent && !ev.callId) agentId = ws.agent;   // an agent's own workspace: it's theirs
  if ((!agentId || !phone) && ev.callId) {
    // transcripts and summaries only name the call: take the agent and number from that call's other events
    const { data } = await db.from('quo_events').select('agent_id,phone').eq('call_id', ev.callId).not('agent_id', 'is', null).limit(1);
    if (data?.[0]) { agentId ??= data[0].agent_id; phone ||= data[0].phone; }
  }

  let ai: string | null = null, tags: CallTags | null = null;
  if (ev.type === 'call.transcript.completed' && process.env.ANTHROPIC_API_KEY) {
    const text = transcriptText(body, ev.ours);
    if (text.length <= 40) ai = '';   // nothing said worth a note (a hang-up or a greeting): '' = checked, not failed
    else {
      try {
        const got = await tagTranscript(new Anthropic(), text);
        ai = got?.note || null; tags = got?.tags ?? null;
      } catch (e) { ai = null; console.error('call notes failed', (e as Error).message); }
    }
  }

  const row: Record<string, unknown> = { id: `${ev.type}:${ev.id}`, agent_id: agentId, type: ev.type, call_id: ev.callId, phone, at: new Date(ev.at).toISOString(), payload: body, ai_note: ai };
  let { error } = await db.from('quo_events').upsert(tags ? { ...row, ai_tags: tags } : row, { onConflict: 'id', ignoreDuplicates: true });
  // before the ai_tags column is added (supabase/live-quo.sql), keep the event and its notes without the tags
  if (error && tags && /ai_tags/.test(error.message)) ({ error } = await db.from('quo_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true }));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agentId && ws.agent && ev.callId) { agentId = ws.agent; await db.from('quo_events').update({ agent_id: agentId }).eq('id', row.id as string); }
  // a transcript or summary that arrived before its call: give it this call's agent and number now
  if (agentId && ev.callId) await db.from('quo_events').update({ agent_id: agentId, phone }).eq('call_id', ev.callId).is('agent_id', null);
  console.log('quo webhook: stored', ev.type, 'agent', agentId, 'ours', ev.ours, 'them', ev.them ? 'yes' : 'no', 'ai note', !!ai, 'tags', tags?.outcome ?? '-');
  return NextResponse.json({ ok: true });
}

/** Opening the address in a browser shows this, to check the webhook is reachable. */
export async function GET() { return NextResponse.json({ ok: true, webhook: 'quo', signingKey: !!process.env.QUO_SIGNING_KEY, secretKey: !!process.env.SUPABASE_SECRET_KEY,
  workspaces: quoWorkspaces().map(w => ({ for: w.agent ?? 'george', signingKey: !!w.signing, apiKey: !!w.apiKey })) }); }

// Coaching for one agent (George, 2026-11-26): an agent may ask only about themselves; the admin about anyone.
// action "week": Claude writes this week's coaching note from the tagged calls and saves it (kv dispatch-coach-<agent>).
// action "tag": tags up to 15 older transcribed calls that have notes but no coaching tags yet.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../src/live/server';
import { CALL_TOOL, readCallTool, WEEKLY_PROMPT, weekForClaude, type CallTags, type CoachCall } from '../../../src/quo/coach';
import { transcriptText, NOTE_PROMPT } from '../../../src/quo/events';

const WEEK = 7 * 86_400_000;

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { agent, action } = await req.json() as { agent: string; action: 'week' | 'tag' };
    if (agent !== me.agentId && me.role !== 'admin') return NextResponse.json({ error: 'You can only see your own coaching.' }, { status: 403 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on Vercel.' }, { status: 500 });
    const client = new Anthropic();

    if (action === 'tag') {
      const { data, error } = await db.from('quo_events').select('id,payload').eq('agent_id', agent).eq('type', 'call.transcript.completed')
        .is('ai_tags', null).order('at', { ascending: false }).limit(15);
      if (error) return NextResponse.json({ error: /ai_tags/.test(error.message) ? 'Run the coaching line in Supabase first (see Dispatch setup).' : error.message }, { status: 500 });
      let done = 0;
      for (const e of data ?? []) {
        const text = transcriptText(e.payload);
        if (text.length <= 40) continue;
        const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 1000,
          system: `${NOTE_PROMPT}\nAlso tag the call for the agent's coaching. Save everything with the save_call tool.`,
          tools: [CALL_TOOL], tool_choice: { type: 'tool', name: CALL_TOOL.name },
          messages: [{ role: 'user', content: `Call transcript:\n\n${text.slice(0, 60_000)}` }] });
        const got = readCallTool((r.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined)?.input);
        if (got) { await db.from('quo_events').update({ ai_tags: got.tags }).eq('id', e.id); done++; }
      }
      return NextResponse.json({ ok: true, tagged: done });
    }

    const since = new Date(Date.now() - WEEK).toISOString();
    const { data, error } = await db.from('quo_events').select('id,agent_id,call_id,at,phone,ai_note,ai_tags').eq('agent_id', agent)
      .eq('type', 'call.transcript.completed').gte('at', since).order('at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const calls: CoachCall[] = (data ?? []).map(e => ({ id: e.id, agentId: e.agent_id, callId: e.call_id, at: Date.parse(e.at), phone: e.phone ?? '',
      note: e.ai_note ?? '', tags: (e.ai_tags as CallTags | null) ?? null }));
    if (!calls.some(c => c.tags)) return NextResponse.json({ error: 'No tagged calls in the last 7 days yet.' }, { status: 400 });
    const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 800, system: WEEKLY_PROMPT,
      messages: [{ role: 'user', content: weekForClaude(calls) }] });
    const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim();
    const value = { at: Date.now(), text, calls: calls.length };
    await db.from('kv').upsert({ key: `dispatch-coach-${agent}`, part: 'all', owner: agent, value, updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, ...value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

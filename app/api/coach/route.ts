// Coaching for one agent (George, 2026-11-26): an agent may ask only about themselves; the admin about anyone.
// action "week": Claude writes this week's coaching note from the tagged calls and saves it (kv dispatch-coach-<agent>).
// action "ask": Ask the coach - answers from the team Playbook, George's teachings and the agent's own numbers.
// action "tag": tags up to 15 older transcribed calls that have notes but no coaching tags yet.
// action "profile": re-reads up to 4 recent calls tagged before "What we know" existed (George, 2026-11-27) and
//   returns the facts by phone so the agent's Dispatch can add them to the contacts. Called again while `more`.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../src/live/server';
import { WEEKLY_PROMPT, weekForClaude, coachSums, type CallTags, type CoachCall } from '../../../src/quo/coach';
import { transcriptText } from '../../../src/quo/events';
import { tagTranscript } from '../../../src/quo/tagCall';
import { ASK_PROMPT, rebuttalsFor, type Playbook } from '../../../src/quo/playbook';

const WEEK = 7 * 86_400_000;

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { agent, action, question, history } = await req.json() as { agent: string; action: 'week' | 'tag' | 'ask' | 'profile'; question?: string; history?: { q: string; a: string }[] };
    if (agent !== me.agentId && me.role !== 'admin') return NextResponse.json({ error: 'You can only see your own coaching.' }, { status: 403 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on Vercel.' }, { status: 500 });
    const client = new Anthropic();

    if (action === 'ask') {
      const q = String(question ?? '').trim().slice(0, 2000);
      if (!q) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
      const [{ data: pbRow }, { data: tRow }, { data: mine }] = await Promise.all([
        db.from('kv').select('value').eq('key', 'dispatch-team-playbook').eq('part', 'all').maybeSingle(),
        db.from('kv').select('value').eq('key', 'dispatch-team-teach').eq('part', 'all').maybeSingle(),
        db.from('quo_events').select('id,agent_id,call_id,at,phone,ai_note,ai_tags').eq('agent_id', agent).eq('type', 'call.transcript.completed')
          .gte('at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
      ]);
      const pb = pbRow?.value as Playbook | undefined;
      const teach = ((tRow?.value as { items?: { title: string; text: string }[] } | undefined)?.items ?? []);
      const calls: CoachCall[] = (mine ?? []).map(e => ({ id: e.id, agentId: e.agent_id, callId: e.call_id, at: Date.parse(e.at), phone: '', note: e.ai_note ?? '', tags: (e.ai_tags as CallTags | null) ?? null }));
      const sm = coachSums(calls);
      const book = pb ? [`Team summary: ${pb.summary}`, `Calls studied: ${pb.callsStudied}`,
        ...pb.objections.map(o => [`Objection "${o.label}": heard ${o.heard}, saved ${o.saved}. They say: ${o.theySay.join(' / ')}`,
          ...rebuttalsFor(pb, o.label).slice(0, 5).map(r => `  - "${r.line}" (${r.tried ? `tried ${r.tried}, saved ${r.saved}` : r.from === 'george' ? "from George, not tried yet" : 'untested idea'}). ${r.why}`)].join('\n')),
        `Openers: ${pb.openers.map(o => `"${o.line}" tried ${o.tried}, ended well ${o.good}`).join('; ')}`,
        `Tips: ${pb.tips.join(' / ')}`, `Trends: ${pb.trends.join(' / ')}`].join('\n') : '(The Playbook has not been built yet.)';
      const mineText = `This agent's last 30 days: ${sm.calls} calls analyzed, ${sm.talked} real conversations, ${sm.good} ended well. Objections: ${sm.objections.map(o => `${o.label} ${o.count} (saved ${o.savedAnyway})`).join(', ') || 'none'}.`;
      const teachText = teach.map(t => `## ${t.title}\n${t.text.slice(0, 8000)}`).join('\n\n') || '(none)';
      const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const h of (history ?? []).slice(-6)) { msgs.push({ role: 'user', content: String(h.q).slice(0, 2000) }, { role: 'assistant', content: String(h.a).slice(0, 4000) }); }
      msgs.push({ role: 'user', content: q });
      const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000,
        system: `${ASK_PROMPT}\n\n# Team Playbook\n${book}\n\n# George's teachings\n${teachText}\n\n# ${mineText}`, messages: msgs });
      const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim();
      return NextResponse.json({ ok: true, text });
    }

    if (action === 'profile') {
      const { data, error } = await db.from('quo_events').select('id,payload,phone,at,ai_tags').eq('agent_id', agent).eq('type', 'call.transcript.completed')
        .gte('at', new Date(Date.now() - 60 * 86_400_000).toISOString()).order('at', { ascending: false }).limit(300);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const todo = (data ?? []).filter(e => !Array.isArray((e.ai_tags as { facts?: unknown } | null)?.facts));
      const out: { phone: string; at: number; facts: unknown }[] = [];
      for (const e of todo.slice(0, 4)) {
        const text = transcriptText(e.payload);
        const got = text.length > 40 ? await tagTranscript(client, text) : null;
        const tags = got?.tags ?? { ...((e.ai_tags as object | null) ?? { outcome: 'Other', objections: [], wentWell: '', tryNext: '' }), facts: [] };
        await db.from('quo_events').update({ ai_tags: tags }).eq('id', e.id);
        if (got?.tags.facts?.length) out.push({ phone: e.phone ?? '', at: Date.parse(e.at), facts: got.tags.facts });
      }
      return NextResponse.json({ ok: true, found: out, more: todo.length > 4 });
    }

    if (action === 'tag') {
      const { data, error } = await db.from('quo_events').select('id,payload').eq('agent_id', agent).eq('type', 'call.transcript.completed')
        .is('ai_tags', null).order('at', { ascending: false }).limit(15);
      if (error) return NextResponse.json({ error: /ai_tags/.test(error.message) ? 'Run the coaching line in Supabase first (see Dispatch setup).' : error.message }, { status: 500 });
      let done = 0;
      for (const e of data ?? []) {
        const text = transcriptText(e.payload);
        if (text.length <= 40) continue;
        const got = await tagTranscript(client, text);
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

// The Playbook's learning run (George, 2026-11-26). Every morning (Vercel cron, vercel.json) and on George's
// "Learn now": takes the team's transcribed calls since the last run, makes sure each is broken into exchanges
// (re-tagging older calls that were tagged before the Playbook existed), and has Claude file them into the Playbook.
// Counts are kept by src/quo/playbook.ts. Saves kv "dispatch-team-playbook" (everyone signed in can read it).
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { transcriptText } from '../../../../src/quo/events';
import { tagTranscript } from '../../../../src/quo/tagCall';
import type { CallTags } from '../../../../src/quo/coach';
import { LEARN_PROMPT, LEARN_TOOL, applyLearn, emptyPlaybook, learnInput, type Playbook, type StudyCall } from '../../../../src/quo/playbook';

export const maxDuration = 300;
const BATCH = 120, RETAG = 16;
const NO_TALK = ['Voicemail', 'No answer', 'Wrong number'];

async function learn(): Promise<Record<string, unknown>> {
  const db = adminDb();
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY is not set on Vercel.' };
  const client = new Anthropic();
  const [{ data: pbRow }, { data: tRow }] = await Promise.all([
    db.from('kv').select('value').eq('key', 'dispatch-team-playbook').eq('part', 'all').maybeSingle(),
    db.from('kv').select('value').eq('key', 'dispatch-team-teach').eq('part', 'all').maybeSingle(),
  ]);
  const pb: Playbook = { ...emptyPlaybook(), ...(pbRow?.value as Playbook | undefined) };
  const teach = ((tRow?.value as { items?: { title: string; text: string }[] } | undefined)?.items ?? []);

  const { data, error } = await db.from('quo_events').select('id,agent_id,at,ai_note,ai_tags').eq('type', 'call.transcript.completed')
    .gt('at', new Date(pb.watermark).toISOString()).order('at', { ascending: true }).limit(BATCH);
  if (error) return { error: /ai_tags/.test(error.message) ? 'Run the coaching line in Supabase first (see Dispatch setup).' : error.message };
  const rows = data ?? [];

  // calls tagged before the Playbook existed (or never tagged) get their exchanges now, a few at a time
  const needs = (t: CallTags | null) => !t || !Array.isArray(t.exchanges);
  let retagged = 0, stopAt = rows.length;
  const todo = rows.map((r, i) => ({ r, i })).filter(x => needs(x.r.ai_tags as CallTags | null));
  if (todo.length > RETAG) stopAt = todo[RETAG].i;
  const now = todo.slice(0, RETAG);
  for (let i = 0; i < now.length; i += 4) {
    await Promise.all(now.slice(i, i + 4).map(async ({ r }) => {
      const { data: full } = await db.from('quo_events').select('payload').eq('id', r.id).maybeSingle();
      const text = transcriptText(full?.payload);
      if (text.length <= 40) { r.ai_tags = { outcome: 'Other', objections: [], wentWell: '', tryNext: '', exchanges: [] }; return; }
      try {
        const got = await tagTranscript(client, text);
        if (got) { r.ai_tags = got.tags; r.ai_note ||= got.note; await db.from('quo_events').update({ ai_tags: got.tags, ai_note: r.ai_note }).eq('id', r.id); retagged++; }
      } catch (e) { console.error('playbook retag failed', (e as Error).message); }
    }));
  }
  // only move forward through calls that are ready, so nothing is skipped
  const ready = rows.slice(0, stopAt);
  const firstStuck = ready.findIndex(r => needs(r.ai_tags as CallTags | null));
  const batch = firstStuck < 0 ? ready : ready.slice(0, firstStuck);
  const more = batch.length < rows.length || rows.length === BATCH;
  const calls: StudyCall[] = batch.map(r => { const t = r.ai_tags as CallTags; return { id: r.id, at: Date.parse(r.at), agent: r.agent_id ?? '', outcome: t.outcome,
    stage: t.stage, opener: NO_TALK.includes(t.outcome) ? '' : t.opener, exchanges: t.exchanges ?? [], note: r.ai_note ?? '' }; });
  if (!calls.length) return { ok: true, studied: 0, retagged, more, message: rows.length ? 'Tagging older calls first. Run again to keep going.' : 'No new calls since the last run.' };

  const talk = calls.filter(c => c.exchanges.length || c.opener);
  let next: Playbook;
  if (!talk.length) {
    next = { ...pb, callsStudied: pb.callsStudied + calls.length, watermark: Math.max(pb.watermark, ...calls.map(c => c.at)), updatedAt: Date.now() };
  } else {
    const input = learnInput(pb, talk, teach);
    const msg = await client.messages.stream({ model: 'claude-opus-5-5', max_tokens: 16000, system: LEARN_PROMPT,
      tools: [LEARN_TOOL], tool_choice: { type: 'tool', name: LEARN_TOOL.name },
      messages: [{ role: 'user', content: input.text }] }).finalMessage();
    if (msg.stop_reason === 'max_tokens') return { error: 'The learning run was cut short. Try again; it will take fewer calls.' };
    const use = msg.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined;
    if (!use) return { error: 'Claude did not return a Playbook update. Try again.' };
    next = applyLearn(pb, talk, input, use.input, Date.now());
    next.callsStudied = pb.callsStudied + calls.length;
    next.watermark = Math.max(next.watermark, ...calls.map(c => c.at));
  }
  const { error: e2 } = await db.from('kv').upsert({ key: 'dispatch-team-playbook', part: 'all', owner: 'shared', value: next, updated_at: new Date().toISOString() });
  if (e2) return { error: e2.message };
  return { ok: true, studied: calls.length, conversations: talk.length, retagged, more };
}

/** Vercel's daily cron. With CRON_SECRET set on Vercel it must match; it runs at most once every 20 hours. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, auth = req.headers.get('authorization');
  const fromCron = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get('user-agent') ?? '');
  if (!fromCron) return NextResponse.json({ ok: true, playbook: 'learning run: daily' });
  try {
    const { data } = await adminDb().from('kv').select('value').eq('key', 'dispatch-team-playbook').eq('part', 'all').maybeSingle();
    if (Date.now() - ((data?.value as Playbook | undefined)?.updatedAt ?? 0) < 20 * 3_600_000) return NextResponse.json({ ok: true, skipped: 'ran recently' });
    let r = await learn();
    if (r.more && !r.error) r = await learn();   // catch up a little each morning
    return NextResponse.json(r);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** George's "Learn now" on the Coaching tab (admin only). */
export async function POST(req: Request) {
  try {
    const me = await whoIsCalling(adminDb(), req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    if (me.role !== 'admin') return NextResponse.json({ error: 'Only George can run the learning by hand.' }, { status: 403 });
    const r = await learn();
    return NextResponse.json(r, { status: r.error ? 500 : 200 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

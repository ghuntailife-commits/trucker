// The AI call brief (George, 2026-11-27): Claude writes the brief in its own words from the contact's record,
// the facts learned on past calls and the rules draft. The screen shows the rules draft until this comes back.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../src/live/server';
import { aiBrief, type AiBriefInput } from '../../../src/brief/ai';

export const maxDuration = 60;
const KINDS = ['callback', 'followUp', 'noshow', 'appt', 'retry'];

export async function POST(req: Request) {
  try {
    const me = await whoIsCalling(adminDb(), req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on Vercel.' }, { status: 500 });
    const b = await req.json() as Partial<AiBriefInput>;
    if (!b.kind || !KINDS.includes(b.kind) || typeof b.contactText !== 'string') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const brief = await aiBrief({ kind: b.kind, agent: String(b.agent ?? '').slice(0, 60), contactText: b.contactText.slice(0, 20_000), draft: b.draft ?? null }, new Anthropic());
    return brief ? NextResponse.json({ ok: true, brief }) : NextResponse.json({ error: 'No brief came back' }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

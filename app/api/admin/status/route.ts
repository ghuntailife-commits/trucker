// System status for the admin (George, 2026-11-27): one read of everything the server knows about each agent.
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { quoWorkspaces } from '../../../../src/quo/keys';
import type { AgentRaw, Screen } from '../../../../src/status/check';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export async function GET(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    if (me.role !== 'admin') return NextResponse.json({ error: 'Only the admin can see system status.' }, { status: 403 });
    const now = Date.now(), week = new Date(now - 7 * 86_400_000).toISOString();

    const [people, saves, pings, inboxes, calStat, tokens, calRows, quo] = await Promise.all([
      db.from('people').select('agent_id,email,role'),
      db.from('kv').select('owner,updated_at').like('key', 'dispatch-agent-%').order('updated_at', { ascending: false }).limit(3000),
      db.from('kv').select('part,value').eq('key', 'dispatch-status-ping'),
      db.from('kv').select('key,value').like('key', 'dispatch-inbox-%'),
      db.from('kv').select('part,value').eq('key', 'dispatch-status-cal'),
      db.from('google_tokens').select('agent_id,email'),
      db.from('calendar_events').select('agent_id'),
      db.from('quo_events').select('agent_id,type,at,ai_note,applied').gte('at', week).order('at', { ascending: false }).limit(5000),
    ]);
    const err = [people, saves, pings, inboxes, quo].find(r => r.error)?.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const lastSave = new Map<string, number>();
    for (const r of (saves.data ?? []) as Any[]) if (!lastSave.has(r.owner)) lastSave.set(r.owner, Date.parse(r.updated_at));
    const screens = new Map<string, Screen[]>();
    const oldPings: string[] = [];
    for (const r of (pings.data ?? []) as Any[]) {
      const v = r.value as Screen;
      if (now - v.at > 86_400_000) { oldPings.push(r.part); continue; }
      screens.set(v.agent, [...(screens.get(v.agent) ?? []), v]);
    }
    if (oldPings.length) await db.from('kv').delete().eq('key', 'dispatch-status-ping').in('part', oldPings.slice(0, 200));
    const inbox = new Map<string, number>();
    for (const r of (inboxes.data ?? []) as Any[]) {
      const v = r.value ?? {};
      const n = ['contacts', 'removed', 'changed', 'events', 'sales', 'noSales'].reduce((s, k) => s + (Array.isArray(v[k]) ? v[k].length : 0), 0);
      if (n) inbox.set(String(r.key).replace(/^dispatch-inbox-/, ''), n);
    }
    const cal = new Map(((calStat.data ?? []) as Any[]).map(r => [r.part, r.value]));
    const tok = new Map(((tokens.data ?? []) as Any[]).map(r => [r.agent_id, r.email]));
    const calCount = new Map<string, number>();
    for (const r of (calRows.data ?? []) as Any[]) calCount.set(r.agent_id, (calCount.get(r.agent_id) ?? 0) + 1);
    const ws = quoWorkspaces();
    const wsAgents = new Set(ws.map(w => w.agent ?? 'george'));
    const q = new Map<string, NonNullable<AgentRaw['quo']>>();
    for (const r of (quo.data ?? []) as Any[]) {
      const id = r.agent_id ?? '?';
      const x = q.get(id) ?? { workspace: wsAgents.has(id), last: null, calls7: 0, texts7: 0, transcripts7: 0, notesMissing: 0, stuck: 0 };
      const at = Date.parse(r.at);
      x.last = Math.max(x.last ?? 0, at);
      if (r.type === 'call.completed') x.calls7++;
      if (/^message\./.test(r.type)) x.texts7++;
      if (r.type === 'call.transcript.completed') { x.transcripts7++; if (!r.ai_note && now - at > 10 * 60_000) x.notesMissing++; }
      if (!r.applied && now - at > 30 * 60_000 && /^(call\.completed|message\.received|call\.recording\.completed)$/.test(r.type)) x.stuck++;
      q.set(id, x);
    }
    const agents: AgentRaw[] = ((people.data ?? []) as Any[]).map(p => ({
      id: p.agent_id, email: p.email, role: p.role,
      lastSave: lastSave.get(p.agent_id) ?? null, inbox: inbox.get(p.agent_id) ?? 0, screens: screens.get(p.agent_id) ?? [],
      quo: q.get(p.agent_id) ?? (wsAgents.has(p.agent_id) ? { workspace: true, last: null, calls7: 0, texts7: 0, transcripts7: 0, notesMissing: 0, stuck: 0 } : null),
      cal: { connected: tok.has(p.agent_id), email: tok.get(p.agent_id), events: calCount.get(p.agent_id) ?? 0, ...(cal.get(p.agent_id) ?? {}) },
    }));
    return NextResponse.json({
      now, build: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev', agents,
      setup: { anthropic: !!process.env.ANTHROPIC_API_KEY, google: !!(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID), quo: ws.map(w => w.agent ?? 'george'),
        unassignedQuo: q.get('?')?.calls7 ?? 0 },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

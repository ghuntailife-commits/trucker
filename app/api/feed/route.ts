// The team feed (George, 2026-11-27): an agent's screen posts its own news here; everyone on the team reads it
// (kv dispatch-team-feed, one part per agent, owner "shared" so every signed-in agent can read it).
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../src/live/server';
import { trimFeed, type FeedItem } from '../../../src/team/feed';

const KEY = 'dispatch-team-feed';

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { items, agent: forAgent } = await req.json() as { items: FeedItem[]; agent?: string };
    // your own news; the admin also posts for the agent they are viewing (e.g. leads they just imported for them)
    const agent = forAgent && me.role === 'admin' ? forAgent : me.agentId;
    const name = (await teamSettings(db))?.agents.find(a => a.id === agent)?.name ?? agent;
    const now = Date.now();
    // only your own news, with your own name; nothing but the known fields
    const clean = (items ?? []).slice(0, 20).filter(f => f && ['leads', 'sale', 'presented', 'booked'].includes(f.kind)).map(f => ({
      id: String(f.id).slice(0, 200), at: Math.min(now, Number(f.at) || now), agent, name, kind: f.kind,
      ...(f.n != null ? { n: Number(f.n) } : {}), ...(f.where ? { where: f.where.map(String).slice(0, 10) } : {}),
      ...(f.alp != null ? { alp: Number(f.alp) } : {}), ...(f.reason ? { reason: String(f.reason).slice(0, 120) } : {}),
      ...(f.contactId ? { contactId: String(f.contactId).slice(0, 80) } : {}) } as FeedItem));
    if (!clean.length) return NextResponse.json({ ok: true });
    const { data } = await db.from('kv').select('value').eq('key', KEY).eq('part', agent).maybeSingle();
    const next = trimFeed([...clean, ...((data?.value as FeedItem[] | null) ?? [])], now);
    const { error } = await db.from('kv').upsert({ key: KEY, part: agent, owner: 'shared', value: next, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

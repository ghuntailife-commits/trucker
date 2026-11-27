// Keeps one agent's Google Calendar matching Dispatch (see src/calendar/google.ts). The browser sends every booked
// appointment and callback it has; the server adds, changes and removes calendar events, and returns appointments
// that were moved in Google Calendar so Dispatch can move them too. At most 40 writes per call; the browser calls again.
import { NextResponse } from 'next/server';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { accessToken, adoptOriginals, deleteEvent, strayCopies, hashOf, listOthers, listOurs, planSync, putEvent, type Row, type WantedEvent } from '../../../../src/calendar/google';

export const maxDuration = 60;
const MAX = 20;

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { agent, events } = await req.json() as { agent: string; events: WantedEvent[] };
    if (agent !== me.agentId && me.role !== 'admin') return NextResponse.json({ error: 'Not yours.' }, { status: 403 });
    const { data: tok } = await db.from('google_tokens').select('refresh_token').eq('agent_id', agent).maybeSingle();
    if (!tok) return NextResponse.json({ connected: false });
    let token: string;
    try { token = await accessToken(tok.refresh_token); }
    catch (e) { return NextResponse.json({ connected: false, reconnect: (e as Error).message === 'RECONNECT', error: (e as Error).message === 'RECONNECT' ? undefined : (e as Error).message }); }

    const now = Date.now();
    const { data: rowsRaw, error } = await db.from('calendar_events').select('uid,google_id,contact_id,start_at,hash').eq('agent_id', agent);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows0 = (rowsRaw ?? []).map(r => ({ ...r, start_at: Number(r.start_at) })) as Row[];
    const google = await listOurs(token, agent, now);
    // take over events the old sheet already made for the same contact and time, and drop Dispatch's own copies
    const before = await listOthers(token, now - 86_400_000, now + 180 * 86_400_000).catch(() => []);
    const { rows, copies: adopted } = adoptOriginals(events, rows0, before);
    const stray = strayCopies(rows0, google, now);
    const plan = planSync(events, rows, google, now);

    let writes = 0;
    for (const m of plan.moved) await db.from('calendar_events').update({ start_at: m.start }).eq('agent_id', agent).eq('uid', m.row.uid);
    const byUid = new Map(rows.map(r => [r.uid, r]));
    const done = new Set<string>();
    for (const w of plan.upsert) {
      if (writes >= MAX) break;
      const r = byUid.get(w.uid);
      const id = await putEvent(token, agent, w, r?.google_id);
      await db.from('calendar_events').upsert({ agent_id: agent, uid: w.uid, google_id: id, contact_id: w.contactId, start_at: w.start, hash: hashOf(w) });
      done.add(w.uid); writes++;
    }
    // a copy goes only once its contact's row points at the original
    const copyOf = new Map(rows0.map(r => [r.google_id, r.uid]));
    const copies = [...new Set([...adopted.filter(id => done.has(copyOf.get(id) ?? '')), ...stray])];
    for (const id of copies) {
      if (writes >= MAX) break;
      if (google.has(id)) await deleteEvent(token, id, false).catch(() => undefined); // tried again next sync
      writes++;
    }
    for (const r of plan.remove) {
      if (writes >= MAX) break;
      await deleteEvent(token, r.google_id, false);
      await db.from('calendar_events').delete().eq('agent_id', agent).eq('uid', r.uid);
      writes++;
    }
    if (plan.forget.length) await db.from('calendar_events').delete().eq('agent_id', agent).in('uid', plan.forget.map(r => r.uid));
    const more = plan.upsert.length + adopted.length + stray.length + plan.remove.length > writes;
    // the agent's own Google events, shown on the Appointments calendar as busy time
    const others = more ? undefined : await listOthers(token, now - 8 * 86_400_000, now + 36 * 86_400_000).catch(() => undefined);
    return NextResponse.json({ connected: true, moves: plan.moves, written: writes, more, others });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(msg === 'RECONNECT' ? { connected: false, reconnect: true } : { error: msg }, { status: msg === 'RECONNECT' ? 200 : 500 });
  }
}

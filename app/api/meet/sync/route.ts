// Presentation coaching from Google Meet (George, 2026-11-27). Looks at the agent's calendar for the last 14 days,
// finds events with a Meet transcript (or Gemini notes) attached, matches each to a contact the agent's screen sent,
// has Claude read it, and saves the result with the Quo events (type meet.presentation) so the contact's notes,
// Coaching and the Playbook pick it up. Events that match no contact are left alone (they may be team meetings).
// Needs the Google permission to read Meet files (drive.meet.readonly): agents connected before it reconnect once.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { accessToken } from '../../../../src/calendar/google';
import { PRES_PROMPT, PRES_TOOL, PRES_TYPE, matchEvent, meetDocs, readPresTool, type CalEvent, type Person } from '../../../../src/meet/present';

export const maxDuration = 300;
const DAY = 86_400_000, PER_RUN = 2;

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { agent, people, days, assign } = await req.json() as { agent: string; people: Person[]; days?: number; assign?: { eventId: string; contact: Person | 'skip' } };
    if (agent !== me.agentId && me.role !== 'admin') return NextResponse.json({ error: 'Not yours.' }, { status: 403 });
    // the agent's own choices of which contact an event is for ("skip" = not a presentation), by Google event id
    const PINS = `dispatch-meet-pins-${agent}`;
    const { data: pinRow } = await db.from('kv').select('value').eq('key', PINS).eq('part', 'all').maybeSingle();
    const pins = (pinRow?.value as Record<string, Person | 'skip'> | undefined) ?? {};
    if (assign) {
      pins[assign.eventId] = assign.contact;
      await db.from('kv').upsert({ key: PINS, part: 'all', owner: agent, value: pins, updated_at: new Date().toISOString() });
      const id = `meet:${assign.eventId}`;
      if (assign.contact === 'skip') await db.from('quo_events').delete().eq('id', id).eq('agent_id', agent);
      else {
        // already read for the wrong contact: move it, and put the notes on the right contact
        const { data: row } = await db.from('quo_events').select('payload').eq('id', id).eq('agent_id', agent).maybeSingle();
        if (row) await db.from('quo_events').update({ phone: assign.contact.p, applied: false, payload: { ...(row.payload as object), contactId: assign.contact.id } }).eq('id', id);
      }
      return NextResponse.json({ ok: true });
    }
    const { data: tok } = await db.from('google_tokens').select('refresh_token').eq('agent_id', agent).maybeSingle();
    if (!tok?.refresh_token) return NextResponse.json({ connected: false });
    let token: string;
    try { token = await accessToken(tok.refresh_token); } catch (e) {
      return NextResponse.json((e as Error).message === 'RECONNECT' ? { connected: false, reconnect: true } : { error: (e as Error).message });
    }
    const now = Date.now();
    const events: CalEvent[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ timeMin: new Date(now - Math.min(365, Math.max(1, days ?? 14)) * DAY).toISOString(), timeMax: new Date(now).toISOString(), singleEvents: 'true', maxResults: '250',
        fields: 'nextPageToken,items(id,status,summary,description,start,attachments,extendedProperties)', ...(page ? { pageToken: page } : {}) });
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return NextResponse.json({ error: `Google Calendar said ${r.status}: ${(await r.text()).slice(0, 200)}` });
      const j = await r.json() as { items?: (CalEvent & { status?: string })[]; nextPageToken?: string };
      events.push(...(j.items ?? []).filter(e => e.status !== 'cancelled' && meetDocs(e).length));
      page = j.nextPageToken;
    } while (page && events.length < 1000);

    const found = events.filter(e => pins[e.id] !== 'skip').map(e => ({ e, who: (pins[e.id] as Person | undefined) ?? matchEvent(e, people ?? []) }));
    const matched = found.filter(f => f.who);
    const unmatched = found.filter(f => !f.who).map(f => ({ eventId: f.e.id, title: f.e.summary ?? '(no title)', at: Date.parse(f.e.start?.dateTime ?? `${f.e.start?.date}T12:00:00Z`) }))
      .sort((a, b) => b.at - a.at).slice(0, 40);
    const ids = matched.map(f => `meet:${f.e.id}`);
    const { data: have } = ids.length ? await db.from('quo_events').select('id').in('id', ids) : { data: [] };
    const done = new Set((have ?? []).map(h => h.id));
    const todo = matched.filter(f => !done.has(`meet:${f.e.id}`));
    if (!todo.length) return NextResponse.json({ connected: true, saved: 0, waiting: 0, unmatched });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on Vercel.' });

    const client = new Anthropic();
    let saved = 0;
    for (const { e, who } of todo.slice(0, PER_RUN)) {
      const doc = meetDocs(e)[0];
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.fileId!)}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 403 || r.status === 401) {
        const t = await r.text();
        if (/insufficient|scope|permission/i.test(t)) return NextResponse.json({ connected: true, reconnect: true, needs: 'meet', saved });
        if (/has not been used|disabled/i.test(t)) return NextResponse.json({ error: 'Turn on the Google Drive API in Google Cloud (APIs & Services > Library > Google Drive API > Enable).', saved });
        continue;
      }
      if (!r.ok) continue;
      const text = (await r.text()).trim();
      if (text.length < 200) continue;
      const msg = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 6000,
        system: `${PRES_PROMPT}\nAlways answer by calling the save_presentation tool exactly once.`,
        tools: [PRES_TOOL], tool_choice: { type: 'auto' },   // Opus 5.5 does not allow a forced tool choice
        messages: [{ role: 'user', content: `${/transcript/i.test(doc.title ?? '') ? 'Presentation transcript' : "Google Meet's notes on the presentation"} (${doc.title}):\n\n${text.slice(0, 150_000)}\n\nSave it with the save_presentation tool.` }] });
      const got = readPresTool((msg.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined)?.input);
      const at = Date.parse(e.start?.dateTime ?? `${e.start?.date}T12:00:00Z`);
      const { error } = await db.from('quo_events').upsert({ id: `meet:${e.id}`, agent_id: agent, type: PRES_TYPE, call_id: null, phone: who!.p,
        at: new Date(Number.isFinite(at) ? at : now).toISOString(), applied: !got, ai_note: got?.note ?? '', ai_tags: got?.tags ?? null,
        payload: { source: 'Google Meet', title: e.summary ?? '', eventId: e.id, contactId: who!.id, doc: doc.fileUrl ?? '', docTitle: doc.title ?? '' } });
      if (error) return NextResponse.json({ error: error.message, saved });
      if (got) saved++;   // a transcript Claude could not read is still marked done, so it isn't paid for again every run
    }
    return NextResponse.json({ connected: true, saved, waiting: todo.length - saved, more: todo.length > PER_RUN, unmatched });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

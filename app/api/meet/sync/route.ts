// Presentation coaching from Google Meet (George, 2026-11-27). Looks at the agent's calendar for the last 14 days,
// finds events with a Meet transcript (or Gemini notes) attached, matches each to a contact the agent's screen sent,
// has Claude read it, and saves the result with the Quo events (type meet.presentation) so the contact's notes,
// Coaching and the Playbook pick it up. Events that match no contact are left alone (they may be team meetings).
// Needs the Google permission to read Meet files (drive.meet.readonly): agents connected before it reconnect once.
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { accessToken } from '../../../../src/calendar/google';
import { PRES_PROMPT, PRES_TOOL, PRES_TYPE, guessPerson, matchEvent, meetDocs, readPresTool, type CalEvent, type Person } from '../../../../src/meet/present';

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
    // every calendar she can see and edit, not just the main one (George, 2026-11-27: Gracie's are on an "APPOINTMENTS" calendar)
    const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&fields=items(id,summary)', { headers: { Authorization: `Bearer ${token}` } });
    if (cl.status === 403 && /insufficient|scope/i.test(await cl.clone().text())) return NextResponse.json({ connected: true, reconnect: true, needs: 'calendars' });
    const cals = cl.ok ? ((await cl.json()) as { items?: { id: string }[] }).items?.map(c => c.id) ?? ['primary'] : ['primary'];
    const events: CalEvent[] = [];
    const seenCodes = new Set<string>();
    for (const cal of cals.length ? cals : ['primary']) {
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ timeMin: new Date(now - Math.min(365, Math.max(1, days ?? 14)) * DAY).toISOString(), timeMax: new Date(now).toISOString(), singleEvents: 'true', maxResults: '250',
        fields: 'nextPageToken,items(id,status,summary,description,start,end,attachments,extendedProperties,hangoutLink)', ...(page ? { pageToken: page } : {}) });
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { if (cal === 'primary' || cals[0] === cal) return NextResponse.json({ error: `Google Calendar said ${r.status}: ${(await r.text()).slice(0, 200)}` }); break; }
      const j = await r.json() as { items?: (CalEvent & { status?: string })[]; nextPageToken?: string };
      const live = (j.items ?? []).filter(e => e.status !== 'cancelled');
      events.push(...live.filter(e => meetDocs(e).length));
      // Google doesn't always attach the transcript to the event (George, 2026-11-27: Philip's call). For recent events
      // with a Meet link and nothing attached, look for the transcript by the meeting code ("pnk-nist-fnd (date) - Transcript").
      for (const e of live.filter(x => !meetDocs(x).length && x.hangoutLink && Date.parse(x.start?.dateTime ?? '') > now - 14 * DAY).slice(-30)) {
        const code = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/.exec(e.hangoutLink ?? '')?.[1];
        if (!code || seenCodes.has(code)) continue;
        seenCodes.add(code);
        const fq = new URLSearchParams({ q: `name contains '${code}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`, fields: 'files(id,name,mimeType)', pageSize: '5' });
        const fr = await fetch(`https://www.googleapis.com/drive/v3/files?${fq}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!fr.ok) continue;
        const files = ((await fr.json()) as { files?: { id: string; name: string; mimeType: string }[] }).files ?? [];
        const found = files.map(f => ({ fileId: f.id, title: f.name, mimeType: f.mimeType }));
        if (found.length) { e.attachments = found; if (meetDocs(e).length) events.push(e); }
      }
      page = j.nextPageToken;
    } while (page && events.length < 1000);
    }
    // the same meeting can sit on two calendars: keep one
    const uniq = new Map(events.map(e => [e.id, e])); events.length = 0; events.push(...uniq.values());

    // not on this Dispatch but clearly a presentation (phone or a person's name as the title): still read it, for coaching (George, 2026-11-27)
    const found = events.filter(e => pins[e.id] !== 'skip').map(e => ({ e, who: (pins[e.id] as Person | undefined) ?? matchEvent(e, people ?? []) ?? guessPerson(e) }));
    const matched = found.filter(f => f.who);
    const unmatched = found.filter(f => !f.who).map(f => ({ eventId: f.e.id, title: f.e.summary ?? '(no title)', at: Date.parse(f.e.start?.dateTime ?? `${f.e.start?.date}T12:00:00Z`) }))
      .sort((a, b) => b.at - a.at).slice(0, 40);
    const ids = matched.map(f => `meet:${f.e.id}`);
    const { data: have } = ids.length ? await db.from('quo_events').select('id,ai_tags,payload').in('id', ids) : { data: [] };
    // read before but Claude's answer didn't save (George, 2026-11-27: Philip): try again, up to 3 times
    const tries = new Map(((have ?? []) as { id: string; ai_tags: unknown; payload: { tries?: number } | null }[]).map(h => [h.id, h.ai_tags ? 99 : h.payload?.tries ?? 1]));
    const done = new Set([...tries].filter(([, n]) => n >= 3).map(([id]) => id));
    // newest first, so a presentation from today isn't stuck behind a year of older recordings (George, 2026-11-27: Philip)
    const startOf = (e: CalEvent) => Date.parse(e.start?.dateTime ?? `${e.start?.date}T12:00:00Z`) || 0;
    const todo = matched.filter(f => !done.has(`meet:${f.e.id}`)).sort((a, b) => startOf(b.e) - startOf(a.e));
    if (!todo.length) return NextResponse.json({ connected: true, saved: 0, waiting: 0, found: events.length, unmatched, done: matched.length });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on Vercel.' });

    const client = new Anthropic();
    let saved = 0;
    const skipped: { title: string; why: string }[] = [];   // shown on the Presentations page, so a stuck one says why
    for (const { e, who } of todo.slice(0, PER_RUN)) {
      const doc = meetDocs(e)[0];
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.fileId!)}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 403 || r.status === 401) {
        const t = await r.text();
        // Meet's own permission doesn't always cover the transcript file (George, 2026-11-27: Philip): reconnect with Drive read access
        if (/insufficient|scope|permission|not granted/i.test(t)) return NextResponse.json({ connected: true, reconnect: true, needs: 'meet', saved });
        if (/has not been used|disabled/i.test(t)) return NextResponse.json({ error: 'Turn on the Google Drive API in Google Cloud (APIs & Services > Library > Google Drive API > Enable).', saved });
        skipped.push({ title: e.summary ?? '', why: `Google wouldn't open the transcript (${r.status}): ${t.slice(0, 160)}` });
        continue;
      }
      if (!r.ok) { skipped.push({ title: e.summary ?? '', why: `Google said ${r.status} opening the transcript: ${(await r.text()).slice(0, 160)}` }); continue; }
      const text = (await r.text()).trim();
      if (text.length < 200) { skipped.push({ title: e.summary ?? '', why: `The transcript is almost empty (${text.length} characters).` }); continue; }
      // a long presentation's notes can run past 6,000 tokens, which cut the answer off (George, 2026-11-27: Philip)
      const msg = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 14000,
        system: `${PRES_PROMPT}\nAlways answer by calling the save_presentation tool exactly once.`,
        tools: [PRES_TOOL], tool_choice: { type: 'auto' },   // Opus 5.5 does not allow a forced tool choice
        messages: [{ role: 'user', content: `${/transcript/i.test(doc.title ?? '') ? 'Presentation transcript' : "Google Meet's notes on the presentation"} (${doc.title}):\n\n${text.slice(0, 150_000)}\n\nSave it with the save_presentation tool.` }] });
      const got = readPresTool((msg.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined)?.input);
      if (!got) { console.error('meet sync: Claude gave no presentation for', e.id, msg.stop_reason); skipped.push({ title: e.summary ?? '', why: `Claude's notes didn't come back (${msg.stop_reason}). It tries again next check.` }); }
      const tried = (tries.get(`meet:${e.id}`) ?? 0) + (got ? 0 : 1);
      const at = Date.parse(e.start?.dateTime ?? `${e.start?.date}T12:00:00Z`);
      const { error } = await db.from('quo_events').upsert({ id: `meet:${e.id}`, agent_id: agent, type: PRES_TYPE, call_id: null, phone: who!.p,
        at: new Date(Number.isFinite(at) ? at : now).toISOString(), applied: !got || !who!.id, ai_note: got?.note ?? '', ai_tags: got?.tags ?? null,
        payload: { source: 'Google Meet', title: e.summary ?? '', eventId: e.id, contactId: who!.id, doc: doc.fileUrl ?? (doc.fileId ? `https://docs.google.com/document/d/${doc.fileId}/edit` : ''), docTitle: doc.title ?? '', ...(got ? {} : { tries: tried }) } });
      if (error) return NextResponse.json({ error: error.message, saved });
      if (got) saved++;   // a transcript Claude could not read is still marked done, so it isn't paid for again every run
    }
    return NextResponse.json({ connected: true, saved, waiting: todo.length - saved, found: events.length, more: todo.length > PER_RUN, unmatched, skipped });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

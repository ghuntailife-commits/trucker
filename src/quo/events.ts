// Reading Quo webhook events, and the notes they leave on a contact. Shapes follow Quo's (OpenPhone's) webhooks:
// { type, createdAt, data: { object } }. Unknown events are ignored. Tested in test/quoEvents.test.ts.
import { digits10 } from '../contacts/phones';
import { presNote, type PresTags } from '../meet/present';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export const QUO_TYPES = ['call.ringing', 'call.completed', 'call.recording.completed', 'call.transcript.completed', 'call.summary.completed', 'message.received', 'message.delivered'] as const;

export interface QuoParts { type: string; id: string; callId: string | null; ours: string; them: string; at: number }

const first = (v: unknown) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '');
const when = (...v: unknown[]) => { for (const x of v) { const n = Date.parse(String(x ?? '')); if (Number.isFinite(n)) return n; } return Date.now(); };

/** The event's main record: data.resource in Quo's 2026 webhooks, data.object in the older OpenPhone ones. */
const rec = (b: Any) => b?.data?.resource ?? b?.data?.object ?? {};

/** Which call or text, whose number is ours (the agent's Quo number) and whose is theirs. */
export function quoParts(body: unknown): QuoParts | null {
  const b = body as Any, type = String(b?.type ?? ''), o = rec(b), cx = b?.data?.context;
  if (!(QUO_TYPES as readonly string[]).includes(type)) return null;
  const isCall = type.startsWith('call.');
  const callId = isCall ? String(o.callId ?? o.id ?? '') || null : null;
  const id = String(o.id ?? o.callId ?? b.id ?? '');
  const out = /^out/i.test(String(o.direction ?? ''));
  let ours = '', them = '';
  if (cx) {
    // 2026 format: numbers sit in data.context
    const p = cx.participants ?? {};
    ours = first(p.workspace) || (out ? '' : first(cx.recipientIdentifiers));
    them = first(p.external) || (out ? first(cx.recipientIdentifiers) : String(cx.senderIdentifier ?? ''));
  } else if (o.from || o.to) {
    const from = first(o.from), to = first(o.to);
    ours = out ? from : to; them = out ? to : from;
  }
  return { type, id, callId, ours, them, at: when(o.completedAt, o.createdAt, b.createdAt) };
}

/** Quo's id for the agent's number (2026 format), used when the number itself is not in the event. */
export const quoNumberId = (body: unknown): string => String((body as Any)?.data?.context?.phoneNumberId ?? '');

/** The transcript as plain lines, "Agent:" for the Quo number's side and "Contact:" for the other. */
export function transcriptText(body: unknown, ours = ''): string {
  const o = rec(body);
  const d = digits10(ours);
  return (Array.isArray(o.dialogue) ? o.dialogue : []).map((l: Any) => {
    const agent = l.userId || (d && digits10(String(l.identifier ?? '')) === d);
    return `${agent ? 'Agent' : 'Contact'}: ${String(l.content ?? '').trim()}`;
  }).filter((s: string) => !/:\s*$/.test(s)).join('\n');
}

/** What Claude is asked to write from a call transcript. */
export const NOTE_PROMPT = `You write call notes for an insurance agent who calls union and transport workers (UPS, USPS, rail, trucking) about Globe Life benefits.
From the transcript, write 2 to 4 short plain sentences for the contact's notes: what happened on the call, anything the contact said that matters (family, money, objections, who decides, best time to call), and the agreed next step with day and time if one was set.
No headings, no bullets, no greeting, no guessing. If the call was a voicemail or nobody talked, say that in one sentence.`;

/** The note line one stored event leaves on the contact (without the date, which the dialer adds). */
export function quoNote(e: { type: string; payload: Any; ai_note?: string | null }): string {
  const o = rec(e.payload);
  switch (e.type) {
    case 'call.completed': {
      const out = /^out/i.test(String(o.direction ?? ''));
      const secs = typeof o.duration === 'number' ? o.duration
        : o.answeredAt && o.completedAt ? Math.max(0, Math.round((Date.parse(o.completedAt) - Date.parse(o.answeredAt)) / 1000)) : 0;
      const answered = o.status ? o.status === 'answered' || secs > 0 : !!o.answeredAt || secs > 0;
      const who = o.source === 'twilio' || (e.payload as Any)?.source === 'twilio' ? 'Dispatch' : 'Quo';
      return `${who} ${out ? 'call' : 'call from them'}: ${answered ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s` : 'not answered'}`;
    }
    // a text the agent sent from the Quo app (George, 2026-11-27); Dispatch's own sends are already in the notes
    case 'message.delivered': { const t = String(o.text ?? o.body ?? o.content ?? '').trim(); return t ? `Texted (Quo): "${t.slice(0, 300)}"` : ''; }
    case 'message.received': return `Text from them: "${String(o.text ?? o.body ?? o.content ?? '').slice(0, 300)}"`;
    case 'call.recording.completed': {
      const url = [...(Array.isArray(o.recordings) ? o.recordings : []), ...(Array.isArray(o.media) ? o.media : [])].map((m: Any) => m?.url).find(Boolean) ?? o.recordingUrl ?? '';
      return url ? `Call recording: ${url}` : '';
    }
    case 'call.voicemail': { const url = rec(e.payload).recordingUrl; return url ? `Voicemail from them: ${url}` : ''; }
    case 'call.transcript.completed': return e.ai_note ? `Call notes (AI): ${e.ai_note.replace(/\s+/g, ' ')}` : '';
    case 'meet.presentation': return presNote(e.ai_note ?? '', (e as { ai_tags?: PresTags | null }).ai_tags);
    case 'call.summary.completed': return '';   // George 2026-11-26: Claude's call notes only, not Quo's summary too
  }
  return '';
}

// Transcripts for Dispatch calls (George, 2026-11-27): when a recording is ready, Twilio Voice Intelligence turns it
// into a transcript; when that's done it tells /api/twilio/transcript, which reads the sentences, has Claude write the
// call notes and coaching tags (as for Quo calls) and stores it as call.transcript.completed.
import { twilioApi } from './server';

const INTEL = 'https://intelligence.twilio.com/v2';
const SERVICE_NAME = 'dispatch-calls';

/** The team's Voice Intelligence service, made once with Dispatch's webhook. */
export async function intelService(base: string): Promise<string> {
  if (process.env.TWILIO_INTELLIGENCE_SID) return process.env.TWILIO_INTELLIGENCE_SID;
  const hook = `${base}/api/twilio/transcript`;
  const list = await twilioApi<{ services?: { sid: string; unique_name: string; webhook_url?: string }[] }>(`${INTEL}/Services?PageSize=50`);
  const have = (list.services ?? []).find(s => s.unique_name === SERVICE_NAME);
  if (have) {
    if (have.webhook_url !== hook) await twilioApi(`${INTEL}/Services/${have.sid}`, { form: { WebhookUrl: hook, WebhookHttpMethod: 'POST' } }).catch(() => {});
    return have.sid;
  }
  const made = await twilioApi<{ sid: string }>(`${INTEL}/Services`, { form: { UniqueName: SERVICE_NAME, FriendlyName: 'Dispatch calls', AutoTranscribe: 'false',
    DataLogging: 'false', LanguageCode: 'en-US', WebhookUrl: hook, WebhookHttpMethod: 'POST' } });
  return made.sid;
}

/** Asks for a transcript of one recording. key carries who and which call: "agent|phone|callSid|vm". */
export async function startTranscript(base: string, recordingSid: string, key: { agent: string; phone: string; callSid: string; voicemail: boolean }) {
  const service = await intelService(base);
  const participants = key.voicemail
    ? [{ channel_participant: 1, role: 'Customer' }]
    : [{ channel_participant: 1, role: 'Agent', user_id: key.agent || 'agent' }, { channel_participant: 2, role: 'Customer' }];
  return twilioApi<{ sid: string }>(`${INTEL}/Transcripts`, { form: { ServiceSid: service,
    Channel: JSON.stringify({ media_properties: { source_sid: recordingSid }, participants }),
    CustomerKey: [key.agent, key.phone, key.callSid, key.voicemail ? 'vm' : ''].join('|') } });
}

export function parseKey(k: string | null | undefined) {
  const [agent = '', phone = '', callSid = '', vm = ''] = String(k ?? '').split('|');
  return { agent, phone, callSid, voicemail: vm === 'vm' };
}

export interface Sentence { media_channel: number; transcript: string; start_time?: number | string }
/** Quo-shaped dialogue (the agent's lines carry a userId), so transcriptText, notes and coaching read it the same way. */
export function dialogueFrom(sentences: Sentence[], voicemail: boolean): { userId?: string; identifier: string; content: string }[] {
  return [...sentences].sort((a, b) => Number(a.start_time ?? 0) - Number(b.start_time ?? 0))
    .filter(s => s.transcript?.trim())
    .map(s => (!voicemail && s.media_channel === 1 ? { userId: 'agent', identifier: 'agent', content: s.transcript.trim() } : { identifier: 'contact', content: s.transcript.trim() }));
}

export async function readTranscript(sid: string): Promise<{ key: string; status: string; sentences: Sentence[] }> {
  const t = await twilioApi<{ customer_key?: string; status?: string }>(`${INTEL}/Transcripts/${sid}`);
  const sentences: Sentence[] = [];
  let url: string | null = `${INTEL}/Transcripts/${sid}/Sentences?PageSize=500`;
  for (let i = 0; url && i < 10; i++) {
    const page: { sentences?: Sentence[]; meta?: { next_page_url?: string | null } } = await twilioApi(url);
    sentences.push(...(page.sentences ?? []));
    url = page.meta?.next_page_url ?? null;
  }
  return { key: t.customer_key ?? '', status: t.status ?? '', sentences };
}

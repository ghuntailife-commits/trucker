// Sends one text from Dispatch's own local numbers (George, 2026-11-27). Only for agents with Dispatch texting on.
// The first send also points the "Dispatch" messaging service's replies at /api/twilio/sms-in and adds any team
// number missing from it, so nothing needs setting up by hand in Twilio.
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { publicUrl, teamTwilioNumbers, twilioApi } from '../../../../src/twilio/server';
import { twilioE164, twilioEnv } from '../../../../src/twilio/twilio';
import { smsProblem, textFrom } from '../../../../src/twilio/sms';

type Svc = { sid: string; friendly_name: string; inbound_request_url?: string | null; use_inbound_webhook_on_number?: boolean };
let ready: { at: number; base: string; pool: string } | null = null;

/** Replies go to Dispatch, and every team number is in the texting service (checked at most every 10 minutes). */
async function setUp(base: string, pool: string[]) {
  const key = pool.join(',');
  if (ready && ready.base === base && ready.pool === key && Date.now() - ready.at < 600_000) return;
  const list = await twilioApi<{ services?: Svc[] }>('https://messaging.twilio.com/v1/Services?PageSize=50');
  const svc = (list.services ?? []).find(s => /dispatch/i.test(s.friendly_name));
  if (!svc) throw new Error('There is no "Dispatch" messaging service in Twilio.');
  const hook = `${base}/api/twilio/sms-in`;
  if (svc.inbound_request_url !== hook || svc.use_inbound_webhook_on_number)
    await twilioApi(`https://messaging.twilio.com/v1/Services/${svc.sid}`, { form: { InboundRequestUrl: hook, InboundMethod: 'POST', UseInboundWebhookOnNumber: 'false' } });
  const inSvc = new Set<string>();
  let url: string | null = `https://messaging.twilio.com/v1/Services/${svc.sid}/PhoneNumbers?PageSize=500`;
  for (let i = 0; url && i < 5; i++) {
    const page: { phone_numbers?: { phone_number: string }[]; meta?: { next_page_url?: string | null } } = await twilioApi(url);
    for (const n of page.phone_numbers ?? []) inSvc.add(twilioE164(n.phone_number));
    url = page.meta?.next_page_url ?? null;
  }
  const missing = pool.map(n => twilioE164(n)).filter(n => n && !inSvc.has(n));
  if (missing.length) {
    const owned = await twilioApi<{ incoming_phone_numbers?: { sid: string; phone_number: string }[] }>('/IncomingPhoneNumbers.json?PageSize=1000');
    for (const n of owned.incoming_phone_numbers ?? []) if (missing.includes(n.phone_number))
      await twilioApi(`https://messaging.twilio.com/v1/Services/${svc.sid}/PhoneNumbers`, { form: { PhoneNumberSid: n.sid } }).catch(e => console.error('twilio sms: could not add', n.phone_number, (e as Error).message));
  }
  ready = { at: Date.now(), base, pool: key };
}

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const { to: rawTo, content } = await req.json() as { to: string; content: string };
    const team = await teamSettings(db);
    const agent = team?.agents.find(a => a.id === me.agentId);
    if (!agent?.twilioText) return NextResponse.json({ error: 'Dispatch texting is not turned on for you in Settings.' }, { status: 400 });
    const to = twilioE164(rawTo ?? '');
    const body = String(content ?? '').trim();
    if (!to) return NextResponse.json({ error: 'That number is not a full 10-digit number.' }, { status: 400 });
    if (!body) return NextResponse.json({ error: 'Write the text first.' }, { status: 400 });
    if (body.length > 1600) return NextResponse.json({ error: 'That text is too long (1,600 characters at most).' }, { status: 400 });
    const pool = teamTwilioNumbers(team);
    if (!pool.length) return NextResponse.json({ error: 'Add your Dispatch numbers in Settings first.' }, { status: 400 });
    const { base } = publicUrl(req);
    await setUp(base, pool);
    // the number this contact last heard from (a Dispatch call or text)
    const { data: last } = await db.from('quo_events').select('payload').in('type', ['call.dialed', 'message.sent']).like('phone', `%${to.slice(-10)}`)
      .order('at', { ascending: false }).limit(1);
    const from = textFrom(pool, to, (last?.[0] as { payload?: { from?: string } } | undefined)?.payload?.from);
    if (!from) return NextResponse.json({ error: 'No Dispatch number to text from.' }, { status: 400 });
    const env = twilioEnv(); if (!env) return NextResponse.json({ error: 'Twilio is not set up on Vercel yet.' }, { status: 500 });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.apiKey}:${env.apiSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body, StatusCallback: `${base}/api/twilio/sms-in?status=1&a=${encodeURIComponent(me.agentId)}` }).toString() });
    const j = await r.json().catch(() => ({})) as { sid?: string; code?: number; message?: string };
    if (!r.ok || !j.sid) return NextResponse.json({ error: smsProblem(j.code, j.message) }, { status: 502 });
    // remembered so replies come to this agent and the next text uses the same number (applied: the screen already noted it)
    await db.from('quo_events').upsert({ id: `message.sent:${j.sid}`, agent_id: me.agentId, type: 'message.sent', call_id: null, phone: to, at: new Date().toISOString(),
      applied: true, payload: { source: 'twilio', from } }, { onConflict: 'id', ignoreDuplicates: true });
    return NextResponse.json({ ok: true, from });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

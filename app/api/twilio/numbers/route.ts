// "Get local numbers" in Settings (George, 2026-11-27), admin only.
//  GET                       the team's Twilio numbers with today's calls on each (spam watch)
//  GET ?stats=1              the Numbers report: 30 days of dials, connects, voicemails, talk time and texts per number
//  POST {action:'search', targets:[{key, areaCode, state}]}  one available number per target (voice + texts + pictures)
//  POST {action:'buy', numbers:[{phone, label}]}             buys them, points Voice at Dispatch, adds them to the
//        "Dispatch" texting service and the approved caller-ID registrations (SHAKEN/STIR and the business profile)
import { NextResponse } from 'next/server';
import { adminDb, teamSettings, whoIsCalling } from '../../../../src/live/server';
import { DAILY_CAP, dialsToday, teamTwilioNumbers, twilioApi } from '../../../../src/twilio/server';
import { numberStats, numberTotals, type Ev } from '../../../../src/twilio/numberStats';
import { twilioEnv } from '../../../../src/twilio/twilio';

export const maxDuration = 120;

type Avail = { available_phone_numbers?: { phone_number: string; locality?: string; region?: string }[] };
type Owned = { incoming_phone_numbers?: { sid: string; phone_number: string; friendly_name: string; capabilities?: Record<string, boolean> }[] };

async function admin(req: Request) {
  const db = adminDb();
  const me = await whoIsCalling(db, req.headers.get('authorization'));
  if ('error' in me) return { error: NextResponse.json({ error: me.error }, { status: 401 }) };
  if (me.role !== 'admin') return { error: NextResponse.json({ error: 'Only the admin can buy numbers.' }, { status: 403 }) };
  if (!twilioEnv()) return { error: NextResponse.json({ error: 'Twilio is not set up on Vercel yet.' }, { status: 400 }) };
  return { db };
}

export async function GET(req: Request) {
  const a = await admin(req); if ('error' in a) return a.error;
  try {
    if (new URL(req.url).searchParams.get('stats')) return NextResponse.json(await statsReport(a.db));
    const [owned, used, team] = await Promise.all([twilioApi<Owned>('/IncomingPhoneNumbers.json?PageSize=500'), dialsToday(a.db), teamSettings(a.db)]);
    const inTeam = new Set(teamTwilioNumbers(team).map(n => n.replace(/\D/g, '').slice(-10)));
    return NextResponse.json({ numbers: (owned.incoming_phone_numbers ?? []).map(n => {
      const d = n.phone_number.replace(/\D/g, '').slice(-10);
      return { phone: n.phone_number, name: n.friendly_name, today: used[d] ?? 0, inTeam: inTeam.has(d), sms: !!n.capabilities?.sms };
    }) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  const a = await admin(req); if ('error' in a) return a.error;
  const body = await req.json().catch(() => ({})) as { action?: string; targets?: { key: string; areaCode: string; state: string }[]; numbers?: { phone: string; label: string }[] };
  try {
    if (body.action === 'search') {
      const seen = new Set<string>();
      const found: { key: string; phone: string; where: string; exact: boolean }[] = [];
      for (const t of (body.targets ?? []).slice(0, 80)) {
        const q = (x: string) => `/AvailablePhoneNumbers/US/Local.json?${x}&VoiceEnabled=true&SmsEnabled=true&MmsEnabled=true&ExcludeAllAddressRequired=true&PageSize=5`;
        let list = (await twilioApi<Avail>(q(`AreaCode=${encodeURIComponent(t.areaCode)}`)).catch(() => ({} as Avail))).available_phone_numbers ?? [];
        let exact = true;
        if (!list.length) { exact = false; list = (await twilioApi<Avail>(q(`InRegion=${encodeURIComponent(t.state)}`)).catch(() => ({} as Avail))).available_phone_numbers ?? []; }
        const pick = list.find(n => !seen.has(n.phone_number));
        if (pick) { seen.add(pick.phone_number); found.push({ key: t.key, phone: pick.phone_number, where: [pick.locality, pick.region].filter(Boolean).join(', '), exact }); }
      }
      return NextResponse.json({ found });
    }
    if (body.action === 'buy') {
      const env = twilioEnv()!;
      // where new numbers go besides Voice: the "Dispatch" texting service and the approved registrations
      const svc = await twilioApi<{ services?: { sid: string; friendly_name: string }[] }>('https://messaging.twilio.com/v1/Services?PageSize=50').catch(() => ({ services: [] }));
      const service = (svc.services ?? []).find(s => /dispatch/i.test(s.friendly_name)) ?? null;
      const tp = await twilioApi<{ results?: { sid: string; status: string }[] }>('https://trusthub.twilio.com/v1/TrustProducts?PageSize=50').catch(() => ({ results: [] }));
      const cp = await twilioApi<{ results?: { sid: string; status: string }[] }>('https://trusthub.twilio.com/v1/CustomerProfiles?PageSize=50').catch(() => ({ results: [] }));
      const trust = [...(cp.results ?? []).filter(r => r.status === 'twilio-approved').map(r => `CustomerProfiles/${r.sid}`),
        ...(tp.results ?? []).filter(r => r.status === 'twilio-approved').map(r => `TrustProducts/${r.sid}`)];
      const bought: { phone: string; texting: boolean; callerId: number }[] = [];
      const failed: { phone: string; why: string }[] = [];
      for (const n of (body.numbers ?? []).slice(0, 15)) {
        try {
          const r = await twilioApi<{ sid: string; phone_number: string }>('/IncomingPhoneNumbers.json',
            { form: { PhoneNumber: n.phone, VoiceApplicationSid: env.appSid, FriendlyName: `Dispatch ${n.label}`.slice(0, 64) } });
          let texting = false, callerId = 0;
          if (service) texting = await twilioApi(`https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`, { form: { PhoneNumberSid: r.sid } }).then(() => true, () => false);
          for (const t of trust) {
            await twilioApi(`https://trusthub.twilio.com/v1/${t}/ChannelEndpointAssignments`, { form: { ChannelEndpointType: 'phone-number', ChannelEndpointSid: r.sid } })
              .then(() => { callerId++; }, () => { /* not every registration takes numbers */ });
          }
          bought.push({ phone: r.phone_number, texting, callerId });
        } catch (e) { failed.push({ phone: n.phone, why: (e as Error).message }); }
      }
      return NextResponse.json({ bought, failed, service: service?.friendly_name ?? null });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

/** Numbers report (George, 2026-11-28): the last 30 days of calls and texts, worked out per number. */
async function statsReport(db: ReturnType<typeof adminDb>) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [owned, team] = await Promise.all([twilioApi<Owned>('/IncomingPhoneNumbers.json?PageSize=500'), teamSettings(db)]);
  const events: Ev[] = [];
  for (let from = 0; from < 60_000; from += 1000) {
    const { data, error } = await db.from('quo_events').select('id,type,call_id,phone,at,agent_id,payload')
      .in('type', ['call.dialed', 'call.completed', 'call.amd', 'message.sent', 'message.received']).gte('at', since)
      .order('at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    events.push(...((data ?? []) as Ev[]));
    if (!data || data.length < 1000) break;
  }
  const rows = numberStats((owned.incoming_phone_numbers ?? []).map(n => n.phone_number), events, Date.now(), 'America/New_York', team?.twilioDailyCap ?? DAILY_CAP);
  const names = Object.fromEntries((team?.agents ?? []).map(x => [x.id, x.name]));
  return { rows, totals: numberTotals(rows), names, cap: team?.twilioDailyCap ?? DAILY_CAP, at: Date.now() };
}

// Plays a Dispatch call recording from the link on the contact. The link carries a key, so it can't be guessed;
// the audio itself stays in Twilio and is fetched with the team's key (George, 2026-11-27).
import { recKey, twilioEnv } from '../../../../../src/twilio/twilio';

export async function GET(req: Request, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  const env = twilioEnv();
  const k = new URL(req.url).searchParams.get('k');
  if (!env || !/^RE[0-9a-f]{32}$/i.test(sid) || k !== recKey(env.apiSecret, sid)) return new Response('Not found', { status: 404 });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Recordings/${sid}.mp3`,
    { headers: { Authorization: `Basic ${Buffer.from(`${env.apiKey}:${env.apiSecret}`).toString('base64')}` } });
  if (!r.ok || !r.body) return new Response('Recording not available yet', { status: r.status === 404 ? 404 : 502 });
  return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' } });
}

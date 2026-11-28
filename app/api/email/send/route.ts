// Sends a follow-up email (policy summary or no-cost benefits) from the signed-in agent's own Gmail
// (George, 2026-11-27). The agent has already seen the preview; this builds the same email on the server,
// adds the standard PDFs and the signature images, and sends it.
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { adminDb, whoIsCalling } from '../../../../src/live/server';
import { accessToken } from '../../../../src/calendar/google';
import { buildFollowUp, emailProblems, type FollowUp, type Signature } from '../../../../src/email/followUp';
import { buildMime, fromHeader, type MimePart } from '../../../../src/email/mime';

export const maxDuration = 60;
const ASSETS = path.join(process.cwd(), 'assets', 'email');
const fromDataUrl = (u: string): { mime: string; data: Buffer } | null => {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u ?? '');
  return m ? { mime: m[1], data: Buffer.from(m[2], 'base64') } : null;
};

export async function POST(req: Request) {
  try {
    const db = adminDb();
    const me = await whoIsCalling(db, req.headers.get('authorization'));
    if ('error' in me) return NextResponse.json({ error: me.error }, { status: 401 });
    const body = await req.json() as { email: FollowUp; signature: Signature; certificate?: string; test?: boolean };
    const cert = body.certificate ? Buffer.from(body.certificate, 'base64') : null;
    if (cert && cert.subarray(0, 4).toString() !== '%PDF') return NextResponse.json({ error: 'The certificate has to be a PDF.' }, { status: 400 });
    const missing = emailProblems(body.email, { hasUpload: !!cert }).filter(p => !body.test || (p !== 'a valid email address' && p !== 'a valid cc address'));
    if (missing.length) return NextResponse.json({ error: `Still needed: ${missing.join(', ')}.` }, { status: 400 });

    const { data: tok } = await db.from('google_tokens').select('refresh_token,email').eq('agent_id', me.agentId).maybeSingle();
    if (!tok?.refresh_token) return NextResponse.json({ error: 'Connect Google first, so the email can go out from your Gmail.', reconnect: true }, { status: 400 });
    let token: string;
    try { token = await accessToken(tok.refresh_token); }
    catch (e) { return NextResponse.json({ error: (e as Error).message === 'RECONNECT' ? 'Your Google connection expired. Connect Google again.' : (e as Error).message, reconnect: (e as Error).message === 'RECONNECT' }, { status: 400 }); }

    const sig = body.signature;
    const built = buildFollowUp(body.email, sig, Date.now());
    const to = body.test ? (tok.email ?? sig.email) : built.to;
    const files: MimePart[] = [];
    for (const a of built.attachments) {
      const data = a.file === 'upload' ? cert! : await readFile(path.join(ASSETS, a.file));
      files.push({ filename: a.filename, mime: a.mime, data });
    }
    const inline: MimePart[] = [];
    const photo = sig.photo ? fromDataUrl(sig.photo) : null;
    if (photo) inline.push({ filename: `signature-photo.${photo.mime === 'image/png' ? 'png' : 'jpg'}`, mime: photo.mime, data: photo.data, cid: 'sigphoto' });
    inline.push({ filename: 'signature-logo.png', mime: 'image/png', data: await readFile(path.join(ASSETS, 'logo.png')), cid: 'siglogo' });

    const raw = buildMime({ from: fromHeader(sig.name, tok.email ?? sig.email), to, cc: body.test ? '' : built.cc, subject: body.test ? `[Test] ${built.subject}` : built.subject,
      html: built.html, text: built.text, inline, files });
    const r = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' }, body: raw });
    const j = await r.json().catch(() => ({})) as { id?: string; error?: { message?: string; status?: string } };
    if (!r.ok) {
      const scope = r.status === 403 && /insufficient|scope|permission/i.test(j.error?.message ?? '');
      return NextResponse.json({ error: scope ? 'Dispatch needs permission to send email from your Gmail. Connect Google again and allow sending email.' : `Gmail: ${j.error?.message ?? r.status}`, reconnect: scope },
        { status: scope ? 400 : 502 });
    }
    return NextResponse.json({ ok: true, id: j.id, to, subject: built.subject, from: tok.email });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

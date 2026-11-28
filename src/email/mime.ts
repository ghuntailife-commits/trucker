// A complete email (HTML + plain text, inline signature images, PDF attachments) in the format Gmail's send
// endpoint takes (George, 2026-11-27). Pure; tested in test/followUp.test.ts.

export interface MimePart { filename: string; mime: string; data: Buffer; cid?: string }
export interface MimeMail { from: string; to: string; cc?: string; subject: string; html: string; text: string; inline: MimePart[]; files: MimePart[] }

const b64lines = (b: Buffer) => b.toString('base64').replace(/.{76}/g, '$&\r\n');
const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const qname = (s: string) => s.replace(/["\\\r\n]/g, '');

export function buildMime(m: MimeMail, boundarySeed = Date.now().toString(36)): string {
  const B = (n: string) => `==dispatch_${n}_${boundarySeed}`;
  const alt = [`--${B('alt')}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64lines(Buffer.from(m.text, 'utf8')),
    `--${B('alt')}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64lines(Buffer.from(m.html, 'utf8')), `--${B('alt')}--`].join('\r\n');
  const related = [`--${B('rel')}`, `Content-Type: multipart/alternative; boundary="${B('alt')}"`, '', alt,
    ...m.inline.flatMap(p => [`--${B('rel')}`, `Content-Type: ${p.mime}; name="${qname(p.filename)}"`, 'Content-Transfer-Encoding: base64',
      `Content-ID: <${p.cid}>`, `Content-Disposition: inline; filename="${qname(p.filename)}"`, '', b64lines(p.data)]),
    `--${B('rel')}--`].join('\r\n');
  const head = [`From: ${m.from}`, `To: ${m.to}`, ...(m.cc ? [`Cc: ${m.cc}`] : []), `Subject: ${enc(m.subject)}`, 'MIME-Version: 1.0'];
  if (!m.files.length) return [...head, `Content-Type: multipart/related; boundary="${B('rel')}"`, '', related, ''].join('\r\n');
  return [...head, `Content-Type: multipart/mixed; boundary="${B('mix')}"`, '',
    `--${B('mix')}`, `Content-Type: multipart/related; boundary="${B('rel')}"`, '', related,
    ...m.files.flatMap(p => [`--${B('mix')}`, `Content-Type: ${p.mime}; name="${qname(p.filename)}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${qname(p.filename)}"`, '', b64lines(p.data)]),
    `--${B('mix')}--`, ''].join('\r\n');
}

/** "Pat Sample" <pat@example.com> */
export const fromHeader = (name: string, email: string) => `${enc(name.replace(/[<>"]/g, ''))} <${email}>`;

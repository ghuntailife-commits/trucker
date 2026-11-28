// Follow-up emails from Dispatch (George, 2026-11-27): the policy summary after a sale and the no-cost benefits
// email after a no-sale, the same wording and look George sends today, for every agent, signed by that agent.
// Pure: builds the subject, HTML, plain text and the list of attachments. Sent by /api/email/send from the agent's
// own Gmail. Tested in test/followUp.test.ts.

export interface Signature { name: string; title: string; phone: string; email: string; npn: string; site: string;
  /** data: URL of the agent's photo (small JPEG/PNG), or '' for none */ photo: string }

export const GEORGE_SIGNATURE: Omit<Signature, 'photo'> = { name: 'George Hunt', title: 'Regional Benefits Director', phone: '615-753-1733',
  email: 'ghunt.ailife@gmail.com', npn: '22237655', site: 'ailife.com' };
export const blankSignature = (name: string, email = ''): Signature => ({ name, title: 'Benefits Representative', phone: '', email, npn: '', site: 'ailife.com', photo: '' });

export type MetWhen = 'today' | 'this evening' | 'last night' | 'yesterday';
export type SaleCert = 'attach' | 'blank' | 'later';
export type NoSaleCert = 'attach' | 'blank' | 'digital';

export interface SaleEmail { kind: 'sale'; first: string; to: string; cc?: string; when: MetWhen; opening: string; coverage: string[];
  monthly: number; draftDay: string; startMonth?: string; trial: boolean;
  add: null | { amount: number; group: string; cert: SaleCert }; childKit: boolean; willKit: boolean }
export interface NoSaleEmail { kind: 'nosale'; first: string; to: string; cc?: string; when: MetWhen; amount: number; group: string; cert: NoSaleCert; childKit: boolean }
export type FollowUp = SaleEmail | NoSaleEmail;

/** Files the email carries. 'upload' is the client's own certificate the agent attached. */
export type FileKey = 'add-certificate-blank.pdf' | 'ail-plus.pdf' | 'ail-plus-small.pdf' | 'will-kit.pdf' | 'child-safe-kit.pdf' | 'upload';
export interface Attachment { file: FileKey; filename: string; mime: string }
export interface Built { subject: string; html: string; text: string; attachments: Attachment[]; to: string; cc: string }

const PDF = 'application/pdf';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** $4,000 · $1,250 · $61.94 */
export function dollars(n: number): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
/** Good Morning / Afternoon / Evening by the time in Eastern (the team's clock), as George's emails do. */
export function greeting(now: number, tz = 'America/New_York'): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}
/** 12 → "12th", "3" → "3rd"; text that isn't a number is kept. */
export function ordinal(v: string): string {
  const m = String(v).trim().match(/^(\d{1,2})(st|nd|rd|th)?$/i);
  if (!m) return String(v).trim();
  const n = Number(m[1]);
  const suf = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suf}`;
}

const P = (t: string, mb = 20) => `<p style="margin:0 0 ${mb}px 0">${t}</p>`;
const H = (t: string) => `<div style="font-size:16px;line-height:22px;font-weight:bold;color:#00558C;margin:0 0 6px 0">${t}</div>`;
const UL = (items: string[]) => `<ul style="margin:0 0 20px 0;padding:0 0 0 22px">${items.map(i => `<li style="margin:0 0 6px 0">${i}</li>`).join('\n')}</ul>`;
const BOX = (bar: string, label: string, inner: string) =>
  `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0">\n<tr>\n<td width="4" bgcolor="${bar}" style="width:4px;font-size:0;line-height:0"> </td>\n` +
  `<td bgcolor="#F3F7FA" style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1a1a1a">\n` +
  `<div style="font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#00558C;margin:0 0 6px 0">${label}</div>\n${inner}\n</td>\n</tr>\n</table>`;
const addLines = (amount: number) => {
  const full = esc(dollars(amount)), half = esc(dollars(amount / 2));
  return `<div style="margin:0 0 4px 0"><b>${full}</b> paid to the beneficiary of your choice if you pass away from an accident</div>\n` +
    `<div style="margin:0 0 4px 0"><b>${full}</b> paid to you for the loss of both hands, both feet, sight in both eyes, or any combination of the two</div>\n` +
    `<div style="margin:0"><b>${half}</b> paid to you for the loss of one hand, one foot, or sight in one eye</div>`;
};
const MORE = H('More About Us') + '\n' + P('<a href="https://e806.globelifeinsurance.com/about#historyofglobe" style="color:#00558C">Globe Life History</a><br><a href="https://e806.globelifeinsurance.com/globelifereviews#jbf" style="color:#00558C">Globe Life Reviews</a>', 28);
const CHILD_KIT = 'Your Child Safe Kit is also attached. It gives you one place to keep your child\'s personal information, physical description, photo and fingerprints, so you have everything on hand to give to the authorities right away in an emergency. Remember to update it every year.';

/** The agent's signature, rebuilt in the body as George's Gmail signature is (photo, two-color rule, name, title, contact, logo, NPN). */
export function signatureHtml(s: Signature): string {
  const font = "'Segoe UI',-apple-system,Helvetica,Arial,sans-serif";
  const dot = '<span style="color:rgb(195,202,209);padding:0px 7px">·</span>';
  const tel = s.phone.replace(/\D/g, '');
  const bits = [
    s.phone && `<a href="tel:+1${tel.slice(-10)}" style="color:rgb(26,26,26);text-decoration:none">${esc(s.phone)}</a>`,
    s.email && `<a href="mailto:${esc(s.email)}" style="color:rgb(26,26,26);text-decoration:none">${esc(s.email)}</a>`,
    s.site && `<a href="https://${esc(s.site.replace(/^https?:\/\//, ''))}/" style="color:rgb(0,85,140);text-decoration:none">${esc(s.site.replace(/^https?:\/\//, ''))}</a>`,
  ].filter(Boolean).join(dot);
  const photo = s.photo ? `<td style="padding:0px 14px 0px 0px;vertical-align:middle"><img src="cid:sigphoto" width="64" height="64" alt="${esc(s.name)}" style="display:block;border:0px;border-radius:4px;width:64px;height:64px"></td>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tbody><tr>${photo}` +
    `<td width="2" style="width:2px;padding:0px;font-size:0px;line-height:0"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tbody><tr><td width="2" height="40" bgcolor="#00558C" style="width:2px;height:40px;line-height:0"> </td></tr><tr><td width="2" height="24" bgcolor="#319B42" style="width:2px;height:24px;line-height:0"> </td></tr></tbody></table></td>` +
    `<td style="padding:0px 22px 0px 14px;vertical-align:middle"><div style="font-family:Georgia,'Times New Roman',Times,serif;font-size:18px;line-height:22px;font-weight:bold;color:rgb(26,26,26);letter-spacing:-0.2px">${esc(s.name)}</div>` +
    (s.title ? `<div style="font-family:${font};font-size:10.5px;line-height:15px;font-weight:bold;color:rgb(0,85,140);letter-spacing:0.9px;text-transform:uppercase;padding-top:2px">${esc(s.title)}</div>` : '') +
    `<div style="height:5px;line-height:5px;font-size:0px"> </div><div style="font-family:${font};font-size:12px;line-height:18px;color:rgb(26,26,26)">${bits}</div></td>` +
    `<td style="padding:0px;vertical-align:middle"><img src="cid:siglogo" width="124" height="43" alt="Globe Life | American Income Division" style="display:block;border:0px;width:124px;height:43px">` +
    (s.npn ? `<div style="padding-top:5px"><span style="font-family:${font};font-size:9.5px;line-height:14px;color:rgb(138,147,156);letter-spacing:0.7px">NPN ${esc(s.npn)}</span></div>` : '') +
    `</td></tr></tbody></table>`;
}

const wrap = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#1a1a1a;max-width:640px">\n${inner}\n</div>`;

/** Does the agent's own opening already thank or greet? Then it replaces "Thanks for taking some time with me". */
const thanksAlready = (s: string) => /^\s*(thank|it was (a|great)|great (speaking|talking|meeting)|pleasure)/i.test(s);

export function buildFollowUp(e: FollowUp, sig: Signature, now: number): Built {
  const hi = P(`${greeting(now)} ${esc(e.first.trim())},`, 16);
  const end = signatureHtml(sig);
  if (e.kind === 'nosale') {
    const group = e.group.trim() ? esc(e.group.trim()) : 'your union';
    const certP = e.cert === 'digital'
      ? 'You should have received a separate email to sign your AD&amp;D certificate. Once it is signed, please keep a copy somewhere safe so that if something happens, you and your family will have proof of it. Last year our company paid out over $4 million in these no-cost accidental policies.'
      : 'Your AD&amp;D certificate is attached to this email. Please print it and put it somewhere safe so that if something happens, you and your family will have proof of it. Last year our company paid out over $4 million in these no-cost accidental policies.';
    const html = wrap([hi,
      P(`Thanks for taking some time with me ${e.when}! As a member in good standing with ${group}, you have several no-cost benefits provided to you by American Income Life. Your Accidental Death &amp; Dismemberment (AD&amp;D) benefit has been activated, and the details on each of your benefits are below:`, 16),
      BOX('#00558C', 'Your AD&amp;D Benefit &ndash; Activated', addLines(e.amount)),
      P(certP),
      H('AIL Plus Discount Card'), P('The AIL Plus Discount Card is designed to help lower your out-of-pocket medical expenses and will not affect your existing health coverage. This benefit is at no cost to you and everyone in your household, and provides a 10 to 85% discount on prescriptions, vision, hearing, chiropractic services and much more. You access the discount card with the AIL Plus mobile app: plug in your zip code and medications, and you will see all of the local providers and how you can save money for you and your family right away. A flyer with more details is attached.'),
      H('Will Kit'), P('Your complimentary Will Kit is attached. It allows you to create a legally recognized will without the cost of hiring an attorney, potentially saving you $1,000&ndash;$2,000 in legal fees. All you need to do is complete the kit and have it notarized according to your state\'s requirements.'),
      ...(e.childKit ? [H('Child Safe Kit'), P('Your Child Safe Kit is also attached. It gives you one place to keep your child\'s personal information, physical description, photo and fingerprints, so you have everything on hand to give to the authorities right away in an emergency. Remember to update it every year.')] : []),
      P('If you have any questions about any of these benefits, never hesitate to reach out to me.'),
      MORE, end].join('\n'));
    const attachments: Attachment[] = [
      ...(e.cert === 'attach' ? [{ file: 'upload' as const, filename: 'AD&D Certificate.pdf', mime: PDF }] : e.cert === 'blank' ? [{ file: 'add-certificate-blank.pdf' as const, filename: 'AD&D Certificate.pdf', mime: PDF }] : []),
      { file: 'ail-plus-small.pdf', filename: 'AIL Plus.pdf', mime: PDF },
      { file: 'will-kit.pdf', filename: 'Legacy Will Kit.pdf', mime: PDF },
      ...(e.childKit ? [{ file: 'child-safe-kit.pdf' as const, filename: 'Child Safe Kit.pdf', mime: PDF }] : []),
    ];
    return { subject: 'Your No-Cost Benefits', html, text: htmlToText(html, sig), attachments, to: e.to.trim(), cc: (e.cc ?? '').trim() };
  }

  // sale
  const when = e.when;
  const opening = e.opening.trim() || 'You made a great decision for your financial future.';
  const day = ordinal(e.draftDay);
  const first = thanksAlready(opening) ? esc(opening) : `Thanks for taking some time with me ${when}! ${esc(opening)}`;
  const intro = e.trial
    ? `${first} Your application has been submitted and will go through some additional underwriting before a final decision is made. No payment will be drafted while your application is being reviewed, and I will reach out as soon as I have an update. Below are the details on the policy we applied for ${when}:`
    : `${first} You are in full control of this policy and can adjust it as needed. Feel free to reach out with any concerns or questions as I will be your agent going forward - never hesitate to reach out to me. Below are the details on the policy we set up ${when}:`;
  const pay = e.trial
    ? `<b>Payment:</b> Once approved, a total of ${esc(dollars(e.monthly))}/month, drafted on the ${esc(day)} of each month`
    : `<b>Payment:</b> Total of ${esc(dollars(e.monthly))}/month. Your first premium will draft within the next 1-5 business days, and after that it will be drafted on the ${esc(day)} of each month${e.startMonth?.trim() ? ` starting in ${esc(e.startMonth.trim())}` : ''}.`;
  const lines = e.coverage.map(c => c.trim()).filter(Boolean).map(c => `<div style="font-size:16px;line-height:25px;font-weight:bold">${esc(c)}</div>`).join('\n');
  const policy = BOX('#00558C', e.trial ? 'Your Application' : 'Your Policy', `${lines}\n<div style="margin:10px 0 0 0">${pay}</div>`);
  const add = e.add;
  const grp = add?.group.trim();
  const addBlock = add && add.cert !== 'later' ? [
    BOX('#319B42', 'Your AD&amp;D Benefit &ndash; Activated', addLines(add.amount)),
    P(e.trial
      ? `This is provided to you at no cost${grp ? ` for being a member in good standing with ${esc(grp)}` : ''}, and it is active now regardless of your application. Your AD&amp;D certificate is attached to this email. Please print it and put it somewhere safe so that if something happens, you and your family will have proof of it.`
      : `This is provided to you at no cost${grp ? ` for being a member in good standing with ${esc(grp)}` : ''}, and your AD&amp;D certificate is attached to this email. Please print it and put it somewhere safe so that if something happens, you and your family will have proof of it.`),
  ] : [];
  const free = [
    ...(add?.cert === 'later' ? [`I am working with the home office to get you your ${esc(dollars(add.amount))} AD&amp;D (Accidental Death &amp; Dismemberment) benefit, and I will send your certificate as soon as it is ready.`] : []),
    'You should have received a text with a TCPA consent form to enroll in the AIL+ discount card, if you did not please reach out and let me know. Just download the AIL Plus app, and you will be able to see providers in your area that we work with where you can receive discounts!',
    e.willKit ? 'There is also a complimentary will kit attached to this email, let me know if you have any questions about it.' : 'There is also a complimentary will kit, let me know if you are interested in hearing more about this.',
    ...(e.childKit ? [CHILD_KIT] : []),
  ];
  const html = wrap([hi, P(intro, 16), policy,
    ...(e.trial ? [] : [P('I will reach out in 6 months to a year to check in and see if you want to increase your investment or adjust anything.')]),
    H(e.trial ? 'Policy Details (once approved)' : 'Policy Details'),
    UL(['Pays out to your beneficiary within 24–48 hours after you pass to help cover funeral and final expenses.',
      'Any amount remaining after final expenses is paid out to your family tax-free, typically within 1-3 business days.',
      'Your whole life policy builds cash value over time at a 4.5% interest rate, and you have the ability to borrow against the cash value of your policy if needed.']),
    ...addBlock,
    H('Free Benefits'), UL(free),
    ...(e.trial ? [P('If you have any questions in the meantime, never hesitate to reach out to me.')]
      : [H('Customer Login for Policy'), P('Below is the link to create a login to check on your policy\'s performance, cash value and coverages. If you ever have additional questions or want to adjust anything please call me first and we will discuss your options and adjust as necessary.<br><a href="https://myaccount.ailife.com/" style="color:#00558C">https://myaccount.ailife.com/</a>')]),
    MORE, end].join('\n'));
  const attachments: Attachment[] = [
    ...(add && add.cert === 'attach' ? [{ file: 'upload' as const, filename: 'AD&D Certificate.pdf', mime: PDF }] : add && add.cert === 'blank' ? [{ file: 'add-certificate-blank.pdf' as const, filename: 'AD&D Certificate.pdf', mime: PDF }] : []),
    ...(e.willKit ? [{ file: 'will-kit.pdf' as const, filename: 'Legacy Will Kit.pdf', mime: PDF }] : []),
    { file: e.childKit ? 'ail-plus-small.pdf' : 'ail-plus.pdf', filename: 'AIL Plus.pdf', mime: PDF },
    ...(e.childKit ? [{ file: 'child-safe-kit.pdf' as const, filename: 'Child Safe Kit.pdf', mime: PDF }] : []),
  ];
  return { subject: 'Your Policy Summary & No-Cost Benefits', html, text: htmlToText(html, sig), attachments, to: e.to.trim(), cc: (e.cc ?? '').trim() };
}

/** Plain-text copy for mail apps that don't show HTML. */
export function htmlToText(html: string, sig: Signature): string {
  const body = html.split('<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tbody><tr>')[0]
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, (_m, href: string, t: string) => (href.startsWith('https://e806') ? `${t}: ${href}` : t))
    .replace(/<li[^>]*>/g, '- ').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|li|tr|ul)>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .split('\n').map(l => l.trim()).filter((l, i, a) => l || (a[i - 1] ?? '') !== '').join('\n').trim();
  const sigText = [sig.name, sig.title, [sig.phone, sig.email, sig.site].filter(Boolean).join(' · '), sig.npn ? `NPN ${sig.npn}` : ''].filter(Boolean).join('\n');
  return `${body}\n\n${sigText}\n`;
}

/** What's missing before it can send, in plain words; [] when ready. */
export function emailProblems(e: FollowUp, opts: { hasUpload: boolean }): string[] {
  const out: string[] = [];
  if (!e.first.trim()) out.push('the client\'s first name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.to.trim())) out.push('a valid email address');
  if (e.cc?.trim() && !e.cc.split(',').every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()))) out.push('a valid cc address');
  if (e.kind === 'nosale') {
    if (!(e.amount > 0)) out.push('the AD&D amount');
    if (e.cert === 'attach' && !opts.hasUpload) out.push('the certificate PDF');
  } else {
    if (!e.coverage.some(c => c.trim())) out.push('at least one coverage line');
    if (!(e.monthly > 0)) out.push('the monthly total');
    if (!e.draftDay.trim()) out.push('the draft day');
    if (e.add && !(e.add.amount > 0)) out.push('the AD&D amount');
    if (e.add?.cert === 'attach' && !opts.hasUpload) out.push('the certificate PDF');
  }
  return out;
}

/** The blank certificate is printed for $2,000. */
export const BLANK_CERT_AMOUNT = 2000;

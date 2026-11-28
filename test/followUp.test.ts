// Follow-up emails (George, 2026-11-27). Made-up clients only.
import { describe, expect, it } from 'vitest';
import { buildFollowUp, dollars, emailProblems, greeting, ordinal, type NoSaleEmail, type SaleEmail, type Signature } from '../src/email/followUp';

const sig: Signature = { name: 'Pat Sample', title: 'Benefits Representative', phone: '555-555-0100', email: 'pat@example.com', npn: '123', site: 'ailife.com', photo: '' };
const eveningET = Date.UTC(2026, 10, 27, 23, 30);   // 6:30 PM ET
const morningET = Date.UTC(2026, 10, 27, 14, 0);    // 9 AM ET

const sale: SaleEmail = { kind: 'sale', first: 'Jordan', to: 'jordan@example.com', when: 'today', opening: 'You made a great decision for your financial future and for your wife and kids.',
  coverage: ['$25,000 guaranteed whole life coverage', '$100,000 of temporary death benefit'], monthly: 61.94, draftDay: '12', startMonth: 'December', trial: false,
  add: null, childKit: false, willKit: true };
const nosale: NoSaleEmail = { kind: 'nosale', first: 'Maria', to: 'maria@example.com', when: 'today', amount: 4000, group: 'SEIU 205', cert: 'blank', childKit: true };

describe('helpers', () => {
  it('money, ordinal and greeting', () => {
    expect(dollars(4000)).toBe('$4,000'); expect(dollars(1250)).toBe('$1,250'); expect(dollars(61.94)).toBe('$61.94'); expect(dollars(1250.5)).toBe('$1,250.50');
    expect(ordinal('12')).toBe('12th'); expect(ordinal('1')).toBe('1st'); expect(ordinal('22nd')).toBe('22nd'); expect(ordinal('3')).toBe('3rd'); expect(ordinal('11')).toBe('11th');
    expect(greeting(eveningET)).toBe('Good Evening'); expect(greeting(morningET)).toBe('Good Morning');
  });
});

describe('policy summary (sale)', () => {
  it('fills the template the way George writes it', () => {
    const b = buildFollowUp(sale, sig, eveningET);
    expect(b.subject).toBe('Your Policy Summary & No-Cost Benefits');
    expect(b.html).toContain('Good Evening Jordan,');
    expect(b.html).toContain('Thanks for taking some time with me today! You made a great decision for your financial future and for your wife and kids. You are in full control');
    expect(b.html).toContain('$25,000 guaranteed whole life coverage');
    expect(b.html).toContain('Total of $61.94/month. Your first premium will draft within the next 1-5 business days, and after that it will be drafted on the 12th of each month starting in December.');
    expect(b.html).toContain('Customer Login for Policy');
    expect(b.html).toContain('Pat Sample');
    expect(b.attachments.map(a => a.filename)).toEqual(['Legacy Will Kit.pdf', 'AIL Plus.pdf']);
    expect(b.text).toContain('- Pays out to your beneficiary');
    expect(b.text).toContain('Globe Life History: https://e806.globelifeinsurance.com/about#historyofglobe');
  });
  it('trial: application wording, no login section, no 1-5 day line', () => {
    const b = buildFollowUp({ ...sale, trial: true }, sig, eveningET);
    expect(b.html).toContain('Your Application');
    expect(b.html).toContain('Once approved, a total of $61.94/month, drafted on the 12th of each month');
    expect(b.html).not.toContain('Customer Login');
    expect(b.html).toContain('Policy Details (once approved)');
  });
  it('AD&D with the blank certificate, a child kit and an opening that already thanks', () => {
    const b = buildFollowUp({ ...sale, opening: 'Thank you so much for taking some time tonight.', add: { amount: 4000, group: 'Teamsters 100', cert: 'blank' }, childKit: true }, sig, eveningET);
    expect(b.html).not.toContain('Thanks for taking some time with me');
    expect(b.html).toContain('<b>$2,000</b> paid to you for the loss of one hand');
    expect(b.html).toContain('member in good standing with Teamsters 100');
    expect(b.attachments.map(a => a.filename)).toEqual(['AD&D Certificate.pdf', 'Legacy Will Kit.pdf', 'AIL Plus.pdf', 'Child Safe Kit.pdf']);
    expect(b.attachments[2].file).toBe('ail-plus-small.pdf');
  });
  it('certificate not ready: a Free Benefits line instead of the box', () => {
    const b = buildFollowUp({ ...sale, add: { amount: 2500, group: '', cert: 'later' } }, sig, eveningET);
    expect(b.html).toContain('I am working with the home office to get you your $2,500 AD&amp;D');
    expect(b.html).not.toContain('Your AD&amp;D Benefit');
  });
  it('no will kit: different bullet and no attachment', () => {
    const b = buildFollowUp({ ...sale, willKit: false }, sig, eveningET);
    expect(b.html).toContain('let me know if you are interested in hearing more about this');
    expect(b.attachments.map(a => a.filename)).toEqual(['AIL Plus.pdf']);
  });
});

describe('no-cost benefits (no sale)', () => {
  it('fills full and half amounts, group, certificate and kits', () => {
    const b = buildFollowUp(nosale, sig, eveningET);
    expect(b.subject).toBe('Your No-Cost Benefits');
    expect(b.html).toContain('member in good standing with SEIU 205');
    expect(b.html).toContain('<b>$4,000</b> paid to the beneficiary');
    expect(b.html).toContain('<b>$2,000</b> paid to you for the loss of one hand');
    expect(b.html).toContain('Your AD&amp;D certificate is attached');
    expect(b.html).not.toMatch(/no sale|did not buy/i);
    expect(b.attachments.map(a => a.filename)).toEqual(['AD&D Certificate.pdf', 'AIL Plus.pdf', 'Legacy Will Kit.pdf', 'Child Safe Kit.pdf']);
  });
  it('signing digitally: no certificate attached, the signing wording', () => {
    const b = buildFollowUp({ ...nosale, cert: 'digital', childKit: false, group: '' }, sig, eveningET);
    expect(b.html).toContain('separate email to sign');
    expect(b.html).toContain('with your union');
    expect(b.html).not.toContain('Child Safe Kit');
    expect(b.attachments.map(a => a.filename)).toEqual(['AIL Plus.pdf', 'Legacy Will Kit.pdf']);
  });
  it('their own certificate goes first as an upload', () => {
    expect(buildFollowUp({ ...nosale, cert: 'attach' }, sig, eveningET).attachments[0].file).toBe('upload');
  });
});

describe('emailProblems', () => {
  it('names what is missing', () => {
    expect(emailProblems({ ...nosale, to: 'nope', amount: 0, cert: 'attach' }, { hasUpload: false })).toEqual(['a valid email address', 'the AD&D amount', 'the certificate PDF']);
    expect(emailProblems(sale, { hasUpload: false })).toEqual([]);
  });
});

describe('signature', () => {
  it('leaves out the photo cell when there is no photo, and shows it when there is', () => {
    expect(buildFollowUp(nosale, sig, eveningET).html).not.toContain('cid:sigphoto');
    expect(buildFollowUp(nosale, { ...sig, photo: 'data:image/jpeg;base64,AAAA' }, eveningET).html).toContain('cid:sigphoto');
  });
});

import { buildMime, fromHeader } from '../src/email/mime';
describe('buildMime', () => {
  it('nests text+html, inline images and PDFs', () => {
    const raw = buildMime({ from: fromHeader('Pat Sample', 'pat@example.com'), to: 'jordan@example.com', subject: 'Your Policy Summary & No-Cost Benefits', html: '<p>Hi</p>', text: 'Hi',
      inline: [{ filename: 'signature-logo.png', mime: 'image/png', data: Buffer.from('png'), cid: 'siglogo' }],
      files: [{ filename: 'AD&D Certificate.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4') }] }, 'x');
    expect(raw).toContain('From: Pat Sample <pat@example.com>');
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="==dispatch_mix_x"');
    expect(raw).toContain('Content-ID: <siglogo>');
    expect(raw).toContain('filename="AD&D Certificate.pdf"');
    expect(raw.indexOf('multipart/alternative')).toBeLessThan(raw.indexOf('Content-ID'));
    expect(raw.trim().endsWith('--==dispatch_mix_x--')).toBe(true);
  });
  it('encodes a non-ASCII subject', () => {
    expect(buildMime({ from: 'a@b.co', to: 'c@d.co', subject: 'Résumé', html: '', text: '', inline: [], files: [] })).toContain('Subject: =?UTF-8?B?');
  });
});

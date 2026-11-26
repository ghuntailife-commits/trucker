// Stage 7: roles, settings, the health check, the Monday coaching note and Quo. Made-up contacts only.
import { describe, expect, it } from 'vitest';
import { contact, et, TZ } from './helpers';
import { TAGS } from '../src/rules/tags';
import type { LogEvent } from '../src/rules/types';
import { defaultTeam, pagesFor, visibleAgents, configFor, checkRules, ruleChanges, defaultRules, viewers } from '../src/team/agents';
import { healthCheck, healthCount } from '../src/team/health';
import { mondayNote, lastWeek } from '../src/team/coaching';
import { e164, textFor, checkText, sendTextRequest, readEvent, matchContact, verifySignature, eventNote, textParts } from '../src/quo/quo';
import { DEFAULT_CONFIG } from '../src/rules/config';
import { demoMonth } from '../src/app-store/demoLog';

describe('roles', () => {
  const team = defaultTeam();
  it('admin sees every page, agents their own work, the boss results only', () => {
    expect(pagesFor('admin')).toContain('settings');
    expect(pagesFor('agent')).not.toContain('team');
    expect(pagesFor('admin')).toContain('library');
    expect(pagesFor('agent')).not.toContain('library');
    expect(pagesFor('agent')).toContain('today');
    expect(pagesFor('boss')).toEqual(['team']);
  });
  it('an agent sees only their own numbers; admin and boss see everyone', () => {
    expect(visibleAgents({ id: 'gracie', role: 'agent' }, team).map(a => a.id)).toEqual(['gracie']);
    expect(visibleAgents({ id: 'boss', role: 'boss' }, team)).toHaveLength(3);
    expect(viewers(team).map(v => v.name)).toEqual(['George', 'Austin', 'Gracie', 'Boss']);
  });
  it('Quo is on for George and Gracie only; coaching for everybody', () => {
    expect(team.agents.filter(a => a.quo).map(a => a.id)).toEqual(['george', 'gracie']);
    expect(team.agents.every(a => a.coaching)).toBe(true);
  });
});

describe('rule settings', () => {
  it('starts on the approved defaults, with nothing changed', () => {
    const r = defaultRules();
    expect(configFor(r)).toEqual(DEFAULT_CONFIG);
    expect(ruleChanges(r)).toEqual([]);
    expect(checkRules(r)).toEqual([]);
  });
  it('lists a change in plain words and refuses bad values', () => {
    const r = { ...defaultRules(), callbackTries: 4, pmStartHour: 16 };
    expect(ruleChanges(r)).toEqual(['Callback tries before it goes back to the list: 3 → 4', 'Afternoon starts at: 3 PM → 4 PM']);
    expect(configFor(r).callbackTries).toBe(4);
    expect(checkRules({ ...r, retryDays: [1, 1, 1] })[0]).toMatch(/8 whole numbers/);
    expect(checkRules({ ...r, listSize: 5 })[0]).toMatch(/List size/);
  });
});

describe('health check', () => {
  const now = et(26, 12);
  it('finds a passed appointment, a late callback and a do-not-call number on another contact', () => {
    const appt = contact({ tag: TAGS.scheduled, callAt: et(25, 19), dials: 2, lastDialed: et(23, 10) });
    const cb = contact({ tag: TAGS.callback, callAt: et(23, 15), lastDialed: et(22, 10), dials: 1 });
    const dnc = contact({ tag: TAGS.dnc, phone: '(214) 555-0199' });
    const other = contact({ phone: '214-555-0199' });
    const fine = contact({ tag: TAGS.scheduled, callAt: et(26, 19) });
    const f = healthCheck({ contacts: [appt, cb, dnc, other, fine], sales: [], noSales: [], now, tz: TZ });
    const by = Object.fromEntries(f.map(x => [x.key, x.ids]));
    expect(by.pastAppt).toEqual([appt.id]);
    expect(by.lateCallback).toEqual([cb.id]);
    expect(by.dncDup).toEqual([other.id]);
    expect(f[0].level).toBe('fix');
    expect(healthCount(f).fix).toBe(2);
  });
  it('finds duplicate and short numbers, and passed follow-ups with no dial', () => {
    const a = contact({ phone: '(865) 555-0101' }), b = contact({ list: 'Georgia', backup: '865.555.0101', phone: '(404) 555-0102' });
    const short = contact({ phone: '555-0103' });
    const p = contact({ tag: TAGS.presented, lastDialed: et(20, 19) });
    const f = healthCheck({ contacts: [a, b, short, p], now, tz: TZ, sales: [],
      noSales: [{ at: et(20, 19), contactId: p.id, objections: ['Price'], reason: '', followUp: '2026-11-24', followUpNote: '', calledInto: false }] });
    const by = Object.fromEntries(f.map(x => [x.key, x]));
    expect(by.dupPhone.ids.sort()).toEqual([a.id, b.id].sort());
    expect(by.dupPhone.about![a.id]).toBe('(865) 555-0101 · 2 contacts');
    expect(by.oddPhone.ids).toEqual([short.id]);
    expect(by.lateFollowUp.ids).toEqual([p.id]);
  });
  it('a clean list has nothing to report', () => {
    expect(healthCheck({ contacts: [contact(), contact()], sales: [], noSales: [], now, tz: TZ })).toEqual([]);
  });
});

describe('Monday coaching note', () => {
  it('covers last Monday to Sunday', () => {
    const w = lastWeek(et(30, 8), TZ);     // Monday 11/30
    expect(w.label).toBe('11/23–11/29');
    expect(lastWeek(et(26, 8), TZ).label).toBe('11/16–11/22');
  });
  it('writes a note with last week against the week before and one thing to work on', () => {
    const now = et(30, 8);
    const m = demoMonth(now, TZ, 30, { seed: 11 });
    const n = mondayNote({ name: 'Avery', ...m, now, tz: TZ, goal: 15000 });
    expect(n.subject).toMatch(/^Your week, 11\/23–11\/29/);
    expect(n.lines.map(l => l.label)).toEqual(['Dials', 'Reached', 'Booked', 'Presented', 'Sold', 'ALP']);
    expect(n.focus.title).toBeTruthy();
    expect(n.text).toContain('Good morning Avery,');
    expect(n.text).toContain('This week, one thing:');
    expect(n.text).not.toMatch(/lead/i);
  });
  it('a quiet week asks for a full week of dials', () => {
    const now = et(30, 8);
    const log: LogEvent[] = [{ at: et(24, 10), contactId: 'x', list: 'Texas', first: 'A', last: 'B', phone: '', kind: 'Dial', count: 1, tag: '', dials: 1 }];
    const n = mondayNote({ name: 'Avery', log, sales: [], noSales: [], now, tz: TZ, goal: 0 });
    expect(n.quiet).toBe(true);
    expect(n.focus.key).toBe('volume');
  });
});

describe('Quo', () => {
  it('formats numbers and fills texts', () => {
    expect(e164('(214) 555-0101')).toBe('+12145550101');
    expect(e164('555-0101')).toBeNull();
    const t = textFor('confirmTomorrow', { first: 'Avery', company: 'Acme' }, { agent: 'George', time: '7:00 PM' });
    expect(t).toBe('Hi Avery, this is George. Just a reminder about our appointment tomorrow at 7:00 PM ET. Reply YES to confirm or text me a better time.');
    expect(textParts(t)).toBe(1);
    expect(textParts('x'.repeat(200))).toBe(2);
  });
  it('checks a text before sending and builds the request with the key on the server side', () => {
    expect(checkText({ from: '', to: '(214) 555-0101', content: 'hi' })).toMatch(/Quo number/);
    expect(checkText({ from: '+12145550000', to: '555', content: 'hi' })).toMatch(/10-digit/);
    const r = sendTextRequest({ from: '(214) 555-0100', to: '(214) 555-0101', content: 'hi' }, 'KEY');
    expect(r.url).toBe('https://api.openphone.com/v1/messages');
    expect(JSON.parse(r.init.body)).toEqual({ content: 'hi', from: '+12145550100', to: ['+12145550101'] });
    expect(r.init.headers.Authorization).toBe('KEY');
  });
  it('reads call-ended and text-received events and finds the contact', () => {
    const call = readEvent({ type: 'call.completed', createdAt: '2026-11-26T20:05:00Z', data: { object: { id: 'AC1', direction: 'outgoing',
      from: '+12145550100', to: '+18655550101', answeredAt: '2026-11-26T20:00:00Z', completedAt: '2026-11-26T20:03:12Z' } } });
    expect(call).toMatchObject({ kind: 'callEnded', phone: '+18655550101', direction: 'out', seconds: 192, answered: true });
    expect(eventNote(call, '11/26')).toBe('11/26: Quo call 3m 12s');
    const txt = readEvent({ type: 'message.received', data: { object: { id: 'AM1', from: '+18655550101', text: 'YES', createdAt: '2026-11-26T20:00:00Z' } } });
    expect(txt).toMatchObject({ kind: 'textIn', body: 'YES' });
    expect(readEvent({ type: 'contact.updated' })).toEqual({ kind: 'ignored', type: 'contact.updated' });
    const a = contact({ phone: '(865) 555-0101', lastDialed: et(20, 10) }), b = contact({ backup: '865-555-0101', lastDialed: et(25, 10) });
    expect(matchContact([a, b], '+18655550101')?.id).toBe(b.id);
  });
  it('accepts only webhooks signed with the agent’s key', async () => {
    const key = btoa('made-up-signing-key'), body = '{"type":"call.completed"}', ts = '1764187200000';
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('made-up-signing-key'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${ts}.${body}`)))));
    expect(await verifySignature(`hmac;1;${ts};${sig}`, body, key)).toBe(true);
    expect(await verifySignature(`hmac;1;${ts};${sig}`, body + ' ', key)).toBe(false);
    expect(await verifySignature(null, body, key)).toBe(false);
  });
});

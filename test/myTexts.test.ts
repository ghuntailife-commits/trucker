// My texts (George, 2026-11-27): agents rewrite each text and make their own. Made-up names.
import { describe, expect, it } from 'vitest';
import { renderText, suggestText, textFor, DEFAULT_TEXTS } from '../src/quo/quo';

describe('my texts', () => {
  const fill = { agent: 'Sam', time: '7:00 PM', when: 'Tuesday, 12/1, 7:00 PM', day: 'Tuesday', tz: 'ET' };
  it('fills the fields and drops empty ones cleanly', () => {
    expect(renderText('Hi {first}, {agent} here. See you {day} at {time} {tz}.', { first: 'Jo' }, fill)).toBe('Hi Jo, Sam here. See you Tuesday at 7:00 PM ET.');
    expect(textFor('missed', { first: 'Jo', company: '' }, fill)).toContain('benefits for members');
    expect(renderText('Hi {first} {unknown}', {}, fill)).toBe('Hi there {unknown}');
  });
  it("uses the agent's own version when they wrote one", () => {
    expect(textFor('hour', { first: 'Jo' }, fill, { edits: { hour: 'Calling at {time}, {first}!' } })).toBe('Calling at 7:00 PM, Jo!');
    expect(textFor('hour', { first: 'Jo' }, fill, { edits: { hour: '  ' } })).toBe(renderText(DEFAULT_TEXTS.hour, { first: 'Jo' }, fill));
  });
  it('opens the text that fits the moment', () => {
    const now = 1_000_000_000;
    expect(suggestText(now + 30 * 60_000, now, false, true)).toBe('hour');
    expect(suggestText(now + 5 * 3_600_000, now, false, true)).toBe('confirmToday');
    expect(suggestText(now + 20 * 3_600_000, now, false, false)).toBe('confirmTomorrow');
    expect(suggestText(now - 60_000, now, false, true)).toBe('noShow');
    expect(suggestText(null, now, true, false)).toBe('noShow');
    expect(suggestText(null, now, false, false)).toBe('missed');
  });
});

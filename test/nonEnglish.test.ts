// Non-English list (George, 2026-11-27): a hang-up whose note says Spanish moves to the Non-English list.
import { describe, expect, it } from 'vitest';
import { contact, et } from './helpers';
import { dialerAction, nonEnglish, NON_ENGLISH } from '../src/rules/engine';

describe('non-English contacts', () => {
  it('reads the language from the note', () => {
    expect(nonEnglish('Spanish')).toBe('Spanish');
    expect(nonEnglish('only speaks español')).toBe('Spanish');
    expect(nonEnglish("doesn't speak english")).toBe('not English');
    expect(nonEnglish('hung up fast')).toBeNull();
    expect(nonEnglish('frenchtown')).toBeNull();
  });
  it('moves a hang-up with "spanish" in the note, and nothing else', () => {
    const now = et(2026, 11, 27, 14, 0);
    const c = contact({ list: 'Ohio' });
    const r = dialerAction(c, 'hungup', now, undefined, { note: 'spanish' });
    expect(r.contact.list).toBe(NON_ENGLISH);
    expect(r.contact.notes).toContain('Hung up - spanish - Moved to Non-English list (was Ohio)');
    expect(dialerAction(c, 'hungup', now, undefined, { note: 'rude' }).contact.list).toBe('Ohio');
    expect(dialerAction(c, 'noanswer', now, undefined, { note: 'spanish voicemail' }).contact.list).toBe('Ohio');
  });
});

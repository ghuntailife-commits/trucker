// System status lines (George, 2026-11-27). Made-up agents only.
import { describe, expect, it } from 'vitest';
import { linesFor, worst, type AgentRaw } from '../src/status/check';

const now = Date.UTC(2026, 10, 27, 18);
const base: AgentRaw = { id: 'avery', email: 'avery@example.com', role: 'agent', lastSave: now - 5 * 60_000, inbox: 0,
  screens: [{ agent: 'avery', at: now - 60_000, build: 'b2', viewing: 'avery', save: 'saved' }],
  quo: { workspace: true, last: now - 3_600_000, calls7: 12, texts7: 30, transcripts7: 10, notesMissing: 0, stuck: 0 },
  cal: { connected: true, lastSync: now - 4 * 60_000, ok: true, events: 9 } };
const level = (a: AgentRaw, label: string) => linesFor(a, now, 'b2').find(l => l.label === label)?.level;

describe('system status', () => {
  it('everything working is green', () => { expect(worst(linesFor(base, now, 'b2'))).toBe('ok'); });
  it('a screen that cannot save is red', () => {
    expect(level({ ...base, screens: [{ ...base.screens[0], save: 'failed', saveError: 'network' }] }, 'Saving')).toBe('bad');
  });
  it('an old version is amber', () => { expect(level({ ...base, screens: [{ ...base.screens[0], build: 'b1' }] }, 'Open now')).toBe('warn'); });
  it('missing AI notes and a failed calendar sync show', () => {
    expect(level({ ...base, quo: { ...base.quo!, notesMissing: 4 } }, 'AI call notes')).toBe('bad');
    expect(level({ ...base, cal: { connected: true, ok: false, error: 'Needs to reconnect Google', events: 0, lastSync: now } }, 'Google Calendar')).toBe('bad');
  });
  it('things not set up are grey, not red', () => {
    const a = { ...base, quo: null, cal: { connected: false, events: 0 }, screens: [], lastSave: null };
    expect(worst(linesFor(a, now, 'b2'))).toBe('off');
  });
});

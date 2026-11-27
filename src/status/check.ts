// System status (George, 2026-11-27): turns what the server knows about each agent into green / amber / red lines.
// Pure, tested in test/status.test.ts.
export type Level = 'ok' | 'warn' | 'bad' | 'off';
export interface Line { label: string; level: Level; detail: string }

export interface Screen { agent: string; at: number; build: string; viewing: string; save: string; saveError?: string; page?: string; ua?: string }
export interface AgentRaw {
  id: string; email: string | null; role: string;
  lastSave: number | null;                 // newest kv write owned by them
  inbox: number;                           // changes waiting for their screen
  screens: Screen[];                       // open screens in the last 24 hours (their own sign-in)
  quo: { workspace: boolean; last: number | null; calls7: number; texts7: number; transcripts7: number; notesMissing: number; stuck: number } | null;
  cal: { connected: boolean; email?: string | null; lastSync?: number; ok?: boolean; error?: string; events: number };
}

const ago = (now: number, t: number) => {
  const m = Math.round((now - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export function linesFor(a: AgentRaw, now: number, build: string): Line[] {
  const out: Line[] = [];
  // Saving
  const live = a.screens.filter(s => now - s.at < 6 * 60_000);
  const failing = live.find(s => s.save === 'failed');
  out.push(failing ? { label: 'Saving', level: 'bad', detail: `A screen can't save: ${failing.saveError ?? 'unknown error'}` }
    : a.lastSave ? { label: 'Saving', level: 'ok', detail: `Last saved ${ago(now, a.lastSave)}` }
    : { label: 'Saving', level: 'off', detail: 'Nothing saved yet' });
  // Open screens and versions
  const old = live.filter(s => build && s.build && s.build !== build);
  out.push(!live.length ? { label: 'Open now', level: 'off', detail: a.screens.length ? `Last seen ${ago(now, Math.max(...a.screens.map(s => s.at)))}` : 'Not seen yet' }
    : old.length ? { label: 'Open now', level: 'warn', detail: `${live.length} screen${live.length === 1 ? '' : 's'}, ${old.length} on an old version (reloads itself between calls)` }
    : { label: 'Open now', level: 'ok', detail: `${live.length} screen${live.length === 1 ? '' : 's'}, up to date` });
  // Inbox
  if (a.inbox) out.push({ label: 'Waiting changes', level: live.length ? 'warn' : 'off', detail: `${a.inbox} change${a.inbox === 1 ? '' : 's'} waiting for their screen${live.length ? ' (should arrive within a minute)' : ' (arrive when they open Dispatch)'}` });
  // Quo
  if (!a.quo) out.push({ label: 'Quo', level: 'off', detail: 'No Quo number set up' });
  else {
    const q = a.quo;
    out.push(q.stuck ? { label: 'Quo', level: 'warn', detail: `${q.stuck} call${q.stuck === 1 ? '' : 's'} or text${q.stuck === 1 ? '' : 's'} not matched to a contact after 30 min (a number not in Dispatch, or their screen hasn't been open)` }
      : q.last ? { label: 'Quo', level: now - q.last > 3 * 86_400_000 ? 'warn' : 'ok', detail: `Last event ${ago(now, q.last)} · 7 days: ${q.calls7} calls, ${q.texts7} texts` }
      : { label: 'Quo', level: q.workspace ? 'warn' : 'off', detail: q.workspace ? 'Set up, but nothing has arrived yet' : 'No events yet' });
    if (q.transcripts7) out.push(q.notesMissing ? { label: 'AI call notes', level: q.notesMissing > 2 ? 'bad' : 'warn', detail: `${q.notesMissing} of ${q.transcripts7} transcripts this week have no notes` }
      : { label: 'AI call notes', level: 'ok', detail: `All ${q.transcripts7} transcripts this week have notes` });
  }
  // Google Calendar
  const c = a.cal;
  out.push(!c.connected ? { label: 'Google Calendar', level: 'off', detail: 'Not connected' }
    : c.ok === false ? { label: 'Google Calendar', level: 'bad', detail: `Last sync failed: ${c.error ?? 'unknown'}` }
    : c.lastSync ? { label: 'Google Calendar', level: now - c.lastSync > 2 * 86_400_000 ? 'warn' : 'ok', detail: `Synced ${ago(now, c.lastSync)} · ${c.events} events${c.email ? ` · ${c.email}` : ''}` }
    : { label: 'Google Calendar', level: 'warn', detail: 'Connected, not synced yet' });
  return out;
}

export const worst = (ls: Line[]): Level => (ls.some(l => l.level === 'bad') ? 'bad' : ls.some(l => l.level === 'warn') ? 'warn' : ls.some(l => l.level === 'ok') ? 'ok' : 'off');

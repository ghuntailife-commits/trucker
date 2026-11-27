// The contact written out for Claude (the AI call brief) and the prep notes that go on a booked appointment's
// calendar event (George, 2026-11-27). Browser-safe, no keys.
import type { Contact } from '../rules/types';
import { notesNewestFirst } from '../rules/notes';
import { tagShort } from '../rules/tags';
import { factsByTopic, lastCallNotes } from './profile';

const when = (t: number, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(t);

export function contactForClaude(c: Contact, now: number, tz: string): string {
  const known = factsByTopic(c.profile, now);
  return [
    `Name: ${c.first} ${c.last}`,
    `Company and job: ${[c.company, c.job].filter(Boolean).join(', ') || 'not known'}`,
    `Where: ${[c.city, c.state].filter(Boolean).join(', ') || 'not known'} (time zone ${c.zone || 'not known'})`,
    `Status now: ${c.tag ? tagShort(c.tag) : 'not called yet or no answer'}${c.callAt ? `, set for ${when(c.callAt, tz)} Eastern` : ''}`,
    `Dials so far: ${c.dials}`,
    c.quals?.length ? `Agent's quick tags: ${c.quals.join(', ')}` : '',
    known.length ? `What the calls taught us (newest first):\n${known.map(g => `- ${g.topic}: ${g.items.map(f => f.fact).join('; ')}`).join('\n')}` : '',
    `Notes, newest first:\n${notesNewestFirst(c.notes).slice(0, 30).map(l => `- ${l}`).join('\n') || '- none'}`,
  ].filter(Boolean).join('\n');
}

/** Prep notes for a booked appointment's calendar event: last call, what we know, the latest notes. */
export function prepNotes(c: Contact, now: number): string {
  const last = lastCallNotes(c.notes);
  const known = factsByTopic(c.profile, now);
  const recent = notesNewestFirst(c.notes).filter(l => !/Call notes \(AI\)/.test(l)).slice(0, 4);
  const out: string[] = [];
  if (last) out.push(`LAST CALL (${last.day}): ${last.text}`);
  if (known.length) out.push(`WHAT WE KNOW:\n${known.map(g => `• ${g.topic}: ${g.items.map(f => f.fact).join('; ')}`).join('\n')}`);
  if (recent.length) out.push(`RECENT NOTES:\n${recent.map(l => `• ${l}`).join('\n')}`);
  return out.join('\n\n');
}

/** A short fingerprint of everything the brief depends on, so it is only rewritten when something changed. */
export function briefKey(c: Contact, kind: string): string {
  const s = [c.id, kind, c.tag, c.callAt ?? '', c.notes, JSON.stringify(c.profile ?? []), (c.quals ?? []).join(',')].join('|');
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${c.id}:${kind}:${(h >>> 0).toString(36)}`;
}

/** What goes in a calendar event's description. When the client is invited, their copy would show it too, so the
 * prep notes stay in Dispatch instead. */
export function eventNote(c: Contact, now: number, clientInvited: boolean): string {
  if (clientInvited) return 'Prep notes: open this appointment in Dispatch (kept off the invite so the client never sees them).';
  const p = prepNotes(c, now);
  return p ? `PREP FOR THIS CALL\n\n${p}` : '';
}

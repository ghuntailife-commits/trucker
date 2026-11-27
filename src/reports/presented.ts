// What counts as a presentation (George, 2026-11-27): a follow-up call ("still no sale", or a sale on the follow-up)
// is not a new presentation. A contact's presented/sold result counts only if it is their first one, or they were
// booked again (a new appointment) after the last one. Pure, tested in test/presented.test.ts.
import type { LogEvent } from '../rules/types';
import { tagKind } from '../rules/tags';

/** The presented/sold log events that are real presentations (by reference). */
export function realPresentations(log: LogEvent[]): Set<LogEvent> {
  const out = new Set<LogEvent>();
  const presented = new Set<string>();
  const sorted = log.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i);
  for (const { e } of sorted) {
    if (e.kind !== 'Tag' || !e.contactId) continue;
    const k = tagKind(e.tag);
    if (k === 'scheduled') presented.delete(e.contactId);            // booked again: the next one is a new presentation
    else if (k === 'presented' || k === 'sold') {
      if (!presented.has(e.contactId)) out.add(e);
      presented.add(e.contactId);
    }
  }
  return out;
}

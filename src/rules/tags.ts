// The disposition tags, exactly as they appear on the current Rules tab.

export const TAGS = {
  callback: "ASKED FOR A CALLBACK BECAUSE THEY WERE BUSY OR THEY'RE INTERESTED",
  noshow: 'NO SHOWED A SCHEDULED PRESENTATION, MAKE PINK IF YOU ARE IN CONTACT',
  scheduled: 'SCHEDULED PRESO- MAKE SURE TO UPDATE IF THEY SHOW UP OR NOT',
  notInterested: 'HUNG UP/ NOT INTERESTED BUT THEY WERE REACHED, AND ARE THE CORRECT PERSON',
  bad: 'BAD NUMBER EITHER NOT THE  RIGHT PERSON WITH SAME NAME, OR THE NUMBER IS DISCONNECTED - FOREWARN AGAIN',
  dnc: 'EXPLICITLY ASKED TO BE ADDED TO DO NOT CALL LIST OR HAD AN ADVERSE ENOUGH REACTION TO REMOVE',
  sold: 'SOLD ;)',
  presented: 'PRESENTED BUT NOT SOLD',
  calledInto: 'CALLED INTO PRESENTATION - COLD CALL THAT WAS PRESENTED TO IMMEDIATELY',
  given: 'GIVEN TO ANOTHER AGENT',
} as const;

export type TagKind = keyof typeof TAGS | 'none' | 'other';

/** Which kind of tag this is. Matches on the start of the text, like the current script, so small edits don't break it. */
export function tagKind(tag: string | null | undefined): TagKind {
  const t = String(tag ?? '').trim().toUpperCase();
  if (!t) return 'none';
  if (t.startsWith('ASKED FOR A CALLBACK')) return 'callback';
  if (t.startsWith('NO SHOWED')) return 'noshow';
  if (t.startsWith('SCHEDULED')) return 'scheduled';
  if (t.startsWith('HUNG UP')) return 'notInterested';
  if (t.startsWith('BAD NUMBER')) return 'bad';
  if (t.startsWith('EXPLICITLY ASKED')) return 'dnc';
  if (t.startsWith('SOLD')) return 'sold';
  if (t.startsWith('PRESENTED')) return 'presented';
  if (t.startsWith('CALLED INTO')) return 'calledInto';
  if (t.startsWith('GIVEN TO ANOTHER AGENT')) return 'given';
  return 'other';
}

/** Short label used on DONE TODAY rows and in reports. */
export function tagShort(tag: string): string {
  return ({
    none: 'Dialed', callback: 'Callback', noshow: 'No showed', scheduled: 'Scheduled', notInterested: 'Hung up',
    bad: 'Bad number', dnc: 'Do not call', given: 'Given to another agent', presented: 'Presented', sold: 'Sold',
    calledInto: 'Called into', other: tag,
  } as Record<TagKind, string>)[tagKind(tag)];
}

/** Appointment results and hand-offs are not cold dials, so they never count as the day's dial. */
export function countsAsDial(tag: string): boolean {
  return !['noshow', 'presented', 'sold', 'given'].includes(tagKind(tag));
}

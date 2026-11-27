// Coaching from AI call notes (George, 2026-11-26): Claude tags each transcribed Quo call with how it ended,
// the objections heard, what went well and one thing to try. This file holds the tag shape, the instructions
// Claude gets, and the sums the Coaching tab shows. Pure, tested in test/coach.test.ts.

import { PLAYBOOK_FIELDS, readExchanges, readStage, type Exchange, type Stage } from './playbook';
import { FACT_FIELDS, readFacts, type Topic } from '../brief/profile';

export const OUTCOMES = ['Booked', 'Callback set', 'Presented', 'Sold', 'Not interested', 'Hung up', 'Voicemail', 'No answer', 'Wrong number', 'Other'] as const;
export type Outcome = typeof OUTCOMES[number];
/** The objections Dispatch counts. Claude picks from these; anything else goes in as its own short label. */
export const OBJECTIONS = ['Not interested', 'Already has coverage', 'Too busy / bad time', 'Need to talk to spouse', 'Money is tight', 'Suspicious / is this a scam',
  'Send me info instead', 'Union already covers me', 'Health concerns', 'Other'] as const;

export interface CallTags { outcome: Outcome; objections: string[]; wentWell: string; tryNext: string; opener?: string; stage?: Stage; exchanges?: Exchange[]; facts?: { topic: Topic; fact: string }[] }

/** The tool Claude must call for each transcript: the note for the contact plus the coaching tags. */
export const CALL_TOOL = {
  name: 'save_call',
  description: 'Save the call notes for the contact and the coaching tags for the agent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      note: { type: 'string', description: '2 to 4 short plain sentences for the contact notes: what happened, anything the contact said that matters (family, money, objections, who decides, best time), and the agreed next step with day and time if set. Voicemail or no talk: one sentence.' },
      outcome: { type: 'string', enum: [...OUTCOMES], description: 'How the call ended.' },
      objections: { type: 'array', items: { type: 'string' }, description: `Objections the contact raised, using these labels when they fit: ${OBJECTIONS.join('; ')}. Empty if none.` },
      went_well: { type: 'string', description: 'One short sentence: the best thing the agent did on this call. Empty for voicemail or no talk.' },
      try_next: { type: 'string', description: 'One short, specific sentence: what the agent could try next time on a call like this. Empty for voicemail or no talk.' },
      ...PLAYBOOK_FIELDS,
      ...FACT_FIELDS,
    },
    required: ['note', 'outcome', 'objections', 'went_well', 'try_next', 'opener', 'stage', 'exchanges', 'facts'],
  },
};

/** Reads Claude's tool input into a note and tags, tolerating anything odd. */
export function readCallTool(input: unknown): { note: string; tags: CallTags } | null {
  const x = input as Record<string, unknown> | null;
  if (!x || typeof x.note !== 'string') return null;
  const outcome = (OUTCOMES as readonly string[]).includes(String(x.outcome)) ? x.outcome as Outcome : 'Other';
  const objections = Array.isArray(x.objections) ? x.objections.map(String).map(s => s.trim()).filter(Boolean).slice(0, 6) : [];
  return { note: x.note.trim(), tags: { outcome, objections, wentWell: String(x.went_well ?? '').trim(), tryNext: String(x.try_next ?? '').trim(),
    opener: String(x.opener ?? '').trim().slice(0, 240), stage: readStage(x.stage), exchanges: readExchanges(x.exchanges), facts: readFacts(x.facts) } };
}

export interface CoachCall { id: string; agentId: string; callId: string | null; at: number; phone: string; note: string; tags: CallTags | null; recording?: string }

const GOOD: Outcome[] = ['Booked', 'Callback set', 'Presented', 'Sold'];
const TALKED = (o: Outcome) => !['Voicemail', 'No answer', 'Wrong number'].includes(o);

export interface CoachSums {
  calls: number; talked: number; good: number;
  outcomes: { label: Outcome; count: number }[];
  objections: { label: string; count: number; savedAnyway: number }[];
  tips: { at: number; wentWell: string; tryNext: string }[];
}

/** The Coaching tab's numbers for a set of tagged calls. "Saved anyway" = the call still ended booked, callback, presented or sold. */
export function coachSums(calls: CoachCall[]): CoachSums {
  const tagged = calls.filter(c => c.tags);
  const oc = new Map<Outcome, number>(), ob = new Map<string, { count: number; savedAnyway: number }>();
  for (const c of tagged) {
    const t = c.tags!;
    oc.set(t.outcome, (oc.get(t.outcome) ?? 0) + 1);
    for (const o of new Set(t.objections)) { const e = ob.get(o) ?? { count: 0, savedAnyway: 0 }; e.count++; if (GOOD.includes(t.outcome)) e.savedAnyway++; ob.set(o, e); }
  }
  return {
    calls: tagged.length,
    talked: tagged.filter(c => TALKED(c.tags!.outcome)).length,
    good: tagged.filter(c => GOOD.includes(c.tags!.outcome)).length,
    outcomes: [...oc].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    objections: [...ob].map(([label, e]) => ({ label, ...e })).sort((a, b) => b.count - a.count),
    tips: tagged.filter(c => c.tags!.tryNext || c.tags!.wentWell).sort((a, b) => b.at - a.at).map(c => ({ at: c.at, wentWell: c.tags!.wentWell, tryNext: c.tags!.tryNext })),
  };
}

/** What Claude is asked for the weekly coaching note. */
export const WEEKLY_PROMPT = `You coach an insurance agent who phones union and transport workers (UPS, USPS, rail, trucking) to book Globe Life benefits appointments.
You get a week of their calls: how each ended, the objections heard, Claude's notes, and per-call "went well" / "try next" lines.
Write a short coaching note for the agent, in plain friendly words, no jargon:
- One sentence on how the week went, with the key numbers.
- Their top 1 or 2 objections and a specific line they could say next time for each.
- One thing they do well that they should keep doing.
- One concrete thing to practise this week.
At most 120 words. No headings. Use short dashes for the list items. Never invent numbers that aren't in the data.`;

/** The week's calls as plain lines for Claude. */
export function weekForClaude(calls: CoachCall[]): string {
  const s = coachSums(calls);
  const head = `Calls analyzed: ${s.calls}. Talked to someone: ${s.talked}. Ended well (booked, callback, presented or sold): ${s.good}.
Outcomes: ${s.outcomes.map(o => `${o.label} ${o.count}`).join(', ') || 'none'}.
Objections: ${s.objections.map(o => `${o.label} ${o.count} (saved anyway ${o.savedAnyway})`).join(', ') || 'none'}.`;
  const lines = calls.filter(c => c.tags).slice(-60).map(c => `- ${c.tags!.outcome}; objections: ${c.tags!.objections.join(', ') || 'none'}; notes: ${c.note.replace(/\s+/g, ' ').slice(0, 300)}; went well: ${c.tags!.wentWell}; try next: ${c.tags!.tryNext}`);
  return `${head}\n\nCalls:\n${lines.join('\n')}`;
}

// What Dispatch knows about a person, gleaned by Claude from their call transcripts (George, 2026-11-27):
// still with the company or left (and when), what they do, their hours and days off, best time to reach them,
// family, what they had going on that day, and anything else worth bringing up. Kept on the contact, newest first
// per topic, and shown in the call brief with the AI notes from the last call. Pure, tested in test/profile.test.ts.
import { notesNewestFirst } from '../rules/notes';

export const TOPICS = ['Job', 'Hours', 'Best time', 'Family', 'That day', 'Money', 'Health', 'Coverage', 'Who decides', 'Personal', 'Other'] as const;
export type Topic = typeof TOPICS[number];
export const TOPIC_HELP: Record<Topic, string> = {
  'Job': 'still with the company or left (and roughly when), role, how long there, union',
  'Hours': 'shift, start and end times, days off, overtime, route',
  'Best time': 'when they said to call, or when they pick up',
  'Family': 'spouse or partner, kids and their ages, grandkids, who lives with them',
  'That day': 'what they were doing or had going on that day (driving, at a game, sick kid), with the date if said',
  'Money': 'budget worries, bills, a recent change in pay',
  'Health': 'health conditions or a recent event they mentioned',
  'Coverage': 'insurance they have now (job, union, private) and how much if said',
  'Who decides': 'a spouse or someone else who needs to be on the call',
  'Personal': 'hobbies, plans, things to bring up to build rapport',
  'Other': 'anything else useful for the next call',
};
export interface Fact { topic: Topic; fact: string; at: number }

/** The tool fields Claude fills for each call (added to save_call). */
export const FACT_FIELDS = {
  facts: {
    type: 'array',
    description: 'Facts about the PERSON learned on this call, each one short and plain (under 15 words). Only what they actually said or clearly showed; never guess. Use the topics: '
      + TOPICS.map(t => `${t} = ${TOPIC_HELP[t]}`).join('; ') + '. Empty for voicemail or no talk.',
    items: { type: 'object', properties: { topic: { type: 'string', enum: [...TOPICS] }, fact: { type: 'string' } }, required: ['topic', 'fact'] },
  },
};

export function readFacts(x: unknown): { topic: Topic; fact: string }[] {
  if (!Array.isArray(x)) return [];
  return x.map(f => f as { topic?: unknown; fact?: unknown })
    .map(f => ({ topic: ((TOPICS as readonly string[]).includes(String(f.topic)) ? f.topic : 'Other') as Topic, fact: String(f.fact ?? '').trim().slice(0, 200) }))
    .filter(f => f.fact).slice(0, 20);
}

const PER_TOPIC = 3;
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Adds a call's facts to what the contact already has: newest first, repeats dropped, a few per topic. */
export function mergeFacts(old: Fact[] | undefined, add: { topic: Topic; fact: string }[], at: number): Fact[] {
  const all = [...add.map(f => ({ ...f, at })), ...(old ?? [])].sort((a, b) => b.at - a.at);
  const out: Fact[] = [];
  for (const f of all) {
    const mine = out.filter(o => o.topic === f.topic);
    if (mine.length >= PER_TOPIC || mine.some(o => same(o.fact, f.fact))) continue;
    out.push(f);
  }
  return out;
}

/** Facts grouped by topic in a fixed order, for the brief. "That day" only counts for a couple of weeks. */
export function factsByTopic(facts: Fact[] | undefined, now: number): { topic: Topic; items: Fact[] }[] {
  const keep = (facts ?? []).filter(f => f.topic !== 'That day' || now - f.at < 14 * 86_400_000);
  return TOPICS.map(topic => ({ topic, items: keep.filter(f => f.topic === topic) })).filter(g => g.items.length);
}

/** The AI notes from the most recent call, from the contact's notes ("M/D: Call notes (AI): ..."). */
export function lastCallNotes(notes: string): { day: string; text: string } | null {
  for (const l of notesNewestFirst(notes)) {
    const m = l.match(/^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?:?\s*Call notes \(AI\):\s*(.+)$/);
    if (m) return { day: m[1], text: m[2].trim() };
  }
  return null;
}

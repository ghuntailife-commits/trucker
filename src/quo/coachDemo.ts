// Made-up coaching calls for the demo only (no real people). Phone numbers are 555 test numbers.
import { readCallTool, type CoachCall } from './coach';
import type { Playbook } from './playbook';

const S: [string, string[], string, string, string][] = [
  ['Booked', ['Need to talk to spouse'], 'Booked Tuesday 6 PM with both of them on the video call.', 'Asked when both would be home instead of pushing past the spouse objection.', 'Confirm the time by text right after you hang up.'],
  ['Not interested', ['Already has coverage'], 'Says the job already covers him. Did not want to hear more.', 'Stayed friendly and kept it short.', 'Point out that work coverage ends when the job does, then ask one question.'],
  ['Callback set', ['Too busy / bad time'], 'Driving. Asked to call back Thursday after 5 PM.', 'Got a specific day and time.', 'Say the reason for the call in the first ten seconds.'],
  ['Voicemail', [], 'Voicemail.', '', ''],
  ['Booked', ['Money is tight'], 'Worried about cost; agreed to see the no-cost benefits first. Booked Friday 7 PM.', 'Led with the no-cost benefits.', 'Keep using the no-cost opener on money objections.'],
  ['Hung up', ['Suspicious / is this a scam'], 'Thought it was a scam and hung up.', '', 'Name the union and the letter they got in the first sentence.'],
  ['Presented', ['Need to talk to spouse'], 'Presented on video; wants to decide with his wife. Follow up Monday.', 'Clear walk-through of the options.', 'Invite the spouse to the presentation when booking.'],
  ['Not interested', ['Send me info instead'], 'Asked for information by email instead.', 'Got the email address.', 'Offer a 10-minute video call as the quicker way to see the info.'],
  ['No answer', [], 'No answer.', '', ''],
  ['Booked', [], 'Booked Saturday 10 AM. Has two kids, interested in the child safe kit.', 'Asked about family early.', 'Mention the child safe kit when they have kids.'],
  ['Callback set', ['Need to talk to spouse'], 'Wants to check with spouse; call back Wednesday 6 PM.', 'Kept the door open.', 'Ask if the spouse can join the call now.'],
  ['Not interested', ['Money is tight'], 'Said money is tight right now.', '', 'Lead with what is free before anything costs money.'],
];

export function demoCoachCalls(agent: string, now: number): CoachCall[] {
  return S.map(([outcome, objections, note, went_well, try_next], i) => ({
    id: `demo-${i}`, agentId: agent, callId: `demo-${i}`, at: now - (i * 13 + 2) * 3_600_000, phone: `+1555555${String(100 + i).padStart(4, '0')}`,
    note, tags: readCallTool({ note, outcome, objections, went_well, try_next })!.tags, recording: i % 3 === 0 ? undefined : 'https://example.com/demo-recording.mp3',
  }));
}
export const DEMO_WEEKLY = `Good week: 12 calls analyzed, 9 real conversations, 6 ended well (3 booked, 2 callbacks, 1 presented).
- "Need to talk to spouse" came up 3 times. Try: "Totally fair, most people want their spouse there. What evening are you both home?"
- "Money is tight" came up twice. Lead with the no-cost benefits before anything else, like you did on Friday's booking.
- Keep asking about family early. It led straight to a booking.
- This week, practise naming the union and the letter in your first sentence to stop the "is this a scam" hang-ups.`;

/** Made-up Playbook for the demo build, to show what the team Playbook looks like once calls come in. */
export function demoPlaybook(now: number): Playbook {
  const r = (id: string, objection: string, line: string, tried: number, saved: number, why: string, from: 'calls' | 'george' | 'idea' = 'calls', ex: string[] = []) =>
    ({ id, objection, line, tried, saved, why, from, examples: ex });
  return {
    updatedAt: now - 3 * 3_600_000, callsStudied: 86, watermark: now,
    summary: 'Made-up demo: 86 calls studied, 41 real conversations. "Too busy" is the most common objection and the two-choice reschedule saves most of them; money objections are where calls are lost.',
    objections: [
      { label: 'Too busy / bad time', heard: 14, saved: 9, theySay: ['I’m driving right now', 'I’m at work, can’t talk'] },
      { label: 'Money is tight', heard: 8, saved: 2, theySay: ['I can’t afford anything else', 'Money’s tight with the holidays'] },
      { label: 'Already has coverage', heard: 6, saved: 3, theySay: ['I already have insurance through work'] },
    ],
    rebuttals: [
      r('r1', 'Too busy / bad time', 'Totally get it. It only takes about 15 minutes. Is tonight or tomorrow evening better?', 9, 7, 'Gives two easy choices instead of a yes/no.', 'calls', ['“I’m driving right now” → “Totally get it… tonight or tomorrow evening?” (saved)']),
      r('r2', 'Too busy / bad time', 'When’s a better time to call you back?', 5, 2, 'Open question; easy to brush off.'),
      r('r3', 'Money is tight', 'This isn’t about buying anything today. It’s to go over the benefits you already have through the union.', 5, 2, 'Takes the pressure off the money question.'),
      r('r4', 'Money is tight', 'Most members spend less on this than on a coffee a day, and some of it costs nothing at all.', 0, 0, 'Reframes the cost in small daily terms.', 'idea'),
      r('r5', 'Already has coverage', 'That’s great. Most of the members I meet have some through work. This makes sure it follows you if you ever leave.', 6, 3, 'Agrees, then shows the gap.'),
    ],
    openers: [
      { id: 'o1', line: 'Hi, this is ___ calling about the union member benefits that came out this year…', note: '', tried: 30, good: 11 },
      { id: 'o2', line: 'Hey ___, quick one, I’m the agent handling the benefits for your local…', note: '', tried: 11, good: 2 },
    ],
    tips: ['Offer two times, never “when is good for you?”', 'Mention the union in the first sentence.', 'On money, say “nothing to buy today” before anything else.'],
    trends: ['Busy objections double between 3 and 6 PM (shift changes).', 'Calls that reach “asked for appointment” book 58% of the time.'],
    questions: ['Do evening calls book more often? Needs about two more weeks of calls.'],
    learned: [{ at: now - 3 * 3_600_000, text: 'Made-up demo: the two-choice close saved 3 of 3 busy objections yesterday.' }],
  };
}

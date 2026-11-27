// Made-up coaching calls for the demo only (no real people). Phone numbers are 555 test numbers.
import { readCallTool, type CoachCall } from './coach';

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

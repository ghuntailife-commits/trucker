// Server only. At go-live, Claude rewrites the call brief from the contact's own notes and history, so it reads
// like the samples George approved. The rules-based brief (brief.ts) is passed in as the starting point and is
// what the agent sees if the AI is off, slow or declines, so a brief never blocks a dial.
// Needs ANTHROPIC_API_KEY in the server's settings. Never imported by the browser.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Brief, BriefKind } from './brief';

export const BRIEF_MODEL = 'claude-opus-5-5';

const BriefSchema = z.object({
  who: z.string(),
  stands: z.string(),
  openWith: z.string(),
  watch: z.array(z.string()),
});

const SYSTEM = `You write call briefs for a life insurance agent (Globe Life) who phones union and logistics workers (UPS, USPS, rail, truckers, warehouse staff).
A brief is read in five seconds, right before the agent dials, or while prepping for a booked appointment.
You get the contact's record: status, the facts learned on past calls, and the notes (the "Call notes (AI)" lines are summaries of real calls).
Write it in your own words, warm and human, like a sharp colleague whispering the key points:
- who: one sentence. Who this person is: job and whether they are still there, how long, family, town. Only what is known.
- stands: one or two sentences. What happened last time and what is due now, with dates.
- openWith: the first line the agent says, in quotes, in the agent's voice, casual and short. Tie it to something personal from the last call (their kid's game, their shift, what they asked for) when there is one.
- watch: up to three short points: best time and hours, who else should be on the call, an objection to get ahead of, something to bring up.
For an appointment, aim it at prepping that meeting. Use only facts in the record. Never guess an age, a job or a reason. Say "contacts", never "leads". Plain words, no jargon.`;

export interface AiBriefInput { kind: BriefKind | 'appt' | 'retry'; agent: string; contactText: string; draft?: Brief | null }

const KIND: Record<AiBriefInput['kind'], string> = { callback: 'a callback they asked for', followUp: 'a follow-up after a presentation with no sale', noshow: 'a contact who missed their appointment',
  appt: 'prepping a booked appointment', retry: 'calling again someone the agent has talked to before' };

/** Claude's brief in its own words, or null when the AI is not available (the screen keeps the rules draft). */
export async function aiBrief(input: AiBriefInput, client = new Anthropic()): Promise<Omit<Brief, 'kind'> | null> {
  try {
    const res = await client.messages.parse({
      model: BRIEF_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(BriefSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content:
        `Agent: ${input.agent}\nBrief for: ${KIND[input.kind]}\n\nContact record:\n${input.contactText}${input.draft ? `\n\nA rules-based draft (facts you can use; rewrite it in your own words):\n${JSON.stringify(input.draft)}` : ''}` }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return null;
    const b = res.parsed_output;
    return { who: b.who, stands: b.stands, openWith: b.openWith, watch: b.watch.slice(0, 3) };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`brief: Claude API error ${e.status}`);
    else console.error('brief: failed', e);
    return null;
  }
}

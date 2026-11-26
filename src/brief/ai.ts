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

const SYSTEM = `You write call briefs for a life insurance agent who cold-calls union and logistics workers (truckers, drivers, warehouse staff).
A brief is read in five seconds, right before the agent dials a callback, a no-sale follow-up or a no-show.
Write four parts:
- who: one sentence. Name, age, town, job and how long there, from the research notes.
- stands: one or two sentences. What already happened and what is due now, with dates.
- openWith: the first line the agent says, in quotes, in the agent's voice, casual and short. Tie it to what stopped them last time.
- watch: up to three short points the agent should keep in mind (best time to reach them, an old backup number, a family member to include).
Use only facts in the notes. Never guess an age, a job or a reason. Say "contacts", never "leads". Plain words, no jargon.`;

export interface AiBriefInput { kind: BriefKind; agent: string; contactText: string; draft: Brief }

/** Returns Claude's brief, or the draft when the AI is not available. */
export async function aiBrief(input: AiBriefInput, client = new Anthropic()): Promise<Brief & { by: 'ai' | 'rules' }> {
  try {
    const res = await client.messages.parse({
      model: BRIEF_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(BriefSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content:
        `Agent: ${input.agent}\nBrief for: ${input.kind}\n\nContact record:\n${input.contactText}\n\nA rules-based draft to improve on:\n${JSON.stringify(input.draft)}` }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return { ...input.draft, by: 'rules' };
    const b = res.parsed_output;
    return { kind: input.kind, who: b.who, stands: b.stands, openWith: b.openWith, watch: b.watch.slice(0, 3), by: 'ai' };
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`brief: Claude API error ${e.status}`);
    else console.error('brief: failed', e);
    return { ...input.draft, by: 'rules' };
  }
}

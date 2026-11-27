// Server only: Claude's notes and coaching tags for one call transcript (used by the Quo webhook, older-call tagging
// and the Playbook's daily learning run).
import Anthropic from '@anthropic-ai/sdk';
import { CALL_TOOL, readCallTool } from './coach';
import { NOTE_PROMPT } from './events';

export async function tagTranscript(client: Anthropic, text: string) {
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 2500,
    system: `${NOTE_PROMPT}\nAlso tag the call for the agent's coaching and the team Playbook (opener, how far it got, each objection with the agent's answer). Save everything with the save_call tool.`,
    tools: [CALL_TOOL], tool_choice: { type: 'tool', name: CALL_TOOL.name },
    messages: [{ role: 'user', content: `Call transcript:\n\n${text.slice(0, 60_000)}` }] });
  return readCallTool((r.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined)?.input);
}

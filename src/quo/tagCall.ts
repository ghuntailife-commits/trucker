// Server only: Claude's notes and coaching tags for one call transcript (used by the Quo webhook, older-call tagging
// and the Playbook's daily learning run).
import Anthropic from '@anthropic-ai/sdk';
import { CALL_TOOL, readCallTool } from './coach';
import { NOTE_PROMPT } from './events';

// Opus 5.5 does not allow a forced tool choice (400 "tool_choice: type tool and any are not supported"), so the
// tool is offered with tool_choice auto and the instructions say to call it. If it answers in plain text instead,
// that text still becomes the call notes (without coaching tags).
export async function tagTranscript(client: Anthropic, text: string) {
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 6000,
    system: `${NOTE_PROMPT}\nAlways answer by calling the save_call tool exactly once. Also tag the call for the agent's coaching and the team Playbook (opener, how far it got, each objection with the agent's answer), and list every fact the contact shared about themselves (job, hours, best time, family, what they had going on that day, and so on) for the next call's brief. Save everything with the save_call tool.`,
    tools: [CALL_TOOL], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `Call transcript:\n\n${text.slice(0, 60_000)}\n\nSave it with the save_call tool.` }] });
  const got = readCallTool((r.content.find(b => b.type === 'tool_use') as { input: unknown } | undefined)?.input);
  if (got) return got;
  const plain = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(' ').trim();
  return plain ? { note: plain.slice(0, 1200), tags: null } : null;
}

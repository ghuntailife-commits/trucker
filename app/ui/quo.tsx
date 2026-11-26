// "Text with Quo": pick a message, edit it, see exactly what goes out, then send from the agent's Quo number.
'use client';
import { useState } from 'react';
import type { Contact } from '../../src/rules/types';
import type { AgentSetting } from '../../src/team/agents';
import { textFor, textParts, checkText, e164, TEXT_LABEL, type TextKey } from '../../src/quo/quo';
import { Dialog, timeOnly } from './shared';

const fmt = (e: string | null) => (e ? `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}` : '');

export function QuoText({ c, agent, apptAt, first = 'missed', onClose, onSent }: {
  c: Contact; agent: AgentSetting; apptAt?: number | null; first?: TextKey; onClose: () => void; onSent: (body: string, kind: TextKey) => void;
}) {
  const fill = { agent: agent.name, time: apptAt ? timeOnly(apptAt) : '', when: apptAt ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(apptAt) : '' };
  const keys: TextKey[] = apptAt ? ['confirmToday', 'confirmTomorrow', 'booked', 'missed'] : ['missed', 'followUp'];
  const [kind, setKind] = useState<TextKey>(keys.includes(first) ? first : keys[0]);
  const [body, setBody] = useState(() => textFor(keys.includes(first) ? first : keys[0], c, fill));
  const to = c.phone || c.backup;
  const from = agent.quoNumber || '+10000000000';     // the demo has no Quo number yet
  const problem = checkText({ from, to, content: body });
  const pick = (k: TextKey) => { setKind(k); setBody(textFor(k, c, fill)); };
  return (
    <Dialog title={`Text ${c.first} with Quo`} onClose={onClose}>
      <div className="quotext">
        <div className="qrow"><span>To</span><b>{c.first} {c.last} · {fmt(e164(to)) || to || 'no number'}</b></div>
        <div className="qrow"><span>From</span><b>{agent.quoNumber ? fmt(e164(agent.quoNumber)) : `${agent.name}'s Quo number`}</b></div>
        <div className="chips">{keys.map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => pick(k)}>{TEXT_LABEL[k]}</button>)}</div>
        <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} aria-label="Text message" />
        <div className="qmeta"><span>{body.length} characters · {textParts(body)} part{textParts(body) === 1 ? '' : 's'}</span>{problem && <span className="warnline">{problem}</span>}</div>
        <div className="eyebrow">What {c.first} will see</div>
        <div className="bubble">{body}</div>
        <p className="hint">Demo: nothing is sent. At go-live this goes out from your Quo number, and their reply shows up in {c.first}&rsquo;s notes.</p>
      </div>
      <div className="bar">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!!problem} onClick={() => onSent(body.trim(), kind)}>Send with Quo</button>
      </div>
    </Dialog>
  );
}

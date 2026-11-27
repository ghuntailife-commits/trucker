// "Text with Quo": pick a message, edit it, see exactly what goes out, then send from the agent's Quo number.
'use client';
import { LIVE } from '../../src/live/supabase';
import { sendQuoText } from '../../src/live/quoClient';
import { useState } from 'react';
import type { Contact } from '../../src/rules/types';
import { quoNumbers, type AgentSetting } from '../../src/team/agents';
import { textFor, textParts, checkText, e164, TEXT_LABEL, type TextKey } from '../../src/quo/quo';
import { Dialog, TZ, timeOnly } from './shared';

const fmt = (e: string | null) => (e ? `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}` : '');

export function QuoText({ c, agent, apptAt, first = 'missed', onClose, onSent }: {
  c: Contact; agent: AgentSetting; apptAt?: number | null; first?: TextKey; onClose: () => void; onSent: (body: string, kind: TextKey) => void;
}) {
  const fill = { agent: agent.name, time: apptAt ? timeOnly(apptAt) : '', when: apptAt ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(apptAt) : '' };
  const keys: TextKey[] = apptAt ? ['confirmToday', 'confirmTomorrow', 'booked', 'missed'] : ['missed', 'followUp'];
  const [kind, setKind] = useState<TextKey>(keys.includes(first) ? first : keys[0]);
  const [body, setBody] = useState(() => textFor(keys.includes(first) ? first : keys[0], c, fill));
  const to = c.phone || c.backup;
  const from = quoNumbers(agent.quoNumber)[0] || '+10000000000';     // the demo has no Quo number yet
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const problem = checkText({ from, to, content: body });
  const pick = (k: TextKey) => { setKind(k); setBody(textFor(k, c, fill)); };
  return (
    <Dialog title={`Text ${c.first} with Quo`} onClose={onClose}>
      <div className="quotext">
        <div className="qrow"><span>To</span><b>{c.first} {c.last} · {fmt(e164(to)) || to || 'no number'}</b></div>
        <div className="qrow"><span>From</span><b>{agent.quoNumber ? fmt(e164(quoNumbers(agent.quoNumber)[0])) : `${agent.name}'s Quo number`}</b></div>
        <div className="chips">{keys.map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => pick(k)}>{TEXT_LABEL[k]}</button>)}</div>
        <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} aria-label="Text message" />
        <div className="qmeta"><span>{body.length} characters · {textParts(body)} part{textParts(body) === 1 ? '' : 's'}</span>{problem && <span className="warnline">{problem}</span>}</div>
        <div className="eyebrow">What {c.first} will see</div>
        <div className="bubble">{body}</div>
        <p className="hint">{LIVE ? <>Sends from your Quo number. Their reply shows up in {c.first}&rsquo;s notes.</> : <>Demo: nothing is sent. At go-live this goes out from your Quo number, and their reply shows up in {c.first}&rsquo;s notes.</>}</p>
        {err && <p className="warnline">{err}</p>}
      </div>
      <div className="bar">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!!problem || sending} onClick={async () => {
          if (!LIVE) return onSent(body.trim(), kind);
          setSending(true); setErr('');
          const e = await sendQuoText(to, body.trim());
          setSending(false);
          if (e) setErr(e); else onSent(body.trim(), kind);
        }}>{sending ? 'Sending…' : 'Send with Quo'}</button>
      </div>
    </Dialog>
  );
}

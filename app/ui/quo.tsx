// "Text with Quo": pick a message, edit it, see exactly what goes out, then send from the agent's Quo number.
'use client';
import { LIVE } from '../../src/live/supabase';
import { sendQuoText } from '../../src/live/quoClient';
import { useEffect, useRef, useState } from 'react';
import { textThread } from '../../src/quo/thread';
import type { Contact } from '../../src/rules/types';
import { quoNumbers, type AgentSetting } from '../../src/team/agents';
import { textFor, renderText, textParts, fancyChars, plainText, checkText, e164, TEXT_LABEL, type TextKey, type MyTexts } from '../../src/quo/quo';
import { Dialog, TZ, TZ_ABBR } from './shared';
import { contactTz, ZONE_IANA } from '../../src/rules/time';

const zoneAbbr = (iana: string) => iana === 'America/Phoenix' ? 'MT' : Object.entries(ZONE_IANA).find(([, z]) => z === iana)?.[0] ?? '';

const fmt = (e: string | null) => (e ? `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}` : '');

export function QuoText({ c, agent, apptAt, first = 'missed', mine, onEditTexts, onClose, onSent, via = 'quo', onVia }: {
  via?: 'quo' | 'dispatch'; onVia?: (v: 'quo' | 'dispatch') => void; c: Contact; agent: AgentSetting; apptAt?: number | null; first?: TextKey | 'reply'; mine?: MyTexts; onEditTexts?: () => void; onClose: () => void; onSent: (body: string, kind: TextKey) => void;
}) {
  // times in the contact's own time zone: 2 PM on an Eastern calendar reads "1:00 PM CT" to a Central contact (George, 2026-11-28)
  const zt = contactTz(c) || TZ, za = zoneAbbr(zt) || TZ_ABBR;
  const fill = { agent: agent.name, tz: za, time: apptAt ? new Intl.DateTimeFormat('en-US', { timeZone: zt, hour: 'numeric', minute: '2-digit' }).format(apptAt) : '',
    day: apptAt ? new Intl.DateTimeFormat('en-US', { timeZone: zt, weekday: 'long' }).format(apptAt) : '',
    when: apptAt ? new Intl.DateTimeFormat('en-US', { timeZone: zt, weekday: 'long', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(apptAt) : '' };
  const keys: TextKey[] = apptAt ? ['booked', 'confirmTomorrow', 'confirmToday', 'hour', 'noShow'] : ['missed', 'noShow', 'followUp'];
  const thread = textThread(c.notes);
  // carrying on a conversation: a blank reply when they texted last (or the agent pressed Reply)
  const replying = first === 'reply' || (thread.length > 0 && !thread[thread.length - 1].mine);
  const start: TextKey = keys.includes(first as TextKey) ? first as TextKey : keys[0];
  const [kind, setKind] = useState<string>(replying ? 'reply' : start);
  const [body, setBody] = useState(() => (replying ? '' : textFor(start, c, fill, mine)));
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [thread.length]);
  const to = c.phone || c.backup;
  const dsp = via === 'dispatch';
  const from = dsp ? '+10000000000' : quoNumbers(agent.quoNumber)[0] || '+10000000000';   // Dispatch picks its local number on the server     // the demo has no Quo number yet
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const problem = checkText({ from, to, content: body });
  const pick = (k: TextKey) => { setKind(k); setBody(textFor(k, c, fill, mine)); };
  const custom = mine?.custom ?? [];
  return (
    <Dialog title={dsp ? `Text ${c.first}` : `Text ${c.first} with Quo`} onClose={onClose}>
      <div className="quotext">
        <div className="qrow"><span>To</span><b>{c.first} {c.last} · {fmt(e164(to)) || to || 'no number'}</b></div>
        {onVia && <div className="qrow"><span>Send from</span><div className="seg mini" role="group" aria-label="Send from">
          <button className={dsp ? 'on' : ''} onClick={() => onVia('dispatch')}>Dispatch</button>
          <button className={dsp ? '' : 'on'} onClick={() => onVia('quo')}>Quo</button></div></div>}
        <div className="qrow"><span>From</span><b>{dsp ? 'Your local Dispatch number (the one they see when you call)' : agent.quoNumber ? fmt(e164(quoNumbers(agent.quoNumber)[0])) : `${agent.name}'s Quo number`}</b></div>
        {thread.length > 0 && <div className="tthread" ref={chat} aria-label={`Texts with ${c.first}`}>
          {thread.map((m, i) => <div key={i} className={`tmsg ${m.mine ? 'me' : 'them'}`}>{(i === 0 || thread[i - 1].day !== m.day) && <small>{m.day}</small>}<span>{m.text}</span></div>)}
        </div>}
        <div className="chips">{thread.length > 0 && <button className={kind === 'reply' ? 'on' : ''} onClick={() => { setKind('reply'); setBody(''); }}>Reply</button>}{keys.map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => pick(k)}>{TEXT_LABEL[k]}</button>)}
          {custom.map(t => <button key={t.id} className={kind === t.id ? 'on' : ''} onClick={() => { setKind(t.id); setBody(renderText(t.body, c, fill)); }}>{t.name}</button>)}
          {onEditTexts && <button className="linkish" onClick={onEditTexts}>Edit my texts</button>}</div>
        <textarea rows={4} autoFocus={kind === 'reply'} placeholder={kind === 'reply' ? `Write to ${c.first}…` : undefined} value={body} onChange={e => setBody(e.target.value)} aria-label="Text message" />
        <div className="qmeta"><TextCost text={body} onFix={setBody} />{problem && body.trim() && <span className="warnline">{problem}</span>}</div>
        {kind !== 'reply' && <><div className="eyebrow">What {c.first} will see</div>
        <div className="bubble">{body}</div></>}
        <p className="hint">{LIVE ? <>Sends from your {dsp ? 'local Dispatch' : 'Quo'} number. Their reply shows up in {c.first}&rsquo;s notes.</> : <>Demo: nothing is sent. At go-live this goes out from your Quo number, and their reply shows up in {c.first}&rsquo;s notes.</>}</p>
        {err && <p className="warnline">{err}</p>}
      </div>
      <div className="bar">
        <button className="btn" onClick={onClose}>{thread.length ? 'Close' : 'Cancel'}</button>
        <button className="btn primary" disabled={!!problem || sending} onClick={async () => {
          if (!LIVE) { onSent(body.trim(), (kind === 'reply' ? 'followUp' : kind) as TextKey); setBody(''); setKind('reply'); return; }
          setSending(true); setErr('');
          const e = await sendQuoText(to, body.trim(), via);
          setSending(false);
          if (e) setErr(e); else { onSent(body.trim(), (kind === 'reply' ? 'followUp' : kind) as TextKey); setBody(''); setKind('reply'); }   // stays open, like a texting app
        }}>{sending ? 'Sending…' : dsp ? 'Send text' : 'Send with Quo'}</button>
      </div>
    </Dialog>
  );
}

/** "1 text" or "Costs as 2 texts", and what makes it cost more (George, 2026-11-28: keep texts cheap). */
export function TextCost({ text, onFix }: { text: string; onFix?: (t: string) => void }) {
  const n = textParts(text);
  const fancy = fancyChars(text);
  const fixed = plainText(text);
  const helps = fixed !== text && textParts(fixed) < n;
  return <span className={`tcost ${n > 1 ? 'more' : ''}`}>
    {text.length} characters · {n > 1 ? <b>costs as {n} texts</b> : '1 text'}
    {n > 1 && fancy.length > 0 && <> · <span title="These characters shrink a text from 160 to 70 characters">because of {fancy.slice(0, 4).join(' ')}</span></>}
    {n > 1 && !fancy.length && <> · keep it under 160 characters for 1 text</>}
    {helps && onFix && <> <button className="linkish" onClick={() => onFix(fixed)}>Make it {textParts(fixed) === 1 ? '1 text' : `${textParts(fixed)} texts`}</button></>}
  </span>;
}

'use client';
// The team Playbook on the Coaching tab (George, 2026-11-26): what the coach has learned from the team's calls,
// objection by objection, with the rebuttals that save calls (counted by Dispatch), openers, tips, trends and a
// daily log. Everyone sees it. George can teach the coach (his scripts and notes) and run the learning by hand.
// Anyone can ask the coach a question.
import { useEffect, useRef, useState } from 'react';
import { rebuttalsFor, type Playbook, type Rebuttal } from '../../src/quo/playbook';
import { demoPlaybook } from '../../src/quo/coachDemo';
import { LIVE } from '../../src/live/supabase';
import { loadPlaybook, loadTeach, saveTeach, learnNow, askTheCoach, type TeachItem } from '../../src/live/coachClient';
import { Panel } from './charts';
import { TZ } from './shared';

const when = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pct = (a: number, b: number) => (b ? `${Math.round(100 * a / b)}%` : '—');

function RebuttalLine({ r }: { r: Rebuttal }) {
  const [open, setOpen] = useState(false);
  const badge = r.tried ? <span className={`spill mini ${r.saved / r.tried >= 0.5 ? 'green' : r.saved ? 'amber' : 'red'}`}>Saved {r.saved} of {r.tried}</span>
    : <span className="spill mini grey">{r.from === 'george' ? 'From you · not tried yet' : 'Idea · not tried yet'}</span>;
  return <li className="pbr">
    <div className="pbl">“{r.line}”</div>
    <div className="pbm">{badge}{r.why && <span className="muted">{r.why}</span>}
      {r.examples.length > 0 && <button className="linkish" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Real calls'}</button>}</div>
    {open && <ul className="pbex">{r.examples.map((x, i) => <li key={i}>{x}</li>)}</ul>}
  </li>;
}

function Ask({ agent }: { agent: string }) {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat, busy]);
  const send = async (text = q) => {
    const question = text.trim(); if (!question || busy) return;
    if (!LIVE) { setChat(c => [...c, { q: question, a: 'Demo: in the live app the coach answers here from the team Playbook, your teachings and your own calls.' }]); setQ(''); return; }
    setBusy(true); setErr(''); setQ('');
    const r = await askTheCoach(agent, question, chat);
    setBusy(false);
    if (r.error || !r.text) { setErr(r.error ?? 'No answer came back. Try again.'); setQ(question); return; }
    setChat(c => [...c, { q: question, a: r.text! }]);
  };
  const starters = ['How do I handle “I’m too busy”?', 'What should I say first on a cold call?', 'Where am I losing calls?'];
  return <Panel span={2} title="Ask the coach" meta="Answers from the Playbook and your calls">
    <div className="askbox">
      {!chat.length && <div className="askstart">{starters.map(s => <button key={s} className="btn sm" onClick={() => send(s)}>{s}</button>)}</div>}
      {chat.map((m, i) => <div key={i} className="askturn"><p className="askq">{m.q}</p><p className="aska">{m.a}</p></div>)}
      {busy && <p className="aska muted">Thinking…</p>}
      {err && <p className="warnline">{err}</p>}
      <div ref={end} />
    </div>
    <form className="askform" onSubmit={e => { e.preventDefault(); void send(); }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about an objection, a script line, your numbers…" aria-label="Ask the coach" />
      <button className="btn primary" disabled={busy || !q.trim()}>Ask</button>
    </form>
  </Panel>;
}

function Teach({ items, setItems }: { items: TeachItem[]; setItems: (x: TeachItem[]) => void }) {
  const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const add = () => {
    if (!text.trim()) return;
    const next = [{ id: `t-${Date.now().toString(36)}`, title: title.trim() || 'Untitled', text: text.trim(), at: Date.now() }, ...items];
    setItems(next); saveTeach(next); setTitle(''); setText('');
  };
  const remove = (id: string) => { const next = items.filter(i => i.id !== id); setItems(next); saveTeach(next); };
  return <Panel span={2} title="Teach the coach" meta="Only you see this. The coach weighs it against real calls.">
    <div className="teach">
      <input placeholder="Title, e.g. “Busy rebuttals” or “Opening script”" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea rows={5} placeholder="Paste a script, rebuttals, notes from a training…" value={text} onChange={e => setText(e.target.value)} />
      <div className="bar"><span className="muted">{text.length ? `${text.length.toLocaleString('en-US')} characters` : ''}</span><button className="btn primary" disabled={!text.trim()} onClick={add}>Add</button></div>
      {items.map(i => <div key={i.id} className="teachitem">
        <button className="linkish" onClick={() => setOpen(open === i.id ? null : i.id)}><b>{i.title}</b></button>
        <span className="muted">{when.format(i.at)}</span>
        <button className="linkish danger" onClick={() => remove(i.id)}>Delete</button>
        {open === i.id && <pre className="teachtext">{i.text}</pre>}
      </div>)}
      {!items.length && <p className="hint">Nothing yet. Your scripts and best rebuttals go here.</p>}
    </div>
  </Panel>;
}

export function PlaybookView({ agent, admin, now }: { agent: string; admin: boolean; now: number }) {
  const [pb, setPb] = useState<Playbook | null | undefined>(undefined);
  const [teach, setTeach] = useState<TeachItem[]>([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (!LIVE) { setPb(demoPlaybook(now)); return; }
    loadPlaybook().then(setPb).catch(() => setPb(null));
    if (admin) loadTeach().then(setTeach).catch(() => {});
  }, [admin]); // eslint-disable-line react-hooks/exhaustive-deps

  const learn = async () => {
    setBusy(true); setMsg('');
    let total = 0;
    for (let i = 0; i < 8; i++) {               // keep going while there's a backlog, a batch at a time
      const r = await learnNow();
      if (r.error) { setMsg(r.error); break; }
      total += r.studied ?? 0;
      setMsg(`Studied ${total} call${total === 1 ? '' : 's'}${r.more ? ', still going…' : '.'}${!total && r.message ? ` ${r.message}` : ''}`);
      if (!r.more) break;
    }
    setPb(await loadPlaybook().catch(() => pb ?? null));
    setBusy(false);
  };

  if (pb === undefined) return <div className="empty">Loading the Playbook…</div>;
  const book = pb ?? null;
  const objs = book?.objections ?? [];
  const shown = pick ?? objs[0]?.label ?? null;
  const shownObj = objs.find(o => o.label === shown);
  const others = book ? [...new Set(book.rebuttals.map(r => r.objection))].filter(o => !objs.some(x => x.label === o)) : [];

  return <div className="rgrid">
    <Panel span={4} title="Team Playbook" meta={book?.updatedAt ? `Learned from ${book.callsStudied.toLocaleString('en-US')} calls · updated ${when.format(book.updatedAt)} · learns every morning` : 'Learns every morning from the team’s calls'}
      foot={admin && LIVE && <><button className="btn sm" disabled={busy} onClick={learn}>{busy ? 'Learning…' : 'Learn now'}</button>{msg && <span className="muted">{msg}</span>}</>}>
      {book?.summary ? <p className="coachnote">{book.summary}</p>
        : <p className="hint pad16">Nothing learned yet. Each morning the coach studies the team’s transcribed Quo calls{admin ? ', or press Learn now' : ''}. It needs calls with Quo transcription on.</p>}
    </Panel>

    {objs.length > 0 && <Panel span={4} title="Objections and what works" meta="Saved = the call kept going toward a booking after the answer">
      <div className="pbtabs">{[...objs.map(o => o.label), ...others].map(l => { const o = objs.find(x => x.label === l);
        return <button key={l} className={shown === l ? 'on' : ''} onClick={() => setPick(l)}>{l}{o && <small>{o.heard} heard · {pct(o.saved, o.heard)} saved</small>}</button>; })}</div>
      {shown && <div className="pbbody">
        {shownObj?.theySay.length ? <p className="pbsay"><span className="eyebrow">What they say</span> {shownObj.theySay.map(t => `“${t}”`).join(' · ')}</p> : null}
        <ol className="pblist">{rebuttalsFor(book!, shown).map(r => <RebuttalLine key={r.id} r={r} />)}</ol>
        {!rebuttalsFor(book!, shown).length && <p className="hint">No answers recorded for this one yet.</p>}
      </div>}
    </Panel>}

    <Ask agent={agent} />
    {book && <Panel span={2} title="Openers" meta="Ended well = booked, callback, presented or sold">
      {book.openers.length ? <ul className="pbop">{[...book.openers].sort((a, b) => b.tried - a.tried).slice(0, 6).map(o =>
        <li key={o.id}><span>“{o.line}”</span><b>{pct(o.good, o.tried)}</b><small>{o.good} of {o.tried}</small></li>)}</ul>
        : <p className="hint pad16">Openers show up as calls are studied.</p>}
    </Panel>}

    {book && (book.tips.length > 0 || book.trends.length > 0) && <Panel span={2} title="Tips and trends">
      <ul className="tiplist">{book.tips.map((t, i) => <li key={'t' + i}><span><b className="c-sold">Tip:</b> {t}</span></li>)}
        {book.trends.map((t, i) => <li key={'r' + i}><span><b className="c-pres">Trend:</b> {t}</span></li>)}
        {book.questions.map((t, i) => <li key={'q' + i}><span className="muted"><b>Still learning:</b> {t}</span></li>)}</ul>
    </Panel>}
    {book && book.learned.length > 0 && <Panel span={2} title="What the coach learned" meta="Newest first">
      <ul className="tiplist">{book.learned.slice(0, 10).map((l, i) => <li key={i}><span className="muted">{when.format(l.at)}</span><span>{l.text}</span></li>)}</ul>
    </Panel>}
    {admin && <Teach items={teach} setItems={setTeach} />}
  </div>;
}

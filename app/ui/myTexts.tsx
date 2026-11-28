'use client';
// "My texts" (George, 2026-11-27): each agent rewrites the texts for each moment (confirmation after booking, morning
// reminder, 1 hour before, no-show follow-up, ...) and makes their own. Used in the Text with Quo box.
import { useState } from 'react';
import { TextCost } from './quo';
import { DEFAULT_TEXTS, TEXT_FIELDS, TEXT_KEYS, TEXT_LABEL, TEXT_WHEN, renderText, plainText, type MyTexts, type TextKey, type CustomText } from '../../src/quo/quo';
import { Dialog, TZ_ABBR } from './shared';

const SAMPLE = { first: 'Jordan', last: 'Sample', company: 'UPS' };

export function MyTextsDialog({ agentName, texts, onSave, onClose }: { agentName: string; texts: MyTexts; onSave: (t: MyTexts) => void; onClose: () => void }) {
  const [edits, setEdits] = useState<Partial<Record<TextKey, string>>>(() => ({ ...(texts.edits ?? {}) }));
  const [custom, setCustom] = useState<CustomText[]>(() => (texts.custom ?? []).map(t => ({ ...t })));
  const [sel, setSel] = useState<string>('booked');
  const fill = { agent: agentName, tz: TZ_ABBR, time: '7:00 PM', day: 'Tuesday', when: 'Tuesday, 12/1, 7:00 PM' };
  const isKey = (TEXT_KEYS as string[]).includes(sel);
  const cur = isKey ? (edits[sel as TextKey] ?? DEFAULT_TEXTS[sel as TextKey]) : custom.find(t => t.id === sel)?.body ?? '';
  const setCur = (v: string) => (isKey ? setEdits(e => ({ ...e, [sel]: v })) : setCustom(cs => cs.map(t => (t.id === sel ? { ...t, body: v } : t))));
  const ct = custom.find(t => t.id === sel);
  const preview = renderText(cur, SAMPLE, fill);
  const add = () => { const id = `t-${Date.now().toString(36)}`; setCustom(cs => [...cs, { id, name: 'New text', body: 'Hi {first}, this is {agent}. ' }]); setSel(id); };
  const insert = (f: string) => setCur(`${cur}${cur.endsWith(' ') || !cur ? '' : ' '}{${f}}`);
  const save = () => {
    const clean: Partial<Record<TextKey, string>> = {};
    for (const k of TEXT_KEYS) { const v = edits[k]?.trim(); if (v && v !== DEFAULT_TEXTS[k]) clean[k] = v; }
    onSave({ edits: clean, custom: custom.filter(t => t.body.trim()).map(t => ({ ...t, name: t.name.trim() || 'My text' })) });
    onClose();
  };
  return <Dialog title="My texts" onClose={onClose} wide>
    <div className="mytexts">
      <div className="mtlist">
        <div className="eyebrow">For each moment</div>
        {TEXT_KEYS.map(k => <button key={k} className={`mtitem ${sel === k ? 'on' : ''}`} onClick={() => setSel(k)}>
          <b>{TEXT_LABEL[k]}</b><small>{edits[k] && edits[k] !== DEFAULT_TEXTS[k] ? 'Your version' : 'Default'}</small></button>)}
        <div className="eyebrow" style={{ marginTop: 12 }}>My own</div>
        {custom.map(t => <button key={t.id} className={`mtitem ${sel === t.id ? 'on' : ''}`} onClick={() => setSel(t.id)}><b>{t.name || 'My text'}</b></button>)}
        <button className="btn sm" onClick={add}>+ New text</button>
      </div>
      <div className="mtedit">
        {isKey ? <><h3>{TEXT_LABEL[sel as TextKey]}</h3><p className="hint">{TEXT_WHEN[sel as TextKey]}</p></>
          : ct && <label><span>Name</span><input value={ct.name} onChange={e => setCustom(cs => cs.map(t => (t.id === sel ? { ...t, name: e.target.value } : t)))} /></label>}
        <textarea rows={5} value={cur} onChange={e => setCur(e.target.value)} aria-label="Text template" />
        <div className="chips"><span className="hint">Add:</span>{TEXT_FIELDS.map(f => <button key={f} className="chip" onClick={() => insert(f)}>{`{${f}}`}</button>)}</div>
        <div className="eyebrow">Example ({SAMPLE.first} at {SAMPLE.company}, 7:00 PM)</div>
        <div className="bubble">{preview}</div>
        <p className="hint"><TextCost text={preview} onFix={() => setCur(plainText(cur))} />. Names and companies change the length a little. You can still change any text before it sends.</p>
        <div className="bar"><span className="muted" />
          {isKey && edits[sel as TextKey] != null && edits[sel as TextKey] !== DEFAULT_TEXTS[sel as TextKey] &&
            <button className="linkish" onClick={() => setEdits(e => { const n = { ...e }; delete n[sel as TextKey]; return n; })}>Back to the default</button>}
          {!isKey && <button className="linkish danger" onClick={() => { setCustom(cs => cs.filter(t => t.id !== sel)); setSel('booked'); }}>Delete this text</button>}
        </div>
      </div>
    </div>
    <div className="bar"><span className="muted" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Save my texts</button>
    </div>
  </Dialog>;
}

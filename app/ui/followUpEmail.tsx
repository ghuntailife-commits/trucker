'use client';
// Follow-up emails (George, 2026-11-27): after a Sale or No sale, the policy summary or no-cost benefits email,
// filled in from the result and the contact, previewed, then sent from the agent's own Gmail. Plus "My email
// signature" (profile menu), which every email ends with.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIVE, connectGoogleCalendar, db } from '../../src/live/supabase';
import { loadState, saveState } from '../../src/app-store/store';
import { BLANK_CERT_AMOUNT, GEORGE_SIGNATURE, blankSignature, buildFollowUp, emailProblems, type FollowUp, type MetWhen,
  type NoSaleCert, type SaleCert, type Signature } from '../../src/email/followUp';
import { Dialog } from './shared';
import { money, tidyCoverage, tidyDay, tidyMonth, tidyMonthly } from '../../src/email/tidy';

// ---------- signature ----------
const sigKey = (agent: string) => `dispatch-sig-${agent}`;
const sigCache = new Map<string, Signature>();

async function dataUrl(src: string): Promise<string> {
  const b = await (await fetch(src)).blob();
  return await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(b); });
}
/** The agent's saved signature, or a starting one (George's own for George). */
export async function loadSignature(agent: string, name: string, email = ''): Promise<Signature> {
  if (sigCache.has(agent)) return sigCache.get(agent)!;
  const saved = await loadState<Signature>(sigKey(agent)).catch(() => null);
  let s = saved ?? (agent === 'george' ? { ...GEORGE_SIGNATURE, photo: await dataUrl('/email/photo-george.jpg').catch(() => '') } : blankSignature(name, email));
  s = { ...blankSignature(name, email), ...s };
  sigCache.set(agent, s);
  return s;
}
function saveSignature(agent: string, s: Signature) { sigCache.set(agent, s); saveState(sigKey(agent), s); }

/** Shrinks a picked photo to 128px square (JPEG) so it stays small in every email. */
async function squarePhoto(f: File): Promise<string> {
  const img = new Image(); img.src = URL.createObjectURL(f);
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 128, 128);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.85);
}

export function SignatureDialog({ agent, name, email, onClose, onSaved }: { agent: string; name: string; email?: string; onClose: () => void; onSaved?: (s: Signature) => void }) {
  const [s, setS] = useState<Signature | null>(null);
  useEffect(() => { void loadSignature(agent, name, email).then(setS); }, [agent, name, email]);
  if (!s) return <Dialog title="My email signature" onClose={onClose}><p className="hint">Loading…</p></Dialog>;
  const set = (k: keyof Signature, v: string) => setS({ ...s, [k]: v });
  return <Dialog title="My email signature" onClose={onClose}>
    <div className="rform sigform">
      <p className="sub">Every follow-up email ends with this, the way George&rsquo;s Gmail signature looks.</p>
      <div className="sigphoto">
        {s.photo ? <img src={s.photo} alt="" /> : <span className="sigph">No photo</span>}
        <label className="btn sm">Choose photo<input type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) set('photo', await squarePhoto(f)); }} /></label>
        {s.photo && <button className="linkish" onClick={() => set('photo', '')}>Remove</button>}
      </div>
      <div className="grid2">
        <label className="fld"><span>Name</span><input value={s.name} onChange={e => set('name', e.target.value)} /></label>
        <label className="fld"><span>Title</span><input value={s.title} onChange={e => set('title', e.target.value)} /></label>
        <label className="fld"><span>Phone</span><input value={s.phone} onChange={e => set('phone', e.target.value)} /></label>
        <label className="fld"><span>Email</span><input value={s.email} onChange={e => set('email', e.target.value)} /></label>
        <label className="fld"><span>NPN</span><input value={s.npn} onChange={e => set('npn', e.target.value)} /></label>
        <label className="fld"><span>Website</span><input value={s.site} onChange={e => set('site', e.target.value)} /></label>
      </div>
      <div className="bar"><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!s.name.trim()} onClick={() => { saveSignature(agent, s); onSaved?.(s); onClose(); }}>Save signature</button></div>
    </div>
  </Dialog>;
}

// ---------- the email ----------
export interface EmailStart {
  kind: 'sale' | 'nosale'; contactId: string; first: string; last: string; email: string; company: string;
  /** from the sale form */ monthly?: number; wholeLife?: number; trial?: boolean;
}

const pdfToB64 = (f: File) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = bad; r.readAsDataURL(f); });
const num = (v: string) => money(v) || Number(String(v).replace(/[$,\s]/g, '')) || 0;   // "4k" works too
const defaultWhen = (): MetWhen => { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(Date.now())); return h >= 17 ? 'this evening' : 'today'; };

export function FollowUpEmailDialog({ agent, agentName, agentEmail, start, onClose, onSent }: {
  agent: string; agentName: string; agentEmail?: string; start: EmailStart; onClose: () => void; onSent: (note: string, email: string) => void;
}) {
  const [sig, setSig] = useState<Signature | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  useEffect(() => { void loadSignature(agent, agentName, agentEmail).then(setSig); }, [agent, agentName, agentEmail]);
  const sale = start.kind === 'sale';
  // shared
  const [first, setFirst] = useState(start.first);
  const [to, setTo] = useState(start.email);
  const [cc, setCc] = useState('');
  const [when, setWhen] = useState<MetWhen>(defaultWhen());
  const [childKit, setChildKit] = useState(!sale);
  // AD&D
  const [hasAdd, setHasAdd] = useState(!sale);
  const [amount, setAmount] = useState('');
  const [group, setGroup] = useState('');
  const [saleCert, setSaleCert] = useState<SaleCert>('blank');
  const [noCert, setNoCert] = useState<NoSaleCert>('blank');
  const [file, setFile] = useState<File | null>(null);
  // sale
  const [opening, setOpening] = useState('You made a great decision for your financial future.');
  const [coverage, setCoverage] = useState<string[]>(() => [start.wholeLife ? `$${start.wholeLife.toLocaleString('en-US')} guaranteed whole life coverage` : '', '']);
  const [monthly, setMonthly] = useState(start.monthly ? String(start.monthly) : '');
  const [draftDay, setDraftDay] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [trial, setTrial] = useState(!!start.trial);
  const [willKit, setWillKit] = useState(true);
  // sending
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [reconnect, setReconnect] = useState(false);
  const [sent, setSent] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  const cert = sale ? saleCert : noCert;
  const email: FollowUp = sale
    ? { kind: 'sale', first, to, cc, when: when === 'this evening' ? 'today' : when, opening, coverage: coverage.map(tidyCoverage), monthly: num(monthly), draftDay: tidyDay(draftDay), startMonth: tidyMonth(startMonth), trial,
      add: hasAdd ? { amount: num(amount), group, cert: saleCert } : null, childKit, willKit }
    : { kind: 'nosale', first, to, cc, when, amount: num(amount), group, cert: noCert, childKit };
  const problems = emailProblems(email, { hasUpload: !!file });
  const built = useMemo(() => (sig ? buildFollowUp(email, sig, Date.now()) : null), [JSON.stringify(email), sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = built ? built.html.replace(/cid:siglogo/g, '/email/logo.png').replace(/cid:sigphoto/g, sig?.photo ?? '') : '';
  const needsCertFile = (sale ? hasAdd && saleCert === 'attach' : noCert === 'attach');
  const blankWarn = (sale ? hasAdd && saleCert === 'blank' : noCert === 'blank') && num(amount) > 0 && num(amount) !== BLANK_CERT_AMOUNT;
  const tooBig = file && file.size > 2.8 * 1024 * 1024;

  const send = async (test: boolean) => {
    if (!sig || problems.length || tooBig) return;
    setErr(''); setReconnect(false); setBusy(test ? 'Sending a test to you…' : 'Sending…');
    try {
      const { data } = await db().auth.getSession();
      const r = await fetch('/api/email/send', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, signature: sig, certificate: needsCertFile && file ? await pdfToB64(file) : undefined, test }) });
      const j = await r.json().catch(() => ({})) as { error?: string; reconnect?: boolean; to?: string; subject?: string };
      if (!r.ok) { setErr(j.error ?? `Could not send (${r.status})`); setReconnect(!!j.reconnect); return; }
      if (test) { setSent(`Test sent to ${j.to}. Check your inbox, then send it to ${first}.`); return; }
      onSent(`Emailed: "${j.subject}" to ${to.trim()}${cert === 'attach' || cert === 'blank' ? (sale && !hasAdd ? '' : ' with the AD&D certificate') : ''}`, to.trim());
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  useEffect(() => { const d = frame.current?.contentDocument; if (d) { d.open(); d.write(`<!doctype html><body style="margin:16px;background:#fff">${preview}</body>`); d.close(); } }, [preview]);

  return <Dialog title={sale ? `Policy summary email: ${start.first} ${start.last}` : `No-cost benefits email: ${start.first} ${start.last}`} onClose={busy ? () => {} : onClose} wide="x">
    <div className="fuemail">
      <div className="fuform rform">
        <div className="grid2">
          <label className="fld"><span>First name</span><input value={first} onChange={e => setFirst(e.target.value)} /></label>
          <label className="fld"><span>When you met</span><select value={when} onChange={e => setWhen(e.target.value as MetWhen)}>
            {(['today', ...(sale ? [] : ['this evening']), 'last night', 'yesterday'] as MetWhen[]).map(w => <option key={w}>{w}</option>)}</select></label>
        </div>
        <label className="fld"><span>To</span><input type="email" inputMode="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@email.com" /></label>
        <label className="fld"><span>Cc <em>optional, e.g. spouse</em></span><input type="email" value={cc} onChange={e => setCc(e.target.value)} /></label>

        {sale && <>
          <label className="fld"><span>Opening line <em>about them</em></span><textarea rows={2} value={opening} onChange={e => setOpening(e.target.value)} /></label>
          <div className="chips mini">{[['Single', 'You made a great decision for your financial future.'], ['Wants a family', 'You made a great decision for your financial future by adding an investment of your own, as well as for your future family.'],
            ['Married, kids', 'You made a great decision for your financial future and for your wife and kids.'], ['Both covered', "You both made a great decision for your family's financial future."]]
            .map(([l, t]) => <button type="button" key={l} className={opening === t ? 'on' : ''} onClick={() => setOpening(t)}>{l}</button>)}</div>
          <label className="fld"><span>Coverage</span></label>
          {coverage.map((c, i) => <input key={i} className="covline" value={c} placeholder={i === 0 ? '25k wl  →  $25,000 guaranteed whole life coverage' : '100k term  →  $100,000 of temporary death benefit'}
            onBlur={e => { const t = tidyCoverage(e.target.value); setCoverage(cs => { const n = [...cs]; n[i] = t; return n; }); }}
            onChange={e => setCoverage(cs => { const n = [...cs]; n[i] = e.target.value; return n; })} />)}
          <button type="button" className="linkish" onClick={() => setCoverage(cs => [...cs, ''])}>+ Another line</button>
          <div className="grid3">
            <label className="fld"><span>Monthly total</span><input inputMode="decimal" value={monthly} onChange={e => setMonthly(e.target.value)} onBlur={e => setMonthly(tidyMonthly(e.target.value))} placeholder="61.94" /></label>
            <label className="fld"><span>Draft day</span><input value={draftDay} onChange={e => setDraftDay(e.target.value)} onBlur={e => setDraftDay(tidyDay(e.target.value))} placeholder="12" /></label>
            <label className="fld"><span>First month <em>optional</em></span><input value={startMonth} onChange={e => setStartMonth(e.target.value)} onBlur={e => setStartMonth(tidyMonth(e.target.value))} placeholder="dec or December" /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={trial} onChange={e => setTrial(e.target.checked)} /> Trialed (pending underwriting)</label>
          <label className="chk"><input type="checkbox" checked={hasAdd} onChange={e => setHasAdd(e.target.checked)} /> Include their AD&amp;D benefit</label>
        </>}

        {hasAdd && <div className="fubox">
          <div className="grid2">
            <label className="fld"><span>AD&amp;D amount</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} onBlur={e => { const n = num(e.target.value); if (n) setAmount(n.toLocaleString('en-US')); }} placeholder="4k or 4,000" /></label>
            <label className="fld"><span>Union or group <em>optional</em></span><input value={group} onChange={e => setGroup(e.target.value)} placeholder={sale ? 'e.g. SEIU 205' : 'blank = "your union"'} /></label>
          </div>
          {num(amount) > 0 && <p className="hint">Pays {`$${num(amount).toLocaleString('en-US')}`} in full, half ({`$${(num(amount) / 2).toLocaleString('en-US')}`}) for one hand, foot or eye.</p>}
          <label className="fld"><span>Certificate</span></label>
          <div className="seg">
            {(sale ? [['blank', 'Standard blank'], ['attach', 'Their certificate'], ['later', 'Not ready yet']] : [['blank', 'Standard blank'], ['attach', 'Their certificate']])
              .map(([k, l]) => <button type="button" key={k} className={cert === k ? 'on' : ''} onClick={() => (sale ? setSaleCert(k as SaleCert) : setNoCert(k as NoSaleCert))}>{l}</button>)}
          </div>
          {needsCertFile && <label className="fld"><span>Their certificate (PDF)</span>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
          {tooBig && <p className="warnline">That PDF is over 2.8 MB. Save a smaller copy and attach that.</p>}
          {blankWarn && <p className="warnline">The standard blank certificate is printed for $2,000, and this client&rsquo;s amount is {`$${num(amount).toLocaleString('en-US')}`}. Attach their own certificate if you have it.</p>}
          {cert === 'attach' && <p className="hint">Check the name on the certificate matches {first || 'the client'}.</p>}
        </div>}

        <label className="chk"><input type="checkbox" checked={childKit} onChange={e => setChildKit(e.target.checked)} /> Child Safe Kit (they have kids)</label>
        {sale && <label className="chk"><input type="checkbox" checked={willKit} onChange={e => setWillKit(e.target.checked)} /> Will Kit</label>}
        <p className="hint">Attached: {built?.attachments.map(a => a.filename).join(', ') || 'nothing'}.</p>
        <p className="hint">Signed as {sig?.name ?? '…'} · <button type="button" className="linkish" onClick={() => setSigOpen(true)}>Edit my signature</button></p>
      </div>

      <div className="fuprev">
        <div className="eyebrow">Preview · {built?.subject}</div>
        <iframe ref={frame} title="Email preview" />
      </div>
    </div>
    {err && <div className="warnbox"><p>{err}</p>{reconnect && <button className="btn sm" onClick={() => void connectGoogleCalendar()}>Connect Google</button>}</div>}
    {sent && <p className="okline">{sent}</p>}
    <div className="bar">
      <span className="muted">{busy || (problems.length ? `Still needed: ${problems.join(', ')}` : !LIVE ? 'Sending works on the live Dispatch.' : '')}</span>
      <button className="btn" disabled={!!busy} onClick={onClose}>Not now</button>
      <button className="btn" disabled={!!busy || !!problems.length || !!tooBig || !LIVE} onClick={() => void send(true)}>Send me a test</button>
      <button className="btn primary" disabled={!!busy || !!problems.length || !!tooBig || !LIVE} onClick={() => void send(false)}>Send to {first || 'client'}</button>
    </div>
    {sigOpen && <SignatureDialog agent={agent} name={agentName} email={agentEmail} onClose={() => setSigOpen(false)} onSaved={setSig} />}
  </Dialog>;
}

// Small pieces shared by the screens.
'use client';
import { myTz, zoneOf } from '../../src/rules/myZone';
/** The agent's own time zone (set in the profile menu; Eastern unless changed). */
export const TZ = myTz();
export const TZ_ABBR = zoneOf(TZ).abbr, TZ_NAME = zoneOf(TZ).name;
export const ZONE_TZ: Record<string, string> = { ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver', PT: 'America/Los_Angeles' };

export function chipClass(why: string) {
  if (why.startsWith('DONE')) return 'Done';
  if (why.startsWith('Callback')) return 'Callback';
  if (why.startsWith('Follow-up')) return 'FollowUp';
  if (why.startsWith('No-show') || why.startsWith('Did they')) return 'NoShow';
  if (why.startsWith('New Number') || why.startsWith('New number')) return 'NewNumber';
  if (why.startsWith('PM')) return 'PM';
  if (why === 'Fresh') return 'Fresh';
  if (why === 'Confirm') return 'Confirm';
  return '';
}
export const localTime = (zone: string, now: number) => {
  const tz = ZONE_TZ[zone];
  return tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(now) : '';
};

export const Ico = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const IC = {
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  connect: 'M16 3h5v5M21 3l-7 7M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  pres: 'M3 3h18v12H3zM8 21l4-6 4 6',
  sold: 'M20 6 9 17l-5-5',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  noans: 'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8M22 2 2 22',
  vm: 'M6 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM18 15a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM6 15h12',
  cb: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2M17 2.5l2 2',
  ni: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  bad: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  appt: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  end: 'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8',
};
export const fmtSecs = (n: number) => `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`;

export const ZONE_NAME: Record<string, string> = { ET: 'Eastern', CT: 'Central', MT: 'Mountain', PT: 'Pacific', AKT: 'Alaska', HT: 'Hawaii' };
export const timeOnly = (t: number) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(t);

/** Hands the viewer a text file: the host's own save prompt when there is one (the hosted demo), else a normal download. */
export function saveText(filename: string, text: string, type = 'text/csv') {
  const host = (window as unknown as { claude?: { use: (n: string) => Promise<{ save: (f: { filename: string; data: string }) => Promise<unknown> } | null> } }).claude;
  if (host?.use) { host.use('downloads').then(dl => dl?.save({ filename, data: text })).catch(() => { /* the viewer said no */ }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A dialog box. Click outside or press Esc to close. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean | 'x' }) {
  return (
    <div className="modal-bg" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className={`modal ${wide === 'x' ? 'xwide' : wide ? 'wide' : ''}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A history line with its web links shown as short clickable words ("Call recording") instead of the long address. */
export function NoteText({ text }: { text: string }) {
  const rec = text.match(/^Call recording:\s*(https?:\/\/\S+)\s*$/);
  if (rec) return <a href={rec[1]} target="_blank" rel="noreferrer">Call recording</a>;
  const parts = text.split(/(https?:\/\/\S+)/);
  return <>{parts.map((p, i) => i % 2 ? <a key={i} href={p} target="_blank" rel="noreferrer">link</a> : p)}</>;
}

/** "Show 100 / 500 / 1,000 / All" for long tables. */
export function ShowCount({ value, total, onChange }: { value: number; total: number; onChange: (n: number) => void }) {
  return <label className="showcount">Show
    <select value={value >= total ? 'all' : String(value)} onChange={e => onChange(e.target.value === 'all' ? Number.MAX_SAFE_INTEGER : +e.target.value)}>
      {[100, 500, 1000].filter(n => n < total).map(n => <option key={n} value={n}>{n.toLocaleString('en-US')}</option>)}
      <option value="all">All {total.toLocaleString('en-US')}</option>
    </select></label>;
}

/** Call and Text buttons for a client, anywhere their details show (George, 2026-11-26). Text uses Quo when it's on,
 *  otherwise the computer's own texting app. */
export function Reach({ id, phone, first, onText }: { id: string; phone: string; first?: string; onText?: (id: string) => void }) {
  const num = phone.replace(/[^\d+]/g, '');
  if (!num) return <span className="hint">No number to call or text</span>;
  return <span className="reach">
    <a className="btn rcall" href={`tel:${num}`} title={`Call ${first ?? ''} at ${phone}`}>Call</a>
    {onText ? <button className="btn rtext" onClick={() => onText(id)} title="Text with Quo">Text</button>
      : <a className="btn rtext" href={`sms:${num}`} title={`Text ${first ?? ''} at ${phone}`}>Text</a>}
  </span>;
}

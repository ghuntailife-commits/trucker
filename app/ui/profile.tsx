// The profile menu (top right): who you are, Settings, Integrations, goal, day/night, shortcuts, export, sign out.
// And the Integrations page it opens: what each connected service does and whether it is connected yet.
'use client';
import { useEffect, useRef, useState } from 'react';
import type { Team } from '../../src/app-store/useTeam';
import type { AgentSetting, ViewerId } from '../../src/team/agents';
import { viewers } from '../../src/team/agents';
import { Panel } from './charts';
import { Dialog } from './shared';

const ROLE = { admin: 'Admin', agent: 'Agent', boss: 'Results only' } as const;

export interface MenuItem { key: string; label: string; sub?: string; onClick: () => void; hidden?: boolean; disabled?: boolean }

export function ProfileMenu({ t, me, theme, setTheme, items }: {
  t: Team; me?: AgentSetting; theme: 'light' | 'dark' | null; setTheme: (x: 'light' | 'dark') => void; items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); removeEventListener('keydown', esc); };
  }, [open]);
  const name = me?.name ?? 'Boss';
  const run = (f: () => void) => () => { setOpen(false); f(); };
  return (
    <div className="pmenu" ref={box}>
      <button className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label={`${name}: profile menu`} onClick={() => setOpen(o => !o)}>{name[0]}</button>
      {open && (
        <div className="pm" role="menu">
          <div className="pmhead">
            <span className="avatar big">{name[0]}</span>
            <div><b>{name}</b><small>{ROLE[t.role]}{me ? ` · ${me.team}` : ''}</small></div>
          </div>
          <label className="pmrow viewas2">
            <span>Viewing as <small>demo only</small></span>
            <select value={t.viewer} onChange={e => { t.setViewer(e.target.value as ViewerId); setOpen(false); }}>
              {viewers(t.team).map(v => <option key={v.id} value={v.id}>{v.name} · {ROLE[v.role]}</option>)}
            </select>
          </label>
          <div className="pmsep" />
          {items.filter(i => !i.hidden).map(i => (
            <button key={i.key} role="menuitem" className="pmitem" disabled={i.disabled} onClick={run(i.onClick)}>
              <span>{i.label}</span>{i.sub && <small>{i.sub}</small>}
            </button>
          ))}
          <button role="menuitemcheckbox" aria-checked={theme === 'dark'} className="pmitem" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <span>Night mode</span><i className={`tog ${theme === 'dark' ? 'on' : ''}`}><i /></i>
          </button>
          <div className="pmsep" />
          <button className="pmitem" disabled title="Sign-in comes with go-live"><span>Sign out</span><small>after go-live</small></button>
        </div>
      )}
    </div>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [['1–6', 'No answer, Voicemail, Callback, Not interested, Bad number, Appointment'], ['C or Enter', 'Call'],
    ['N', 'Write a note'], ['/', 'Search'], ['U or Ctrl+Z', 'Undo'], ['R', 'Re-sort Today'], ['S', 'Skip for today'], ['B', 'Switch to the backup number'], ['Esc', 'Close or stop auto-dial']];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <table className="rt keys2"><tbody>{keys.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
      <div className="bar"><button className="btn primary" onClick={onClose}>Done</button></div>
    </Dialog>
  );
}

interface Integration { key: string; name: string; what: string; who: string; needs: string; status: 'built' | 'ready' | 'later' }
const INTEGRATIONS: Integration[] = [
  { key: 'google', name: 'Google sign-in', status: 'ready', who: 'Everybody',
    what: 'Each person signs in with their Google account. Their role decides what they see: you see everyone, agents see their own contacts, the boss sees results only.',
    needs: 'Your Google Cloud project (free) at go-live.' },
  { key: 'calendar', name: 'Google Calendar', status: 'ready', who: 'Everybody',
    what: 'Every appointment goes on the agent’s calendar with the invite emailed to the contact. Moves and cancels sync both ways, so the calendar and Appointments always match.',
    needs: 'The same Google Cloud project, with Calendar turned on.' },
  { key: 'quo', name: 'Quo', status: 'built', who: 'George and Gracie',
    what: 'Calls go out through Quo. Reminder and confirmation texts go out from your Quo number with a preview first. Talk time and replies land on the contact automatically.',
    needs: 'Each agent’s Quo API key and number.' },
  { key: 'ai', name: 'Claude AI', status: 'built', who: 'Everybody',
    what: 'Writes the call brief for callbacks, follow-ups and no-shows, and the Monday coaching note. The demo uses the rules-based version; the AI version reads the notes like a person would.',
    needs: 'An Anthropic API key. About a cent or less per brief.' },
  { key: 'gmail', name: 'Gmail', status: 'later', who: 'Everybody',
    what: 'Sends the policy summary after a sale and the no-cost benefits email after a no-sale, from the agent’s own Gmail, with a preview first. Also delivers the Monday coaching note.',
    needs: 'The same Google Cloud project, with Gmail turned on.' },
  { key: 'muse', name: 'Number finding', status: 'later', who: 'Admin',
    what: 'Fills Needs Number from your number-finding sheet, staged for review before anything is saved, like today.',
    needs: 'Read access to the number-finding sheet.' },
];
const STATUS = { built: ['Built, connects at go-live', 'teal'], ready: ['Ready for go-live', 'blue'], later: ['Planned', 'grey'] } as const;

export function IntegrationsPage({ t }: { t: Team }) {
  const quoOn = t.team.agents.filter(a => a.quo).map(a => a.name);
  return (
    <div className="respage setpage">
      <section className="hero"><div className="title"><div className="eyebrow">Connected services</div><h1>Integrations</h1></div></section>
      <div className="rgrid">
        {INTEGRATIONS.map(i => (
          <Panel key={i.key} span={2} title={i.name} meta={<span className={`spill ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span>}
            foot={<>Needs: {i.needs}</>}>
            <p className="intwhat">{i.what}</p>
            <p className="hint">For: {i.key === 'quo' ? (quoOn.join(' and ') || 'nobody yet') : i.who}{i.key === 'quo' && t.role === 'admin' ? ' · change it in Settings' : ''}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

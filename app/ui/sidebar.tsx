'use client';
// The Dispatch sidebar (George, 2026-11-26): the logo goes Home; each page has an icon, and the bar folds down to
// icons only. On a phone it slides in from the menu button.
import { useEffect, useState } from 'react';
import type { Page } from '../../src/team/agents';
import { BRAND } from './brandAssets';

export const NAV_ICON: Partial<Record<Page, string>> = {
  home: 'M3 10.5 12 3l9 7.5M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9',
  today: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  appts: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h2M14 14h2M8 18h2',
  contacts: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 7h2M3 12h2M3 17h2M12.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 17.5c.6-2 2.2-3 4-3s3.4 1 4 3',
  needs: 'M9 3 7 21M17 3l-2 18M4 8.5h17M3 15.5h17',
  results: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4.5-5.8',
};
const NavIco = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** The mark, in day or night colours to match the theme. */
export function Mark({ size = 30 }: { size?: number }) {
  return <span className="bmark" style={{ width: size, height: size }}>
    <img className="day" src={BRAND.markDay} alt="" width={size} height={size} /><img className="night" src={BRAND.markNight} alt="" width={size} height={size} /></span>;
}
export function Wordmark({ height = 22 }: { height?: number }) {
  return <span className="bword" style={{ height }}>
    <img className="day" src={BRAND.wordDay} alt="Dispatch" height={height} /><img className="night" src={BRAND.wordNight} alt="Dispatch" height={height} /></span>;
}

const KEY = 'dispatch-sidebar';
export function useSidebar() {
  const [wide, setWide] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(KEY) === 'narrow') setWide(false); } catch { /* */ } }, []);
  const toggle = () => setWide(w => { try { localStorage.setItem(KEY, w ? 'narrow' : 'wide'); } catch { /* */ } return !w; });
  return { wide, toggle, mobileOpen, setMobileOpen };
}

export interface NavItem { page: Page; label: string; badge?: number | string; tone?: 'red' | 'amber' }

export function Sidebar({ items, page, go, sb, who }: {
  items: NavItem[]; page: Page; go: (p: Page) => void; sb: ReturnType<typeof useSidebar>; who: string;
}) {
  const pick = (p: Page) => { go(p); sb.setMobileOpen(false); };
  return <>
    {sb.mobileOpen && <div className="side-bg" onClick={() => sb.setMobileOpen(false)} />}
    <aside className={`side ${sb.wide ? 'wide' : 'narrow'} ${sb.mobileOpen ? 'mopen' : ''}`} aria-label="Main menu">
      <button className="sbrand" onClick={() => pick('home')} title="Home" aria-label="Dispatch: go to Home">
        <Mark size={30} />{(sb.wide || sb.mobileOpen) && <Wordmark height={24} />}
      </button>
      {(sb.wide || sb.mobileOpen) && <div className="swho">{who}</div>}
      <nav className="snav">
        {items.map(it => (
          <button key={it.page} className={page === it.page ? 'on' : ''} aria-current={page === it.page ? 'page' : undefined}
            onClick={() => pick(it.page)} title={sb.wide ? undefined : it.label}>
            <NavIco d={NAV_ICON[it.page] ?? NAV_ICON.home!} />
            <span className="slabel">{it.label}</span>
            {it.badge != null && it.badge !== 0 && <em className={`sbadge ${it.tone ?? ''}`}>{it.badge}</em>}
          </button>
        ))}
      </nav>
      <button className="scollapse" onClick={sb.toggle} aria-label={sb.wide ? 'Fold the menu to icons' : 'Open the menu'} title={sb.wide ? 'Fold to icons' : 'Open the menu'}>
        <NavIco d={sb.wide ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /><span className="slabel">Fold to icons</span>
      </button>
    </aside>
  </>;
}

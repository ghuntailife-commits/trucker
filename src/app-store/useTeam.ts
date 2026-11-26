'use client';
// The team settings (agents, goals, Quo, coaching, rules) and who is signed in. In the demo there is no sign-in:
// a "Viewing as" switch shows each person's screen. With the database connected, the role comes from Google sign-in.
import { useCallback, useEffect, useState } from 'react';
import { defaultTeam, type TeamSettings, type ViewerId, type AgentId, type AgentSetting, type RuleSettings, configFor } from '../team/agents';
import { loadState, saveState } from './store';
import { agentSeed, storageKey } from './agentSeeds';
import type { Seed } from './agentSeeds';

const KEY = 'trucker-team-v1', VIEW = 'trucker-viewer';

export function useTeam() {
  const [team, setTeam] = useState<TeamSettings | null>(null);
  const [viewer, setViewerState] = useState<ViewerId>('george');
  useEffect(() => {
    let live = true;
    loadState<TeamSettings>(KEY).then(t => { if (live) setTeam(t && t.v === 1 ? { ...defaultTeam(), ...t } : defaultTeam()); });
    try { const v = localStorage.getItem(VIEW); if (v === 'george' || v === 'austin' || v === 'gracie' || v === 'boss') setViewerState(v); } catch { /* */ }
    return () => { live = false; };
  }, []);
  useEffect(() => { if (team) saveState(KEY, team); }, [team]);

  const setViewer = useCallback((v: ViewerId) => { setViewerState(v); try { localStorage.setItem(VIEW, v); } catch { /* */ } }, []);
  const setAgent = useCallback((id: AgentId, change: Partial<AgentSetting>) =>
    setTeam(t => (t ? { ...t, agents: t.agents.map(a => (a.id === id ? { ...a, ...change } : a)) } : t)), []);
  const setRules = useCallback((rules: RuleSettings) => setTeam(t => (t ? { ...t, rules } : t)), []);
  const setTeamField = useCallback((change: Partial<Pick<TeamSettings, 'coachingHour' | 'coachingCopyTo'>>) => setTeam(t => (t ? { ...t, ...change } : t)), []);
  const reset = useCallback(() => setTeam(defaultTeam()), []);

  const me = team?.agents.find(a => a.id === viewer);
  const role = viewer === 'boss' ? 'boss' : me?.role ?? 'agent';
  return { ready: !!team, team: team ?? defaultTeam(), viewer, role, me, setViewer, setAgent, setRules, setTeamField, reset,
    cfg: configFor(team?.rules) } as const;
}
export type Team = ReturnType<typeof useTeam>;

/** Each agent's saved lists for the Team page (log, sales, no-sales, contacts), straight from this browser. */
export async function loadAgentData(id: AgentId, now: number, tz: string): Promise<Seed> {
  const got = await loadState<Seed & { v?: number }>(storageKey(id));
  if (got && got.contacts) return { contacts: got.contacts, log: got.log ?? [], sales: got.sales ?? [], noSales: got.noSales ?? [] };
  return agentSeed(id, now, tz);
}

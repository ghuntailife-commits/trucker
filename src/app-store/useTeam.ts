'use client';
// The team settings (agents, goals, Quo, coaching, rules) and who is signed in. In the demo there is no sign-in:
// a "Viewing as" switch shows each person's screen. With the database connected, the role comes from Google sign-in.
import { useCallback, useEffect, useState } from 'react';
import { defaultTeam, withRoster, type TeamSettings, type ViewerId, type AgentId, type AgentSetting, type RuleSettings, configFor } from '../team/agents';
import { loadState, saveState } from './store';
import { LIVE, db, type Person } from '../live/supabase';
import { agentSeed, storageKey } from './agentSeeds';
import type { Seed } from './agentSeeds';

const KEY = 'trucker-team-v1', VIEW = 'trucker-viewer';

/** `person`: who is signed in (live). The demo has no sign-in and remembers the "Viewing as" choice instead. */
export function useTeam(person?: Person) {
  const [team, setTeam] = useState<TeamSettings | null>(null);
  const [viewer, setViewerState] = useState<ViewerId>(person?.agent_id ?? 'george');
  useEffect(() => {
    let live = true;
    loadState<TeamSettings>(KEY).then(t => {
      if (!live) return;
      let team = t && t.v === 1 ? withRoster({ ...defaultTeam(), ...t }) : defaultTeam();
      setTeam(team);
      // live: each agent keeps their own licensed states (the team settings are the admin's to change)
      if (LIVE) db().from('kv').select('key,value').like('key', 'dispatch-lic-%').then(({ data }) => {
        if (!live || !data?.length) return;
        const lic = new Map(data.map((r: { key: string; value: unknown }) => [r.key.slice('dispatch-lic-'.length), r.value as string[]]));
        team = { ...team, agents: team.agents.map(a => (Array.isArray(lic.get(a.id)) ? { ...a, states: lic.get(a.id)! } : a)) };
        setTeam(team);
      });
      if (!person) try { const v = localStorage.getItem(VIEW); if (v && (v === 'boss' || team.agents.some(a => a.id === v))) setViewerState(v); } catch { /* */ }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (team) saveState(KEY, team); }, [team]);

  // live: only the admin can look at someone else's screen
  const setViewer = useCallback((v: ViewerId) => { if (person && person.role !== 'admin') return; setViewerState(v); if (!person) try { localStorage.setItem(VIEW, v); } catch { /* */ } }, [person]);
  const setAgent = useCallback((id: AgentId, change: Partial<AgentSetting>) => {
    if (LIVE && change.states) saveState(`dispatch-lic-${id}`, change.states);
    setTeam(t => (t ? { ...t, agents: t.agents.map(a => (a.id === id ? { ...a, ...change } : a)) } : t));
  }, []);
  const setRules = useCallback((rules: RuleSettings) => setTeam(t => (t ? { ...t, rules } : t)), []);
  const setTeamField = useCallback((change: Partial<Pick<TeamSettings, 'coachingHour' | 'coachingCopyTo' | 'twilioNumbers' | 'twilioRecord' | 'twilioNotice' | 'twilioDailyCap'>>) => setTeam(t => (t ? { ...t, ...change } : t)), []);
  const reset = useCallback(() => setTeam(defaultTeam()), []);

  const me = team?.agents.find(a => a.id === viewer);
  const role = viewer === 'boss' ? 'boss' : me?.role ?? 'agent';
  return { ready: !!team, team: team ?? defaultTeam(), viewer, role, me, person, setViewer, setAgent, setRules, setTeamField, reset,
    cfg: configFor(team?.rules) } as const;
}
export type Team = ReturnType<typeof useTeam>;

/** Each agent's saved lists for the Team page (log, sales, no-sales, contacts), straight from this browser. */
export async function loadAgentData(id: AgentId, now: number, tz: string): Promise<Seed> {
  const got = await loadState<Seed & { v?: number }>(storageKey(id));
  if (got && got.contacts) return { contacts: got.contacts, log: got.log ?? [], sales: got.sales ?? [], noSales: got.noSales ?? [] };
  return agentSeed(id, now, tz);
}

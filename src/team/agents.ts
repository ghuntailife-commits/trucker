import { ROSTER, type RosterRow } from './roster';
import { parseState } from '../contacts/states';
// The team: who signs in, what each role can open, and the settings the admin keeps (was the Rules tab plus
// a few cells per agent). In the database these are the agents and agent_settings tables (migration 0003).
import { DEFAULT_CONFIG, type Config } from '../rules/config';

export type Role = 'admin' | 'lead' | 'agent' | 'boss';
/** Agent IDs are first names in lowercase (the roster in roster.ts); the database uses its own UUIDs. */
export type AgentId = string;
export type ViewerId = AgentId | 'boss';
export type Page = 'home' | 'today' | 'appts' | 'contacts' | 'needs' | 'results' | 'coach' | 'team' | 'library' | 'settings' | 'integrations' | 'status';
/** Pages reached from the profile menu, not the top bar. */
export const MENU_PAGES: Page[] = ['settings', 'integrations', 'status'];

export interface AgentSetting {
  id: AgentId;
  name: string;
  team: string;
  role: Role;
  /** Who this agent is under: they show on that person's Team page (George, 2026-11-26). */
  leadId?: AgentId | null;
  states: string[];
  /** Monthly ALP goal. */
  goal: number;
  /** Texts and call logging through Quo. On for George and Gracie (George, 2026-11-26). */
  quo: boolean;
  /** The agent's Quo number, the "from" on texts. Filled in at go-live. */
  quoNumber: string;
  /** Monday coaching note, for everybody (George, 2026-11-26). */
  coaching: boolean;
  active: boolean;
  /** Calls through Dispatch itself (Twilio), instead of the Quo app (George, 2026-11-27). Off until turned on. */
  twilio?: boolean;
  /** Texts through Dispatch's own local numbers (Twilio) instead of Quo; replies come into Dispatch (George, 2026-11-27). Off until turned on. */
  twilioText?: boolean;
}

/** The rules an admin can change from Settings. Everything else stays as approved in config.ts. */
export type RuleKey = 'retryDays' | 'restDays' | 'backupDials' | 'callbackTries' | 'noShowTries' | 'listSize'
  | 'freshShareByBlock' | 'pmStartHour' | 'autoPmRetry' | 'confirmMorningOf' | 'apptSoonHours';
export type RuleSettings = Pick<Config, RuleKey>;

export interface TeamSettings {
  v: 1;
  agents: AgentSetting[];
  rules: RuleSettings;
  /** When the Monday coaching note goes out, Eastern. */
  coachingHour: number;
  /** Who gets a copy of every coaching note (the admin). */
  coachingCopyTo: AgentId | null;
  /** The team's Twilio numbers, shared: each call goes out from the one local to the contact. */
  twilioNumbers?: string;
  /** Record Dispatch calls (default on), and play "This call may be recorded" to the contact first (default on). */
  twilioRecord?: boolean;
  twilioNotice?: boolean;
  /** calls one number makes a day before it rests and the next-best number takes over (spam watch; default 100) */
  twilioDailyCap?: number;
  /** transcribe recorded Dispatch calls for notes and coaching (Twilio Voice Intelligence; default on) */
  twilioTranscribe?: boolean;
}

export const RULE_KEYS: RuleKey[] = ['retryDays', 'restDays', 'backupDials', 'callbackTries', 'noShowTries', 'listSize',
  'freshShareByBlock', 'pmStartHour', 'autoPmRetry', 'confirmMorningOf', 'apptSoonHours'];

export function defaultRules(): RuleSettings {
  const out = {} as Record<RuleKey, unknown>;
  for (const k of RULE_KEYS) out[k] = structuredClone(DEFAULT_CONFIG[k]);
  return out as RuleSettings;
}

export function defaultTeam(): TeamSettings {
  return {
    v: 1,
    agents: ROSTER.map(rosterAgent),
    rules: defaultRules(),
    coachingHour: 8,
    coachingCopyTo: 'george',
  };
}

const GOALS: Record<string, number> = { george: 20000, austin: 12000, gracie: 15000 };
/** A roster row as the team settings start out. Quo on for George and Gracie only; coaching for everybody. */
export function rosterAgent(r: RosterRow): AgentSetting {
  return { id: r.id, name: r.name, team: r.team, role: r.role, leadId: r.lead, goal: GOALS[r.id] ?? 10000, quo: r.id === 'george' || r.id === 'gracie',
    quoNumber: '', coaching: true, active: r.id !== 'cameron',
    states: r.states.split(',').map(x => parseState(x.trim())?.name).filter((x): x is string => !!x) };
}
/** Adds anyone on the roster who is missing from saved settings, and fills in who they are under. */
export function withRoster(t: TeamSettings): TeamSettings {
  const have = new Map(t.agents.map(a => [a.id, a]));
  const agents = ROSTER.map(r => { const base = rosterAgent(r), saved = have.get(r.id);
    return saved ? { ...base, ...saved, leadId: saved.leadId === undefined ? base.leadId : saved.leadId, role: saved.role === 'agent' && base.role === 'lead' ? 'lead' as Role : saved.role } : base; });
  return { ...t, agents: [...agents, ...t.agents.filter(a => !ROSTER.some(r => r.id === a.id))] };
}

/** The rules in force: the approved defaults with the admin's changes on top. */
export function configFor(rules: Partial<RuleSettings> | undefined): Config {
  return { ...DEFAULT_CONFIG, ...(rules ?? {}) };
}

/** What each role can open. The boss sees results and totals only, never contact details. */
export function pagesFor(role: Role): Page[] {
  if (role === 'admin') return ['home', 'today', 'appts', 'contacts', 'needs', 'results', 'coach', 'team', 'library', 'settings', 'integrations', 'status'];
  if (role === 'lead') return ['home', 'today', 'appts', 'contacts', 'needs', 'results', 'coach', 'team', 'integrations'];
  if (role === 'agent') return ['home', 'today', 'appts', 'contacts', 'needs', 'results', 'coach', 'integrations'];
  return ['team'];
}
export const canSeeContacts = (role: Role) => role !== 'boss';
/** Whose numbers a viewer can see on the Team page. Agents see only their own (no Team page); a team lead sees
 *  themselves and the agents under them; the admin and the boss see everyone. */
export function visibleAgents(viewer: { id: ViewerId; role: Role }, team: TeamSettings): AgentSetting[] {
  if (viewer.role === 'agent') return team.agents.filter(a => a.id === viewer.id);
  if (viewer.role === 'lead') return team.agents.filter(a => a.active && (a.id === viewer.id || a.leadId === viewer.id));
  return team.agents.filter(a => a.active);
}

export interface Viewer { id: ViewerId; name: string; role: Role }
export function viewers(team: TeamSettings): Viewer[] {
  return [...team.agents.filter(a => a.active).map(a => ({ id: a.id, name: a.name, role: a.role })), { id: 'boss' as const, name: 'Boss', role: 'boss' as const }];
}

/** Checks the admin's rule changes before they are saved. Returns what is wrong, in plain words. */
export function checkRules(r: RuleSettings): string[] {
  const bad: string[] = [];
  const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (r.retryDays.length !== 8 || !r.retryDays.every(n => whole(n, 0, 60))) bad.push('Days between tries need 8 whole numbers from 0 to 60.');
  if (!whole(r.restDays, 1, 90)) bad.push('Rest after both numbers needs a whole number of days from 1 to 90.');
  if (!whole(r.backupDials, 1, 20)) bad.push('Dials before the backup number needs a number from 1 to 20.');
  if (!whole(r.callbackTries, 1, 10)) bad.push('Callback tries needs a number from 1 to 10.');
  if (!whole(r.noShowTries, 1, 10)) bad.push('No-show tries needs a number from 1 to 10.');
  if (!whole(r.listSize, 20, 1000)) bad.push('List size needs a number from 20 to 1,000.');
  if (r.freshShareByBlock && !r.freshShareByBlock.every(n => n >= 0 && n <= 1)) bad.push('Fresh share needs percentages from 0 to 100.');
  if (!whole(r.pmStartHour, 11, 20)) bad.push('Afternoon starts needs an hour from 11 AM to 8 PM.');
  if (!(r.apptSoonHours >= 12 && r.apptSoonHours <= 24 * 14)) bad.push('Far-out warning needs 12 hours to 14 days.');
  return bad;
}

/** Plain-words list of what an admin changed against the approved defaults (shown in the Save preview). */
export function ruleChanges(r: RuleSettings, base: RuleSettings = defaultRules()): string[] {
  const d = base, out: string[] = [];
  for (const k of RULE_KEYS) {
    const a = JSON.stringify(d[k]), b = JSON.stringify(r[k]);
    if (a !== b) out.push(`${RULE_LABEL[k]}: ${show(k, d[k])} → ${show(k, r[k])}`);
  }
  return out;
}
export const RULE_LABEL: Record<RuleKey, string> = {
  retryDays: 'Days between tries (by dials so far)', restDays: 'Rest after both numbers are tried', backupDials: 'Dials before the backup number',
  callbackTries: 'Callback tries before it goes back to the list', noShowTries: 'No-show tries', listSize: "Today's list size",
  freshShareByBlock: 'Fresh contacts by time of day', pmStartHour: 'Afternoon starts at', autoPmRetry: 'Morning no-answers come back after the afternoon starts',
  confirmMorningOf: 'Second confirm on the morning of', apptSoonHours: 'Warn when an appointment is booked further out than',
};
export function show(k: RuleKey, v: unknown): string {
  if (k === 'freshShareByBlock') return v ? (v as number[]).map(n => Math.round(n * 100) + '%').join(' / ') : 'off';
  if (k === 'pmStartHour') { const h = v as number; return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; }
  if (k === 'apptSoonHours') return `${v} hours`;
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Plain-words list of agent changes (goal, Quo, coaching...) for the Save preview. */
export function agentChanges(before: AgentSetting[], after: AgentSetting[]): string[] {
  const out: string[] = [];
  for (const a of after) {
    const b = before.find(x => x.id === a.id);
    if (!b) { out.push(`${a.name}: added`); continue; }
    if ((a.leadId ?? null) !== (b.leadId ?? null)) out.push(`${a.name}: now under ${after.find(x => x.id === a.leadId)?.name ?? 'nobody'}`);
    if (a.role !== b.role) out.push(`${a.name}: role ${b.role} to ${a.role}`);
    if (a.goal !== b.goal) out.push(`${a.name}: monthly goal $${b.goal.toLocaleString('en-US')} → $${a.goal.toLocaleString('en-US')}`);
    if (a.quo !== b.quo) out.push(`${a.name}: Quo ${a.quo ? 'on' : 'off'}`);
    if (a.quoNumber !== b.quoNumber) out.push(`${a.name}: Quo number ${a.quoNumber || '(none)'}`);
    if (!!a.twilio !== !!b.twilio) out.push(`${a.name}: Dispatch calling ${a.twilio ? 'on' : 'off'}`);
    if (!!a.twilioText !== !!b.twilioText) out.push(`${a.name}: Dispatch texting ${a.twilioText ? 'on' : 'off'}`);
    if (a.coaching !== b.coaching) out.push(`${a.name}: Monday coaching note ${a.coaching ? 'on' : 'off'}`);
    if (a.states.join() !== b.states.join()) out.push(`${a.name}: states ${a.states.join(', ') || '(none)'}`);
    if (a.active !== b.active) out.push(`${a.name}: ${a.active ? 'active' : 'paused'}`);
  }
  return out;
}

/** An agent can have several Quo numbers (e.g. one per state), typed comma-separated. The first is the one texts go from. */
export const quoNumbers = (v: string | undefined): string[] => (v ?? '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

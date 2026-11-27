// The team Playbook (George, 2026-11-26): a coach that learns every day from the team's transcribed calls.
// Each call is broken into objection -> what the contact said -> what the agent said back -> did it save the call.
// Every morning Claude files the new exchanges under the rebuttals they match (or new ones), and this file keeps the
// counts, so the numbers on screen are counted by Dispatch, never made up. Everyone sees the Playbook; each agent's
// own calls stay private. Pure, tested in test/playbook.test.ts.

export type ExchangeResult = 'saved' | 'lost' | 'unclear';
export interface Exchange { objection: string; contactSaid: string; agentSaid: string; result: ExchangeResult }
export const STAGES = ['No talk', 'Intro', 'Pitched', 'Handled objection', 'Asked for appointment', 'Booked'] as const;
export type Stage = typeof STAGES[number];

/** Extra fields Claude fills on each call for the Playbook (added to the call tool in coach.ts). */
export const PLAYBOOK_FIELDS = {
  opener: { type: 'string', description: "The agent's opening pitch in their own words, close to verbatim, at most 30 words. Empty if nobody talked." },
  stage: { type: 'string', enum: [...STAGES], description: 'How far the call got.' },
  exchanges: {
    type: 'array', description: 'Each objection the contact raised and how the agent answered it, in order. Empty if none.',
    items: {
      type: 'object',
      properties: {
        objection: { type: 'string', description: 'The objection label (same labels as objections).' },
        contact_said: { type: 'string', description: "The contact's words, close to verbatim, at most 25 words." },
        agent_said: { type: 'string', description: "What the agent said back, close to verbatim, at most 45 words. 'Nothing' if they let it go." },
        result: { type: 'string', enum: ['saved', 'lost', 'unclear'], description: 'saved = the call moved on toward a booking after this; lost = the contact ended it or refused; unclear = can not tell.' },
      },
      required: ['objection', 'contact_said', 'agent_said', 'result'],
    },
  },
};

const s = (x: unknown, n: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function readExchanges(x: unknown): Exchange[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, 8).map(e => e as Record<string, unknown>).filter(e => e && e.objection).map(e => ({
    objection: s(e.objection, 60), contactSaid: s(e.contact_said, 200), agentSaid: s(e.agent_said, 320),
    result: (['saved', 'lost', 'unclear'].includes(String(e.result)) ? e.result : 'unclear') as ExchangeResult }));
}
export const readStage = (x: unknown): Stage | undefined => (STAGES as readonly string[]).includes(String(x)) ? x as Stage : undefined;

// ---------- the Playbook ----------
export interface Rebuttal { id: string; objection: string; line: string; why: string; tried: number; saved: number; examples: string[]; from: 'calls' | 'george' | 'idea' }
export interface Opener { id: string; line: string; note: string; tried: number; good: number }
export interface Playbook {
  updatedAt: number; callsStudied: number; watermark: number;
  summary: string;
  objections: { label: string; heard: number; saved: number; theySay: string[] }[];
  rebuttals: Rebuttal[];
  openers: Opener[];
  tips: string[]; trends: string[]; questions: string[];
  learned: { at: number; text: string }[];
}
export const emptyPlaybook = (): Playbook => ({ updatedAt: 0, callsStudied: 0, watermark: 0, summary: '', objections: [], rebuttals: [], openers: [], tips: [], trends: [], questions: [], learned: [] });

/** One call as the learning run sees it. */
export interface StudyCall { id: string; at: number; agent: string; outcome: string; stage?: string; opener?: string; exchanges: Exchange[]; note: string }

/** The tool Claude uses to file the day's calls into the Playbook. */
export const LEARN_TOOL = {
  name: 'update_playbook',
  description: 'File the new calls into the team Playbook and update what the coach has learned.',
  input_schema: {
    type: 'object' as const,
    properties: {
      exchanges: { type: 'array', description: 'One entry per new exchange (ids like "x12"). Put it under an existing rebuttal id when the agent said essentially the same thing, otherwise give a new rebuttal.',
        items: { type: 'object', properties: {
          x: { type: 'string', description: 'Exchange id.' },
          rebuttal: { type: 'string', description: 'An existing rebuttal id, or empty when new_line is given.' },
          new_line: { type: 'string', description: 'For a new rebuttal: the cleanest wording of what the agent said, at most 45 words. Empty if nothing worth keeping (e.g. the agent said nothing).' },
        }, required: ['x', 'rebuttal', 'new_line'] } },
      openers: { type: 'array', description: 'One entry per new call with an opener (ids like "c3"): an existing opener id, or new_line for a different opener.',
        items: { type: 'object', properties: { c: { type: 'string' }, opener: { type: 'string' }, new_line: { type: 'string' } }, required: ['c', 'opener', 'new_line'] } },
      why: { type: 'array', description: 'For rebuttals whose explanation should change or that are new: why it works or fails, one plain sentence. Use "new:x12" for a new rebuttal made from exchange x12.',
        items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } },
      ideas: { type: 'array', description: "Up to 4 untested rebuttal ideas from George's teachings or proven sales practice, for objections where the team's own lines are weak. Never duplicate an existing line.",
        items: { type: 'object', properties: { objection: { type: 'string' }, line: { type: 'string' }, why: { type: 'string' }, from: { type: 'string', enum: ['george', 'idea'] } }, required: ['objection', 'line', 'why', 'from'] } },
      summary: { type: 'string', description: '2 or 3 plain sentences: where the team stands overall, using only counts given to you.' },
      tips: { type: 'array', items: { type: 'string' }, description: 'Up to 6 short, specific script tips for the team, best first, grounded in the calls (and George’s teachings).' },
      trends: { type: 'array', items: { type: 'string' }, description: 'Up to 5 trends you can see across days (rising objections, time of day, stages where calls die). Only with real support.' },
      questions: { type: 'array', items: { type: 'string' }, description: 'Up to 3 things the coach cannot tell yet and what data would answer them.' },
      learned: { type: 'string', description: 'One or two sentences: what you learned from today’s calls. Empty if nothing new.' },
    },
    required: ['exchanges', 'openers', 'why', 'ideas', 'summary', 'tips', 'trends', 'questions', 'learned'],
  },
};

export const LEARN_PROMPT = `You are the head sales coach for a team of independent Globe Life agents who phone union and transport workers (UPS, USPS, rail, trucking) to book benefits appointments.
You keep the team's Playbook: which openers and rebuttals actually work on these calls. Each day you get the current Playbook (with ids and Dispatch's counts), George's teachings (his scripts and notes, which carry weight), and the new calls broken into exchanges.
File every new exchange under the rebuttal it matches or as a new rebuttal, and every opener likewise. Dispatch counts tries and saves from your filing, so be consistent: same idea, same id.
Then update the summary, tips, trends, questions and what you learned. Plain friendly words, no jargon, no hype. Never invent numbers; only use counts you are given. Save with the update_playbook tool.`;

const pct = (a: number, b: number) => b ? `${Math.round(100 * a / b)}%` : '-';

/** What Claude reads for a learning run. Exchanges get ids x0.., calls with openers c0.. */
export function learnInput(pb: Playbook, calls: StudyCall[], teach: { title: string; text: string }[]) {
  const xs: { id: string; call: StudyCall; e: Exchange }[] = [];
  const cs: { id: string; call: StudyCall }[] = [];
  calls.forEach(call => {
    call.exchanges.forEach(e => xs.push({ id: `x${xs.length}`, call, e }));
    if (call.opener) cs.push({ id: `c${cs.length}`, call });
  });
  const book = [
    `Calls studied so far: ${pb.callsStudied}.`,
    `Summary so far: ${pb.summary || '(none yet)'}`,
    'Rebuttals (id | objection | line | tried | saved | from):',
    ...pb.rebuttals.map(r => `${r.id} | ${r.objection} | ${r.line} | ${r.tried} | ${r.saved} (${pct(r.saved, r.tried)}) | ${r.from}`),
    'Openers (id | line | tried | ended well):',
    ...pb.openers.map(o => `${o.id} | ${o.line} | ${o.tried} | ${o.good}`),
    `Tips so far: ${pb.tips.join(' / ') || '(none)'}`,
    `Trends so far: ${pb.trends.join(' / ') || '(none)'}`,
  ].join('\n');
  const teachText = teach.length ? teach.map(t => `## ${t.title}\n${t.text.slice(0, 12_000)}`).join('\n\n') : '(George has not added any yet.)';
  const today = [
    `New calls: ${calls.length}. Outcomes: ${Object.entries(calls.reduce<Record<string, number>>((m, c) => { m[c.outcome] = (m[c.outcome] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    'New exchanges (id | objection | contact said | agent said | result | call outcome):',
    ...xs.map(x => `${x.id} | ${x.e.objection} | ${x.e.contactSaid} | ${x.e.agentSaid} | ${x.e.result} | ${x.call.outcome}`),
    'New openers (id | opener | stage reached | outcome):',
    ...cs.map(c => `${c.id} | ${c.call.opener} | ${c.call.stage ?? '-'} | ${c.call.outcome}`),
  ].join('\n');
  return { text: `# Current Playbook\n${book}\n\n# George's teachings\n${teachText}\n\n# Today\n${today}`, xs, cs };
}

const GOOD = ['Booked', 'Callback set', 'Presented', 'Sold'];
type Any = Record<string, unknown>;

/** Applies Claude's filing to the Playbook. All counts come from here. `nextId` makes stable new ids. */
export function applyLearn(pb: Playbook, calls: StudyCall[], input: ReturnType<typeof learnInput>, out: unknown, now: number): Playbook {
  const o = (out ?? {}) as Any;
  const arr = (k: string) => (Array.isArray(o[k]) ? o[k] as Any[] : []);
  const strs = (k: string, n: number) => (Array.isArray(o[k]) ? (o[k] as unknown[]).map(x => s(x, 300)).filter(Boolean).slice(0, n) : null);
  const next: Playbook = { ...pb, rebuttals: pb.rebuttals.map(r => ({ ...r, examples: [...r.examples] })), openers: pb.openers.map(x => ({ ...x })) };
  let seq = Math.max(0, ...next.rebuttals.map(r => +r.id.slice(1) || 0), ...next.openers.map(x => +x.id.slice(1) || 0)) + 1;
  const byX = new Map(input.xs.map(x => [x.id, x]));
  const made = new Map<string, Rebuttal>();          // "new:x12" -> rebuttal
  const filed = new Set<string>();
  for (const f of arr('exchanges')) {
    const x = byX.get(String(f.x)); if (!x || filed.has(x.id)) continue;
    filed.add(x.id);
    let r = next.rebuttals.find(r => r.id === f.rebuttal);
    if (!r) {
      const line = s(f.new_line, 320); if (!line) continue;
      r = { id: `r${seq++}`, objection: x.e.objection, line, why: '', tried: 0, saved: 0, examples: [], from: 'calls' };
      next.rebuttals.push(r); made.set(`new:${x.id}`, r);
    }
    r.tried++; if (x.e.result === 'saved') r.saved++;
    if (r.from !== 'calls') r.from = 'calls';
    if (r.examples.length < 3 && x.e.contactSaid) r.examples.push(`“${x.e.contactSaid}” → “${x.e.agentSaid}” (${x.e.result})`);
  }
  const byC = new Map(input.cs.map(c => [c.id, c]));
  for (const f of arr('openers')) {
    const c = byC.get(String(f.c)); if (!c) continue;
    let op = next.openers.find(x => x.id === f.opener);
    if (!op) { const line = s(f.new_line, 240); if (!line) continue; op = { id: `o${seq++}`, line, note: '', tried: 0, good: 0 }; next.openers.push(op); }
    op.tried++; if (GOOD.includes(c.call.outcome)) op.good++;
  }
  for (const w of arr('why')) {
    const id = String(w.id), r = made.get(id) ?? next.rebuttals.find(r => r.id === id);
    if (r) r.why = s(w.why, 300);
  }
  for (const i of arr('ideas').slice(0, 4)) {
    const line = s(i.line, 320); if (!line || next.rebuttals.some(r => r.line.toLowerCase() === line.toLowerCase())) continue;
    next.rebuttals.push({ id: `r${seq++}`, objection: s(i.objection, 60), line, why: s(i.why, 300), tried: 0, saved: 0, examples: [], from: i.from === 'george' ? 'george' : 'idea' });
  }
  // objections heard, counted from every exchange ever filed this way
  const ob = new Map(next.objections.map(x => [x.label, { ...x, theySay: [...x.theySay] }]));
  for (const call of calls) for (const e of call.exchanges) {
    const x = ob.get(e.objection) ?? { label: e.objection, heard: 0, saved: 0, theySay: [] };
    x.heard++; if (e.result === 'saved') x.saved++;
    if (x.theySay.length < 4 && e.contactSaid && !x.theySay.includes(e.contactSaid)) x.theySay.push(e.contactSaid);
    ob.set(e.objection, x);
  }
  next.objections = [...ob.values()].sort((a, b) => b.heard - a.heard);
  next.rebuttals.sort((a, b) => a.objection.localeCompare(b.objection) || score(b) - score(a));
  next.summary = s(o.summary, 600) || pb.summary;
  next.tips = strs('tips', 6) ?? pb.tips;
  next.trends = strs('trends', 5) ?? pb.trends;
  next.questions = strs('questions', 3) ?? pb.questions;
  const learned = s(o.learned, 400);
  next.learned = learned ? [{ at: now, text: learned }, ...pb.learned].slice(0, 60) : pb.learned;
  next.callsStudied = pb.callsStudied + calls.length;
  next.watermark = Math.max(pb.watermark, ...calls.map(c => c.at));
  next.updatedAt = now;
  return next;
}

/** Ranking: save rate pulled toward 50% when a line has only a few tries (1 of 1 ranks below 9 of 10). */
export const score = (r: Pick<Rebuttal, 'tried' | 'saved'>) => (r.saved + 1) / (r.tried + 2);

/** Rebuttals for one objection, best first, proven before untested. */
export const rebuttalsFor = (pb: Playbook, objection: string) =>
  pb.rebuttals.filter(r => r.objection === objection).sort((a, b) => (b.tried ? 1 : 0) - (a.tried ? 1 : 0) || score(b) - score(a));

export const ASK_PROMPT = `You are the team's sales coach inside Dispatch, the calling app for independent Globe Life agents who phone union and transport workers (UPS, USPS, rail, trucking) to book benefits appointments.
Answer the agent's question using the team Playbook (rebuttals with real try/save counts), George's teachings, and the agent's own recent numbers. Prefer lines that are proven on these calls; say when something is untested.
Be short, warm and practical: give the exact words to say when that helps. Plain language, no jargon, no hype. Never invent numbers.`;

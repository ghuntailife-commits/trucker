// Presentation coaching from Google Meet (George, 2026-11-27): Gracie's Meet recordings put a transcript (and Gemini's
// notes) on the calendar event. Dispatch reads them, matches the event to the contact, and Claude writes what happened:
// the outcome, objections and how they were answered, the close, why it did or didn't close, and what to try next.
// Results are saved with the Quo call notes (quo_events, type "meet.presentation") so the contact's notes, Coaching,
// Ask the coach and the Team Playbook all pick them up. Pure, tested in test/present.test.ts.

import { OBJECTIONS } from '../quo/coach';
import { PLAYBOOK_FIELDS, readExchanges, type Exchange } from '../quo/playbook';
import { FACT_FIELDS, readFacts, type Topic } from '../brief/profile';

export const PRES_TYPE = 'meet.presentation';
export const PRES_OUTCOMES = ['Sold', 'Follow-up set', 'No sale', 'Unclear'] as const;
export type PresOutcome = typeof PRES_OUTCOMES[number];

export interface PresTags {
  kind: 'presentation';
  presOutcome: PresOutcome;
  outcome: string;                 // for the Playbook and call sums: "Sold", "Callback set" or "Presented"
  objections: string[];
  whyNot: string[];                // the reasons it didn't close (empty when sold)
  closeAsked: boolean; closeHow: string;
  products: string[];
  wentWell: string; tryNext: string;
  exchanges: Exchange[];
  facts: { topic: Topic; fact: string }[];
}

export const PRES_PROMPT = `You coach a Globe Life insurance agent. You get the transcript (or Google Meet's notes) of one video presentation the agent gave a union or transport worker (UPS, USPS, rail, trucking): the agent explains the no-cost union benefits, then presents life, accident and health coverage and asks for the sale.
Read it like a sales manager and save it with the save_presentation tool, exactly once:
- summary: 3 to 5 plain sentences for the contact's notes: who was on, what they cared about, what was offered, how it ended and the next step (day and time if set).
- the outcome, every objection with the contact's words and the agent's answer, whether and how the agent asked for the sale, the real reasons it didn't close (not just what the contact said, also what the agent missed), the best thing the agent did and one specific thing to try next time.
- facts about the person for next time.
Plain friendly words, no jargon. Never invent anything that is not in the transcript.`;

export const PRES_TOOL = {
  name: 'save_presentation',
  description: 'Save the presentation notes for the contact and the coaching for the agent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: '3 to 5 short plain sentences for the contact notes.' },
      outcome: { type: 'string', enum: [...PRES_OUTCOMES], description: 'Sold = they bought; Follow-up set = a time was set to decide or talk again; No sale = they said no; Unclear = cannot tell.' },
      objections: { type: 'array', items: { type: 'string' }, description: `Objections raised, using these labels when they fit: ${OBJECTIONS.join('; ')}; Uninsurable (health); Wants to shop around; Price too high. Empty if none.` },
      why_not: { type: 'array', items: { type: 'string' }, description: "Up to 4 short reasons it didn't close, each under 15 words, most important first. Include what the agent could have done differently. Empty if sold." },
      close_asked: { type: 'boolean', description: 'Did the agent clearly ask for the sale?' },
      close_how: { type: 'string', description: 'One sentence: how the agent asked for the sale (their words if possible), or what stopped them asking.' },
      products: { type: 'array', items: { type: 'string' }, description: 'Coverage presented or bought, short names (e.g. "Whole life", "Accident", "Cancer", "AD&D no-cost"). Empty if unclear.' },
      went_well: { type: 'string', description: 'One short sentence: the best thing the agent did.' },
      try_next: { type: 'string', description: 'One short, specific sentence: what to try next time on a presentation like this.' },
      exchanges: { ...PLAYBOOK_FIELDS.exchanges, description: 'Each objection and how the agent answered it, in order. saved = they moved on toward buying after it. Empty if none.' },
      ...FACT_FIELDS,
    },
    required: ['summary', 'outcome', 'objections', 'why_not', 'close_asked', 'close_how', 'products', 'went_well', 'try_next', 'exchanges', 'facts'],
  },
};

const s = (x: unknown, n: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (x: unknown, k: number, n: number) => Array.isArray(x) ? x.map(v => s(v, n)).filter(Boolean).slice(0, k) : [];

export function readPresTool(input: unknown): { note: string; tags: PresTags } | null {
  const x = input as Record<string, unknown> | null;
  if (!x || typeof x.summary !== 'string' || !x.summary.trim()) return null;
  const presOutcome = (PRES_OUTCOMES as readonly string[]).includes(String(x.outcome)) ? x.outcome as PresOutcome : 'Unclear';
  return { note: s(x.summary, 1500), tags: {
    kind: 'presentation', presOutcome,
    outcome: presOutcome === 'Sold' ? 'Sold' : presOutcome === 'Follow-up set' ? 'Callback set' : 'Presented',
    objections: list(x.objections, 6, 60), whyNot: presOutcome === 'Sold' ? [] : list(x.why_not, 4, 140),
    closeAsked: x.close_asked === true, closeHow: s(x.close_how, 300), products: list(x.products, 8, 40),
    wentWell: s(x.went_well, 300), tryNext: s(x.try_next, 300), exchanges: readExchanges(x.exchanges), facts: readFacts(x.facts) } };
}

/** The line that goes on the contact's notes. */
export function presNote(note: string, t: PresTags | null | undefined): string {
  if (!note) return '';
  const why = t?.whyNot.length ? ` Why it didn't close: ${t.whyNot.join('; ')}.` : '';
  return `Presentation notes (AI): ${note.replace(/\s+/g, ' ')}${why}`;
}

// ---------- finding the presentations on the calendar ----------
export interface CalAttachment { fileId?: string; fileUrl?: string; title?: string; mimeType?: string }
export interface CalEvent { id: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string };
  attachments?: CalAttachment[]; extendedProperties?: { private?: Record<string, string> }; conferenceData?: unknown; hangoutLink?: string }
export interface Person { id: string; n: string; p: string }   // contact id, "First Last", phone

const GDOC = 'application/vnd.google-apps.document';
/** The Meet documents on an event, transcript first (it has every word), then Gemini's notes. */
export function meetDocs(ev: CalEvent): CalAttachment[] {
  const docs = (ev.attachments ?? []).filter(a => a.fileId && a.mimeType === GDOC && /transcript|notes by gemini|gemini/i.test(a.title ?? ''));
  return docs.sort((a, b) => Number(/transcript/i.test(b.title ?? '')) - Number(/transcript/i.test(a.title ?? '')));
}

const d10 = (p: string) => p.replace(/\D/g, '').slice(-10);
const norm = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Which contact a calendar event is for: Dispatch's own event id, else their phone, else their full name in the title. */
export function matchEvent(ev: CalEvent, people: Person[]): Person | null {
  const pr = ev.extendedProperties?.private;
  const id = pr?.contactId || pr?.uid?.replace(/:(appt|callback)$/, '');
  if (id) { const hit = people.find(p => p.id === id); if (hit) return hit; }
  const text = `${ev.summary ?? ''} ${ev.description ?? ''}`;
  const digits = (text.match(/\d[\d\s().-]{8,}\d/g) ?? []).map(d10).filter(d => d.length === 10);
  for (const d of digits) { const hit = people.find(p => d10(p.p) === d); if (hit) return hit; }
  const title = norm(ev.summary ?? '');
  const named = people.filter(p => p.n.trim().includes(' ') && title.includes(norm(p.n)));
  return named.length === 1 ? named[0] : null;
}

// ---------- sums for the Coaching tab ----------
export interface PresRow { id: string; at: number; phone: string; title: string; note: string; tags: PresTags | null; doc?: string }
export function presSums(rows: PresRow[]) {
  const t = rows.filter(r => r.tags).map(r => r.tags!);
  const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n); };
  return {
    total: t.length, sold: t.filter(x => x.presOutcome === 'Sold').length, followUp: t.filter(x => x.presOutcome === 'Follow-up set').length,
    noSale: t.filter(x => x.presOutcome === 'No sale').length, asked: t.filter(x => x.closeAsked).length,
    objections: count(t.flatMap(x => [...new Set(x.objections)])),
    whyNot: count(t.flatMap(x => x.whyNot)),
  };
}

/** Presentations as plain lines for Claude (the weekly note and Ask the coach). */
export function presForClaude(rows: PresRow[]): string {
  const lines = rows.filter(r => r.tags).slice(-20).map(r => { const t = r.tags!;
    return `- ${t.presOutcome}; asked for the sale: ${t.closeAsked ? 'yes' : 'no'} (${t.closeHow}); objections: ${t.objections.join(', ') || 'none'}; why not: ${t.whyNot.join('; ') || '-'}; went well: ${t.wentWell}; try next: ${t.tryNext}`; });
  return lines.length ? `Video presentations (${lines.length}):\n${lines.join('\n')}` : '';
}

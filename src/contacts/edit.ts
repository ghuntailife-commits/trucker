// Editing a contact's details by hand: checks the numbers the same way Needs Number does, and lists every change
// so the screen can show it before saving.
import type { Contact } from '../rules/types';
import { knownBad } from '../rules/engine';
import { buildIndex } from './importer';
import { digits10, fmtPhone } from './phones';
import { parseState } from './states';

export type EditFields = Pick<Contact, 'first' | 'last' | 'phone' | 'backup' | 'job' | 'company' | 'city' | 'state' | 'linkedin'>;
export const EDIT_LABELS: Record<keyof EditFields, string> = {
  first: 'First name', last: 'Last name', phone: 'Phone', backup: 'Backup', job: 'Job', company: 'Company', city: 'City', state: 'State', linkedin: 'LinkedIn',
};

export interface EditPlan { contact: Contact; changes: { field: keyof EditFields; from: string; to: string }[]; error: string }

export function planEdit(c: Contact, f: EditFields, all: Contact[]): EditPlan {
  const x: Contact = { ...c };
  const fail = (error: string): EditPlan => ({ contact: c, changes: [], error });
  for (const k of ['first', 'last', 'job', 'company', 'city', 'linkedin'] as const) x[k] = f[k].trim();
  if (!x.first && !x.last) return fail('A contact needs a name.');
  if (f.state.trim() !== c.state) {
    const st = parseState(f.state);
    if (!st) return fail(`"${f.state}" is not a US state.`);
    x.state = st.abbr; x.zone = st.zone;
  }
  const idx = buildIndex(all.filter(o => o.id !== c.id));
  for (const k of ['phone', 'backup'] as const) {
    const raw = f[k].trim();
    if (raw === c[k]) continue;
    if (!raw) { x[k] = ''; continue; }
    const p = fmtPhone(raw);
    if (!p) return fail(`${EDIT_LABELS[k]} is not a 10-digit number.`);
    if (knownBad(c.notes, p)) return fail(`${p} was already marked a bad number for this contact.`);
    const hit = idx.phones.get(digits10(p));
    if (hit) return fail(`${p} is already on ${hit.where}.`);
    x[k] = p;
  }
  if (x.phone && x.phone === x.backup) return fail('Phone and backup are the same number.');
  if (!x.phone && x.backup) { x.phone = x.backup; x.backup = ''; }
  if (x.phone !== c.phone && x.phone) { x.newNumberMark = c.dials; if (c.status === 'Cannot Find' || c.status === 'Bad') x.status = ''; }
  const changes = (Object.keys(EDIT_LABELS) as (keyof EditFields)[])
    .filter(k => x[k] !== c[k]).map(k => ({ field: k, from: c[k], to: x[k] }));
  return { contact: x, changes, error: '' };
}

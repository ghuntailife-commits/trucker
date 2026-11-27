// Contacts an agent removes from their own list go back to the contact library with their notes and history
// (George, 2026-11-26). The agent can't write the library itself, so they drop them in their own
// "dispatch-libreturn-<agent>" box and the library picks them up the next time George opens it (useLibrary).
import type { Contact } from '../rules/types';
import { loadState, saveState } from './store';

export interface Returned { contact: Contact; by: string; byName: string; at: number; reason: string }
export const returnKey = (agent: string) => `dispatch-libreturn-${agent}`;

export async function returnToLibrary(agent: string, agentName: string, contacts: Contact[], reason: string, now: number) {
  const box = (await loadState<{ items: Returned[] }>(returnKey(agent)))?.items ?? [];
  await saveState(returnKey(agent), { items: [...box, ...contacts.map(contact => ({ contact, by: agent, byName: agentName, at: now, reason }))] });
}

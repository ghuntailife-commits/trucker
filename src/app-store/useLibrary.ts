'use client';
// The contact library in the demo: kept in this browser. Sending to the signed-in agent goes straight into their lists
// (one Undo step); sending to anyone else lands in their inbox and joins their lists the next time their screen opens.
// With the database connected this is the library_contacts table (migration 0006) and the send is one transaction.
import { LIVE } from '../live/supabase';
import { useCallback, useEffect, useState } from 'react';
import type { Contact } from '../rules/types';
import type { AgentId } from '../team/agents';
import { applyHandout, undoHandout, type HandoutLine, type LibraryState, type Recipient } from '../library/library';
import { demoLibrary } from '../library/demoLibrary';
import { loadState, saveState } from './store';
import { loadAgentData } from './useTeam';

const KEY = 'dispatch-library-v1';
export interface Inbox { contacts: Contact[]; removed: string[] }
export const inboxKey = (agent: AgentId) => `dispatch-inbox-${agent}`;

export function useLibrary(me: AgentId, mine: { contacts: Contact[]; batch: (label: string, change: { added?: Contact[]; removed?: string[] }, message: string) => void }, tz: string) {
  const [st, setSt] = useState<LibraryState | null>(null);
  useEffect(() => {
    let live = true;
    loadState<LibraryState>(KEY).then(got => { if (live) setSt(got && got.v === 1 ? got : { v: 1, contacts: LIVE ? [] : demoLibrary(tz), handouts: [] }); });
    return () => { live = false; };
  }, [tz]);
  useEffect(() => { if (st) saveState(KEY, st); }, [st]);

  /** The agent's contacts as they stand, for the duplicate check. */
  const contactsOf = useCallback(async (id: AgentId, now: number): Promise<Contact[]> => {
    if (id === me) return mine.contacts;
    const [data, inbox] = await Promise.all([loadAgentData(id, now, tz), loadState<Inbox>(inboxKey(id))]);
    const gone = new Set(inbox?.removed ?? []);
    return [...data.contacts, ...(inbox?.contacts ?? [])].filter(c => !gone.has(c.id));
  }, [me, mine.contacts, tz]);

  const send = useCallback(async (plan: HandoutLine[], to: Recipient & { id: AgentId }, now: number) => {
    if (!st) return 0;
    const r = applyHandout(st, plan, to, now, `h-${now.toString(36)}`);
    if (!r.added.length) return 0;
    if (to.id === me) mine.batch('Contacts from the library', { added: r.added }, `${r.added.length} contacts added from the library.`);
    else {
      const inbox = (await loadState<Inbox>(inboxKey(to.id))) ?? { contacts: [], removed: [] };
      await saveState(inboxKey(to.id), { ...inbox, contacts: [...inbox.contacts, ...r.added] });
    }
    setSt(r.state);
    return r.added.length;
  }, [st, me, mine]);

  const undo = useCallback(async (handoutId: string, now: number) => {
    if (!st) return { back: 0, kept: [] as string[] };
    const h = st.handouts.find(x => x.id === handoutId);
    if (!h) return { back: 0, kept: [] };
    const theirs = await contactsOf(h.agent as AgentId, now);
    const u = undoHandout(st, handoutId, theirs, now);
    if (h.agent === me) { if (u.remove.length) mine.batch('Undo library send', { removed: u.remove }, `${u.remove.length} contacts went back to the library.`); }
    else {
      const inbox = (await loadState<Inbox>(inboxKey(h.agent as AgentId))) ?? { contacts: [], removed: [] };
      const rm = new Set(u.remove), still = inbox.contacts.filter(c => !rm.has(c.id));
      const merged = u.remove.filter(id => !inbox.contacts.some(c => c.id === id));
      await saveState(inboxKey(h.agent as AgentId), { contacts: still, removed: [...inbox.removed, ...merged] });
    }
    setSt(u.state);
    return { back: h.items.length - u.kept.length, kept: u.kept };
  }, [st, me, mine, contactsOf]);

  return { ready: !!st, lib: st?.contacts ?? [], handouts: st?.handouts ?? [], send, undo, contactsOf,
    resetLibrary: () => setSt({ v: 1, contacts: demoLibrary(tz), handouts: [] }) };
}
export type Library = ReturnType<typeof useLibrary>;

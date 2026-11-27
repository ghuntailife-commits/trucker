'use client';
// The contact library in the demo: kept in this browser. Sending to the signed-in agent goes straight into their lists
// (one Undo step); sending to anyone else lands in their inbox and joins their lists the next time their screen opens.
// With the database connected this is the library_contacts table (migration 0006) and the send is one transaction.
import { LIVE } from '../live/supabase';
import { useCallback, useEffect, useState } from 'react';
import type { Contact } from '../rules/types';
import type { AgentId } from '../team/agents';
import { applyHandout, undoHandout, mergeReturns, type HandoutLine, type LibraryState, type LibraryContact, type Recipient } from '../library/library';
import { demoLibrary } from '../library/demoLibrary';
import { loadState, saveState } from './store';
import { loadAgentData } from './useTeam';
import { returnKey, type Returned } from './libraryReturns';

const KEY = 'dispatch-library-v1';
export interface Inbox { contacts: Contact[]; removed: string[] }
export const inboxKey = (agent: AgentId) => `dispatch-inbox-${agent}`;

export function useLibrary(me: AgentId, mine: { contacts: Contact[]; batch: (label: string, change: { added?: Contact[]; removed?: string[] }, message: string) => void }, tz: string, admin = false, agentIds: string[] = []) {
  const [st, setSt] = useState<LibraryState | null>(null);
  useEffect(() => {
    let live = true;
    loadState<LibraryState>(KEY).then(got => { if (live) setSt(got && got.v === 1 ? got : { v: 1, contacts: LIVE ? [] : demoLibrary(tz), handouts: [] }); });
    return () => { live = false; };
  }, [tz]);

  /** Contacts agents sent back from their lists (admin only): taken into the library, then the boxes are emptied. */
  const pullReturns = useCallback(async () => {
    if (!admin || !agentIds.length) return 0;
    const boxes = await Promise.all(agentIds.map(a => loadState<{ items: Returned[] }>(returnKey(a)).then(b => ({ a, items: b?.items ?? [] })).catch(() => ({ a, items: [] as Returned[] }))));
    const items = boxes.flatMap(b => b.items);
    if (!items.length) return 0;
    const t = Date.now();
    setSt(cur => (cur ? mergeReturns(cur, items, i => `lib-r${t.toString(36)}-${i}`).state : cur));
    for (const b of boxes) if (b.items.length) await saveState(returnKey(b.a), { items: [] });
    return items.length;
  }, [admin, agentIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st) void pullReturns(); }, [!!st]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // take them off any other agent who had them but had not called them yet (checkOtherAgents)
    const moves = new Map<AgentId, string[]>();
    for (const l of plan) if (l.ok && l.contact) for (const m of l.moveFrom ?? []) moves.set(m.agent as AgentId, [...(moves.get(m.agent as AgentId) ?? []), m.contactId]);
    for (const [who, ids] of moves) {
      if (who === me) mine.batch('Given to another agent', { removed: ids }, `${ids.length} contacts moved to ${to.name}.`);
      else {
        const inbox = (await loadState<Inbox>(inboxKey(who))) ?? { contacts: [], removed: [] };
        const rm = new Set(ids);
        await saveState(inboxKey(who), { contacts: inbox.contacts.filter(c => !rm.has(c.id)), removed: [...inbox.removed, ...ids] });
      }
    }
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

  /** Moves contacts from one agent to another (planTransfer). Removes them from the first, adds them to the second. */
  const transfer = useCallback(async (from: AgentId, to: AgentId, toName: string, lines: { id: string; ok: boolean; contact?: Contact }[]) => {
    const ok = lines.filter(l => l.ok && l.contact);
    if (!ok.length) return 0;
    const ids = ok.map(l => l.id), add = ok.map(l => l.contact!);
    if (from === me) mine.batch('Moved to another agent', { removed: ids }, `${ids.length} contacts moved to ${toName}.`);
    else {
      const inbox = (await loadState<Inbox>(inboxKey(from))) ?? { contacts: [], removed: [] };
      const rm = new Set(ids);
      await saveState(inboxKey(from), { contacts: inbox.contacts.filter(c => !rm.has(c.id)), removed: [...inbox.removed, ...ids] });
    }
    if (to === me) mine.batch('Moved from another agent', { added: add }, `${add.length} contacts added.`);
    else {
      const inbox = (await loadState<Inbox>(inboxKey(to))) ?? { contacts: [], removed: [] };
      await saveState(inboxKey(to), { ...inbox, contacts: [...inbox.contacts, ...add] });
    }
    return ok.length;
  }, [me, mine]);

  /** Adds contacts to the library (after a previewed CSV import or the Lead Library move). */
  const addToLibrary = useCallback((cs: LibraryContact[]) => setSt(x => x ? { ...x, contacts: [...x.contacts, ...cs] } : x), []);

  return { ready: !!st, pullReturns, lib: st?.contacts ?? [], handouts: st?.handouts ?? [], send, undo, contactsOf, addToLibrary, transfer,
    resetLibrary: () => setSt({ v: 1, contacts: demoLibrary(tz), handouts: [] }) };
}
export type Library = ReturnType<typeof useLibrary>;

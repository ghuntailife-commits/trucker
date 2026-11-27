'use client';
// Team feed notes (George, 2026-11-27): sage green, bottom left, a few seconds each. Your own news says "you" and
// is marked; leads assigned to you have a button to go find them.
import { useEffect } from 'react';
import { feedText, type FeedItem } from '../../src/team/feed';

export function FeedToasts({ toasts, me, nameOf, dismiss, onLeads }: {
  toasts: FeedItem[]; me: string; nameOf: (contactId?: string) => string | undefined; dismiss: (id: string) => void; onLeads: () => void;
}) {
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dismiss(toasts[toasts.length - 1].id), 12_000);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  if (!toasts.length) return null;
  return <div className="feedtoasts" role="status" aria-live="polite">{toasts.map(f => { const x = feedText(f, me, nameOf(f.contactId)); return (
    <div key={f.id} className={`feedtoast ${x.mine ? 'mine' : ''} k-${f.kind}`}>
      <div>{x.mine && <span className="youtag">{f.kind === 'leads' ? 'For you' : 'You'}</span>}<b>{x.text}</b>{x.sub && <small>{x.sub}</small>}</div>
      {x.mine && f.kind === 'leads' && <button className="btn sm" onClick={() => { onLeads(); dismiss(f.id); }}>Show me</button>}
      <button className="x" aria-label="Close" onClick={() => dismiss(f.id)}>×</button>
    </div>); })}</div>;
}

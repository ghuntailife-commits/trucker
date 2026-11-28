'use client';
// When a screen crashes, show what broke instead of Next's blank "Application error" page, and report it so it
// can be fixed (George, 2026-11-28, after Gracie hit one). Reload brings Dispatch back.
import { useEffect } from 'react';
import { db } from '../src/live/supabase';

export default function DispatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await db().auth.getSession();
        await fetch('/api/status/error', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: JSON.stringify({ message: error.message, stack: error.stack ?? '', page: location.hash || location.pathname }) });
      } catch { /* shown on screen anyway */ }
    })();
  }, [error]);
  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: 16, fontFamily: 'Inter, sans-serif' }}>
      <h2 style={{ marginBottom: 8 }}>Dispatch hit a problem</h2>
      <p>Nothing you saved is lost. Reload to keep going. If it happens again, send George a picture of this box.</p>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'rgba(127,127,127,.12)', padding: 12, borderRadius: 8 }}>{error.message}{'\n'}{(error.stack ?? '').split('\n').slice(1, 4).join('\n')}</pre>
      <button onClick={() => { try { reset(); } catch { location.reload(); } }} style={{ marginRight: 8 }}>Try again</button>
      <button onClick={() => location.reload()}>Reload Dispatch</button>
    </div>
  );
}

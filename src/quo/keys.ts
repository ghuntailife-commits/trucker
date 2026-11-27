// Server only. Quo keys per workspace (George, 2026-11-27): George's workspace uses QUO_API_KEY and QUO_SIGNING_KEY.
// An agent with their own Quo account (Gracie) adds QUO_API_KEY_<ID> and QUO_SIGNING_KEY_<ID> on Vercel, where <ID>
// is their Dispatch id in capitals (GRACIE). Their calls, texts and transcripts then land in their own Dispatch.
export interface QuoWorkspace { agent: string | null; apiKey: string; signing: string }

export function quoWorkspaces(env: Record<string, string | undefined> = process.env): QuoWorkspace[] {
  const out: QuoWorkspace[] = [];
  if (env.QUO_SIGNING_KEY || env.QUO_API_KEY) out.push({ agent: null, apiKey: (env.QUO_API_KEY ?? '').trim(), signing: (env.QUO_SIGNING_KEY ?? '').trim() });
  for (const k of Object.keys(env)) {
    const m = k.match(/^QUO_(?:SIGNING|API)_KEY_([A-Z0-9_]+)$/);
    if (!m) continue;
    const agent = m[1].toLowerCase();
    if (out.some(w => w.agent === agent)) continue;
    out.push({ agent, apiKey: (env[`QUO_API_KEY_${m[1]}`] ?? '').trim(), signing: (env[`QUO_SIGNING_KEY_${m[1]}`] ?? '').trim() });
  }
  return out;
}

/** The Quo key that sends texts for this agent: their own workspace's if they have one, else George's. */
export function quoKeyFor(agentId: string, env: Record<string, string | undefined> = process.env): string {
  const own = quoWorkspaces(env).find(w => w.agent === agentId.toLowerCase());
  return own?.apiKey || (env.QUO_API_KEY ?? '').trim();
}

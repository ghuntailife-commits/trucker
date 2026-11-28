// Fills in AI call notes that failed the first time (George, 2026-11-28: System status showed 7 of 38 missing).
// Hang-ups and greetings get '' (checked, nothing worth a note); real conversations get Claude's notes and tags.
// The notes show in Coaching and the System status; the contact's own notes already have the call itself.
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { transcriptText } from './events';
import { tagTranscript } from './tagCall';

export async function repairNotes(db: SupabaseClient, budgetMs: number, days = 7): Promise<{ fixed: number; empty: number; failed: number; left: number }> {
  const start = Date.now();
  const { data, error } = await db.from('quo_events').select('id,payload,ai_tags').eq('type', 'call.transcript.completed').is('ai_note', null)
    .gte('at', new Date(Date.now() - days * 86_400_000).toISOString()).lte('at', new Date(Date.now() - 10 * 60_000).toISOString())
    .order('at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let fixed = 0, empty = 0, failed = 0, done = 0;
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  for (const e of rows) {
    if (Date.now() - start > budgetMs) break;
    done++;
    const text = transcriptText(e.payload);
    if (text.length <= 40) { await db.from('quo_events').update({ ai_note: '' }).eq('id', e.id); empty++; continue; }
    if (!client) { failed++; continue; }
    const got = await tagTranscript(client, text).catch(() => null);
    if (!got?.note) { failed++; continue; }
    await db.from('quo_events').update({ ai_note: got.note, ...(e.ai_tags ? {} : got.tags ? { ai_tags: got.tags } : {}) }).eq('id', e.id);
    fixed++;
  }
  return { fixed, empty, failed, left: rows.length - done + failed };
}

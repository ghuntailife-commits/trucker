-- Quo events (calls, texts, recordings, transcripts) for Dispatch. Paste into Supabase > SQL Editor > New query > Run.
-- Safe to run twice. Only the website's server can add events; each agent reads only their own, the admin reads all.
create table if not exists quo_events (
  id         text primary key,                 -- "<event type>:<Quo id>", so a repeated webhook is stored once
  agent_id   text,                             -- whose Quo number it was
  type       text not null,
  call_id    text,
  phone      text,                             -- the other person's number
  at         timestamptz not null default now(),
  payload    jsonb not null,
  ai_note    text,                             -- Claude's call notes, from the transcript
  applied    boolean not null default false,   -- already put on the contact's notes
  created_at timestamptz not null default now()
);
create index if not exists quo_events_agent on quo_events (agent_id, applied);
create index if not exists quo_events_call on quo_events (call_id);
alter table quo_events enable row level security;
drop policy if exists quo_read on quo_events;
create policy quo_read on quo_events for select to authenticated using (agent_id = my_agent() or my_role() = 'admin');
drop policy if exists quo_mark on quo_events;
create policy quo_mark on quo_events for update to authenticated using (agent_id = my_agent() or my_role() = 'admin')
  with check (agent_id = my_agent() or my_role() = 'admin');
grant select, update on quo_events to authenticated;

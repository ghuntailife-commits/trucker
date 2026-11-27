-- Google Calendar for Dispatch (George, 2026-11-26). Paste into Supabase > SQL Editor > New query > Run. Safe to run twice.
-- Only the website's server reads or writes these tables (no policies = no access from the browser).
create table if not exists google_tokens (
  agent_id      text primary key,
  refresh_token text not null,
  email         text,
  updated_at    timestamptz not null default now()
);
alter table google_tokens enable row level security;

create table if not exists calendar_events (
  agent_id   text not null,
  uid        text not null,          -- "<contact id>:appt" or "<contact id>:callback"
  google_id  text not null,          -- the event's id in Google Calendar
  contact_id text not null,
  start_at   bigint not null,        -- what Dispatch last put on the calendar (ms)
  hash       text not null,          -- title/time/details last sent, to skip unchanged events
  primary key (agent_id, uid)
);
alter table calendar_events enable row level security;

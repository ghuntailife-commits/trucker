-- Stage 7: the team. Per-agent settings (goal, Quo, coaching), Quo texts and events, Monday coaching notes,
-- and the daily health check runs. Roles (agent / admin / boss) and their row level security came in 0001.

-- Per-agent settings the admin keeps. One row per agent.
create table agent_settings (
  agent_id       uuid primary key references agents (id) on delete cascade,
  states         text[] not null default '{}',
  monthly_goal   numeric not null default 20000,
  quo_enabled    boolean not null default false,       -- George and Gracie on (2026-11-26)
  quo_number     text not null default '',             -- the agent's Quo number, E.164
  -- the Quo API key itself is NOT stored here: it lives in the server's secrets, named by this reference
  quo_key_ref    text not null default '',
  coaching       boolean not null default true,        -- Monday coaching note, everybody
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agents (id)
);
alter table agent_settings enable row level security;
create policy agent_settings_read on agent_settings for select using (agent_id = auth.uid() or my_role() in ('admin', 'boss'));
create policy agent_settings_admin on agent_settings for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Team rules (was the Rules tab): every change is kept, so a rule can be put back.
create table settings_history (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  by_agent    uuid references agents (id),
  config      jsonb not null,
  summary     text not null default ''
);
alter table settings_history enable row level security;
create policy settings_history_admin on settings_history for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Texts sent through Quo from the dialer (after the agent saw the preview).
create table quo_texts (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  agent_id    uuid not null references agents (id),
  contact_id  uuid references contacts (id),
  to_number   text not null,
  kind        text not null default '',     -- confirmToday / confirmTomorrow / booked / missed / followUp / custom
  body        text not null,
  quo_id      text,                         -- Quo's message id once accepted
  status      text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  error       text not null default ''
);
create index quo_texts_agent_at on quo_texts (agent_id, at);
alter table quo_texts enable row level security;
create policy quo_texts_own on quo_texts for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');

-- Events Quo sends (call ended, text received). Kept raw for a while so nothing is lost if matching fails.
create table quo_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  agent_id    uuid references agents (id),
  quo_id      text not null unique,          -- the same event twice is stored once
  kind        text not null,                 -- callEnded / textIn
  phone       text not null default '',
  contact_id  uuid references contacts (id),
  seconds     int,
  body        text not null default '',
  raw         jsonb not null
);
create index quo_events_agent on quo_events (agent_id, received_at);
alter table quo_events enable row level security;
create policy quo_events_own on quo_events for select using (agent_id = auth.uid() or my_role() = 'admin');

-- Monday coaching notes: what was written, for whom, and when it went out.
create table coaching_notes (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null references agents (id),
  week_start  date not null,
  subject     text not null,
  body        text not null,
  focus       text not null default '',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (agent_id, week_start)
);
alter table coaching_notes enable row level security;
create policy coaching_own on coaching_notes for select using (agent_id = auth.uid() or my_role() = 'admin');
create policy coaching_admin on coaching_notes for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Daily health check: one row per agent per run, with what it found (counts and contact ids).
create table health_runs (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  agent_id    uuid not null references agents (id),
  findings    jsonb not null default '[]',
  fix_count   int not null default 0,
  check_count int not null default 0
);
create index health_runs_agent_at on health_runs (agent_id, at);
alter table health_runs enable row level security;
create policy health_own on health_runs for select using (agent_id = auth.uid() or my_role() = 'admin');

-- Team leaderboard for a date range: totals only, so the boss can read it without contact details.
create function team_board(from_day date, to_day date)
returns table (agent text, dials bigint, connects bigint, scheduled bigint, presented bigint, sold bigint, alp numeric)
language sql stable security definer set search_path = public as $$
  select a.name,
         coalesce(sum(d.dials), 0), coalesce(sum(d.connects), 0), coalesce(sum(d.scheduled), 0),
         coalesce(sum(d.presented), 0),
         (select count(*) from sales s where s.agent_id = a.id and (s.at at time zone 'America/New_York')::date between from_day and to_day),
         (select coalesce(sum(s.alp), 0) from sales s where s.agent_id = a.id and (s.at at time zone 'America/New_York')::date between from_day and to_day)
    from agents a left join daily_summary d on d.agent_id = a.id and d.day between from_day and to_day
   where a.active and a.role <> 'boss' and my_role() in ('admin', 'boss')
   group by a.id, a.name
$$;

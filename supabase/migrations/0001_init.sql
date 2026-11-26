-- Trucker dialer: initial database.
-- One database for the whole team. Each agent sees only their own contacts; admins see everyone;
-- the boss role sees results and sales totals only (no contact details).

create type app_role as enum ('agent', 'admin', 'boss');

create table agents (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null unique,
  team        text not null default 'Direct',          -- Direct / Greater
  role        app_role not null default 'agent',
  dialer      text not null default 'phone',           -- phone | calilio
  theme       text not null default 'day',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Contacts (was: one row on a state tab)
create table contacts (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references agents (id),
  list             text not null,                      -- state name or 'Hardcards'
  tag              text not null default '',
  dials            int  not null default 0,
  first_name       text not null default '',
  last_name        text not null default '',
  phone            text not null default '',
  job              text not null default '',
  company          text not null default '',
  city             text not null default '',
  state            text not null default '',
  backup           text not null default '',
  notes            text not null default '',
  last_dialed      timestamptz,
  status           text not null default '' check (status in ('', 'Good', 'Backup', 'Bad', 'Do Not Call', 'Cannot Find')),
  call_at          timestamptz,
  linkedin         text not null default '',
  zone             text not null default '',
  new_number_mark  numeric,
  callback_tries   int not null default 0,
  no_show_tries    int not null default 0,
  swap_memo        jsonb,
  seq              int not null default 0,             -- original row order inside the list
  calendar_event   text,                               -- linked APPOINTMENTS event id
  source           text not null default '',           -- e.g. 'George Truckers / Texas row 57'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz                         -- "Delete contact" hides it; logged dials stay
);
create index contacts_agent_list on contacts (agent_id, list, seq) where deleted_at is null;
create index contacts_agent_phone on contacts (agent_id, (regexp_replace(phone, '\D', '', 'g'))) where deleted_at is null;

-- Activity Log: one row per dial / disposition / swap / import. Source of every stat.
create table activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  agent_id    uuid not null references agents (id),
  contact_id  uuid references contacts (id),
  list        text not null default '',
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text not null default '',
  kind        text not null check (kind in ('Dial', 'Tag', 'Swap', 'Note', 'Import')),
  count       int  not null default 1,
  tag         text not null default '',
  dials       int  not null default 0,
  reach       boolean,                         -- Tag rows: a real person was reached (v27 column K)
  undone      boolean not null default false
);
create index activity_agent_at on activity_log (agent_id, at);
create index activity_contact on activity_log (contact_id, at);

-- Per-agent Today state (was the Order tab)
create table today_state (
  agent_id     uuid primary key references agents (id),
  snap         timestamptz,                       -- last re-sort
  saved_order  uuid[] not null default '{}',
  saved_appts  uuid[] not null default '{}',
  skips        uuid[] not null default '{}',
  skips_day    date,
  undo         jsonb                              -- snapshot for the last action
);

create table sales (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default now(),
  agent_id        uuid not null references agents (id),
  contact_id      uuid references contacts (id),
  trial_alp       numeric,
  standard_alp    numeric,
  monthly_premium numeric,
  called_into     boolean not null default false,
  note            text not null default ''
);

create table no_sales (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  agent_id    uuid not null references agents (id),
  contact_id  uuid references contacts (id),
  objection   text not null,
  called_into boolean not null default false,
  note        text not null default ''
);

-- Team-wide settings (was the Rules tab) and the area code table
create table settings (id int primary key default 1 check (id = 1), config jsonb not null default '{}');
create table area_codes (code text primary key, zone text not null);

-- ---------- Row level security ----------
alter table agents       enable row level security;
alter table contacts     enable row level security;
alter table activity_log enable row level security;
alter table today_state  enable row level security;
alter table sales        enable row level security;
alter table no_sales     enable row level security;
alter table settings     enable row level security;
alter table area_codes   enable row level security;

create function my_role() returns app_role language sql stable security definer set search_path = public as
  $$ select role from agents where id = auth.uid() $$;

create policy agents_read on agents for select using (id = auth.uid() or my_role() in ('admin', 'boss'));
create policy agents_admin on agents for all using (my_role() = 'admin');

create policy contacts_own on contacts for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');
create policy log_own on activity_log for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');
create policy today_own on today_state for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');
create policy sales_read on sales for select using (agent_id = auth.uid() or my_role() in ('admin', 'boss'));
create policy sales_write on sales for insert with check (agent_id = auth.uid() or my_role() = 'admin');
create policy nosales_read on no_sales for select using (agent_id = auth.uid() or my_role() in ('admin', 'boss'));
create policy nosales_write on no_sales for insert with check (agent_id = auth.uid() or my_role() = 'admin');
create policy settings_read on settings for select using (auth.uid() is not null);
create policy settings_admin on settings for all using (my_role() = 'admin');
create policy area_read on area_codes for select using (auth.uid() is not null);
create policy area_admin on area_codes for all using (my_role() = 'admin');

-- Daily totals per agent (Daily Summary). Readable by the boss without contact details.
-- Note: the boss reads it through the security-definer function below, never the raw log.
create view daily_summary with (security_invoker = true) as
select agent_id,
       (at at time zone 'America/New_York')::date as day,
       sum(count) filter (where kind = 'Dial')                                         as dials,
       count(*) filter (where kind = 'Tag' and reach)                                  as connects,
       count(*) filter (where kind = 'Tag' and tag like 'SCHEDULED%')                   as scheduled,
       count(*) filter (where kind = 'Tag' and tag like 'CALLED INTO%')                 as called_into,
       count(distinct contact_id) filter (where kind = 'Tag' and (tag like 'PRESENTED%' or tag like 'SOLD%')) as presented,
       count(distinct contact_id) filter (where kind = 'Tag' and tag like 'SOLD%')     as sold
from activity_log where not undone
group by agent_id, (at at time zone 'America/New_York')::date;

create function team_results(from_day date, to_day date)
returns table (agent text, team text, day date, dials bigint, connects bigint, scheduled bigint,
               called_into bigint, presented bigint, sold bigint)
language sql stable security definer set search_path = public as $$
  select a.name, a.team, d.day, d.dials, d.connects, d.scheduled, d.called_into, d.presented, d.sold
  from daily_summary d join agents a on a.id = d.agent_id
  where d.day between from_day and to_day and my_role() in ('admin', 'boss')
$$;

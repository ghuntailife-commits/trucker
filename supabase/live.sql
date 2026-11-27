-- Dispatch live database. Paste this whole file into Supabase > SQL Editor > New query, then click Run. Safe to run twice.
-- Each person's data is stored in parts (one per contact list, one per month of activity, one for everything else),
-- so a dial only re-saves the list it touched. Who may see what is enforced here, by the database:
--   * an agent reads and writes only their own data
--   * a team lead also reads (never changes) their own team's data
--   * the admin (George) reads and writes everything
-- The sheets are never touched by anything in here.

create table if not exists people (
  agent_id   text primary key,
  name       text not null,
  email      text unique,
  role       text not null default 'agent' check (role in ('admin', 'lead', 'agent', 'boss')),
  lead_id    text references people (agent_id),
  updated_at timestamptz not null default now()
);

create table if not exists kv (
  key        text not null,
  part       text not null,
  owner      text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (key, part)
);
create index if not exists kv_owner on kv (owner);

-- the signed-in person's agent id and role, from their sign-in email
create or replace function my_agent() returns text language sql stable security definer set search_path = public as $$
  select agent_id from people where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from people where lower(email) = lower(auth.jwt() ->> 'email') limit 1 $$;
create or replace function on_my_team(who text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where agent_id = who and lead_id = my_agent()) $$;

alter table people enable row level security;
alter table kv enable row level security;

drop policy if exists people_read on people;
create policy people_read on people for select to authenticated using (my_agent() is not null);
drop policy if exists people_admin on people;
create policy people_admin on people for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

drop policy if exists kv_read on kv;
create policy kv_read on kv for select to authenticated using (
  owner = my_agent() or my_role() = 'admin' or on_my_team(owner) or (owner = 'shared' and my_agent() is not null));
drop policy if exists kv_insert on kv;
create policy kv_insert on kv for insert to authenticated with check (owner = my_agent() or my_role() = 'admin');
drop policy if exists kv_update on kv;
create policy kv_update on kv for update to authenticated using (owner = my_agent() or my_role() = 'admin')
  with check (owner = my_agent() or my_role() = 'admin');
drop policy if exists kv_delete on kv;
create policy kv_delete on kv for delete to authenticated using (owner = my_agent() or my_role() = 'admin');

grant select, insert, update, delete on people, kv to authenticated;
grant execute on function my_agent(), my_role(), on_my_team(text) to authenticated;

-- George is the admin. Everyone else is added by the switch-over screen.
insert into people (agent_id, name, email, role) values ('george', 'George', 'GEORGE_EMAIL', 'admin')
  on conflict (agent_id) do update set role = 'admin';

-- the website's server (Quo webhook, sending texts) uses the secret key, which needs its own grant
grant select, insert, update, delete on people, kv to service_role;

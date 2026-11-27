-- Team leads (George, 2026-11-26): everyone with a Truckers sheet is on Dispatch. George is the only admin. Some agents
-- lead others (Braga, Bradley) and see those agents' results on their Team page: totals and amounts only, like the
-- boss, never their contacts or notes. Roster comes from the Truckers Registry sheet (src/team/roster.ts).
alter type app_role add value if not exists 'lead';
alter table agents add column if not exists lead_id uuid references agents (id);   -- who they are under
alter table agents add column if not exists team text not null default 'Direct' check (team in ('Direct', 'Greater'));
alter table agents add column if not exists sheet_id text;                         -- their old Truckers sheet, read once at switch-over

-- Is this agent me, or one of mine?
create function in_my_team(agent uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select agent = auth.uid() or exists (select 1 from agents where id = agent and lead_id = auth.uid()) $$;

drop policy agents_read on agents;
create policy agents_read on agents for select using (id = auth.uid() or lead_id = auth.uid() or my_role() in ('admin', 'boss'));

-- The Team page functions: admin and boss see everyone; a lead sees their own agents and themselves.
create or replace function team_sales(from_day date, to_day date)
returns table (agent text, at timestamptz, trial_alp numeric, standard_alp numeric, called_into boolean)
language sql stable security definer set search_path = public as $$
  select a.name, s.at, s.trial_alp, s.standard_alp, s.called_into
    from sales s join agents a on a.id = s.agent_id
   where (s.at at time zone 'America/New_York')::date between from_day and to_day
     and (my_role() in ('admin', 'boss') or (my_role() = 'lead' and in_my_team(s.agent_id)))
$$;
create or replace function team_no_sales(from_day date, to_day date)
returns table (agent text, at timestamptz, objection text, called_into boolean)
language sql stable security definer set search_path = public as $$
  select a.name, n.at, n.objection, n.called_into
    from no_sales n join agents a on a.id = n.agent_id
   where (n.at at time zone 'America/New_York')::date between from_day and to_day
     and (my_role() in ('admin', 'boss') or (my_role() = 'lead' and in_my_team(n.agent_id)))
$$;
revoke all on function in_my_team(uuid) from public, anon;
grant execute on function in_my_team(uuid) to authenticated;

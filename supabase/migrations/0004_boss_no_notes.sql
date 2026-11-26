-- Tighten what the boss can read. Before this, the boss could read sales and no-sale rows directly, which
-- carry the agent's free-text note (it can hold a client's name). Now the boss gets totals and amounts only,
-- through the two functions below. Agents still see only their own rows; the admin still sees everything.
drop policy sales_read on sales;
create policy sales_read on sales for select using (agent_id = auth.uid() or my_role() = 'admin');
drop policy nosales_read on no_sales;
create policy nosales_read on no_sales for select using (agent_id = auth.uid() or my_role() = 'admin');

-- Sales for the Team page charts: when, whose, how much. No contact, no note.
create function team_sales(from_day date, to_day date)
returns table (agent text, at timestamptz, trial_alp numeric, standard_alp numeric, called_into boolean)
language sql stable security definer set search_path = public as $$
  select a.name, s.at, s.trial_alp, s.standard_alp, s.called_into
    from sales s join agents a on a.id = s.agent_id
   where (s.at at time zone 'America/New_York')::date between from_day and to_day
     and my_role() in ('admin', 'boss')
$$;

-- No-sales for the Team page: whose, when and the objection. No contact, no note.
create function team_no_sales(from_day date, to_day date)
returns table (agent text, at timestamptz, objection text, called_into boolean)
language sql stable security definer set search_path = public as $$
  select a.name, n.at, n.objection, n.called_into
    from no_sales n join agents a on a.id = n.agent_id
   where (n.at at time zone 'America/New_York')::date between from_day and to_day
     and my_role() in ('admin', 'boss')
$$;

revoke all on function team_sales(date, date), team_no_sales(date, date) from public, anon;
grant execute on function team_sales(date, date), team_no_sales(date, date) to authenticated;

-- Stage 5: result forms and the appointments calendar.
-- Sale form: ALP type + one ALP (was trial and standard), whole life and ADB coverage, email.
alter table sales add column alp_type    text check (alp_type in ('Trial', 'Standard'));
alter table sales add column alp         numeric;
alter table sales add column whole_life  numeric;
alter table sales add column adb         numeric not null default 0;
alter table sales add column email       text not null default '';
update sales set alp_type = case when coalesce(standard_alp, 0) > 0 then 'Standard' else 'Trial' end,
                 alp = coalesce(nullif(standard_alp, 0), trial_alp, 0)
 where alp is null;

-- No-sale form: several objections, what stopped it, an optional follow-up date and note.
alter table no_sales add column objections     text[] not null default '{}';
alter table no_sales add column reason         text not null default '';
alter table no_sales add column follow_up      date;
alter table no_sales add column follow_up_note text not null default '';
update no_sales set objections = array[objection] where objection <> '' and objections = '{}';
alter table no_sales alter column objection set default '';

-- Contacts: email (calendar invite, policy email), when the appointment was confirmed, quick qualifier tags.
alter table contacts add column if not exists email        text not null default '';
alter table contacts add column if not exists confirmed_at timestamptz;
alter table contacts add column if not exists quals        text[] not null default '{}';

-- Calendar sync runs: what matched, what changed (replaces the hidden 2-hour trigger's alert).
create table calendar_syncs (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  agent_id  uuid not null references agents (id),
  matched   int not null default 0,
  updated   int not null default 0,
  message   text not null default '',
  ok        boolean not null default true
);
alter table calendar_syncs enable row level security;
create policy calsync_read on calendar_syncs for select using (agent_id = auth.uid() or my_role() = 'admin');

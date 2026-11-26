-- Each agent's number sheet (George, 2026-11-26). The app makes a new Google Sheet per agent, sends Needs Number
-- contacts to it, and every few minutes reads back the numbers found there (rules in src/numbers/sheet.ts).
create table number_sheets (
  agent_id        uuid primary key references agents (id),
  spreadsheet_id  text not null,
  auto_send_bad   boolean not null default false,  -- send newly bad numbers to the sheet on their own
  last_check      timestamptz,
  last_error      text
);
alter table number_sheets enable row level security;
create policy number_sheets_own on number_sheets for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');

-- Each batch of numbers saved from the sheet, so it can be undone.
create table number_uploads (
  id         bigint generated always as identity primary key,
  agent_id   uuid not null references agents (id),
  at         timestamptz not null default now(),
  sheet_rows int[] not null,
  before     jsonb not null,   -- the contacts as they were
  after      jsonb not null,   -- the contacts as saved; undo only puts back ones still equal to this
  undone_at  timestamptz
);
create index number_uploads_agent_at on number_uploads (agent_id, at);
alter table number_uploads enable row level security;
create policy number_uploads_own on number_uploads for all using (agent_id = auth.uid() or my_role() = 'admin')
  with check (agent_id = auth.uid() or my_role() = 'admin');

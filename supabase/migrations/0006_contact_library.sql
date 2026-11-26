-- The contact library (George, 2026-11-26): the Lead Library sheet, living in the app. Only the admin reads or changes it;
-- sending contacts to an agent inserts them into that agent's contacts and marks them given (rules in src/library/library.ts).
create table library_contacts (
  id          bigint generated always as identity primary key,
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text not null default '',
  job         text not null default '',
  company     text not null default '',
  city        text not null default '',
  state       text not null default '',          -- two letters
  linkedin    text not null default '',
  backup      text not null default '',
  notes       text not null default '',
  given_to    text not null default '',           -- as written on the sheet, e.g. an agent not on Dispatch yet
  given_agent uuid references agents (id),       -- set when the person is on Dispatch
  given_at    timestamptz,
  imported_at timestamptz not null default now()
);
create index library_contacts_open on library_contacts (state) where given_to = '';
alter table library_contacts enable row level security;
create policy library_admin on library_contacts for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Each send, so it can be undone (contacts the agent has not dialed yet go back to the library).
create table library_handouts (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  agent_id    uuid not null references agents (id),
  items       jsonb not null,                     -- [{ library_id, contact_id }]
  undone_at   timestamptz
);
alter table library_handouts enable row level security;
create policy library_handouts_admin on library_handouts for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Sales from outside the agent's lists (company leads, referrals) entered on Results.
alter table sales add column if not exists source text check (source in ('company', 'referral', 'other'));
-- Follow-up calls with no answer since the last presentation; at 3 the contact drops off Today.
alter table contacts add column if not exists follow_up_tries int not null default 0;

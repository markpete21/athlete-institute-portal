-- Tournament rosters are uploaded as names, not registered accounts. Until
-- now the upload discarded every player field and Compete rendered each row
-- as "Team member". Roster rows without a registration carry their own
-- display fields; Compete masks them under the same division rules.
alter table public.team_members
  add column if not exists display_first text,
  add column if not exists display_last  text,
  add column if not exists jersey_size   text,
  add column if not exists skill         smallint check (skill is null or skill between 1 and 5);

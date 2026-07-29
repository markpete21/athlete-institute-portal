-- ============================================================================
-- Compete. Portal - the PUBLIC competitive site (compete.athleteinstitute.ca).
-- Two per-division controls:
--   show_on_compete  : does this division appear publicly at all
--   show_full_names  : full "Ava Peterson" vs masked "Ava P." on public rosters
-- Defaults by program type (Mark's rule):
--   league, clinic          -> full names ON
--   tournament, club (rep)  -> masked, staff toggle up per division
--   academy                 -> never appears on the competitive portal
-- run-migration.mjs. Idempotent.
-- ============================================================================

alter table public.divisions add column if not exists show_on_compete boolean not null default true;
alter table public.divisions add column if not exists show_full_names boolean not null default false;

-- One-time backfill of the type-based default for divisions that already exist.
-- (There is no way to tell "never edited" from here: divisions.updated_at is
-- NOT NULL DEFAULT now() with an update trigger, so it is never null. Going
-- forward, createDivision() applies the same rule at insert time, which is the
-- right place for it.)
-- NOTE: there is no 'tournament' program type. Module 9 models a tournament as
-- a program with tournament_mode set, so it must be excluded explicitly here.
update public.divisions d
   set show_full_names = true
  from public.programs p
  join public.program_types t on t.id = p.program_type_id
 where d.program_id = p.id
   and t.key in ('league', 'clinic')
   and p.tournament_mode is null;

-- Academy divisions never appear publicly (spec: Academy teams are NOT on the
-- competitive portal). This one IS enforced on every run, by design.
update public.divisions d
   set show_on_compete = false
  from public.programs p
  join public.program_types t on t.id = p.program_type_id
 where d.program_id = p.id
   and t.key = 'academy';

-- Per-family suppression: a parent (or staff) can hide one athlete from every
-- public roster regardless of the division toggle. Always wins.
alter table public.family_members add column if not exists hide_from_public_rosters boolean not null default false;

create index if not exists divisions_compete_idx on public.divisions (show_on_compete) where show_on_compete;

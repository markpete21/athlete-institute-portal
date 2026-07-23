-- ============================================================================
-- Migration 0004 — Module 1 Stage 5: Playbook import (staged, reviewable)
-- Paste into the Supabase SQL Editor and RUN. Idempotent — safe to re-run.
--
-- The import is a JOB with staged ROWS: upload parses into import_rows
-- (dry-run — nothing touches real tables), duplicates are grouped for admin
-- review (merge / keep-separate), and only COMMIT materializes families,
-- family_members and unclaimed profiles. Unclaimed profiles carry a
-- placeholder clerk_user_id ('unclaimed:<token>') until the person signs in
-- with a matching email and the profile is adopted (claim flow).
-- ============================================================================

create table if not exists public.import_jobs (
  id           bigint generated always as identity primary key,
  filename     text not null,
  status       text not null default 'staged'
                 check (status in ('staged','committed','abandoned')),
  row_count    integer not null default 0,
  dupe_groups  integer not null default 0,
  committed_families integer,
  committed_members  integer,
  committed_profiles integer,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists import_jobs_updated_at on public.import_jobs;
create trigger import_jobs_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

alter table public.import_jobs enable row level security;

create table if not exists public.import_rows (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.import_jobs (id) on delete cascade,
  row_num     integer not null,
  raw         jsonb not null,
  first_name  text,
  last_name   text,
  email       text,                              -- normalized (lowercase) or null
  phone       text,
  address     text,
  city        text,
  postal      text,
  dob         date,
  household_key text,                            -- from CSV or derived (address+last name)
  dupe_group  integer,                           -- rows sharing a group are suspected duplicates
  resolution  text not null default 'new'
                check (resolution in ('new','merge','skip')),
  merge_into  bigint references public.import_rows (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.import_rows enable row level security;

create index if not exists import_rows_job_idx   on public.import_rows (job_id, row_num);
create index if not exists import_rows_group_idx on public.import_rows (job_id, dupe_group);

-- Unclaimed-profile claim support: a token the claim email carries, and
-- adoption metadata. (clerk_user_id holds 'unclaimed:<token>' until claimed.)
alter table public.profiles add column if not exists claim_token text unique;
alter table public.profiles add column if not exists claimed_at timestamptz;
alter table public.profiles add column if not exists imported_from text;  -- 'playbook:<job_id>'

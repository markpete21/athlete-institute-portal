-- Migration 0055 - Seasons manager (slice 3 of the compete redesign).
-- Seasons become DATA instead of free-text: one row per season, dates drive
-- status (upcoming/active/ended) in the UI, archiving hides a season from
-- new-program forms without touching history. programs.season_key keeps its
-- meaning and now points at seasons.key; existing distinct keys are
-- backfilled so nothing orphans.

create table if not exists public.seasons (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  name       text not null,
  starts_on  date,
  ends_on    date,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists seasons_updated_at on public.seasons;
create trigger seasons_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

alter table public.seasons enable row level security;

-- Canonical thirds-of-year seasons used across the portal since Module 0.
insert into public.seasons (key, name, starts_on, ends_on)
values
  ('2026:jan-apr', 'Winter 2026', '2026-01-01', '2026-04-30'),
  ('2026:may-aug', 'Summer 2026', '2026-05-01', '2026-08-31'),
  ('2026:sep-dec', 'Fall 2026',   '2026-09-01', '2026-12-31'),
  ('2027:jan-apr', 'Winter 2027', '2027-01-01', '2027-04-30')
on conflict (key) do nothing;

-- Backfill: any season key already used by a program stays selectable even if
-- it never matched the canonical pattern (name falls back to the key).
insert into public.seasons (key, name)
select distinct p.season_key, p.season_key
from public.programs p
where p.season_key is not null
  and p.season_key <> ''
  and not exists (select 1 from public.seasons s where s.key = p.season_key);

-- Migration 0057 - Standalone Compete events + per-location display (slices
-- 5-6). A standalone event is a program that exists ONLY for Compete: hosted
-- or outside-organization leagues/tournaments with teams, schedules and
-- scores managed in admin, and NO Play registration, rosters or payments
-- behind it. Reusing the programs spine keeps every downstream system
-- (divisions, games, standings, stats, branding, sponsors) working unchanged;
-- Play surfaces simply exclude compete_only rows.

alter table public.programs add column if not exists compete_only boolean not null default false;

-- Per-location Compete display settings (keyed to the Facilities locations
-- table - Compete "locations" are the same concept, not a parallel one).
-- layout_mode: auto = simple under 8 published divisions, else full.
create table if not exists public.compete_location_settings (
  location_id bigint primary key references public.locations (id) on delete cascade,
  layout_mode text not null default 'auto' check (layout_mode in ('auto', 'full', 'simple')),
  welcome     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists compete_location_settings_updated_at on public.compete_location_settings;
create trigger compete_location_settings_updated_at
  before update on public.compete_location_settings
  for each row execute function public.set_updated_at();

alter table public.compete_location_settings enable row level security;

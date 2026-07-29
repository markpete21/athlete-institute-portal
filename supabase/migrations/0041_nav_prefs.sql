-- ============================================================================
-- Admin navigation preferences: per-user favourite modules + pinned programs
-- for the persistent AdminShell. run-migration.mjs. Idempotent.
-- ============================================================================

create table if not exists public.admin_nav_prefs (
  profile_id   bigint primary key references public.profiles (id) on delete cascade,
  favourites   text[]  not null default '{programs,schedule,comms,reports}',
  pinned_programs bigint[] not null default '{}',
  rail_minimized boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.admin_nav_prefs enable row level security;

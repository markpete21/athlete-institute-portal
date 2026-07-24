-- ============================================================================
-- Migration 0025 - Module 7: Leagues (registration front-end)
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- Leagues extend programs (Module 4) + divisions/teams (Module 6). This adds
-- league config (pricing model, enabled paths), captain teams + join links,
-- and small-group registration intent.
-- ============================================================================

-- Per-league config on the program (a "league" is a program of type league).
alter table public.programs add column if not exists league_pricing text not null default 'player'
  check (league_pricing in ('player','team','both'));
alter table public.programs add column if not exists team_rate_cents integer not null default 0 check (team_rate_cents >= 0);
alter table public.programs add column if not exists league_paths jsonb not null default '["captain","member","small_group","free_agent"]'::jsonb;

-- Captain-created teams get a shareable join link + expiry/close.
alter table public.teams add column if not exists join_token text unique;
alter table public.teams add column if not exists captain_registration_id bigint references public.registrations (id) on delete set null;
alter table public.teams add column if not exists join_expires_at timestamptz;

-- A registration's chosen path + small-group intent.
alter table public.registrations add column if not exists league_path text
  check (league_path in ('captain','member','small_group','free_agent'));
alter table public.registrations add column if not exists group_key text;
alter table public.registrations add column if not exists group_member_names jsonb;  -- small-group typed names
alter table public.registrations add column if not exists team_id bigint references public.teams (id) on delete set null;

-- Superstat connection for site-run leagues (owner, Nov 12 2026). One
-- league-owned Superstat club holds every Circuit team; a server-side key
-- (SUPERSTAT_API_KEY) reads it. This migration adds:
--   - which Superstat team is which Circuit team (per division)
--   - per game: the linked Superstat match, its status, last sync, and
--     stats_published (default false) so stats can be loaded and checked
--     privately; the public Full stats button and page need it true
--   - play-by-play events (timestamps and shot positions; for the paid
--     play-by-play and shot chart later)
--   - written team insights per game (paid later)
-- Server-only access (RLS on, no policies). Needs 0106. Run BEFORE deploying.
create table if not exists public.site_league_superstat_teams (
  id                bigserial primary key,
  brand_key         text not null references public.brands (key) on delete cascade,
  league_slug       text not null default 'circuit',
  team              text not null,            -- name as in site_league_games
  division          text not null default '',
  superstat_team_id text not null,
  superstat_name    text,
  created_at        timestamptz not null default now(),
  unique (brand_key, league_slug, team, division)
);
alter table public.site_league_superstat_teams enable row level security;

alter table public.site_league_games add column if not exists superstat_match_id text;
alter table public.site_league_games add column if not exists superstat_status text;
alter table public.site_league_games add column if not exists superstat_synced_at timestamptz;
alter table public.site_league_games add column if not exists stats_published boolean not null default false;
create index if not exists site_league_games_superstat_idx on public.site_league_games (superstat_match_id) where superstat_match_id is not null;

create table if not exists public.site_league_events (
  id             bigserial primary key,
  brand_key      text not null references public.brands (key) on delete cascade,
  league_slug    text not null default 'circuit',
  game_id        bigint not null references public.site_league_games (id) on delete cascade,
  seq            integer not null,
  type           text not null,
  success        boolean,
  team           text not null,
  number         text,
  name           text,
  period_number  integer,
  period_type    text,
  period_seconds numeric,
  match_seconds  numeric,
  x              numeric,                    -- 0 = left baseline, 1 = right baseline (FIBA court, not rotated)
  y              numeric,                    -- 0 = top sideline, 1 = bottom sideline
  custom_name    text,
  created_at     timestamptz not null default now()
);
create index if not exists site_league_events_game_idx on public.site_league_events (game_id, seq);
alter table public.site_league_events enable row level security;

create table if not exists public.site_league_insights (
  id           bigserial primary key,
  brand_key    text not null references public.brands (key) on delete cascade,
  league_slug  text not null default 'circuit',
  game_id      bigint not null references public.site_league_games (id) on delete cascade,
  team         text not null,                -- the side Superstat wrote them for (the uploader)
  status       text not null,
  payload      jsonb not null default '{}',
  generated_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (game_id, team)
);
alter table public.site_league_insights enable row level security;

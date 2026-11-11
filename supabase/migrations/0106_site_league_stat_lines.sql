-- Full stats for site-run league games (owner, Nov 11 2026): one row per
-- player per game, plus an optional TEAM totals row per team (is_total).
-- The core columns (pts, reb, ast) match the Compete portal's
-- game_stat_lines, so a season moves into Compete row for row; the rest are
-- the extra box-score columns a stat sheet (e.g. Superstat) exports.
-- Uploaded in the site editor (Circuit tab > a game > Full stats). The
-- public Full stats button appears only once a game has rows here.
-- Server-only access (RLS on, no policies). Run BEFORE deploying the code.
create table if not exists public.site_league_stat_lines (
  id          bigserial primary key,
  brand_key   text not null references public.brands (key) on delete cascade,
  league_slug text not null default 'circuit',
  game_id     bigint not null references public.site_league_games (id) on delete cascade,
  division    text not null default '',
  team        text not null,                 -- name as in site_league_games
  is_total    boolean not null default false,
  player_id   bigint references public.site_league_players (id) on delete set null,
  number      text,
  name        text,
  pts         integer not null default 0 check (pts >= 0),
  reb         integer not null default 0 check (reb >= 0),
  ast         integer not null default 0 check (ast >= 0),
  stl integer, blk integer, tov integer, oreb integer,
  fgm integer, fga integer, tpm integer, tpa integer, ftm integer, fta integer,
  min         text,
  sort_order  integer not null default 100,
  source      text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists site_league_stat_lines_game_idx on public.site_league_stat_lines (brand_key, league_slug, game_id);
alter table public.site_league_stat_lines enable row level security;

-- 0109: per-game jersey fixes for site-run league stats.
-- The season roster stays the default (jersey number → player). A row here
-- says that in ONE game, on one team, the jersey tagged as `worn` was really
-- the player shown as `as_number` / `as_name` (jerseys change, numbers get
-- misread), or that the line is not a player at all (`hidden`).
-- Applied when stats are read, so it survives every re-sync. Idempotent.
create table if not exists public.site_league_game_jerseys (
  id          bigint generated always as identity primary key,
  brand_key   text not null,
  league_slug text not null,
  game_id     bigint not null references public.site_league_games (id) on delete cascade,
  team        text not null,
  worn        text not null,
  as_number   text,
  as_name     text,
  hidden      boolean not null default false,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (game_id, team, worn)
);
create index if not exists site_league_game_jerseys_league_idx on public.site_league_game_jerseys (brand_key, league_slug);
alter table public.site_league_game_jerseys enable row level security;

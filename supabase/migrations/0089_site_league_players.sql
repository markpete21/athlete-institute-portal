-- Circuit rosters (owner, Nov 2 2026): players per team per division,
-- entered in the site editor (League > Rosters). Shown on the Circuit page
-- (#rosters, full names: owner confirmed guardian permission for every
-- player) and used to pick top scorers after games. Server-only access
-- (RLS on, no policies). Run BEFORE deploying the code that reads it.
create table if not exists public.site_league_players (
  id          bigserial primary key,
  brand_key   text not null references public.brands (key) on delete cascade,
  league_slug text not null default 'circuit',
  team        text not null,               -- site_league_teams.name / the name in site_league_games
  division    text not null default '',     -- e.g. U13 Boys
  number      text,                          -- jersey number, as printed
  name        text not null,
  sort_order  integer not null default 100,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists site_league_players_idx on public.site_league_players (brand_key, league_slug, division, team);
alter table public.site_league_players enable row level security;

-- Site-run leagues (owner decision, Oct 30 2026): the ALL CAN Circuit's
-- schedule, results and standings are entered on the website for now, not
-- through the Compete portal. One table of games; standings are computed
-- from final scores per division. Editor: <site>/admin/league.
create table if not exists public.site_league_games (
  id          bigserial primary key,
  brand_key   text not null references public.brands (key) on delete cascade,
  league_slug text not null default 'circuit',   -- site_programs.slug of the league
  division    text not null default '',          -- e.g. U13 Boys; blank = one division
  starts_at   timestamptz,
  venue       text,
  home        text not null,
  away        text not null,
  home_score  integer,
  away_score  integer,
  status      text not null default 'scheduled' check (status in ('scheduled','final','postponed')),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists site_league_games_idx on public.site_league_games (brand_key, league_slug, starts_at);

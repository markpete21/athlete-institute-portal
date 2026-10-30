-- Teams in a site-run league: a logo and short name per team name as it
-- appears in site_league_games. Seeds the two ALL CAN Circuit logos supplied
-- Oct 30 2026 (files in /public/sites/all-can/teams). Idempotent.
create table if not exists public.site_league_teams (
  id          bigserial primary key,
  brand_key   text not null references public.brands (key) on delete cascade,
  league_slug text not null default 'circuit',
  name        text not null,
  short_name  text,
  city        text,
  logo_url    text,
  created_at  timestamptz not null default now(),
  unique (brand_key, league_slug, name)
);
insert into public.site_league_teams (brand_key, league_slug, name, short_name, city, logo_url)
values
  ('all-can','circuit','Orangeville Bears','Bears','Orangeville','/sites/all-can/teams/orangeville-bears.png'),
  ('all-can','circuit','Woodbridge Lions','Lions','Woodbridge','/sites/all-can/teams/woodbridge-lions.png'),
  ('all-can','circuit','Motion Kings','Kings',null,null),
  ('all-can','circuit','Nexus Wolves','Wolves',null,null),
  ('all-can','circuit','David Ann Academy','David Ann',null,null)
on conflict (brand_key, league_slug, name) do update set logo_url = coalesce(excluded.logo_url, public.site_league_teams.logo_url), short_name = coalesce(public.site_league_teams.short_name, excluded.short_name);

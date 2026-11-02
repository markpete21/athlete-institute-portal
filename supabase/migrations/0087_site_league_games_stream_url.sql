-- Live stream link per Circuit game (owner, Nov 2 2026): shown on the schedule
-- in place of "Upcoming" ("Watch live", "Live now" during the game). Set one
-- link for every upcoming game in the editor (League > Live stream) or per
-- game. Additive; run BEFORE deploying the code that selects it.
alter table public.site_league_games add column if not exists stream_url text;
comment on column public.site_league_games.stream_url is 'Live stream page for this game; shown in place of Upcoming on the schedule.';

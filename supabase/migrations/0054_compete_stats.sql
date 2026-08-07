-- Migration 0054 - Compete stats platform (slice 2 of the compete redesign).
-- Per-division stats, DEFAULT OFF; staff flip stats_enabled and choose which
-- boards the public pages show. Stat lines key on team_members so identity
-- flows registration -> family_member and a profile-name edit propagates to
-- every historical game log (one source of truth, no snapshots).

alter table public.divisions add column if not exists stats_enabled boolean not null default false;
alter table public.divisions add column if not exists stats_show jsonb not null default '{"averages":true,"leaders":true,"team":true}'::jsonb;

create table if not exists public.game_stat_lines (
  id             bigint generated always as identity primary key,
  game_id        bigint not null references public.games (id) on delete cascade,
  division_id    bigint not null references public.divisions (id) on delete cascade,
  team_id        bigint references public.teams (id) on delete set null,
  team_member_id bigint not null references public.team_members (id) on delete cascade,
  pts            integer not null default 0 check (pts >= 0),
  reb            integer not null default 0 check (reb >= 0),
  ast            integer not null default 0 check (ast >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_id, team_member_id)
);

drop trigger if exists game_stat_lines_updated_at on public.game_stat_lines;
create trigger game_stat_lines_updated_at
  before update on public.game_stat_lines
  for each row execute function public.set_updated_at();

alter table public.game_stat_lines enable row level security;

create index if not exists game_stat_lines_division_idx on public.game_stat_lines (division_id);
create index if not exists game_stat_lines_game_idx on public.game_stat_lines (game_id);
create index if not exists game_stat_lines_member_idx on public.game_stat_lines (team_member_id);

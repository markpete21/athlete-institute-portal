-- ============================================================================
-- Migration 0024 - Module 6: Competitive Play (divisions, teams, rosters, games)
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- Brand->Sport->Type->Season->Division->Teams->Rosters. Brand/Sport/Season/Type
-- live on programs (Module 4); divisions belong to a program, teams to a
-- division, roster rows link to Module 4 registrations. Games book via Module 2.
-- ============================================================================

create table if not exists public.divisions (
  id            bigint generated always as identity primary key,
  program_id    bigint not null references public.programs (id) on delete cascade,
  name          text not null,
  sport         text not null default 'other' check (sport in ('basketball','volleyball','other')),
  max_teams     integer,
  min_players   integer,
  max_players   integer,
  tiebreaks     jsonb not null default '[]'::jsonb,  -- ordered criteria; defaults by sport
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists divisions_updated_at on public.divisions;
create trigger divisions_updated_at before update on public.divisions for each row execute function public.set_updated_at();
alter table public.divisions enable row level security;
create index if not exists divisions_program_idx on public.divisions (program_id);

create table if not exists public.teams (
  id            bigint generated always as identity primary key,
  division_id   bigint not null references public.divisions (id) on delete cascade,
  name          text not null,
  coach_staff_id bigint references public.staff (id) on delete set null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams for each row execute function public.set_updated_at();
alter table public.teams enable row level security;
create index if not exists teams_division_idx on public.teams (division_id);

create table if not exists public.team_members (
  id              bigint generated always as identity primary key,
  team_id         bigint references public.teams (id) on delete set null,
  division_id     bigint not null references public.divisions (id) on delete cascade,
  registration_id bigint references public.registrations (id) on delete set null,
  locked          boolean not null default false,   -- pinned before the draft
  group_key       text,                             -- small-group togetherness
  created_at      timestamptz not null default now()
);
alter table public.team_members enable row level security;
create index if not exists team_members_division_idx on public.team_members (division_id);
create index if not exists team_members_team_idx on public.team_members (team_id);

create table if not exists public.games (
  id            bigint generated always as identity primary key,
  division_id   bigint not null references public.divisions (id) on delete cascade,
  round         integer,
  home_team_id  bigint references public.teams (id) on delete set null,
  away_team_id  bigint references public.teams (id) on delete set null,
  booking_id    bigint references public.bookings (id) on delete set null,
  starts_at     timestamptz,
  ends_at       timestamptz,
  court         integer,
  status        text not null default 'scheduled' check (status in ('scheduled','final')),
  home_score    integer,
  away_score    integer,
  overtime      boolean not null default false,
  live_stream_ref text,                             -- recorded stream link (live app)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists games_updated_at on public.games;
create trigger games_updated_at before update on public.games for each row execute function public.set_updated_at();
alter table public.games enable row level security;
create index if not exists games_division_idx on public.games (division_id, starts_at);

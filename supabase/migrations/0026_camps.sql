-- ============================================================================
-- Migration 0026 - Module 8: Camps (weeks + variations + check-in/out)
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- A camp is a program (type camp). Camp WEEKS/variations are sub-offerings
-- (own dates/hours/capacity/roster). Check-in/out tracks authorized pickups.
-- Deposit + proration already in Module 4 (20%/$500). Optional M6 rostering.
-- ============================================================================

create table if not exists public.camp_weeks (
  id            bigint generated always as identity primary key,
  program_id    bigint not null references public.programs (id) on delete cascade,
  name          text not null,                    -- "Week 1 - Boys 10-12"
  start_date    date not null,
  end_date      date not null,
  daily_start   text,                             -- 'HH:MM'
  daily_end     text,
  overnight     boolean not null default false,
  gender_band   text,                             -- 'boys' | 'girls' | null
  age_min       integer,
  age_max       integer,
  capacity      integer,
  price_cents   integer not null default 0 check (price_cents >= 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists camp_weeks_updated_at on public.camp_weeks;
create trigger camp_weeks_updated_at before update on public.camp_weeks for each row execute function public.set_updated_at();
alter table public.camp_weeks enable row level security;
create index if not exists camp_weeks_program_idx on public.camp_weeks (program_id, sort_order);

-- Registrations pick a specific week.
alter table public.registrations add column if not exists camp_week_id bigint references public.camp_weeks (id) on delete set null;
alter table public.registrations add column if not exists friend_request text;   -- "group my child with ___"

create table if not exists public.camp_checkins (
  id              bigint generated always as identity primary key,
  registration_id bigint not null references public.registrations (id) on delete cascade,
  camp_week_id    bigint references public.camp_weeks (id) on delete set null,
  day             date not null,
  checked_in_at   timestamptz,
  checked_out_at  timestamptz,
  authorized_pickup text,                          -- who picked up
  staff_clerk_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (registration_id, day)
);
drop trigger if exists camp_checkins_updated_at on public.camp_checkins;
create trigger camp_checkins_updated_at before update on public.camp_checkins for each row execute function public.set_updated_at();
alter table public.camp_checkins enable row level security;
create index if not exists camp_checkins_week_day_idx on public.camp_checkins (camp_week_id, day);

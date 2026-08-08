-- 0058_division_ops.sql
-- Division operations: coach confirmations, game officials, media day.
--
-- Consumed by lib/competitive/{coachConfirmations,officials,mediaDay}.ts and
-- the admin division page. Coach confirm links are PUBLIC token pages
-- (app/play/coach-confirm/[token]) - the token is the credential, same model
-- as rental quote signing. Officials are a small pool (not necessarily staff
-- accounts); the optional staff link is what powers the coach-conflict rule:
-- an official never works a game whose team they coach.

-- Custom questions asked on the coach confirmation form (array of labels).
alter table public.divisions add column if not exists coach_questions jsonb not null default '[]'::jsonb;

-- One confirmation per team; re-assigning the coach deletes the row so a
-- stale confirmation can never carry over to a different person.
create table if not exists public.coach_confirmations (
  id bigint generated always as identity primary key,
  division_id bigint not null references public.divisions(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  staff_id bigint not null references public.staff(id) on delete cascade,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','confirmed','declined')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb,
  note text,
  sent_at timestamptz,
  reminder_sent_at timestamptz,
  responded_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id)
);
alter table public.coach_confirmations enable row level security;
drop trigger if exists coach_confirmations_updated_at on public.coach_confirmations;
create trigger coach_confirmations_updated_at before update on public.coach_confirmations
  for each row execute function public.set_updated_at();
create index if not exists coach_confirmations_division_idx on public.coach_confirmations (division_id);

-- Officials pool (referees / scorekeepers). Availability is a simple daily
-- window + a per-day cap; per-date exceptions can reuse staff_unavailability
-- later if officials get linked staff rows.
create table if not exists public.officials (
  id bigint generated always as identity primary key,
  staff_id bigint references public.staff(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  avail_start time,
  avail_end time,
  max_per_day integer not null default 4 check (max_per_day between 1 and 12),
  pay_cents integer not null default 3500 check (pay_cents >= 0),
  active boolean not null default true,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.officials enable row level security;
drop trigger if exists officials_updated_at on public.officials;
create trigger officials_updated_at before update on public.officials
  for each row execute function public.set_updated_at();

create table if not exists public.game_officials (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  official_id bigint not null references public.officials(id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (game_id, official_id)
);
alter table public.game_officials enable row level security;
create index if not exists game_officials_game_idx on public.game_officials (game_id);
create index if not exists game_officials_official_idx on public.game_officials (official_id);

-- Media day: one planned photo day per division. Windows are a computed
-- snapshot (per-team arrive/photo/portrait times sized from the real roster
-- and family photo consent); replanning replaces the windows and rebooks the
-- facility hold through the Module 2 engine.
create table if not exists public.media_days (
  id bigint generated always as identity primary key,
  division_id bigint not null references public.divisions(id) on delete cascade,
  facility_id bigint not null references public.facilities(id) on delete restrict,
  booking_id bigint references public.bookings(id) on delete set null,
  day date not null,
  start_hhmm text not null,
  team_photo_minutes integer not null default 10 check (team_photo_minutes between 1 and 60),
  portrait_minutes integer not null default 2 check (portrait_minutes between 1 and 30),
  buffer_minutes integer not null default 10 check (buffer_minutes between 0 and 60),
  include_portraits boolean not null default true,
  include_coach boolean not null default true,
  windows jsonb not null default '[]'::jsonb,
  notified_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id)
);
alter table public.media_days enable row level security;
drop trigger if exists media_days_updated_at on public.media_days;
create trigger media_days_updated_at before update on public.media_days
  for each row execute function public.set_updated_at();

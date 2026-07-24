-- ============================================================================
-- Module 10: General Programs (drop-in sessions) + program tags + reschedule
-- Applied via scripts/run-migration.mjs. Idempotent.
-- ============================================================================

-- Drop-in: bookable dated sessions with per-session capacity.
create table if not exists public.dropin_sessions (
  id           bigint generated always as identity primary key,
  program_id   bigint not null references public.programs (id) on delete cascade,
  session_date date not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  booking_id   bigint references public.bookings (id) on delete set null,
  capacity     integer,
  price_cents  integer not null default 0 check (price_cents >= 0),
  created_at   timestamptz not null default now()
);
alter table public.dropin_sessions enable row level security;
create index if not exists dropin_sessions_program_idx on public.dropin_sessions (program_id, session_date);

-- Sessions a registration has purchased (accumulate under ONE registration).
create table if not exists public.dropin_purchases (
  id              bigint generated always as identity primary key,
  registration_id bigint not null references public.registrations (id) on delete cascade,
  session_id      bigint not null references public.dropin_sessions (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (registration_id, session_id)
);
alter table public.dropin_purchases enable row level security;
create index if not exists dropin_purchases_session_idx on public.dropin_purchases (session_id);

-- Program option tags (Player ID, Coaching Clinic) - naming/reporting only.
alter table public.programs add column if not exists tags jsonb not null default '[]'::jsonb;

-- Distinct drop-in program type (multi-select dated sessions, pay per session).
-- Clinic + Pickup already exist; drop-in is the one structurally-different flow.
insert into public.program_types (key, name, default_category, default_proration, sort_order) values
  ('dropin', 'Drop-In', 'Youth Sports', 'dropin', 8)
on conflict (key) do nothing;

-- Session postponed/TBD marker for the reschedule workflow.
alter table public.program_sessions add column if not exists postponed boolean not null default false;
alter table public.dropin_sessions add column if not exists postponed boolean not null default false;

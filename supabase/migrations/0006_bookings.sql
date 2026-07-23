-- ============================================================================
-- Migration 0006 - Module 2 Stage 2: the master bookings table + hours
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
-- (ASCII only - the clipboard route mangles fancy characters.)
--
-- ONE table for every booking on the platform (rentals, programs, events,
-- internal). Conflicts are COMPUTED, not prevented by constraints: colliding
-- rows may coexist deliberately (operator "keep both", Stage 3), so no
-- exclusion constraint - the tree-aware engine + conflicts queue owns this.
-- Buffers (setup/cleanup minutes) extend a booking's occupied interval for
-- conflict purposes only; the displayed time stays starts_at..ends_at.
-- ============================================================================

create table if not exists public.bookings (
  id            bigint generated always as identity primary key,
  facility_id   bigint not null references public.facilities (id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  source        text not null check (source in ('rental','program','event','internal')),
  status        text not null default 'confirmed' check (status in ('tentative','confirmed')),
  is_internal   boolean not null default false,
  title         text not null,
  logo_url      text,                            -- event logo (storage path or URL)
  show_on_public_schedule boolean not null default false,
  source_ref    text,                            -- e.g. 'rental:123' | 'program:45'
  setup_minutes   integer not null default 0 check (setup_minutes >= 0 and setup_minutes <= 480),
  cleanup_minutes integer not null default 0 check (cleanup_minutes >= 0 and cleanup_minutes <= 480),
  series_id     bigint,                          -- recurrence series (Stage 4)
  canceled_at   timestamptz,                     -- soft cancel; engine ignores
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.bookings enable row level security;

create index if not exists bookings_facility_time_idx
  on public.bookings (facility_id, starts_at, ends_at) where canceled_at is null;
create index if not exists bookings_time_idx
  on public.bookings (starts_at, ends_at) where canceled_at is null;
create index if not exists bookings_series_idx on public.bookings (series_id);

-- Per-facility operating-hours override (Toronto local). Null = inherit from
-- the nearest ancestor override, else the global default 08:00-23:00.
alter table public.facilities add column if not exists hours_open  time;
alter table public.facilities add column if not exists hours_close time;

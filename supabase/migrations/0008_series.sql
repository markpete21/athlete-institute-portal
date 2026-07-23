-- ============================================================================
-- Migration 0008 - Module 2 Stage 4: recurring booking series
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- A series is the pattern + template; every generated occurrence is its own
-- bookings row pointing back via bookings.series_id (added in 0006). That is
-- what makes single-date conflict resolution natural: cancel/edit one row,
-- the series stays intact.
-- ============================================================================

create table if not exists public.booking_series (
  id          bigint generated always as identity primary key,
  pattern     jsonb not null,         -- { freq:'weekly', byWeekday:[2], interval:1 }
  start_date  date not null,
  start_time  text not null,          -- 'HH:MM' Toronto wall time
  end_time    text not null,
  until_date  date,
  occurrence_count integer,
  facility_id bigint not null references public.facilities (id) on delete restrict,
  title       text not null,
  source      text not null check (source in ('rental','program','event','internal')),
  created_by  text not null,
  created_at  timestamptz not null default now()
);

alter table public.booking_series enable row level security;

-- bookings.series_id gains its FK now that the table exists.
do $$ begin
  alter table public.bookings
    add constraint bookings_series_fk
    foreign key (series_id) references public.booking_series (id) on delete set null;
exception when duplicate_object then null; end $$;

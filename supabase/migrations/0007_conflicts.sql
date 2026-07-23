-- ============================================================================
-- Migration 0007 - Module 2 Stage 3: conflict acknowledgements (keep-both)
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- Conflicts themselves are COMPUTED from overlapping bookings (no conflict
-- table to drift). What we store is the operator's explicit "keep both"
-- decision: it removes the pair from the conflicts queue and schedules an
-- email reminder so the unresolved double-booking is not forgotten (spec).
-- Pairs are stored ordered (booking_a < booking_b) so each pair is unique.
-- ============================================================================

create table if not exists public.booking_conflict_acks (
  id              bigint generated always as identity primary key,
  booking_a       bigint not null references public.bookings (id) on delete cascade,
  booking_b       bigint not null references public.bookings (id) on delete cascade,
  acknowledged_by text not null,                 -- Clerk user id
  note            text,
  reminder_at     timestamptz not null,          -- when to nag about the double-booking
  reminded_at     timestamptz,                   -- set once the reminder email went out
  created_at      timestamptz not null default now(),
  check (booking_a < booking_b),
  unique (booking_a, booking_b)
);

alter table public.booking_conflict_acks enable row level security;

create index if not exists conflict_acks_due_idx
  on public.booking_conflict_acks (reminder_at) where reminded_at is null;

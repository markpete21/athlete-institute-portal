-- ============================================================================
-- Migration 0011 - Module 2 Stage 7: family linkage on bookings
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- The personal "family schedule" hook: bookings that belong to a household
-- (a family's rental, a registered program session) carry family_id so the
-- signed-in family sees them on play. Rentals (M3) and Programs (M4) set it
-- when they create bookings through the lib/bookings API.
-- ============================================================================

alter table public.bookings
  add column if not exists family_id bigint references public.families (id) on delete set null;

create index if not exists bookings_family_idx
  on public.bookings (family_id) where family_id is not null and canceled_at is null;

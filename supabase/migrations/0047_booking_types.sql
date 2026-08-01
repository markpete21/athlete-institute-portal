-- ============================================================================
-- Migration 0047 - widen rentals.booking_type for the booking wizard.
-- The original check allowed only camp/event/tournament/league/clinic/other;
-- the wizard books internal practices, games, open gym, maintenance blocks
-- and more. Union of the internal + rental type lists. Idempotent.
-- ============================================================================

alter table public.rentals drop constraint if exists rentals_booking_type_check;

alter table public.rentals add constraint rentals_booking_type_check
  check (booking_type is null or booking_type in (
    'practice','program','training','game','tournament','event','camp',
    'clinic','open gym','tryouts','showcase','meeting','maintenance','media',
    'league','birthday party','corporate','school','other'
  ));

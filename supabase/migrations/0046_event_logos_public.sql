-- ============================================================================
-- Migration 0046 - Make the event-logos bucket public.
-- Idempotent - safe to re-run. ASCII only.
--
-- WHY:
--   bookings.logo_url is rendered by the TV display boards at
--   /display/<token>, which are unauthenticated URLs left running on a screen
--   for weeks at a time. The bucket was created private alongside the other
--   media buckets, so any logo uploaded there could only be served through a
--   signed URL - which expires, leaving a broken image on the board partway
--   through the day.
--
--   Event logos are club/tournament crests shown publicly on a wall-mounted
--   screen by design, so there is nothing private to protect here. The
--   children's photo bucket (member-photos) is deliberately NOT touched.
--
--   ensureBuckets() in packages/foundation/src/storage.ts now reconciles this
--   flag too, so a fresh environment gets it right without this migration.
-- ============================================================================

update storage.buckets
   set public = true
 where id = 'event-logos'
   and public is distinct from true;

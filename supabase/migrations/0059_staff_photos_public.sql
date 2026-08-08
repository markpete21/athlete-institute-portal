-- ============================================================================
-- Migration 0059 - Make the staff-photos bucket public.
-- Idempotent - safe to re-run. ASCII only.
--
-- WHY:
--   Staff photos render on PUBLIC program registration pages and "our
--   coaches" pages (StaffGrid) for anonymous visitors - the same situation
--   that flipped event-logos public in 0046. A signed URL would expire and
--   leave broken coach photos on public pages. Staff photos are of adults,
--   uploaded by admins, and meant for public display by design.
--   member-photos (children) is deliberately NOT touched.
--
--   ensureBuckets() in packages/foundation/src/storage.ts reconciles this
--   flag too, so a fresh environment gets it right without this migration.
-- ============================================================================

update storage.buckets
   set public = true
 where id = 'staff-photos'
   and public is distinct from true;

-- ============================================================================
-- Family-member photos for the Play Portal roster (parent-uploaded, or picked
-- from a gallery photo). Colour key is derived, not stored.
-- run-migration.mjs. Idempotent.
-- ============================================================================

alter table public.family_members add column if not exists photo_url  text;
alter table public.family_members add column if not exists photo_path text;  -- member-photos bucket
-- Which gallery item the photo came from, when picked rather than uploaded.
alter table public.family_members add column if not exists photo_media_id bigint;

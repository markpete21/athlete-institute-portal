-- ============================================================================
-- Migration 0046 - saved schedule views get an explicit scope:
-- personal (default, visible only to the creator) or shared with all staff.
-- Existing rows keep working: they become shared, matching what staff already
-- saw (the page listed every view regardless of owner before this).
-- Idempotent - safe to re-run.
-- ============================================================================

alter table public.saved_schedule_views
  add column if not exists shared boolean not null default false;

-- Rows created before the scope existed were effectively shared - keep them so.
update public.saved_schedule_views
   set shared = true
 where shared = false
   and created_at < '2026-08-01';

create index if not exists saved_views_shared_idx
  on public.saved_schedule_views (shared, created_by);

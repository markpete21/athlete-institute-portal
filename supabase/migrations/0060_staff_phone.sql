-- ============================================================================
-- Migration 0060 - staff cell phone.
-- Idempotent - safe to re-run. ASCII only.
--
-- Coaches need a cell number on their staff record: they are reached on
-- game days, not by email. Plain text - formats vary (extensions, intl).
-- ============================================================================

alter table public.staff
  add column if not exists phone text;

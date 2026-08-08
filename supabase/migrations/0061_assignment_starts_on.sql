-- ============================================================================
-- Migration 0061 - staff_assignments.starts_on
-- Idempotent - safe to re-run. ASCII only.
--
-- An assignment needs to know when ITS coach started: a replacement hired
-- mid-program is not owed for the sessions before the handoff, and the new
-- rate editor counts "sessions worked so far" per assignment. Null means
-- "since the program began" (all pre-existing rows behave as before).
-- ============================================================================

alter table public.staff_assignments
  add column if not exists starts_on date;

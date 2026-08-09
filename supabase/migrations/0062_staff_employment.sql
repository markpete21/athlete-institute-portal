-- ============================================================================
-- Migration 0062 - staff employment classification.
-- Idempotent - safe to re-run. ASCII only.
--
-- Three kinds of staff, three pay paths:
--   employee   - paid through Wagepoint payroll
--   contractor - invoices / QuickBooks bills
--   volunteer  - NO pay (assignments must be $0)
-- Null = not classified yet (existing records; admin sets it on the record).
-- ============================================================================

alter table public.staff
  add column if not exists employment text
    check (employment is null or employment in ('employee','contractor','volunteer'));

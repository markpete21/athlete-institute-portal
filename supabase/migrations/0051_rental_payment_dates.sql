-- ============================================================================
-- Migration 0051 - the wizard's payment schedule persists on the rental.
-- deposit_due_date joins balance_due_date so a QUOTE carries its intended
-- schedule from day one; marking it booked later builds the installments from
-- these dates instead of re-deriving defaults. Idempotent.
-- ============================================================================

alter table public.rentals add column if not exists deposit_due_date date;

comment on column public.rentals.deposit_due_date is
  'Intended deposit due date (default: 5 business days from creation). Used when the quote is marked booked.';

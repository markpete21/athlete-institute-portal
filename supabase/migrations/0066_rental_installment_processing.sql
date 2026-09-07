-- Rentals cron idempotency: an installment with no Stripe customer used to be
-- re-invoiced (and ops re-emailed) every day because nothing recorded that
-- collection had already been kicked off. processed_at is stamped by
-- processInstallment; the cron skips rows that carry it.
alter table public.rental_installments add column if not exists processed_at timestamptz;
create index if not exists rental_installments_due_pending_idx
  on public.rental_installments (due_date) where status = 'pending';

-- Bookings are looked up by their owner (rental-block:<id>, program:<id>, …)
-- when the owner is cancelled or rescheduled.
create index if not exists bookings_source_ref_idx on public.bookings (source_ref) where source_ref is not null;

-- ============================================================================
-- Migration 0014 - Module 3 Stage 4: rental installments + payment fields
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
-- ============================================================================

alter table public.rentals add column if not exists stripe_customer_id text;
alter table public.rentals add column if not exists pad_agreed boolean not null default false;
alter table public.rentals add column if not exists booked_at timestamptz;
alter table public.rentals add column if not exists balance_due_date date;

create table if not exists public.rental_installments (
  id             bigint generated always as identity primary key,
  rental_id      bigint not null references public.rentals (id) on delete cascade,
  seq            integer not null,
  label          text not null,
  amount_cents   integer not null check (amount_cents >= 0),
  due_date       date not null,
  is_deposit     boolean not null default false,
  status         text not null default 'pending'
                   check (status in ('pending','paid','failed','waived')),
  stripe_payment_intent text,
  stripe_invoice_id     text,
  paid_at        timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (rental_id, seq)
);

drop trigger if exists rental_installments_updated_at on public.rental_installments;
create trigger rental_installments_updated_at
  before update on public.rental_installments
  for each row execute function public.set_updated_at();

alter table public.rental_installments enable row level security;

create index if not exists rental_installments_due_idx
  on public.rental_installments (due_date) where status = 'pending';
create index if not exists rental_installments_rental_idx
  on public.rental_installments (rental_id, seq);

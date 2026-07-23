-- ============================================================================
-- Migration 0013 - Module 3 Stage 2: rentals (quotes) + lines + add-ons
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- A rental is ONE agreement/quote spanning any number of date/time blocks.
-- Each line = one facility block; the line's tentative booking (created via
-- the Module 2 API) HOLDS the slot while the quote is out. Add-ons attach to
-- the whole quote or to a specific line (residence-room model). Totals are
-- cached on the rental and recomputed by lib/rentals/quotes.ts on mutation.
-- ============================================================================

create table if not exists public.rentals (
  id              bigint generated always as identity primary key,
  title           text not null,
  status          text not null default 'quote'
                    check (status in ('quote','deposit_due','balance_due','overdue','paid','cancelled')),
  is_internal     boolean not null default false,
  business_unit_id bigint references public.business_units (id) on delete set null,
  booking_type    text check (booking_type in ('camp','event','tournament','league','clinic','other')),
  booking_type_other text,
  profile_id      bigint references public.profiles (id) on delete set null,
  organization_id bigint references public.organizations (id) on delete set null,
  family_id       bigint references public.families (id) on delete set null,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  notes           text,
  deposit_pct     integer not null default 25 check (deposit_pct between 0 and 100),
  subtotal_cents  integer not null default 0,
  tax_cents       integer not null default 0,
  total_cents     integer not null default 0,
  deposit_cents   integer not null default 0,
  quote_token     text not null unique,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists rentals_updated_at on public.rentals;
create trigger rentals_updated_at
  before update on public.rentals
  for each row execute function public.set_updated_at();

alter table public.rentals enable row level security;

create index if not exists rentals_status_idx on public.rentals (status);

create table if not exists public.rental_lines (
  id             bigint generated always as identity primary key,
  rental_id      bigint not null references public.rentals (id) on delete cascade,
  facility_id    bigint not null references public.facilities (id) on delete restrict,
  facility_name  text not null,                 -- cached label for quotes/PDF
  rate_mode      text not null default 'hourly'
                   check (rate_mode in ('hourly','full_day','flat')),
  unit_rate_cents integer not null check (unit_rate_cents >= 0),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null check (ends_at > starts_at),
  line_total_cents integer not null default 0,
  booking_id     bigint references public.bookings (id) on delete set null,
  series_id      bigint references public.booking_series (id) on delete set null,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.rental_lines enable row level security;

create index if not exists rental_lines_rental_idx on public.rental_lines (rental_id, sort_order);

create table if not exists public.rental_line_addons (
  id             bigint generated always as identity primary key,
  rental_id      bigint not null references public.rentals (id) on delete cascade,
  line_id        bigint references public.rental_lines (id) on delete cascade,  -- null = whole-quote add-on
  addon_id       bigint references public.rental_addons_catalog (id) on delete set null,
  name           text not null,                 -- cached
  pricing_mode   text not null check (pricing_mode in ('flat','per_unit','per_hour')),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  qty            numeric not null default 1 check (qty > 0),
  total_cents    integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.rental_line_addons enable row level security;

create index if not exists rental_line_addons_rental_idx on public.rental_line_addons (rental_id);

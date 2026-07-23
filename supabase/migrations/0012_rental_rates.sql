-- ============================================================================
-- Migration 0012 - Module 3 Stage 1: rental rates, add-ons, business units
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
-- ============================================================================

-- Default rental rates per facility. A quote line picks a rate MODE (hourly is
-- primary; full-day / flat as alternates) and may override the amount.
create table if not exists public.facility_rates (
  facility_id    bigint primary key references public.facilities (id) on delete cascade,
  hourly_cents   integer check (hourly_cents   is null or hourly_cents   >= 0),
  full_day_cents integer check (full_day_cents is null or full_day_cents >= 0),
  flat_cents     integer check (flat_cents     is null or flat_cents     >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists facility_rates_updated_at on public.facility_rates;
create trigger facility_rates_updated_at
  before update on public.facility_rates
  for each row execute function public.set_updated_at();

alter table public.facility_rates enable row level security;

-- Add-on library (live stream, extra staff, branding/signage, media...).
create table if not exists public.rental_addons_catalog (
  id            bigint generated always as identity primary key,
  name          text not null unique,
  description   text,
  pricing_mode  text not null default 'flat'
                  check (pricing_mode in ('flat','per_unit','per_hour')),
  default_price_cents integer not null default 0 check (default_price_cents >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists rental_addons_catalog_updated_at on public.rental_addons_catalog;
create trigger rental_addons_catalog_updated_at
  before update on public.rental_addons_catalog
  for each row execute function public.set_updated_at();

alter table public.rental_addons_catalog enable row level security;

insert into public.rental_addons_catalog (name, description, pricing_mode, default_price_cents) values
  ('Live stream',       'Broadcast the event on AI Live',        'flat',     25000),
  ('Extra staff',       'Additional staff member',               'per_hour',  3500),
  ('Branding / signage','Custom signage and branding placement', 'flat',     15000),
  ('Media package',     'Photo/video coverage',                  'flat',     40000)
on conflict (name) do nothing;

-- Public-open flag: ONLY flagged facilities are self-serve bookable online;
-- optional windows (jsonb) narrow it to specific weekly time slots.
alter table public.facilities
  add column if not exists public_open boolean not null default false;
alter table public.facilities
  add column if not exists public_open_windows jsonb;  -- e.g. [{"weekday":2,"start":"18:00","end":"22:00"}]

-- Business units for $0 internal bookings (Stage 3 uses these).
create table if not exists public.business_units (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.business_units enable row level security;

insert into public.business_units (name) values
  ('OP National Boys'), ('OP National Girls'),
  ('Bears Rep Basketball'), ('Bears Volleyball Club')
on conflict (name) do nothing;

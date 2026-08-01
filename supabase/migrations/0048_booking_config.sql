-- ============================================================================
-- Migration 0048 - booking types become DATA (admin-editable), and business
-- units gain the fields their admin editor needs.
--
-- The wizard's type chips and the rentals form both read booking_types now;
-- the hard check constraint on rentals.booking_type goes away (0047 widened
-- it, this removes it - validation lives in the app against the table, so
-- adding a type in admin needs no migration).
-- Idempotent - safe to re-run.
-- ============================================================================

create table if not exists public.booking_types (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  applies_to text not null default 'both' check (applies_to in ('internal','rental','both')),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.booking_types enable row level security;

alter table public.rentals drop constraint if exists rentals_booking_type_check;

-- Seed the current union list (only when empty).
do $$
begin
  if exists (select 1 from public.booking_types) then
    return;
  end if;
  insert into public.booking_types (name, applies_to, sort_order) values
    ('practice',       'both',     1),
    ('program',        'internal', 2),
    ('training',       'internal', 3),
    ('game',           'both',     4),
    ('tournament',     'both',     5),
    ('event',          'both',     6),
    ('camp',           'both',     7),
    ('clinic',         'both',     8),
    ('league',         'rental',   9),
    ('open gym',       'internal', 10),
    ('tryouts',        'internal', 11),
    ('showcase',       'internal', 12),
    ('meeting',        'internal', 13),
    ('maintenance',    'internal', 14),
    ('media',          'both',     15),
    ('birthday party', 'rental',   16),
    ('corporate',      'rental',   17),
    ('school',         'rental',   18),
    ('other',          'both',     99);
end $$;

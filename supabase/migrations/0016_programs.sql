-- ============================================================================
-- Migration 0016 - Module 4 Stage 1: program spine + type manager
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- The shared base every program type (camps, leagues, clinics, club, academy,
-- ...) extends. Bookings go through Module 2; money through Module 1; waivers
-- reuse Module 3. registrations lands minimally here (returning-athlete
-- derivation needs history); the full flow is Stage 3.
-- ============================================================================

create table if not exists public.program_types (
  id            bigint generated always as identity primary key,
  key           text not null unique,
  name          text not null,
  default_category text not null default 'Youth Sports'
                  check (default_category in ('Academy','Club','Camps','Youth Sports','Adult')),
  default_proration text not null default 'none'
                  check (default_proration in ('league','clinic','camp','dropin','none')),
  default_settings jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists program_types_updated_at on public.program_types;
create trigger program_types_updated_at before update on public.program_types
  for each row execute function public.set_updated_at();
alter table public.program_types enable row level security;

insert into public.program_types (key, name, default_category, default_proration, sort_order) values
  ('camp',    'Camp',           'Camps',        'camp',   1),
  ('league',  'League',         'Youth Sports', 'league', 2),
  ('clinic',  'Clinic',         'Youth Sports', 'clinic', 3),
  ('pickup',  'Pickup/Drop-In', 'Youth Sports', 'dropin', 4),
  ('club',    'Club',           'Club',         'none',   5),
  ('academy', 'Academy',        'Academy',      'none',   6),
  ('other',   'Other/Misc',     'Adult',        'none',   7)
on conflict (key) do nothing;

create table if not exists public.programs (
  id              bigint generated always as identity primary key,
  name            text not null,
  description     text,
  program_type_id bigint not null references public.program_types (id) on delete restrict,
  category        text not null default 'Youth Sports'
                    check (category in ('Academy','Club','Camps','Youth Sports','Adult')),
  sport_tag       text,
  season_key      text,                      -- '2026:may-aug' etc.
  year            integer,
  brand_key       text not null default 'athlete-institute',
  min_age         integer,
  max_age         integer,
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  capacity        integer check (capacity is null or capacity >= 0),
  proration_method text not null default 'none'
                    check (proration_method in ('league','clinic','camp','dropin','none')),
  -- Pricing (Stage 4 fills the flow; columns live here to avoid a re-migration).
  base_price_cents        integer not null default 0 check (base_price_cents >= 0),
  early_bird_price_cents  integer check (early_bird_price_cents is null or early_bird_price_cents >= 0),
  early_bird_until        date,
  late_fee_cents          integer not null default 0 check (late_fee_cents >= 0),
  late_fee_after          date,
  returning_discount_cents integer check (returning_discount_cents is null or returning_discount_cents >= 0),
  multi_member_discount_cents integer not null default 0 check (multi_member_discount_cents >= 0),
  scholarship_eligible    boolean not null default false,
  -- Program dashboard: QuickBooks class mapping for margin (sync built later).
  quickbooks_class        text,
  waiver_id       bigint references public.waivers (id) on delete set null,
  status          text not null default 'draft'
                    check (status in ('draft','published','registration_open','full','closed','archived')),
  settings        jsonb not null default '{}'::jsonb,
  share_token     text not null unique,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists programs_updated_at on public.programs;
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
alter table public.programs enable row level security;

create index if not exists programs_type_idx     on public.programs (program_type_id);
create index if not exists programs_category_idx on public.programs (category);
create index if not exists programs_status_idx   on public.programs (status);

-- Staff assignment hook (full Staff module separate). Shown on the public page.
create table if not exists public.program_staff (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  profile_id  bigint not null references public.profiles (id) on delete cascade,
  role_label  text,
  show_public boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (program_id, profile_id)
);
alter table public.program_staff enable row level security;

-- Program session bookings link (each program session is a Module 2 booking).
create table if not exists public.program_sessions (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  booking_id  bigint references public.bookings (id) on delete set null,
  series_id   bigint references public.booking_series (id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now()
);
alter table public.program_sessions enable row level security;
create index if not exists program_sessions_program_idx on public.program_sessions (program_id, starts_at);

-- Registrations (roster). Minimal here for returning-athlete derivation; the
-- full registration/checkout flow is Stage 3.
create table if not exists public.registrations (
  id               bigint generated always as identity primary key,
  program_id       bigint not null references public.programs (id) on delete cascade,
  family_id        bigint references public.families (id) on delete set null,
  family_member_id bigint references public.family_members (id) on delete set null,
  profile_id       bigint references public.profiles (id) on delete set null,
  season_key       text,
  standing         text check (standing in ('returning_athlete','returning_member','brand_new')),
  status           text not null default 'active'
                     check (status in ('active','withdrawn','waitlisted','cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists registrations_updated_at on public.registrations;
create trigger registrations_updated_at before update on public.registrations
  for each row execute function public.set_updated_at();
alter table public.registrations enable row level security;

create index if not exists registrations_program_idx on public.registrations (program_id);
create index if not exists registrations_member_idx  on public.registrations (family_member_id);

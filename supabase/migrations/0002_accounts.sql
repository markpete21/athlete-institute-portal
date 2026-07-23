-- ============================================================================
-- Migration 0002 — Module 1 (Accounts) Stage 1: the core data model
-- Paste into the Supabase SQL Editor and RUN. Idempotent — safe to re-run.
--
-- The contract the rest of the platform depends on (spec: "do not stub").
-- Conventions per docs/schema-conventions.md: snake_case, timestamptz,
-- RLS enabled + NO anon policies (service-role only), set_updated_at trigger,
-- money in integer cents, text + CHECK instead of enums (cheaper to extend).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — Clerk users mirrored for relational joins (Clerk user_id is the
-- external identity key). Only people who can LOG IN have profiles; family
-- members without accounts (young dependents) live in family_members only.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            bigint generated always as identity primary key,
  clerk_user_id text not null unique,
  email         text unique,                    -- null for unclaimed imports
  first_name    text,
  last_name     text,
  phone         text,
  user_type     text not null default 'customer'
                  check (user_type in ('customer','organization','tenant','staff')),
  status        text not null default 'active'
                  check (status in ('active','suspended','archived')),
  -- Per-type settings without schema changes (spec: JSONB + typed settings UI)
  settings      jsonb not null default '{}'::jsonb,
  family_id     bigint,                         -- FK added after families exists
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- ----------------------------------------------------------------------------
-- families — the household. One Head of Household; Play Points live here
-- (loyalty is household-level; 100 points = $1).
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id                  bigint generated always as identity primary key,
  name                text not null,            -- e.g. "Peterson Household"
  hoh_profile_id      bigint references public.profiles (id) on delete restrict,
  play_points_balance integer not null default 0 check (play_points_balance >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists families_updated_at on public.families;
create trigger families_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

alter table public.families enable row level security;

-- profiles.family_id FK (deferred so the two tables can reference each other)
do $$ begin
  alter table public.profiles
    add constraint profiles_family_fk
    foreign key (family_id) references public.families (id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists profiles_family_idx on public.profiles (family_id);

-- ----------------------------------------------------------------------------
-- family_members — the household roster, INCLUDING people with no login
-- (dependents). member_role drives the access split:
--   hoh        owns the account (manage members, payment methods, settings)
--   secondary  transact-not-alter (register + pay; cannot change settings)
--   dependent  under 18: view-only-own, no transactions
--   adult      18+: self-serve for adult programs, stays in household
-- dob powers the 18+ auto-conversion (dependent → adult).
-- ----------------------------------------------------------------------------
create table if not exists public.family_members (
  id          bigint generated always as identity primary key,
  family_id   bigint not null references public.families (id) on delete cascade,
  profile_id  bigint references public.profiles (id) on delete set null, -- null until claimed
  first_name  text not null,
  last_name   text not null,
  dob         date,
  email       text,
  member_role text not null default 'dependent'
                check (member_role in ('hoh','secondary','dependent','adult')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists family_members_updated_at on public.family_members;
create trigger family_members_updated_at
  before update on public.family_members
  for each row execute function public.set_updated_at();

alter table public.family_members enable row level security;

create index if not exists family_members_family_idx  on public.family_members (family_id);
create index if not exists family_members_profile_idx on public.family_members (profile_id);
-- One hoh row per family
create unique index if not exists family_members_one_hoh
  on public.family_members (family_id) where (member_role = 'hoh');

-- ----------------------------------------------------------------------------
-- organizations — Clerk Organizations mirrored for joins + invoice billing.
-- Agents are Clerk org members (all equal power) — no local agent table.
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id            bigint generated always as identity primary key,
  clerk_org_id  text not null unique,
  name          text not null,
  billing_email text,
  status        text not null default 'active'
                  check (status in ('active','suspended','archived')),
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;

-- ----------------------------------------------------------------------------
-- roles + role_assignments — permission sets, editable in admin. A staff
-- account holds one or more; CUSTOMERS can also hold one (volunteer coach) —
-- holding any role unlocks admin.* for that role's scope, base type unchanged.
-- ----------------------------------------------------------------------------
create table if not exists public.roles (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text,
  -- Permission matrix filled in by Module 5; shape: { "area": ["read","write"] }
  permissions jsonb not null default '{}'::jsonb,
  is_system   boolean not null default false,   -- seeded roles: rename ok, delete blocked in UI
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists roles_updated_at on public.roles;
create trigger roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

alter table public.roles enable row level security;

insert into public.roles (name, description, is_system) values
  ('Admin',                'Full access to every admin area', true),
  ('Facility Coordinator', 'Facility tree, schedules, bookings and rentals', true),
  ('Coach',                'Assigned programs, rosters and score entry', true),
  ('Assistant Coach',      'Assigned programs and rosters (limited)', true),
  ('Convenor',             'League/tournament day-of operations', true),
  ('Volunteer',            'Check-in and day-of assistance', true)
on conflict (name) do nothing;

create table if not exists public.role_assignments (
  id         bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles (id) on delete cascade,
  role_id    bigint not null references public.roles (id) on delete cascade,
  granted_by text,                               -- Clerk user id of the granter
  created_at timestamptz not null default now(),
  unique (profile_id, role_id)
);

alter table public.role_assignments enable row level security;

create index if not exists role_assignments_profile_idx on public.role_assignments (profile_id);

-- ----------------------------------------------------------------------------
-- staff_credit_accounts — season staff credit. Seasons fixed: Jan–Apr,
-- May–Aug, Sep–Dec (season_key 'YYYY-1|2|3' from @ai/foundation dates).
-- Top-up sets balance TO the cap (no rollover, no increment). Cap = the
-- portal default unless cap_override_cents is set. Spendable across the
-- staff member's whole household.
-- ----------------------------------------------------------------------------
create table if not exists public.staff_credit_accounts (
  profile_id         bigint primary key references public.profiles (id) on delete cascade,
  cap_override_cents integer check (cap_override_cents is null or cap_override_cents >= 0),
  balance_cents      integer not null default 0 check (balance_cents >= 0),
  season_key         text not null,             -- season the balance belongs to
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists staff_credit_accounts_updated_at on public.staff_credit_accounts;
create trigger staff_credit_accounts_updated_at
  before update on public.staff_credit_accounts
  for each row execute function public.set_updated_at();

alter table public.staff_credit_accounts enable row level security;

-- Portal-wide settings (e.g. the default staff-credit cap). Same key/value
-- jsonb pattern as the live repo's app_settings.
create table if not exists public.portal_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists portal_settings_updated_at on public.portal_settings;
create trigger portal_settings_updated_at
  before update on public.portal_settings
  for each row execute function public.set_updated_at();

alter table public.portal_settings enable row level security;

insert into public.portal_settings (key, value) values
  ('staff_credit_default_cap_cents', '10000'::jsonb)  -- $100 default; editable in admin
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- play_points_ledger — every earn/spend, household-level. families.
-- play_points_balance is the materialized sum, maintained in code within the
-- same transaction (audit trail = this ledger + audit_log).
-- ----------------------------------------------------------------------------
create table if not exists public.play_points_ledger (
  id           bigint generated always as identity primary key,
  family_id    bigint not null references public.families (id) on delete cascade,
  delta_points integer not null check (delta_points <> 0), -- + earn / − spend
  reason       text not null,                   -- e.g. 'registration.earn', 'checkout.redeem'
  ref          text,                            -- e.g. 'registration:123'
  created_by   text,                            -- Clerk user id or 'system'
  created_at   timestamptz not null default now()
);

alter table public.play_points_ledger enable row level security;

create index if not exists play_points_ledger_family_idx
  on public.play_points_ledger (family_id, created_at desc);

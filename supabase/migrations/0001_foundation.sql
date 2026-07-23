-- ============================================================================
-- Migration 0001 — Module 0 foundation tables
-- Paste into the Supabase SQL Editor (project: athlete-institute-portal)
-- and click RUN. Idempotent — safe to re-run.
--
-- Conventions (full doc: docs/schema-conventions.md):
--   * snake_case; created_at/updated_at timestamptz on every table
--   * RLS ENABLED on every table, NO anon policies — app access goes through
--     the service-role key from server code (auth is Clerk, not Supabase Auth)
--   * updated_at maintained by the shared set_updated_at() trigger
-- ============================================================================

-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- audit_log — the shared audit trail (Module 0 §9). Sensitive actions across
-- all modules write here (refunds, overrides, permission changes, deletions).
-- Append-only by convention: no update/delete from app code.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      text        not null,              -- Clerk user id, or 'system:*'
  action     text        not null,              -- e.g. 'refund.issued', 'role.granted'
  target     text,                              -- e.g. 'registration:reg_123'
  meta       jsonb       not null default '{}'::jsonb,
  at         timestamptz not null,              -- action time (stamped by audit())
  created_at timestamptz not null default now()
);

create index if not exists audit_log_target_idx  on public.audit_log (target);
create index if not exists audit_log_actor_idx   on public.audit_log (actor);
create index if not exists audit_log_at_idx      on public.audit_log (at desc);

alter table public.audit_log enable row level security;

-- ----------------------------------------------------------------------------
-- brands — admin-editable overrides that merge OVER the code seeds in
-- @ai/foundation/brands (same pattern as the hub's org brand: a missing row or
-- DB outage still renders the seeded brand). Seeded with the four brands.
-- ----------------------------------------------------------------------------
create table if not exists public.brands (
  key          text primary key,                -- matches Brand.key in code
  name         text,
  accent       text check (accent ~* '^#[0-9a-f]{6}$'),
  accent_ink   text check (accent_ink ~* '^#[0-9a-f]{6}$'),
  logo_url     text,
  wordmark_url text,
  font         text,
  provisional  boolean,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists brands_updated_at on public.brands;
create trigger brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

alter table public.brands enable row level security;

insert into public.brands (key) values
  ('athlete-institute'), ('orangeville-prep'), ('all-can'), ('bears')
on conflict (key) do nothing;

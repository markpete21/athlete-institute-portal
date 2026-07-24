-- ============================================================================
-- Module 14: Dashboard & Reporting - multi-location model, QBO sync cache,
-- saved reports, exec recipients, capacity nudges. run-migration.mjs. Idempotent.
-- ============================================================================

-- Locations = first-class reporting dimension (maps to a QuickBooks Location).
create table if not exists public.locations (
  id           bigint generated always as identity primary key,
  name         text not null,
  city         text,
  qbo_location_id text,
  created_at   timestamptz not null default now()
);
alter table public.locations enable row level security;

-- Program definition/instance model: a program is defined once and runs as
-- location-specific instances. definition_id groups instances of one definition;
-- location_id marks which site this instance runs at. Both nullable/back-compat.
alter table public.programs add column if not exists location_id  bigint references public.locations (id) on delete set null;
alter table public.programs add column if not exists definition_id bigint;  -- self-group key (points at the canonical program id)

-- QuickBooks Online connection (OAuth tokens) - one row.
create table if not exists public.qbo_connection (
  id            integer primary key default 1 check (id = 1),
  realm_id      text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  connected_at  timestamptz,
  last_sync_at  timestamptz
);
alter table public.qbo_connection enable row level security;

-- Cached QBO expenses (pulled nightly + on-demand) for margin views.
create table if not exists public.qbo_expenses (
  id            bigint generated always as identity primary key,
  qbo_id        text unique,
  txn_date      date,
  category      text not null,
  amount_cents  integer not null default 0,
  qbo_class     text,           -- maps to program
  qbo_location  text,           -- maps to location
  synced_at     timestamptz not null default now()
);
alter table public.qbo_expenses enable row level security;
create index if not exists qbo_expenses_class_idx on public.qbo_expenses (qbo_class, txn_date);

-- Revenue push log (invoices/payments pushed to QBO) - idempotency + audit.
create table if not exists public.qbo_revenue_pushes (
  id            bigint generated always as identity primary key,
  source_ref    text unique,    -- e.g. 'program_order:123'
  qbo_id        text,
  amount_cents  integer not null default 0,
  qbo_class     text,
  qbo_location  text,
  pushed_at     timestamptz not null default now()
);
alter table public.qbo_revenue_pushes enable row level security;

-- Saved custom reports (pivot-style definition) + optional schedule.
create table if not exists public.report_definitions (
  id            bigint generated always as identity primary key,
  name          text not null,
  source        text not null check (source in ('registrations','financials','feedback','facility')),
  definition    jsonb not null default '{}'::jsonb,  -- columns/filters/grouping
  schedule_cron text,           -- null = manual
  recipients    text[],         -- emails for scheduled delivery
  format        text not null default 'pdf' check (format in ('pdf','csv','link')),
  created_by    text,
  created_at    timestamptz not null default now()
);
alter table public.report_definitions enable row level security;

-- Exec report recipient list (week/month-in-review).
create table if not exists public.exec_recipients (
  id         bigint generated always as identity primary key,
  name       text,
  email      text not null unique,
  weekly     boolean not null default true,
  monthly    boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.exec_recipients enable row level security;

-- Per-program capacity-nudge config + last-fired tracking.
create table if not exists public.capacity_nudges (
  program_id     bigint primary key references public.programs (id) on delete cascade,
  threshold_pct  integer not null default 80 check (threshold_pct between 1 and 100),
  last_level     text,
  last_notified_at timestamptz
);
alter table public.capacity_nudges enable row level security;

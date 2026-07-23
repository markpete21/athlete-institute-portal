-- ============================================================================
-- Migration 0009 - Module 2 Stage 5: saved schedule views
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- Named views staff create for themselves ("Dome only", "Tournament courts"):
-- a facility scope + the filter state, applied on top of any view mode.
-- ============================================================================

create table if not exists public.saved_schedule_views (
  id           bigint generated always as identity primary key,
  name         text not null,
  facility_ids bigint[] not null default '{}',
  filters      jsonb not null default '{}'::jsonb,  -- { source, status, internal }
  created_by   text not null,                        -- Clerk user id
  created_at   timestamptz not null default now(),
  unique (created_by, name)
);

alter table public.saved_schedule_views enable row level security;

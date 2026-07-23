-- ============================================================================
-- Migration 0021 - Module 4 Stage 8: abandoned-cart capture (flow events)
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- Log every entry into the registration flow + where the person dropped, to
-- feed a retargeting list (Communications module emails "you left something").
-- Public-catalog filtering reads existing programs columns; no schema needed.
-- ============================================================================

create table if not exists public.registration_flow_events (
  id          bigint generated always as identity primary key,
  program_id  bigint references public.programs (id) on delete set null,
  profile_id  bigint references public.profiles (id) on delete set null,
  family_id   bigint references public.families (id) on delete set null,
  email       text,
  stage       text not null check (stage in ('browsing','in_cart','at_payment','completed','abandoned')),
  created_at  timestamptz not null default now()
);
alter table public.registration_flow_events enable row level security;
create index if not exists flow_events_program_idx on public.registration_flow_events (program_id, created_at desc);
create index if not exists flow_events_actor_idx   on public.registration_flow_events (profile_id, created_at desc);

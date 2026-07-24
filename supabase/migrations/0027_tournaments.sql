-- ============================================================================
-- Migration 0027 - Module 9: Tournaments (team-entry front-end)
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
-- Tournaments are team-entered + team-priced; mode = championship | showcase.
-- ============================================================================

alter table public.programs add column if not exists tournament_mode text
  check (tournament_mode in ('championship','showcase'));

-- A team-entry registration links to the team it created; roster players are
-- team_members (Module 6). One payment per team = one program_order.
alter table public.teams add column if not exists entry_registration_id bigint references public.registrations (id) on delete set null;

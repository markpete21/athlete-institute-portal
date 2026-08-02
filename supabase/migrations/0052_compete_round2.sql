-- ============================================================================
-- Migration 0052 - Compete round 2: staff skill ratings + playoff games
--
-- staff_skill_rating: a 1-5 rating per athlete, set ONLY by staff, NEVER
-- public. Powers the team builder (most-even-teams) across every program the
-- athlete registers for - it lives on family_members, not the registration,
-- so it follows the athlete season to season. Deliberately absent from
-- lib/compete (the public reader) - nothing on the Compete site may read it.
--
-- games.stage: 'regular' vs 'playoff'. League divisions keep standings from
-- regular games; the public Playoffs tab renders the playoff games as a
-- bracket. Tournament-mode programs are all bracket, whatever the stage says.
-- Idempotent; apply via scripts/run-migration.mjs.
-- ============================================================================

alter table public.family_members
  add column if not exists staff_skill_rating smallint
  check (staff_skill_rating is null or (staff_skill_rating between 1 and 5));

alter table public.games
  add column if not exists stage text not null default 'regular'
  check (stage in ('regular', 'playoff'));

create index if not exists games_division_stage_idx on public.games (division_id, stage);

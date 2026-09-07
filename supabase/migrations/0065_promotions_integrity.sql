-- Promotions integrity (Module 20 hardening).
--
-- 1. Wheel spins are ENTITLEMENTS, not a free action: one milestone spin per
--    unlock tier (tier = floor(lifetime earned / unlock_lifetime_points)).
--    The unique index makes a double spend of the same tier impossible even
--    under concurrent requests — the insert happens before points are credited.
alter table public.wheel_spins add column if not exists tier integer;
create unique index if not exists wheel_spins_milestone_tier_uidx
  on public.wheel_spins (family_id, tier) where source = 'milestone' and tier is not null;

-- 2. Contest scores: one row per family (best score), plausibility cap per
--    contest, and a submission timestamp for rate limiting. Collapse any
--    historical duplicates to the best row first.
alter table public.contests add column if not exists max_score integer not null default 300;
delete from public.contest_scores a
  using public.contest_scores b
  where a.contest_id = b.contest_id and a.family_id = b.family_id
    and (a.score < b.score or (a.score = b.score and a.id < b.id));
alter table public.contest_scores
  add column if not exists attempts integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists contest_scores_family_uidx on public.contest_scores (contest_id, family_id);

-- 3. Idempotent external credits: the ecosystem API looks up (family, ref).
create index if not exists play_points_ledger_family_ref_idx
  on public.play_points_ledger (family_id, ref) where ref is not null;

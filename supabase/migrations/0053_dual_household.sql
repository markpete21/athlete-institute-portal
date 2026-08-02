-- ============================================================================
-- Dual-household dependents (Accounts review). A dependent (and only a
-- dependent) may belong to TWO households at once - e.g. divorced parents.
-- The member row stays owned by the PRIMARY family (family_id); the second
-- household links via second_family_id. Both households see the child on
-- their roster/schedule; either can register and pay; money stays with the
-- family that transacted (registrations/orders already carry family_id).
-- On the 18+ adult conversion the link is cleared (adults are single-household).
-- Apply with: node scripts/run-migration.mjs supabase/migrations/0053_dual_household.sql
-- Idempotent. ASCII only.
-- ============================================================================

alter table public.family_members
  add column if not exists second_family_id bigint references public.families(id) on delete set null;

-- A member can never be "shared" with their own household.
do $$ begin
  alter table public.family_members
    add constraint family_members_second_family_distinct
    check (second_family_id is null or second_family_id <> family_id);
exception when duplicate_object then null; end $$;

create index if not exists family_members_second_family_idx
  on public.family_members (second_family_id) where second_family_id is not null;

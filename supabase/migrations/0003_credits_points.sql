-- ============================================================================
-- Migration 0003 — Module 1 Stage 4: atomic Play Points + staff credit ops
-- Paste into the Supabase SQL Editor and RUN. Idempotent — safe to re-run.
--
-- supabase-js cannot express multi-statement transactions, so the two ops
-- that MUST be atomic (ledger row + balance move together) are SQL functions
-- called via RPC with the service-role key. Both raise on insufficient funds
-- so callers can never overdraw.
-- ============================================================================

-- Earn (positive delta) or spend (negative delta) Play Points for a family:
-- appends the ledger row and moves families.play_points_balance atomically.
create or replace function public.play_points_apply(
  p_family_id  bigint,
  p_delta      integer,
  p_reason     text,
  p_ref        text default null,
  p_created_by text default 'system'
) returns integer  -- the new balance
language plpgsql as $$
declare
  v_balance integer;
begin
  if p_delta = 0 then
    raise exception 'play_points_apply: delta must be nonzero';
  end if;

  select play_points_balance into v_balance
    from public.families where id = p_family_id for update;
  if not found then
    raise exception 'play_points_apply: family % not found', p_family_id;
  end if;

  if v_balance + p_delta < 0 then
    raise exception 'play_points_apply: insufficient points (balance %, delta %)', v_balance, p_delta;
  end if;

  insert into public.play_points_ledger (family_id, delta_points, reason, ref, created_by)
    values (p_family_id, p_delta, p_reason, p_ref, p_created_by);

  update public.families
    set play_points_balance = v_balance + p_delta
    where id = p_family_id;

  return v_balance + p_delta;
end $$;

-- Spend staff credit (positive amount = spend). Raises on insufficient funds.
create or replace function public.staff_credit_spend(
  p_profile_id bigint,
  p_amount_cents integer
) returns integer  -- the new balance
language plpgsql as $$
declare
  v_balance integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'staff_credit_spend: amount must be positive';
  end if;

  select balance_cents into v_balance
    from public.staff_credit_accounts where profile_id = p_profile_id for update;
  if not found then
    raise exception 'staff_credit_spend: no credit account for profile %', p_profile_id;
  end if;

  if v_balance < p_amount_cents then
    raise exception 'staff_credit_spend: insufficient credit (balance %, spend %)', v_balance, p_amount_cents;
  end if;

  update public.staff_credit_accounts
    set balance_cents = v_balance - p_amount_cents
    where profile_id = p_profile_id;

  return v_balance - p_amount_cents;
end $$;

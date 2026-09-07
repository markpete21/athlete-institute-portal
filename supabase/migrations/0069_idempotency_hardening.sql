-- 1. Ecosystem credits: the API's SELECT-then-INSERT dedupe on `ref` has to be
--    backed by the database or two concurrent retries both credit. Scoped to
--    the ecosystem caller so internal refs (order:<id> carries redeem AND earn
--    rows) are untouched.
create unique index if not exists play_points_ledger_ecosystem_ref_uidx
  on public.play_points_ledger (family_id, ref)
  where ref is not null and created_by like 'ecosystem:%';

-- 2. Refund credits are written once per registration: a retried applyRefund
--    finds the row and skips the credit instead of paying twice.
create unique index if not exists credit_ledger_refund_ref_uidx
  on public.credit_ledger (family_id, ref)
  where ref is not null and reason = 'refund';

-- 3. Campaign drains claim their batch before sending so the staff "Send"
--    request and the hourly cron can overlap without duplicate emails.
alter table public.comms_recipients add column if not exists claimed_at timestamptz;

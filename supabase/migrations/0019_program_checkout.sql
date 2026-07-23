-- ============================================================================
-- Migration 0019 - Module 4 Stage 4: program checkout, Credit on Account, plans
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- Credit on Account is a household dollar balance (from refunds, non-expiring),
-- DISTINCT from Play Points. A checkout = one program_order grouping the
-- registrations, with the priced breakdown + an installment schedule.
-- ============================================================================

-- Credit on Account (household), mirroring the Play Points ledger pattern.
alter table public.families add column if not exists credit_balance_cents integer not null default 0
  check (credit_balance_cents >= 0);

create table if not exists public.credit_ledger (
  id           bigint generated always as identity primary key,
  family_id    bigint not null references public.families (id) on delete cascade,
  delta_cents  integer not null check (delta_cents <> 0),  -- + from refunds / - spent
  reason       text not null,
  ref          text,
  created_by   text,
  created_at   timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;
create index if not exists credit_ledger_family_idx on public.credit_ledger (family_id, created_at desc);

-- Atomic Credit on Account move (never overdraws) - mirrors play_points_apply.
create or replace function public.credit_apply(
  p_family_id bigint, p_delta integer, p_reason text, p_ref text default null, p_created_by text default 'system'
) returns integer language plpgsql as $$
declare v_balance integer;
begin
  if p_delta = 0 then raise exception 'credit_apply: delta must be nonzero'; end if;
  select credit_balance_cents into v_balance from public.families where id = p_family_id for update;
  if not found then raise exception 'credit_apply: family % not found', p_family_id; end if;
  if v_balance + p_delta < 0 then raise exception 'credit_apply: insufficient credit (balance %, delta %)', v_balance, p_delta; end if;
  insert into public.credit_ledger (family_id, delta_cents, reason, ref, created_by) values (p_family_id, p_delta, p_reason, p_ref, p_created_by);
  update public.families set credit_balance_cents = v_balance + p_delta where id = p_family_id;
  return v_balance + p_delta;
end $$;

create table if not exists public.program_orders (
  id             bigint generated always as identity primary key,
  family_id      bigint references public.families (id) on delete set null,
  profile_id     bigint references public.profiles (id) on delete set null,
  cart_id        bigint references public.carts (id) on delete set null,
  promo_code     text,
  subtotal_cents integer not null default 0,      -- sum of line subtotals (post program-level adjustments)
  staff_credit_cents integer not null default 0,
  promo_cents    integer not null default 0,
  credit_on_account_cents integer not null default 0,
  play_points_used integer not null default 0,    -- points (= cents)
  total_cents    integer not null default 0,
  points_earned  integer not null default 0,
  pay_in_full    boolean not null default true,
  status         text not null default 'pending'
                   check (status in ('pending','paid','plan_active','overdue','cancelled')),
  created_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists program_orders_updated_at on public.program_orders;
create trigger program_orders_updated_at before update on public.program_orders
  for each row execute function public.set_updated_at();
alter table public.program_orders enable row level security;

create table if not exists public.program_installments (
  id             bigint generated always as identity primary key,
  order_id       bigint not null references public.program_orders (id) on delete cascade,
  seq            integer not null,
  label          text not null,
  amount_cents   integer not null check (amount_cents >= 0),
  due_date       date not null,
  status         text not null default 'pending' check (status in ('pending','paid','failed','waived')),
  stripe_payment_intent text,
  stripe_invoice_id     text,
  paid_at        timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (order_id, seq)
);

drop trigger if exists program_installments_updated_at on public.program_installments;
create trigger program_installments_updated_at before update on public.program_installments
  for each row execute function public.set_updated_at();
alter table public.program_installments enable row level security;
create index if not exists program_installments_due_idx on public.program_installments (due_date) where status = 'pending';

-- registrations gain the order link + priced line snapshot.
alter table public.registrations add column if not exists order_id bigint references public.program_orders (id) on delete set null;
alter table public.registrations add column if not exists line_total_cents integer;
alter table public.registrations add column if not exists refund_insurance boolean not null default false;

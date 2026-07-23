-- ============================================================================
-- Migration 0018 - Module 4 Stage 3: registration cart + held spots + waitlist
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- A cart holds spots (10-min TTL) while a family checks out multiple members
-- into multiple programs. On reserve, each held item becomes a registration -
-- active if there's capacity, else waitlisted (staff can override the cap).
-- ============================================================================

create table if not exists public.carts (
  id                bigint generated always as identity primary key,
  owner_profile_id  bigint references public.profiles (id) on delete set null,
  status            text not null default 'open' check (status in ('open','converted','expired')),
  marketing_source  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists carts_updated_at on public.carts;
create trigger carts_updated_at before update on public.carts
  for each row execute function public.set_updated_at();
alter table public.carts enable row level security;

create table if not exists public.cart_items (
  id               bigint generated always as identity primary key,
  cart_id          bigint not null references public.carts (id) on delete cascade,
  program_id       bigint not null references public.programs (id) on delete cascade,
  family_member_id bigint not null references public.family_members (id) on delete cascade,
  hold_expires_at  timestamptz not null,
  created_at       timestamptz not null default now(),
  unique (cart_id, program_id, family_member_id)
);
alter table public.cart_items enable row level security;
create index if not exists cart_items_program_idx on public.cart_items (program_id, hold_expires_at);

-- registrations gains links to the cart it came from + waitlist ordering.
alter table public.registrations add column if not exists cart_id bigint references public.carts (id) on delete set null;
alter table public.registrations add column if not exists waitlist_position integer;
alter table public.registrations add column if not exists staff_override boolean not null default false;

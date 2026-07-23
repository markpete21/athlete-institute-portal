-- ============================================================================
-- Migration 0020 - Module 4 Stage 5: products with variants + jersey/gear
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
-- ============================================================================

create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text,
  is_gear     boolean not null default false,   -- the jersey/gear item
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
alter table public.products enable row level security;

create table if not exists public.product_variants (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products (id) on delete cascade,
  label       text not null,                    -- e.g. "M", "Large"
  price_cents integer not null default 0 check (price_cents >= 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.product_variants enable row level security;
create index if not exists product_variants_product_idx on public.product_variants (product_id, sort_order);

-- Which products a program offers as checkout add-ons.
create table if not exists public.program_products (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  product_id  bigint not null references public.products (id) on delete cascade,
  required    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (program_id, product_id)
);
alter table public.program_products enable row level security;

-- Purchased add-ons on an order (fold into the order total at checkout).
create table if not exists public.order_addons (
  id              bigint generated always as identity primary key,
  order_id        bigint not null references public.program_orders (id) on delete cascade,
  registration_id bigint references public.registrations (id) on delete set null,
  product_id      bigint references public.products (id) on delete set null,
  variant_id      bigint references public.product_variants (id) on delete set null,
  label           text not null,
  price_cents     integer not null check (price_cents >= 0),
  qty             integer not null default 1 check (qty > 0),
  created_at      timestamptz not null default now()
);
alter table public.order_addons enable row level security;
create index if not exists order_addons_order_idx on public.order_addons (order_id);

-- Program jersey settings + per-registrant jersey selection.
alter table public.programs add column if not exists jersey_numbers_enabled boolean not null default false;
alter table public.programs add column if not exists jersey_extras jsonb not null default '{}'::jsonb;  -- size -> extra count
alter table public.registrations add column if not exists jersey_size text;
alter table public.registrations add column if not exists jersey_number integer;         -- assigned
alter table public.registrations add column if not exists jersey_number_2 integer;       -- 2nd choice

-- ============================================================================
-- Migration 0005 — Module 2 Stage 1: facility hierarchy (flexible tree)
-- Paste into the Supabase SQL Editor and RUN. Idempotent — safe to re-run.
--
-- A single self-referencing table of ARBITRARY depth (no fixed levels).
-- `label` is informational only. Soft-delete via deleted_at; bookings will FK
-- to nodes, so nodes are never hard-deleted. One booking per node per slot is
-- Module 2 Stage 2's concern — this is just the tree.
-- ============================================================================

create table if not exists public.facilities (
  id         bigint generated always as identity primary key,
  parent_id  bigint references public.facilities (id) on delete restrict,
  name       text not null,
  label      text,                               -- e.g. City, Location, Facility, Court, Basket
  sort_order integer not null default 0,
  bookable   boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists facilities_updated_at on public.facilities;
create trigger facilities_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

alter table public.facilities enable row level security;

create index if not exists facilities_parent_idx on public.facilities (parent_id);
-- Sibling names unique among live nodes (soft-deleted names can be reused).
create unique index if not exists facilities_sibling_name
  on public.facilities (coalesce(parent_id, 0), lower(name))
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- Seed: the real Athlete Institute tree (only when the table is empty).
-- ----------------------------------------------------------------------------
do $$
declare
  v_city bigint; v_ai bigint; v_ocs bigint;
  v_fh bigint; v_fhgym bigint; v_fhn bigint; v_fhs bigint;
  v_dome bigint; v_c1 bigint; v_c2 bigint; v_c3 bigint;
begin
  if exists (select 1 from public.facilities) then
    return;
  end if;

  insert into public.facilities (name, label, bookable, sort_order)
    values ('Orangeville, ON', 'City', false, 1) returning id into v_city;

  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_city, 'Athlete Institute', 'Location', 1) returning id into v_ai;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_city, 'Orangeville Christian School', 'Location', 2) returning id into v_ocs;

  -- Fieldhouse: Gym → North/South halves → baskets
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_ai, 'Fieldhouse', 'Facility', 1) returning id into v_fh;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_fh, 'Fieldhouse Gym', 'Sub-Facility', 1) returning id into v_fhgym;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_fhgym, 'Fieldhouse North', 'Court', 1) returning id into v_fhn;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_fhgym, 'Fieldhouse South', 'Court', 2) returning id into v_fhs;
  insert into public.facilities (parent_id, name, label, sort_order) values
    (v_fhn, 'Fieldhouse North – East Basket', 'Basket', 1),
    (v_fhn, 'Fieldhouse North – West Basket', 'Basket', 2),
    (v_fhs, 'Fieldhouse South – East Basket', 'Basket', 1),
    (v_fhs, 'Fieldhouse South – West Basket', 'Basket', 2);

  -- Dome: Courts 1–3 → baskets
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_ai, 'Dome', 'Facility', 2) returning id into v_dome;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_dome, 'Dome Court 1', 'Court', 1) returning id into v_c1;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_dome, 'Dome Court 2', 'Court', 2) returning id into v_c2;
  insert into public.facilities (parent_id, name, label, sort_order)
    values (v_dome, 'Dome Court 3', 'Court', 3) returning id into v_c3;
  insert into public.facilities (parent_id, name, label, sort_order) values
    (v_c1, 'Court 1 – East Basket', 'Basket', 1),
    (v_c1, 'Court 1 – West Basket', 'Basket', 2),
    (v_c2, 'Court 2 – East Basket', 'Basket', 1),
    (v_c2, 'Court 2 – West Basket', 'Basket', 2),
    (v_c3, 'Court 3 – East Basket', 'Basket', 1),
    (v_c3, 'Court 3 – West Basket', 'Basket', 2);

  -- Bear Cub Coffee: a leaf directly under the location
  insert into public.facilities (parent_id, name, label, bookable, sort_order)
    values (v_ai, 'Bear Cub Coffee', 'Facility', false, 3);
end $$;

-- ============================================================================
-- Migration 0045 - Module 2 review: weekday operating hours, seasonal closures,
-- facility -> location linkage, and the real AI hours seed.
-- Idempotent - safe to re-run. ASCII only.
--
-- WHY:
--  1. hours_open/hours_close (0006) is ONE window with no day-of-week, so a
--     site that runs 09:00-22:00 on weeknights and 08:00-22:00 on weekends
--     cannot be expressed. hours_windows supersedes it; the legacy columns
--     stay as a fallback so nothing that already set them changes behaviour.
--  2. Outdoor facilities close for the winter. facility_closures carries
--     date-range closures (advisory, like hours) and cascades to descendants.
--  3. locations (0032) was a reporting dimension with no link to the facility
--     tree, so only programs carried a location. facilities.location_id lets a
--     booking resolve its site by walking up the tree.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Weekday operating-hours windows.
--    [{"weekday":1,"open":"09:00","close":"22:00"}, ...]  weekday 0=Sun..6=Sat.
--    A node that defines windows is CLOSED on any weekday it does not list.
--    Null = inherit from the nearest ancestor that defines hours.
-- ----------------------------------------------------------------------------
alter table public.facilities add column if not exists hours_windows jsonb;

comment on column public.facilities.hours_windows is
  'Weekday operating windows [{weekday:0-6,open:HH:MM,close:HH:MM}]. Supersedes hours_open/hours_close. A listed node is closed on unlisted weekdays. Null inherits from the nearest ancestor.';

-- ----------------------------------------------------------------------------
-- 2. Seasonal / holiday closures. Inclusive date range in Toronto local dates.
--    A closure on a node applies to that node and every descendant.
-- ----------------------------------------------------------------------------
create table if not exists public.facility_closures (
  id          bigint generated always as identity primary key,
  facility_id bigint not null references public.facilities (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint facility_closures_range check (ends_on >= starts_on)
);

drop trigger if exists facility_closures_updated_at on public.facility_closures;
create trigger facility_closures_updated_at
  before update on public.facility_closures
  for each row execute function public.set_updated_at();

alter table public.facility_closures enable row level security;

create index if not exists facility_closures_facility_idx
  on public.facility_closures (facility_id, starts_on, ends_on);

-- ----------------------------------------------------------------------------
-- 3. Facility -> location linkage (the reporting / QuickBooks dimension).
-- ----------------------------------------------------------------------------
alter table public.facilities
  add column if not exists location_id bigint references public.locations (id) on delete set null;

create index if not exists facilities_location_idx on public.facilities (location_id);

-- ----------------------------------------------------------------------------
-- 4. Seed the two real locations and bind them to their tree nodes.
--    Matched by name so this is safe on a tree whose ids differ.
-- ----------------------------------------------------------------------------
insert into public.locations (name, city)
select 'Athlete Institute', 'Orangeville'
where not exists (select 1 from public.locations where name = 'Athlete Institute');

insert into public.locations (name, city)
select 'Orangeville Christian School', 'Orangeville'
where not exists (select 1 from public.locations where name = 'Orangeville Christian School');

update public.facilities f
   set location_id = l.id
  from public.locations l
 where f.name = l.name
   and f.location_id is distinct from l.id;

-- ----------------------------------------------------------------------------
-- 5. Real operating hours for Athlete Institute:
--    Mon-Fri 09:00-22:00, Sat-Sun 08:00-22:00. Descendants inherit.
--    OCS is deliberately left with NO hours: it is space Athlete Institute
--    rents for specific program blocks, never self-serve bookable, so it
--    inherits the platform default and staff book it deliberately.
-- ----------------------------------------------------------------------------
update public.facilities
   set hours_windows = '[
         {"weekday":0,"open":"08:00","close":"22:00"},
         {"weekday":1,"open":"09:00","close":"22:00"},
         {"weekday":2,"open":"09:00","close":"22:00"},
         {"weekday":3,"open":"09:00","close":"22:00"},
         {"weekday":4,"open":"09:00","close":"22:00"},
         {"weekday":5,"open":"09:00","close":"22:00"},
         {"weekday":6,"open":"08:00","close":"22:00"}
       ]'::jsonb
 where name = 'Athlete Institute'
   and hours_windows is null;

-- ----------------------------------------------------------------------------
-- 6. Fully qualify the Dome basket names. "Court 1 - East Basket" does not say
--    which building once it appears in a flat filter, dropdown or TV display.
-- ----------------------------------------------------------------------------
update public.facilities
   set name = 'Dome ' || name
 where name similar to 'Court [0-9]+ - (East|West) Basket'
   and deleted_at is null;

-- ============================================================================
-- Migration 0022 - Module 5 Stage 1: staff records + capability matrix
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
--
-- A staff record enriches a Module 1 staff account (bio/photo/pay/certs), but
-- can also be ACCOUNT-LESS (a coach added via roster upload, no login yet) -
-- upgraded to a login later by adding an email. Bios are global (one per staff).
-- ============================================================================

create table if not exists public.staff (
  id          bigint generated always as identity primary key,
  profile_id  bigint references public.profiles (id) on delete set null,  -- null = account-less
  first_name  text not null,
  last_name   text not null,
  email       text,                            -- for a later Clerk invite (upgrade)
  bio         text,
  photo_url   text,
  status      text not null default 'inactive' check (status in ('active','inactive','archived')),
  archived_at timestamptz,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at before update on public.staff for each row execute function public.set_updated_at();
alter table public.staff enable row level security;
create index if not exists staff_profile_idx on public.staff (profile_id);

-- Capability matrix: role x capability with view/edit flags (NOT hard-coded).
create table if not exists public.role_capabilities (
  id          bigint generated always as identity primary key,
  role_id     bigint not null references public.roles (id) on delete cascade,
  capability  text not null,                   -- e.g. roster_names, roster_sensitive, schedule, pay, score_entry, camp_checkin
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (role_id, capability)
);

drop trigger if exists role_capabilities_updated_at on public.role_capabilities;
create trigger role_capabilities_updated_at before update on public.role_capabilities for each row execute function public.set_updated_at();
alter table public.role_capabilities enable row level security;

-- Seed sensible defaults for the seeded roles. Admin gets everything; the
-- privacy-critical roster_sensitive stays OFF except Admin.
do $$
declare r_admin bigint; r_fac bigint; r_coach bigint; r_asst bigint; r_conv bigint; r_vol bigint;
begin
  select id into r_admin from public.roles where name = 'Admin';
  select id into r_fac   from public.roles where name = 'Facility Coordinator';
  select id into r_coach from public.roles where name = 'Coach';
  select id into r_asst  from public.roles where name = 'Assistant Coach';
  select id into r_conv  from public.roles where name = 'Convenor';
  select id into r_vol   from public.roles where name = 'Volunteer';

  -- Admin: view+edit on all capabilities.
  if r_admin is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit)
    select r_admin, cap, true, true from unnest(array['roster_names','roster_sensitive','schedule','pay','score_entry','camp_checkin']) cap
    on conflict (role_id, capability) do nothing;
  end if;
  -- Coach: roster names + schedule (view), score entry (edit); NO sensitive/pay.
  if r_coach is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit) values
      (r_coach,'roster_names',true,false),(r_coach,'schedule',true,false),(r_coach,'score_entry',true,true)
    on conflict do nothing;
  end if;
  if r_asst is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit) values
      (r_asst,'roster_names',true,false),(r_asst,'schedule',true,false)
    on conflict do nothing;
  end if;
  if r_conv is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit) values
      (r_conv,'roster_names',true,false),(r_conv,'schedule',true,false),(r_conv,'score_entry',true,true)
    on conflict do nothing;
  end if;
  if r_fac is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit) values
      (r_fac,'schedule',true,true)
    on conflict do nothing;
  end if;
  if r_vol is not null then
    insert into public.role_capabilities (role_id, capability, can_view, can_edit) values
      (r_vol,'camp_checkin',true,true)
    on conflict do nothing;
  end if;
end $$;

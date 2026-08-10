-- ============================================================================
-- Migration 0063 - certification catalog + per-program role requirements.
-- Idempotent - safe to re-run. ASCII only.
--
-- Certifications become CONFIGURED things, not free text:
--   staff_certification_types      the org-wide catalog (admin-editable)
--   program_role_certifications    which certs a role needs on a program
--                                  (Head Coach needs VSC + Safe Sport, ...)
-- staff_certifications gains cert_type_id; existing rows are backfilled by
-- exact name match and keep working either way (name stays for display).
-- "Outstanding" is DERIVED: required by an active assignment's role but not
-- held/valid - never stored.
-- ============================================================================

create table if not exists public.staff_certification_types (
  id              bigint generated always as identity primary key,
  name            text not null unique,
  description     text,
  -- When set, an obtained cert's expiry defaults to obtained + this many months.
  validity_months integer check (validity_months is null or validity_months > 0),
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists staff_certification_types_updated_at on public.staff_certification_types;
create trigger staff_certification_types_updated_at before update on public.staff_certification_types for each row execute function public.set_updated_at();
alter table public.staff_certification_types enable row level security;

insert into public.staff_certification_types (name, description, validity_months, sort_order) values
  ('Vulnerable Sector Check', 'Police record check for working with minors.', 12, 1),
  ('Safe Sport Training', 'Coaching Association of Canada safe sport module.', 60, 2),
  ('First Aid / CPR', 'Standard first aid with CPR-C.', 36, 3)
on conflict (name) do nothing;

create table if not exists public.program_role_certifications (
  id            bigint generated always as identity primary key,
  program_id    bigint not null references public.programs (id) on delete cascade,
  role_label    text not null,
  cert_type_id  bigint not null references public.staff_certification_types (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (program_id, role_label, cert_type_id)
);
alter table public.program_role_certifications enable row level security;
create index if not exists program_role_certs_program_idx on public.program_role_certifications (program_id);

alter table public.staff_certifications
  add column if not exists cert_type_id bigint references public.staff_certification_types (id) on delete set null;

update public.staff_certifications sc
   set cert_type_id = t.id
  from public.staff_certification_types t
 where sc.cert_type_id is null
   and sc.name = t.name;

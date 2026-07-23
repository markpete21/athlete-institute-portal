-- ============================================================================
-- Migration 0023 - Module 5 Stages 3/5/6: assignments, pay, certs, absence
-- Applied via scripts/run-migration.mjs. Idempotent - safe to re-run.
-- Pay tracking only - NEVER moves money (exports to QuickBooks/payroll).
-- ============================================================================

-- Staff <-> program assignment carries the pay structure (per program).
create table if not exists public.staff_assignments (
  id            bigint generated always as identity primary key,
  staff_id      bigint not null references public.staff (id) on delete cascade,
  program_id    bigint not null references public.programs (id) on delete cascade,
  role_label    text,
  pay_mode      text not null default 'per_session'
                  check (pay_mode in ('hourly','per_session','flat','salary')),
  rate_cents    integer not null default 0 check (rate_cents >= 0),
  frequency     text not null default 'after_program'
                  check (frequency in ('bi_weekly','monthly','after_program')),
  show_public   boolean not null default true,
  active        boolean not null default true,   -- false when replaced-for-remainder
  effective_until date,                           -- set when replaced from a point on
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (staff_id, program_id)
);
drop trigger if exists staff_assignments_updated_at on public.staff_assignments;
create trigger staff_assignments_updated_at before update on public.staff_assignments for each row execute function public.set_updated_at();
alter table public.staff_assignments enable row level security;
create index if not exists staff_assignments_program_idx on public.staff_assignments (program_id);
create index if not exists staff_assignments_staff_idx on public.staff_assignments (staff_id);

-- Generated pay dates (schedule of what's owed when), paid vs outstanding.
create table if not exists public.staff_pay_dates (
  id            bigint generated always as identity primary key,
  assignment_id bigint not null references public.staff_assignments (id) on delete cascade,
  due_date      date not null,
  amount_cents  integer not null check (amount_cents >= 0),
  status        text not null default 'outstanding' check (status in ('outstanding','paid')),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.staff_pay_dates enable row level security;
create index if not exists staff_pay_dates_due_idx on public.staff_pay_dates (due_date);
create index if not exists staff_pay_dates_assignment_idx on public.staff_pay_dates (assignment_id);

-- Per-session absence + replacement (replacement rate may differ).
create table if not exists public.staff_session_absences (
  id                   bigint generated always as identity primary key,
  assignment_id        bigint not null references public.staff_assignments (id) on delete cascade,
  session_date         date not null,
  replacement_staff_id bigint references public.staff (id) on delete set null,
  replacement_rate_cents integer check (replacement_rate_cents is null or replacement_rate_cents >= 0),
  created_by           text not null,
  created_at           timestamptz not null default now(),
  unique (assignment_id, session_date)
);
alter table public.staff_session_absences enable row level security;

create table if not exists public.staff_certifications (
  id          bigint generated always as identity primary key,
  staff_id    bigint not null references public.staff (id) on delete cascade,
  name        text not null,                    -- Vulnerable Sector Check, Safe Sport Training, ...
  obtained_on date,
  expires_on  date,
  reminded_at timestamptz,                      -- expiry warning sent
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists staff_certifications_updated_at on public.staff_certifications;
create trigger staff_certifications_updated_at before update on public.staff_certifications for each row execute function public.set_updated_at();
alter table public.staff_certifications enable row level security;
create index if not exists staff_certifications_expiry_idx on public.staff_certifications (expires_on) where expires_on is not null;

create table if not exists public.staff_unavailability (
  id          bigint generated always as identity primary key,
  staff_id    bigint not null references public.staff (id) on delete cascade,
  date        date not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (staff_id, date)
);
alter table public.staff_unavailability enable row level security;

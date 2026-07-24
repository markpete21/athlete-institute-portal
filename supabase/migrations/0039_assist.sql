-- ============================================================================
-- Module 21: AI Assistant Platform ("Assist") - query log doubles as the
-- rate-limit counter + audit trail. Idempotent.
-- ============================================================================

create table if not exists public.assist_logs (
  id         bigint generated always as identity primary key,
  surface    text not null check (surface in ('public','customer','admin')),
  rate_key   text not null,          -- ip (public) / family (customer) / profile (admin)
  question   text,
  answered   boolean not null default true,
  handed_off boolean not null default false,
  tool_calls integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.assist_logs enable row level security;
create index if not exists assist_logs_rate_idx on public.assist_logs (rate_key, created_at);

-- Human-handoff contact options (editable).
create table if not exists public.assist_config (
  id integer primary key default 1 check (id = 1),
  handoff_phone text default '519-941-0492',
  handoff_sms   text default '519-941-0492',
  handoff_email text default 'info@athleteinstitute.ca',
  public_rate_per_hour integer not null default 20,
  authed_rate_per_hour integer not null default 60,
  updated_at timestamptz not null default now()
);
insert into public.assist_config (id) values (1) on conflict (id) do nothing;
alter table public.assist_config enable row level security;

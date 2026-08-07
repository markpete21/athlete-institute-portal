-- Migration 0056 - Per-league branding, sponsors and tickets link (slice 4).
-- Every league/tournament gets its own event ecosystem on Compete: colours,
-- logo and hero media (compete_brand jsonb), sponsor logos in display order,
-- and an optional tickets.athleteinstitute.ca link. Media objects live in the
-- PUBLIC event-logos bucket (public since 0046) and rows store full URLs,
-- matching how booking event logos already work.

alter table public.programs add column if not exists compete_brand jsonb not null default '{}'::jsonb;
alter table public.programs add column if not exists tickets_url text;

create table if not exists public.compete_sponsors (
  id         bigint generated always as identity primary key,
  program_id bigint not null references public.programs (id) on delete cascade,
  name       text not null,
  logo_url   text,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists compete_sponsors_updated_at on public.compete_sponsors;
create trigger compete_sponsors_updated_at
  before update on public.compete_sponsors
  for each row execute function public.set_updated_at();

alter table public.compete_sponsors enable row level security;

create index if not exists compete_sponsors_program_idx on public.compete_sponsors (program_id, sort);

-- ============================================================================
-- Module 12: Academy (named teams, recruitment offer pipeline, tuition tiers,
-- scholarships, staff-dictated plans, processing fee). No Competitive Play.
-- Applied via scripts/run-migration.mjs. Idempotent.
-- ============================================================================

create table if not exists public.academies (
  id                    bigint generated always as identity primary key,
  name                  text not null,
  brand_key             text,
  processing_fee_percent numeric not null default 0 check (processing_fee_percent >= 0),
  plan_complete_by      date,          -- e.g. season-year Feb 1 (front-loaded)
  created_at            timestamptz not null default now()
);
alter table public.academies enable row level security;

-- Academy -> Team: fixed staff-managed named teams, per-team tuition tiers.
create table if not exists public.academy_teams (
  id                          bigint generated always as identity primary key,
  academy_id                  bigint not null references public.academies (id) on delete cascade,
  name                        text not null,
  coach_staff_id              bigint references public.staff (id) on delete set null,
  capacity                    integer,
  tuition_room_board_cents    integer not null default 0 check (tuition_room_board_cents >= 0),
  tuition_commuter_cents      integer not null default 0 check (tuition_commuter_cents >= 0),
  tuition_international_cents  integer not null default 0 check (tuition_international_cents >= 0),
  season_program_id           bigint references public.programs (id) on delete set null,
  created_at                  timestamptz not null default now()
);
alter table public.academy_teams enable row level security;
create index if not exists academy_teams_academy_idx on public.academy_teams (academy_id);

-- Recruitment pipeline: Selected -> Offered -> Accepted/Declined. No tryouts.
create table if not exists public.academy_players (
  id                     bigint generated always as identity primary key,
  academy_id             bigint not null references public.academies (id) on delete cascade,
  team_id                bigint references public.academy_teams (id) on delete set null,
  family_member_id       bigint not null references public.family_members (id) on delete cascade,
  family_id              bigint references public.families (id) on delete set null,
  status                 text not null default 'selected' check (status in ('selected','offered','accepted','declined')),
  tuition_tier           text check (tuition_tier in ('room_board','commuter','international')),
  scholarship_cents      integer not null default 0 check (scholarship_cents >= 0),
  deposit_cents          integer,
  season_registration_id bigint references public.registrations (id) on delete set null,
  returning_flag         boolean not null default false,
  created_at             timestamptz not null default now(),
  unique (academy_id, family_member_id)
);
alter table public.academy_players enable row level security;
create index if not exists academy_players_team_idx on public.academy_players (team_id);

create table if not exists public.academy_offers (
  id                    bigint generated always as identity primary key,
  player_id             bigint not null references public.academy_players (id) on delete cascade,
  team_id               bigint not null references public.academy_teams (id) on delete cascade,
  tuition_tier          text check (tuition_tier in ('room_board','commuter','international')),
  deposit_cents         integer,
  deposit_pct           numeric check (deposit_pct > 0 and deposit_pct <= 100),
  token                 text not null unique,
  status                text not null default 'pending' check (status in ('pending','accepted','declined')),
  applied_deposit_cents integer,
  accepted_at           timestamptz,
  created_at            timestamptz not null default now()
);
alter table public.academy_offers enable row level security;
create index if not exists academy_offers_player_idx on public.academy_offers (player_id);

-- Seed Orangeville Prep Academy + the six named teams (idempotent).
insert into public.academies (name, processing_fee_percent, plan_complete_by)
select 'Orangeville Prep Academy', 2.9, '2027-02-01'
where not exists (select 1 from public.academies where name = 'Orangeville Prep Academy');

insert into public.academy_teams (academy_id, name)
select a.id, t.name
from public.academies a
cross join (values
  ('OP National Boys'), ('OP National Girls'), ('OP Varsity Boys'),
  ('OP Varsity Boys 2'), ('OP Junior Girls'), ('OP Junior Boys')
) as t(name)
where a.name = 'Orangeville Prep Academy'
  and not exists (select 1 from public.academy_teams x where x.academy_id = a.id and x.name = t.name);

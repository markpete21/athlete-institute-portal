-- ============================================================================
-- Module 11: Club (Club -> Team, tryout -> offer -> confirm pipeline, billing).
-- Applied via scripts/run-migration.mjs. Idempotent.
-- ============================================================================

create table if not exists public.clubs (
  id         bigint generated always as identity primary key,
  name       text not null,
  sport      text,
  brand_key  text,
  created_at timestamptz not null default now()
);
alter table public.clubs enable row level security;

-- Club -> Team. Per-team free-text level label + per-team DOB eligibility range.
create table if not exists public.club_teams (
  id               bigint generated always as identity primary key,
  club_id          bigint not null references public.clubs (id) on delete cascade,
  name             text not null,
  level_label      text not null,          -- free text: "15U" vs "U15" per club
  gender           text not null default 'mixed' check (gender in ('girls','boys','mixed')),
  dob_min          date,                    -- eligibility window (inclusive)
  dob_max          date,
  season_fee_cents integer not null default 0 check (season_fee_cents >= 0),
  division_id      bigint references public.divisions (id) on delete set null,
  season_program_id bigint references public.programs (id) on delete set null,
  created_at       timestamptz not null default now()
);
alter table public.club_teams enable row level security;
create index if not exists club_teams_club_idx on public.club_teams (club_id);

-- Tryout sessions = M4 programs linked to a club level+gender group.
create table if not exists public.club_tryout_sessions (
  id          bigint generated always as identity primary key,
  club_id     bigint not null references public.clubs (id) on delete cascade,
  program_id  bigint not null references public.programs (id) on delete cascade,
  level_label text not null,
  gender      text not null default 'mixed' check (gender in ('girls','boys','mixed')),
  created_at  timestamptz not null default now(),
  unique (program_id)
);
alter table public.club_tryout_sessions enable row level security;

-- Consolidated tryout roster: ONE row per player per club+level+gender group,
-- regardless of how many tryout sessions they registered for.
create table if not exists public.club_tryout_players (
  id               bigint generated always as identity primary key,
  club_id          bigint not null references public.clubs (id) on delete cascade,
  level_label      text not null,
  gender           text not null default 'mixed',
  family_member_id bigint not null references public.family_members (id) on delete cascade,
  family_id        bigint references public.families (id) on delete set null,
  rating           integer check (rating between 1 and 5),
  notes            text,
  -- ladder: unrated -> selected/considering/out -> offered_pending -> confirmed/declined
  flag             text not null default 'unrated'
                     check (flag in ('unrated','selected','considering','out','offered_pending','confirmed','declined')),
  team_id          bigint references public.club_teams (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (club_id, level_label, gender, family_member_id)
);
alter table public.club_tryout_players enable row level security;
create index if not exists club_tryout_players_group_idx on public.club_tryout_players (club_id, level_label, gender);

-- Offers from a team roster (verbal or deposit-required), manually cancelled.
create table if not exists public.club_offers (
  id                    bigint generated always as identity primary key,
  player_id             bigint not null references public.club_tryout_players (id) on delete cascade,
  team_id               bigint not null references public.club_teams (id) on delete cascade,
  mode                  text not null check (mode in ('verbal','deposit')),
  deposit_cents         integer check (deposit_cents >= 0),   -- set-amount deposit
  deposit_pct           numeric check (deposit_pct > 0 and deposit_pct <= 100), -- OR percent
  token                 text not null unique,
  status                text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled')),
  applied_deposit_cents integer,                              -- deposit actually applied on confirm
  season_registration_id bigint references public.registrations (id) on delete set null,
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now()
);
alter table public.club_offers enable row level security;
create index if not exists club_offers_player_idx on public.club_offers (player_id);

-- Club program type (season-fee programs; custom refunds, not proration).
insert into public.program_types (key, name, default_category, default_proration, sort_order) values
  ('club', 'Club', 'Club', 'none', 5)
on conflict (key) do nothing;

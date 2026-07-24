-- ============================================================================
-- Module 20: Promotions & Engagement - contests/games, wheel, challenges,
-- streaks & badges. All points flow through the M19/M1 ledger. Idempotent.
-- ============================================================================

create table if not exists public.contests (
  id          bigint generated always as identity primary key,
  name        text not null,
  game_key    text not null check (game_key in ('basketball','soccer','volleyball','pickleball','football')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reward_top_n integer not null default 5,
  reward_points integer not null default 2500,
  status      text not null default 'open' check (status in ('open','closed','awarded')),
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.contests enable row level security;

create table if not exists public.contest_scores (
  id          bigint generated always as identity primary key,
  contest_id  bigint not null references public.contests (id) on delete cascade,
  family_id   bigint not null references public.families (id) on delete cascade,
  score       integer not null check (score >= 0),
  created_at  timestamptz not null default now()
);
alter table public.contest_scores enable row level security;
create index if not exists contest_scores_board_idx on public.contest_scores (contest_id, score desc);

-- Spin-to-win wheel: configurable weighted prizes + spin log.
create table if not exists public.wheel_config (
  id integer primary key default 1 check (id = 1),
  prizes jsonb not null default '[{"label":"50 points","points":50,"weight":30},{"label":"100 points","points":100,"weight":25},{"label":"250 points","points":250,"weight":10},{"label":"Free drop-in session","points":0,"weight":10},{"label":"10% gear discount","points":0,"weight":10},{"label":"Better luck next time","points":0,"weight":15}]'::jsonb,
  unlock_lifetime_points integer not null default 1000,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.wheel_config (id) values (1) on conflict (id) do nothing;
alter table public.wheel_config enable row level security;

create table if not exists public.wheel_spins (
  id          bigint generated always as identity primary key,
  family_id   bigint not null references public.families (id) on delete cascade,
  prize_label text not null,
  points      integer not null default 0,
  source      text,                 -- 'milestone' | 'contest' | 'grant'
  created_at  timestamptz not null default now()
);
alter table public.wheel_spins enable row level security;

-- Configurable challenges.
create table if not exists public.challenges (
  id          bigint generated always as identity primary key,
  name        text not null,
  kind        text not null check (kind in ('first_n','do_x_by_date','streak','referral_push')),
  rule        jsonb not null default '{}'::jsonb,   -- {n} | {count, action} | {multiplier}
  points      integer not null default 0,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      text not null default 'open' check (status in ('open','closed')),
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.challenges enable row level security;

create table if not exists public.challenge_progress (
  id           bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  family_id    bigint not null references public.families (id) on delete cascade,
  actions      integer not null default 0,
  completed_at timestamptz,
  awarded      boolean not null default false,
  unique (challenge_id, family_id)
);
alter table public.challenge_progress enable row level security;

-- Badges.
create table if not exists public.badges (
  badge_key   text primary key,
  label       text not null,
  description text
);
insert into public.badges (badge_key, label, description) values
  ('first_season',  'First Season',   'Completed your first season with us'),
  ('referral_champ','Referral Champ', '3 successful referrals'),
  ('superfan',      'Superfan',       '5+ seasons with Athlete Institute'),
  ('streak_keeper', 'Streak Keeper',  '3+ consecutive seasons in a row')
on conflict (badge_key) do nothing;
alter table public.badges enable row level security;

create table if not exists public.family_badges (
  family_id  bigint not null references public.families (id) on delete cascade,
  badge_key  text not null references public.badges (badge_key) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (family_id, badge_key)
);
alter table public.family_badges enable row level security;

-- Announcement template for contests/challenges (M13).
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template, is_marketing) values
  ('promo.announcement', 'Promotion announcement', '{email,push,sms}', '{{title}}', '{{message}}', false),
  ('promo.winner',       'Contest winner',          '{email,push}',     'You won {{points}} Play Points!', '{{message}} Points are already in your account.', false)
on conflict (trigger_key) do nothing;

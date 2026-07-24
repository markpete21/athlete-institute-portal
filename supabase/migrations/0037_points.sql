-- ============================================================================
-- Module 19: Play Points & Referrals - earn rules, referrals, reporting.
-- Ledger + 100pts=$1 spend slot already exist (Module 1 / migration 0003).
-- ============================================================================

-- Configurable earn rules (toggle + value), seeded per spec.
create table if not exists public.points_earn_rules (
  rule_key   text primary key,
  label      text not null,
  points     integer not null default 0,
  enabled    boolean not null default true,
  per_household_once boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.points_earn_rules enable row level security;

insert into public.points_earn_rules (rule_key, label, points, per_household_once) values
  ('household.created',  'New household creation', 100, true),
  ('feedback.quick',     'Quick review',            50, false),
  ('feedback.full',      'Full feedback form',     250, false),
  ('signup.early_bird',  'Early-bird signup',      500, false),
  ('profile.complete',   'Complete profile',       100, true),
  ('pad.connected',      'Connect PAD',            200, true),
  ('app.first_login',    'First app login',        100, true),
  ('birthday',           'Birthday (annual)',      150, false),
  ('referral.referrer',  'Referral - referrer',   1000, false),
  ('referral.referred',  'Referral - referred',    500, false)
on conflict (rule_key) do nothing;

-- Referral code per family + referral tracking.
alter table public.families add column if not exists referral_code text unique;

create table if not exists public.referrals (
  id                  bigint generated always as identity primary key,
  referrer_family_id  bigint not null references public.families (id) on delete cascade,
  referred_family_id  bigint not null references public.families (id) on delete cascade,
  season_key          text,
  status              text not null default 'pending'
                        check (status in ('pending','rewarded','flagged','clawed_back')),
  rewarded_at         timestamptz,
  flag_reason         text,
  created_at          timestamptz not null default now(),
  unique (referred_family_id)          -- a household can be referred once
);
alter table public.referrals enable row level security;
create index if not exists referrals_referrer_idx on public.referrals (referrer_family_id, season_key);

-- Earn notification template (M13).
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template, is_marketing) values
  ('points.earned', 'Play Points earned', '{email,push}', 'You earned {{points}} Play Points!', '{{message}} Your balance is now {{balance}} points.', false)
on conflict (trigger_key) do nothing;

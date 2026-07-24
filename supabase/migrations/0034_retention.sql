-- ============================================================================
-- Module 16: Predictive Retention - tunable weights, computed flags, actions.
-- INTERNAL-ONLY (PIPEDA): never exposed to families. Idempotent.
-- ============================================================================

-- Tunable rule weights (one row; defaults mirror foundation DEFAULT_WEIGHTS).
create table if not exists public.retention_weights (
  id integer primary key default 1 check (id = 1),
  weights jsonb not null default '{"reenrollTiming":40,"lowFeedback":15,"abandonedCart":10,"paymentFriction":10,"emailDisengaged":10,"siblingGap":10,"crossAppTrend":15}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.retention_weights (id) values (1) on conflict (id) do nothing;
alter table public.retention_weights enable row level security;

-- Computed risk flags per returning-eligible participant (refreshed by cron).
create table if not exists public.retention_flags (
  id               bigint generated always as identity primary key,
  family_member_id bigint not null references public.family_members (id) on delete cascade,
  family_id        bigint references public.families (id) on delete cascade,
  program_id       bigint references public.programs (id) on delete set null, -- the program they could re-enroll in
  score            integer not null default 0,
  level            text not null default 'green' check (level in ('red','amber','green')),
  reasons          jsonb not null default '[]'::jsonb,
  signals          jsonb,
  last_activity_at timestamptz,
  computed_at      timestamptz not null default now(),
  actioned_at      timestamptz,
  actioned_by      text,
  action_taken     text,
  unique (family_member_id)
);
alter table public.retention_flags enable row level security;
create index if not exists retention_flags_level_idx on public.retention_flags (level, score desc);

-- Call tasks created from one-click actions.
create table if not exists public.retention_tasks (
  id          bigint generated always as identity primary key,
  flag_id     bigint references public.retention_flags (id) on delete cascade,
  kind        text not null check (kind in ('call','offer','discount')),
  note        text,
  status      text not null default 'open' check (status in ('open','done')),
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.retention_tasks enable row level security;

-- Weekly digest trigger template (M13).
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template, is_marketing) values
  ('retention.weekly_digest', 'Retention weekly digest (staff)', '{email}', '{{count}} families at risk this week', '{{count}} families are flagged at risk of not re-enrolling. Review the retention dashboard: {{dashboard_url}}', false)
on conflict (trigger_key) do nothing;

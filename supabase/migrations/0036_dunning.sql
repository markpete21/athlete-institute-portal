-- ============================================================================
-- Module 18: Automated dunning + team-balance explainer. Idempotent.
-- ============================================================================

-- Configurable dunning step timings (one row).
create table if not exists public.dunning_config (
  id integer primary key default 1 check (id = 1),
  retry_after_days integer not null default 3,
  email_after_days integer not null default 5,
  sms_after_days   integer not null default 10,
  task_after_days  integer not null default 14,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.dunning_config (id) values (1) on conflict (id) do nothing;
alter table public.dunning_config enable row level security;

-- One dunning case per failed installment; step advances through the sequence.
create table if not exists public.dunning_cases (
  id              bigint generated always as identity primary key,
  installment_id  bigint not null references public.program_installments (id) on delete cascade,
  order_id        bigint references public.program_orders (id) on delete cascade,
  family_id       bigint references public.families (id) on delete set null,
  failed_at       timestamptz not null default now(),
  step            text not null default 'failed'
                    check (step in ('failed','retried','emailed','smsed','task_created','recovered','written_off')),
  step_at         timestamptz not null default now(),
  recovered_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (installment_id)
);
alter table public.dunning_cases enable row level security;
create index if not exists dunning_cases_open_idx on public.dunning_cases (step) where recovered_at is null;

-- Overdue flag on the family account.
alter table public.families add column if not exists overdue boolean not null default false;

-- Team-balance explainer storage (ADMIN-PRIVATE - never family-visible).
create table if not exists public.team_balance_explainers (
  id          bigint generated always as identity primary key,
  division_id bigint not null references public.divisions (id) on delete cascade,
  explanation text not null,
  model       text,
  created_at  timestamptz not null default now()
);
alter table public.team_balance_explainers enable row level security;

-- Editable M13 templates for the dunning steps.
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template, is_marketing) values
  ('dunning.email', 'Dunning: payment failed (email)', '{email}', 'Payment issue - {{program_name}}', 'Hi {{first_name}}, your {{amount}} payment did not go through. Pay now: {{pay_url}}', false),
  ('dunning.sms',   'Dunning: payment failed (SMS)',   '{sms}',   'Payment reminder',                'Your {{amount}} payment for {{program_name}} is still outstanding. Pay: {{pay_url}}', false),
  ('dunning.task',  'Dunning: staff call task',        '{email}', 'CALL TASK: overdue account',      '{{family}} is overdue {{amount}} after the full dunning sequence. Call them.', false)
on conflict (trigger_key) do nothing;

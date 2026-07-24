-- ============================================================================
-- Module 13: Communications (campaigns, saved lists, auto-notifications,
-- suppression, stats). Applied via scripts/run-migration.mjs. Idempotent.
-- ============================================================================

-- Saved email templates/designs (block array + brand chrome).
create table if not exists public.comms_templates (
  id         bigint generated always as identity primary key,
  name       text not null,
  brand_key  text,
  subject    text,
  blocks     jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.comms_templates enable row level security;

-- Saved recipient lists = a segment DEFINITION (include/exclude rules +
-- filters). Recalculated live at send time, never a snapshot.
create table if not exists public.comms_lists (
  id         bigint generated always as identity primary key,
  name       text not null,
  definition jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.comms_lists enable row level security;

-- Campaigns (email builder output or announcement). Live-loaded audience.
create table if not exists public.comms_campaigns (
  id            bigint generated always as identity primary key,
  name          text not null,
  kind          text not null default 'email' check (kind in ('email','announcement')),
  brand_key     text,
  subject       text,
  blocks        jsonb not null default '[]'::jsonb,
  body_text     text,                          -- announcement plain text
  channels      text[] not null default '{email}',
  from_email    text,
  reply_to      text,
  list_id       bigint references public.comms_lists (id) on delete set null,
  audience      jsonb,                          -- inline segment definition if no list
  is_marketing  boolean not null default true,
  ab_test       jsonb,                          -- {variantB:{subject,blocks}, splitPercent}
  ab_winner     text,
  status        text not null default 'draft' check (status in ('draft','scheduled','sending','sent','canceled')),
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  sent_by       text,
  created_at    timestamptz not null default now()
);
alter table public.comms_campaigns enable row level security;
create index if not exists comms_campaigns_status_idx on public.comms_campaigns (status, scheduled_at);

-- Per-recipient send record + Resend-webhook status.
create table if not exists public.comms_recipients (
  id           bigint generated always as identity primary key,
  campaign_id  bigint not null references public.comms_campaigns (id) on delete cascade,
  profile_id   bigint references public.profiles (id) on delete set null,
  email        text not null,
  variant      text check (variant in ('A','B')),
  message_id   text,                            -- Resend id for webhook matching
  status       text not null default 'queued' check (status in ('queued','sent','delivered','bounced','opened','clicked','unsubscribed','error')),
  opened_at    timestamptz,
  clicked_at   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.comms_recipients enable row level security;
create index if not exists comms_recipients_campaign_idx on public.comms_recipients (campaign_id);
create index if not exists comms_recipients_msg_idx on public.comms_recipients (message_id);
create index if not exists comms_recipients_email_open_idx on public.comms_recipients (email, opened_at);

-- Per-link click tracking.
create table if not exists public.comms_link_clicks (
  id           bigint generated always as identity primary key,
  campaign_id  bigint not null references public.comms_campaigns (id) on delete cascade,
  recipient_id bigint references public.comms_recipients (id) on delete set null,
  url          text not null,
  clicked_at   timestamptz not null default now()
);
alter table public.comms_link_clicks enable row level security;
create index if not exists comms_link_clicks_campaign_idx on public.comms_link_clicks (campaign_id);

-- Permanent suppression list (hard bounces + unsubscribes) - auto-excluded.
create table if not exists public.comms_suppressions (
  email      text primary key,
  reason     text not null check (reason in ('hard_bounce','unsubscribe','complaint')),
  created_at timestamptz not null default now()
);
alter table public.comms_suppressions enable row level security;

-- Editable auto-notification (transactional/triggered) templates.
create table if not exists public.comms_auto_notifications (
  trigger_key  text primary key,
  label        text not null,
  enabled      boolean not null default true,
  channels     text[] not null default '{email}',
  subject      text,
  body_template text,
  is_marketing boolean not null default false,
  updated_by   text,
  updated_at   timestamptz not null default now()
);
alter table public.comms_auto_notifications enable row level security;

-- Seed the default triggers (all editable, on by default).
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template) values
  ('registration.confirmed',   'Registration confirmation',        '{email,push}', 'You are registered for {{program_name}}', 'Hi {{first_name}}, you are confirmed for {{program_name}}.'),
  ('payment.receipt',          'Payment receipt',                  '{email}',      'Receipt - {{amount}}',                    'Thanks {{first_name}}, we received {{amount}}. Balance: {{balance_owed}}.'),
  ('installment.upcoming',      'Installment upcoming',             '{email}',      'Upcoming payment {{amount}}',             'A payment of {{amount}} is scheduled for {{due_date}}.'),
  ('installment.charged',       'Installment charged',              '{email}',      'Payment of {{amount}} processed',         'We processed {{amount}} toward {{program_name}}.'),
  ('installment.failed',        'Installment failed',               '{email,sms}',  'Payment failed',                          'Your {{amount}} payment failed. Please update your payment method.'),
  ('waitlist.available',        'Waitlist spot available',          '{email,sms}',  'A spot opened in {{program_name}}',       'A spot opened in {{program_name}}. Claim it soon.'),
  ('program.rescheduled',       'Program reschedule',               '{email,sms,push}', 'Session change - {{program_name}}',   'Your {{program_name}} session has changed. See details.'),
  ('booking.status',            'Booking/quote status change',      '{email}',      'Your booking was updated',                'Your booking/quote status is now {{status}}.'),
  ('offer.sent',               'Offer sent',                        '{email}',      'You have an offer from {{team_name}}',    'You have an offer to join {{team_name}}. Respond here.'),
  ('offer.accepted',           'Offer accepted',                    '{email}',      'Welcome to {{team_name}}',                'You are confirmed for {{team_name}}.'),
  ('cert.expiry',              'Certification expiry (staff)',      '{email}',      'Certification expiring',                  'Your {{cert}} expires {{expiry_date}}.'),
  ('staff.pay_reminder',       'Staff pay reminder',                '{email}',      'Pay reminder',                            'A pay item is due {{due_date}}.'),
  ('cart.abandoned',           'Abandoned-cart nudge',              '{email}',      'You left something behind',               'Finish registering {{first_name}} for {{program_name}}.'),
  ('refund.processed',         'Refund processed',                  '{email}',      'Refund processed',                        'We processed a refund of {{amount}}.'),
  ('account.claim_invite',     'Account-claim invite',              '{email}',      'Claim your Athlete Institute account',    'Claim your account: {{claim_url}}')
on conflict (trigger_key) do nothing;

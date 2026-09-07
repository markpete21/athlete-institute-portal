-- Durable idempotency for inbound webhooks. Providers (Stripe, Resend, later
-- Clerk) redeliver events; the route inserts the provider event id here BEFORE
-- dispatching and skips anything already seen. A handler failure is recorded
-- and the route returns non-2xx so the provider retries.
create table if not exists public.webhook_events (
  id           bigint generated always as identity primary key,
  provider     text not null,                   -- 'stripe' | 'resend' | 'clerk' | ...
  external_id  text not null,                   -- the provider's event id
  event_type   text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, external_id)
);
alter table public.webhook_events enable row level security;
create index if not exists webhook_events_received_idx on public.webhook_events (received_at desc);

-- Scheduled sends that must happen once per window even if the cron re-runs
-- (Vercel retry, manual re-hit): exec week/month reports, the retention
-- digest. Insert-before-send on the unique key is the guard.
create table if not exists public.scheduled_send_log (
  kind         text not null,                   -- 'exec.week' | 'exec.month' | 'retention.digest'
  window_key   text not null,                   -- e.g. the window start date
  sent_at      timestamptz not null default now(),
  detail       jsonb,
  primary key (kind, window_key)
);
alter table public.scheduled_send_log enable row level security;

-- Campaign sends are resumable: recipients are queued first, then drained in
-- batches by the send action and the hourly comms cron.
alter table public.comms_recipients add column if not exists sent_at timestamptz;
create index if not exists comms_recipients_queued_idx on public.comms_recipients (campaign_id) where status = 'queued';

-- ============================================================================
-- Migration 0050 - calendar sync: tokened ICS feed subscriptions.
-- A feed is a long-lived unguessable URL a calendar app polls (Google/Apple/
-- Outlook "subscribe by URL"). kind 'master' = the staff master schedule;
-- 'family' = one household's bookings on play. The token is the credential,
-- same model as the TV display URLs. Idempotent - safe to re-run.
-- ============================================================================

create table if not exists public.calendar_feeds (
  id         bigint generated always as identity primary key,
  token      text not null unique,
  kind       text not null check (kind in ('master','family')),
  family_id  bigint references public.families (id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint calendar_feeds_family_kind check (kind <> 'family' or family_id is not null)
);

alter table public.calendar_feeds enable row level security;

create index if not exists calendar_feeds_owner_idx on public.calendar_feeds (created_by, kind);

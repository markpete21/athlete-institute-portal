-- ============================================================================
-- Module 22: AI Enhancements - consent flags, score events for highlights,
-- jersey tags on gallery media, AI proposal storage. Idempotent.
-- ============================================================================

-- 4. Auto-galleries: jersey-number grouping (default) + PIPEDA-gated face consent.
alter table public.gallery_media add column if not exists jersey_numbers integer[];
alter table public.families add column if not exists face_grouping_consent boolean not null default false;

-- 5. Auto-highlights v1: score events with timestamps (from M6 score entry),
-- optionally attributed to a jersey number for per-player reels.
create table if not exists public.score_events (
  id           bigint generated always as identity primary key,
  game_id      bigint not null references public.games (id) on delete cascade,
  team_id      bigint references public.teams (id) on delete set null,
  player_number integer,
  points       integer not null default 0,
  occurred_at  timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table public.score_events enable row level security;
create index if not exists score_events_game_idx on public.score_events (game_id, occurred_at);

-- Highlight clips assembled from windows (metadata; cutting runs in the
-- live-stream pipeline against the game's recording).
create table if not exists public.highlight_clips (
  id           bigint generated always as identity primary key,
  game_id      bigint not null references public.games (id) on delete cascade,
  gallery_id   bigint references public.galleries (id) on delete set null,
  player_number integer,               -- null = full-game reel
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  source       text not null default 'scoreboard' check (source in ('scoreboard','audio')),
  stream_ref   text,                   -- set when the pipeline renders the clip
  created_at   timestamptz not null default now()
);
alter table public.highlight_clips enable row level security;

-- 1/2 proposals: AI output awaiting staff review (NEVER auto-applied).
create table if not exists public.ai_proposals (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('roster','schedule','description','pricing')),
  target_ref  text not null,           -- 'division:4' / 'program:12'
  proposal    jsonb not null,
  narrative   text,
  status      text not null default 'proposed' check (status in ('proposed','approved','dismissed')),
  created_by  text,
  reviewed_by text,
  created_at  timestamptz not null default now()
);
alter table public.ai_proposals enable row level security;

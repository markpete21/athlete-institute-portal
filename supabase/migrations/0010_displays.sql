-- ============================================================================
-- Migration 0010 - Module 2 Stage 6: TV displays (templates + token URLs)
-- Paste into the Supabase SQL Editor and RUN. Idempotent - safe to re-run.
--
-- Displays are PUBLIC web pages at unguessable token URLs (the token is the
-- access control; middleware exempts /display/*). Configuration lives in
-- admin: templates (media panel behavior + content options) are assigned to
-- N displays, each scoped to selected facilities.
-- ============================================================================

create table if not exists public.display_templates (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  media_mode  text not null default 'image'
                check (media_mode in ('image','video','slideshow')),
  media_urls  text[] not null default '{}',      -- 9:16 portrait assets
  show_today  boolean not null default true,     -- whole-day schedule panel
  show_upcoming boolean not null default true,   -- "coming up in the next 4 weeks"
  slide_seconds integer not null default 8 check (slide_seconds between 3 and 120),
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists display_templates_updated_at on public.display_templates;
create trigger display_templates_updated_at
  before update on public.display_templates
  for each row execute function public.set_updated_at();

alter table public.display_templates enable row level security;

create table if not exists public.displays (
  id           bigint generated always as identity primary key,
  token        text not null unique,             -- long random URL token
  name         text not null,                    -- "Front lobby TV"
  template_id  bigint references public.display_templates (id) on delete set null,
  facility_ids bigint[] not null default '{}',   -- scope; empty = all facilities
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists displays_updated_at on public.displays;
create trigger displays_updated_at
  before update on public.displays
  for each row execute function public.set_updated_at();

alter table public.displays enable row level security;

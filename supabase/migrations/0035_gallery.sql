-- ============================================================================
-- Module 17: Photo & Video Gallery. Idempotent.
-- ============================================================================

create table if not exists public.galleries (
  id          bigint generated always as identity primary key,
  program_id  bigint not null references public.programs (id) on delete cascade,
  session_id  bigint references public.program_sessions (id) on delete set null,
  title       text not null,
  archived_at timestamptz,          -- lifecycle archive marker
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.galleries enable row level security;
create index if not exists galleries_program_idx on public.galleries (program_id);

create table if not exists public.gallery_media (
  id               bigint generated always as identity primary key,
  gallery_id       bigint not null references public.galleries (id) on delete cascade,
  kind             text not null check (kind in ('photo','video')),
  storage_path     text,             -- photos: gallery-media bucket path (original)
  video_stream_ref text,             -- videos: transcoding/HLS pipeline reference
  poster_path      text,             -- video poster frame in the bucket
  caption          text,
  bytes            integer,
  created_at       timestamptz not null default now()
);
alter table public.gallery_media enable row level security;
create index if not exists gallery_media_gallery_idx on public.gallery_media (gallery_id);

-- New-upload notification template (M13).
insert into public.comms_auto_notifications (trigger_key, label, channels, subject, body_template, is_marketing) values
  ('gallery.new_media', 'New gallery photos/video', '{email,push}', 'New photos from {{program_name}}', 'New photos and video from {{program_name}} are in your gallery: {{gallery_url}}', false)
on conflict (trigger_key) do nothing;

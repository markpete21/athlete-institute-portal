-- ============================================================================
-- Brand settings: per-brand logo upload + header ordering/visibility.
-- The brands table (0001) already carries key/name/accent/logo_url/wordmark_url.
-- run-migration.mjs. Idempotent.
-- ============================================================================

alter table public.brands add column if not exists sort_order   integer not null default 100;
alter table public.brands add column if not exists show_in_header boolean not null default true;
alter table public.brands add column if not exists tagline      text;
-- storage path (in the public brand-assets bucket) so we can delete/replace
alter table public.brands add column if not exists logo_path    text;

-- Seed/refresh the four brands that appear in the public header. Accents are the
-- real values sampled from the supplied marks. ON CONFLICT keeps any logo a
-- staff member has already uploaded (we only fill name/accent/order/tagline).
insert into public.brands (key, name, accent, accent_ink, sort_order, show_in_header, tagline, provisional) values
  ('athlete-institute',  'Athlete Institute',  '#9e8959', '#ffffff', 10, true, 'Orangeville, ON',        false),
  ('all-can',            'ALL CAN',            '#d8232a', '#ffffff', 20, true, 'Inclusive programming',  false),
  ('bears',              'Orangeville Bears',  '#a8935f', '#1e1e1e', 30, true, 'Club program',           false),
  ('all-canadian-games', 'All Canadian Games', '#d2232a', '#ffffff', 40, true, 'Showcase events',        false),
  ('orangeville-prep',   'Orangeville Prep',   '#9e8959', '#ffffff', 50, false, 'Academy',               false)
on conflict (key) do update set
  name        = excluded.name,
  accent      = excluded.accent,
  accent_ink  = excluded.accent_ink,
  sort_order  = excluded.sort_order,
  tagline     = excluded.tagline,
  provisional = excluded.provisional;
-- show_in_header is intentionally NOT in the ON CONFLICT list above: once staff
-- toggle a brand's header placement we must not stomp it on a re-run. But the
-- column is introduced by THIS migration, so pre-existing rows (e.g.
-- orangeville-prep, seeded back in 0001) took the `true` default and would show
-- up in the header. Set the intended initial placement once, explicitly.
update public.brands set show_in_header = false where key = 'orangeville-prep';
update public.brands set show_in_header = true
 where key in ('athlete-institute','all-can','bears','all-canadian-games');

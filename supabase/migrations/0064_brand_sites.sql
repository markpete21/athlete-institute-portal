-- ============================================================================
-- Migration 0064 - Brand sites (Module 23) + the ALL CAN Sport site seed.
-- Idempotent - safe to re-run. ASCII only.
--
-- Every top-level brand can get its own public website on its own root
-- domain, served by this repo (app/site/[brand]) and edited in admin
-- (/admin/sites). Tables:
--   brand_sites          one row per brand that has a site (status, hosts, seo)
--   site_pages           every page, system or staff-made; draft + published blocks
--   site_nav_items       the header menu tree (root > folder > folder > page)
--   site_posts           stories (news/blog) with scheduling
--   site_media           media library per site (public brand-assets bucket)
--   site_editor_scopes   who may work on which site, with a role
--   site_page_views      privacy-safe daily counters (no identifiers)
--   site_redirects       old address -> new address (301s in middleware)
--   site_locations       the public "location" records (location-first sites)
--   site_programs        site-owned program facts until Module 4 programs link
--   site_leads           interest sign-ups, location requests, hosting enquiries
--   site_ai_questions    tracked parent questions for AI visibility checks
--   site_ai_checks       weekly results per assistant
--   site_ask_logs        Ask <brand> questions (no personal data)
--   team_follows         "Follow this team" for signed-in families
-- Consuming code: lib/site/*, app/site/[brand]/*, app/admin/sites/*,
-- middleware.ts (hosts manifest + redirects), packages/foundation/src/hosts.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. brand_sites
-- ---------------------------------------------------------------------------
create table if not exists public.brand_sites (
  brand_key     text primary key references public.brands (key) on delete cascade,
  status        text not null default 'off' check (status in ('off','coming_soon','live')),
  hostnames     text[] not null default '{}',
  primary_host  text,
  theme_key     text not null default 'vanguard',
  name          text,                       -- public site name, e.g. 'ALL CAN Sport'
  seo           jsonb not null default '{}',
  social        jsonb not null default '{}',
  contact       jsonb not null default '{}',
  links         jsonb not null default '{}',
  coming_soon   jsonb not null default '{}',
  footer        jsonb not null default '{}',
  analytics     jsonb not null default '{}',
  settings      jsonb not null default '{}', -- {ask_enabled, ask_handoff_email, ...}
  launched_at   timestamptz,
  created_by    text not null default 'system:migration',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists brand_sites_updated_at on public.brand_sites;
create trigger brand_sites_updated_at before update on public.brand_sites for each row execute function public.set_updated_at();
alter table public.brand_sites enable row level security;

-- ---------------------------------------------------------------------------
-- 2. site_pages
-- ---------------------------------------------------------------------------
create table if not exists public.site_pages (
  id               bigint generated always as identity primary key,
  brand_key        text not null references public.brand_sites (brand_key) on delete cascade,
  kind             text not null default 'custom' check (kind in ('custom','home','system')),
  template         text not null default 'custom',   -- renderer: home, locations, location, location-sport, sport, sport-soon, circuit, training, stories, parent-guide, financial-assistance, about, privacy-policy, scores, standings, rosters, my-teams, programs, custom
  ref              text,                             -- template argument (location slug, sport slug, 'loc/sport')
  slug             text not null,                    -- '' for home; unique per brand
  title            text not null,
  blocks_draft     jsonb not null default '[]',
  blocks_published jsonb,
  published_at     timestamptz,
  published_by     text,
  hidden_from_menu boolean not null default false,
  seo              jsonb not null default '{}',
  sort_order       integer not null default 100,
  last_edited_by   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (brand_key, slug)
);
drop trigger if exists site_pages_updated_at on public.site_pages;
create trigger site_pages_updated_at before update on public.site_pages for each row execute function public.set_updated_at();
alter table public.site_pages enable row level security;
create index if not exists site_pages_brand_idx on public.site_pages (brand_key, sort_order);

alter table public.brand_sites
  add column if not exists home_page_id bigint references public.site_pages (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. site_nav_items
-- ---------------------------------------------------------------------------
create table if not exists public.site_nav_items (
  id          bigint generated always as identity primary key,
  brand_key   text not null references public.brand_sites (brand_key) on delete cascade,
  parent_id   bigint references public.site_nav_items (id) on delete cascade,
  kind        text not null check (kind in ('page','folder','link')),
  label       text not null,
  page_id     bigint references public.site_pages (id) on delete cascade,
  href        text,
  new_tab     boolean not null default false,
  description text,
  image_url   text,
  featured    boolean not null default false,
  sort_order  integer not null default 100,
  visible     boolean not null default true,
  meta        jsonb not null default '{}',   -- {soon, sport, note}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists site_nav_items_updated_at on public.site_nav_items;
create trigger site_nav_items_updated_at before update on public.site_nav_items for each row execute function public.set_updated_at();
alter table public.site_nav_items enable row level security;
create index if not exists site_nav_items_brand_idx on public.site_nav_items (brand_key, parent_id, sort_order);

-- Depth rule: root > folder > folder > page/link at most (a folder may not sit
-- at depth 2 and nothing may sit at depth 3). Enforced here as well as in the
-- server action so a bad write can never produce a four-level menu.
create or replace function public.site_nav_depth_check() returns trigger
language plpgsql as $$
declare
  d integer := 0;
  p bigint := new.parent_id;
  pk text;
begin
  while p is not null loop
    d := d + 1;
    select parent_id, kind into p, pk from public.site_nav_items where id = p;
    if pk is not null and pk <> 'folder' then
      raise exception 'A menu item can only sit inside a folder.';
    end if;
    if d > 2 then
      raise exception 'That would make the menu three folders deep. Menus allow a dropdown and one more level inside it.';
    end if;
  end loop;
  if new.kind = 'folder' and d >= 2 then
    raise exception 'That would make the menu three folders deep. Menus allow a dropdown and one more level inside it.';
  end if;
  return new;
end $$;
drop trigger if exists site_nav_items_depth on public.site_nav_items;
create trigger site_nav_items_depth before insert or update on public.site_nav_items
  for each row execute function public.site_nav_depth_check();

-- ---------------------------------------------------------------------------
-- 4. site_posts (stories)
-- ---------------------------------------------------------------------------
create table if not exists public.site_posts (
  id                 bigint generated always as identity primary key,
  brand_key          text not null references public.brand_sites (brand_key) on delete cascade,
  slug               text not null,
  title              text not null,
  excerpt            text,
  type               text not null default 'Announcement',
  location_slug      text,
  sport              text,
  program_slug       text,
  author_label       text,
  author_profile_id  bigint references public.profiles (id) on delete set null,
  cover_media_id     bigint,
  cover_url          text,
  cover_alt          text,
  cover_credit       text,
  body_blocks        jsonb not null default '[]',
  status             text not null default 'draft' check (status in ('draft','scheduled','published')),
  published_at       timestamptz,
  seo                jsonb not null default '{}',
  tags               text[] not null default '{}',
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (brand_key, slug)
);
drop trigger if exists site_posts_updated_at on public.site_posts;
create trigger site_posts_updated_at before update on public.site_posts for each row execute function public.set_updated_at();
alter table public.site_posts enable row level security;
create index if not exists site_posts_brand_idx on public.site_posts (brand_key, status, published_at desc);

-- ---------------------------------------------------------------------------
-- 5. site_media
-- ---------------------------------------------------------------------------
create table if not exists public.site_media (
  id           bigint generated always as identity primary key,
  brand_key    text not null references public.brand_sites (brand_key) on delete cascade,
  kind         text not null default 'photo' check (kind in ('photo','logo','video','doc')),
  name         text not null,
  folder       text not null default 'Uploads',
  path         text,          -- storage path in brand-assets (null for files shipped in /public)
  url          text not null, -- public URL (bucket or /public path)
  alt          text,
  decorative   boolean not null default false,
  credit       text,
  width        integer,
  height       integer,
  bytes        integer,
  uploaded_by  text,
  replaced_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists site_media_updated_at on public.site_media;
create trigger site_media_updated_at before update on public.site_media for each row execute function public.set_updated_at();
alter table public.site_media enable row level security;
create index if not exists site_media_brand_idx on public.site_media (brand_key, folder, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. site_editor_scopes (members)
-- ---------------------------------------------------------------------------
create table if not exists public.site_editor_scopes (
  id             bigint generated always as identity primary key,
  brand_key      text not null references public.brand_sites (brand_key) on delete cascade,
  profile_id     bigint references public.profiles (id) on delete cascade,
  invited_email  text,
  role           text not null default 'editor' check (role in ('admin','editor','writer')),
  status         text not null default 'active' check (status in ('invited','active')),
  last_active_at timestamptz,
  granted_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint site_editor_scopes_identity check (profile_id is not null or invited_email is not null)
);
drop trigger if exists site_editor_scopes_updated_at on public.site_editor_scopes;
create trigger site_editor_scopes_updated_at before update on public.site_editor_scopes for each row execute function public.set_updated_at();
alter table public.site_editor_scopes enable row level security;
create unique index if not exists site_editor_scopes_profile_uq on public.site_editor_scopes (brand_key, profile_id) where profile_id is not null;
create unique index if not exists site_editor_scopes_email_uq on public.site_editor_scopes (brand_key, lower(invited_email)) where invited_email is not null;

-- The system role that makes a profile staff (reach admin.*); scope rows then
-- say which sites. The role alone grants nothing.
insert into public.roles (name, description, is_system) values
  ('Site Editor', 'Edits one or more brand websites (scoped per site in Websites > Members)', true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 7. site_page_views (counters only - no IP, no UA, no identifiers)
-- ---------------------------------------------------------------------------
create table if not exists public.site_page_views (
  brand_key  text not null references public.brand_sites (brand_key) on delete cascade,
  path       text not null,
  day        date not null,
  views      integer not null default 0,
  primary key (brand_key, path, day)
);
alter table public.site_page_views enable row level security;

create or replace function public.site_page_view_bump(p_brand text, p_path text, p_day date, p_n integer)
returns void language sql as $$
  insert into public.site_page_views (brand_key, path, day, views) values (p_brand, p_path, p_day, p_n)
  on conflict (brand_key, path, day) do update set views = public.site_page_views.views + excluded.views;
$$;

-- ---------------------------------------------------------------------------
-- 8. site_redirects
-- ---------------------------------------------------------------------------
create table if not exists public.site_redirects (
  id          bigint generated always as identity primary key,
  brand_key   text not null references public.brand_sites (brand_key) on delete cascade,
  from_path   text not null,
  to_path     text,
  reason      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (brand_key, from_path)
);
alter table public.site_redirects enable row level security;

-- ---------------------------------------------------------------------------
-- 9. site_locations + site_programs (site-owned records until Module 4 links)
-- ---------------------------------------------------------------------------
create table if not exists public.site_locations (
  id            bigint generated always as identity primary key,
  brand_key     text not null references public.brand_sites (brand_key) on delete cascade,
  slug          text not null,
  name          text not null,
  city          text,
  region        text not null default 'Ontario',
  venue         text,
  address       text,
  parking       text,
  arrival       text,
  contact       text,
  social_url    text,
  status        text not null default 'opening_soon' check (status in ('open','opening_soon','waitlist','closed')),
  launch_label  text,                 -- e.g. 'Coming Jan 2027' (shown instead of a generic status)
  sports        text[] not null default '{}',
  note          text,
  photo_url     text,
  photo_alt     text,
  calendar      jsonb not null default '[]',   -- [[label, value], ...]
  location_id   bigint references public.locations (id) on delete set null,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (brand_key, slug)
);
drop trigger if exists site_locations_updated_at on public.site_locations;
create trigger site_locations_updated_at before update on public.site_locations for each row execute function public.set_updated_at();
alter table public.site_locations enable row level security;

create table if not exists public.site_programs (
  id             bigint generated always as identity primary key,
  brand_key      text not null references public.brand_sites (brand_key) on delete cascade,
  slug           text not null,
  location_slug  text not null,
  sport          text not null,
  league_type    text not null,        -- Youth League, Adult League, Youth Skills, Rep
  name           text not null,
  status         text not null default 'coming_soon' check (status in ('open','coming_soon','full','closed','archived')),
  status_label   text,                 -- e.g. 'Coming Jan 2027'
  description    text,
  facts          jsonb not null default '[]',   -- [[label, value], ...] in the fixed fact-block order
  program_id     bigint references public.programs (id) on delete set null,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (brand_key, slug)
);
drop trigger if exists site_programs_updated_at on public.site_programs;
create trigger site_programs_updated_at before update on public.site_programs for each row execute function public.set_updated_at();
alter table public.site_programs enable row level security;
create index if not exists site_programs_loc_idx on public.site_programs (brand_key, location_slug, sport);

-- ---------------------------------------------------------------------------
-- 10. site_leads (interest sign-ups, requests, hosting enquiries, contact)
-- ---------------------------------------------------------------------------
create table if not exists public.site_leads (
  id            bigint generated always as identity primary key,
  brand_key     text not null references public.brand_sites (brand_key) on delete cascade,
  kind          text not null check (kind in ('interest','request','host','contact','assistance')),
  email         text not null,
  name          text,
  phone         text,
  fields        jsonb not null default '{}',   -- program, age group, sport, area, organization...
  consent       boolean not null default false,
  consent_text  text,                          -- the exact wording agreed to (CASL record)
  source_path   text,
  status        text not null default 'new' check (status in ('new','contacted','closed')),
  created_at    timestamptz not null default now()
);
alter table public.site_leads enable row level security;
create index if not exists site_leads_brand_idx on public.site_leads (brand_key, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- 11. AI visibility checks + Ask logs
-- ---------------------------------------------------------------------------
create table if not exists public.site_ai_questions (
  id          bigint generated always as identity primary key,
  brand_key   text not null references public.brand_sites (brand_key) on delete cascade,
  question    text not null,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.site_ai_questions enable row level security;

create table if not exists public.site_ai_checks (
  id           bigint generated always as identity primary key,
  question_id  bigint not null references public.site_ai_questions (id) on delete cascade,
  assistant    text not null,
  ran_at       timestamptz not null default now(),
  result       text not null check (result in ('cited','mentioned','none')),
  cited_url    text
);
alter table public.site_ai_checks enable row level security;
create index if not exists site_ai_checks_q_idx on public.site_ai_checks (question_id, ran_at desc);

create table if not exists public.site_ask_logs (
  id          bigint generated always as identity primary key,
  brand_key   text not null references public.brand_sites (brand_key) on delete cascade,
  rate_key    text not null,
  question    text not null,
  answered    boolean not null default false,
  handed_off  boolean not null default false,
  sources     jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
alter table public.site_ask_logs enable row level security;
create index if not exists site_ask_logs_rate_idx on public.site_ask_logs (rate_key, created_at desc);

-- ---------------------------------------------------------------------------
-- 12. team_follows
-- ---------------------------------------------------------------------------
create table if not exists public.team_follows (
  profile_id  bigint not null references public.profiles (id) on delete cascade,
  team_id     bigint not null references public.teams (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, team_id)
);
alter table public.team_follows enable row level security;

-- ---------------------------------------------------------------------------
-- 13. Changes to existing tables
-- ---------------------------------------------------------------------------
alter table public.brands add column if not exists design_tokens jsonb not null default '{}';
alter table public.brands add column if not exists site_url text;
alter table public.programs add column if not exists site_blocks jsonb not null default '[]';
alter table public.programs add column if not exists site_featured boolean not null default false;

-- ============================================================================
-- 14. ALL CAN Sport seed (allcansport.ca). Status stays OFF until launch.
-- ============================================================================
insert into public.brand_sites (brand_key, status, hostnames, primary_host, theme_key, name, seo, social, contact, links, coming_soon, settings)
values (
  'all-can', 'off', array['allcansport.ca','www.allcansport.ca'], 'allcansport.ca', 'all-can', 'ALL CAN Sport',
  jsonb_build_object(
    'title', 'ALL CAN Sport',
    'default_description', 'Inclusive, professionally run leagues and skill development for youth and adults of all abilities.',
    'keywords', jsonb_build_array(),
    'title_formats', jsonb_build_object('page', '{Page} · ALL CAN Sport', 'location', '{Location} youth sports · ALL CAN Sport', 'sport', '{Sport} in {Location} · ALL CAN Sport', 'team', '{Team} · {Division} · ALL CAN Sport'),
    'index_team_pages', true,
    'ai', jsonb_build_object('answers', true, 'training', false),
    'setup_done', false
  ),
  '{}'::jsonb,
  jsonb_build_object('email', 'info@athleteinstitute.ca', 'phone', '519-940-3735', 'address', 'Athlete Institute, Ltd., 207321 Highway 9, Mono, ON L9W 6J2, Canada', 'legal_name', 'Athlete Institute, Ltd.'),
  jsonb_build_object('watch_url', 'https://live.athleteinstitute.ca', 'tickets_url', 'https://tickets.athleteinstitute.ca', 'gear_url', 'https://gear.athleteinstitute.ca', 'play_url', 'https://play.athleteinstitute.ca'),
  jsonb_build_object('headline', 'ALL CAN Sport is coming.', 'body', 'Inclusive, professionally run leagues and skill development for youth and adults of all abilities. Leave your email and we will tell you when registration opens.', 'show_email_capture', true),
  jsonb_build_object('ask_enabled', true, 'ask_handoff_email', 'info@athleteinstitute.ca')
)
on conflict (brand_key) do nothing;

-- Locations
insert into public.site_locations (brand_key, slug, name, city, region, venue, address, status, launch_label, sports, note, calendar, sort_order)
select 'all-can', 'toronto-midtown', 'Toronto Midtown', 'Toronto', 'Ontario', 'De La Salle College', '131 Farnham Ave, Toronto, ON', 'opening_soon', 'Coming Jan 2027', array['basketball'], 'Area name [TBC]',
  '[["Registration opens","[TBC]"],["Placement","[TBC]"],["Jerseys","[TBC]"],["First session","[TBC]"],["Last session","[TBC]"]]'::jsonb, 1
where not exists (select 1 from public.site_locations where brand_key = 'all-can' and slug = 'toronto-midtown');
insert into public.site_locations (brand_key, slug, name, city, region, venue, address, status, sports, note, calendar, sort_order)
select 'all-can', 'orangeville', 'Orangeville', 'Orangeville', 'Ontario', 'Athlete Institute', '207321 Highway 9, Mono, ON L9W 6J2', 'open', array['basketball'], 'Home of the ALL CAN Circuit',
  '[["Season","[TBC]"],["Events","[TBC]"]]'::jsonb, 2
where not exists (select 1 from public.site_locations where brand_key = 'all-can' and slug = 'orangeville');

-- Programs (site-owned facts; link program_id when Module 4 registration opens)
insert into public.site_programs (brand_key, slug, location_slug, sport, league_type, name, status, status_label, facts, sort_order)
select 'all-can', 'toronto-midtown-basketball-league', 'toronto-midtown', 'basketball', 'Youth League', 'ALL CAN Basketball League', 'coming_soon', 'Coming Jan 2027',
  '[["Ages","[TBC]"],["Format","30-minute skills block, then gameplay."],["Day and time","[TBC]"],["Season","[TBC]"],["Venue","De La Salle College · 131 Farnham Ave, Toronto, ON"],["Price","[TBC], taxes included or shown"],["Included","Jersey [TBC] · coaching · officials [TBC]"],["Spots","[TBC]"],["Registration","Opens [TBC]"]]'::jsonb, 1
where not exists (select 1 from public.site_programs where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league');
insert into public.site_programs (brand_key, slug, location_slug, sport, league_type, name, status, status_label, facts, sort_order)
select 'all-can', 'toronto-midtown-basketball-skills', 'toronto-midtown', 'basketball', 'Youth Skills', 'ALL CAN Basketball Skills', 'coming_soon', 'Coming Jan 2027',
  '[["Ages","[TBC]"],["Format","Skills sessions: ball handling, finishing, shooting, defence and decisions."],["Day and time","[TBC]"],["Season","[TBC]"],["Venue","De La Salle College · 131 Farnham Ave, Toronto, ON"],["Price","[TBC]"],["Group size","[TBC]"],["Registration","Opens [TBC]"]]'::jsonb, 2
where not exists (select 1 from public.site_programs where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-skills');
insert into public.site_programs (brand_key, slug, location_slug, sport, league_type, name, status, facts, sort_order)
select 'all-can', 'circuit', 'orangeville', 'basketball', 'Rep', 'ALL CAN Circuit', 'open',
  '[["Divisions","[TBC]"],["Format","Rep teams. Selection and competitive expectations [TBC]."],["Season","[TBC]"],["Home venue","Athlete Institute · 207321 Highway 9, Mono, ON L9W 6J2"],["Events","[TBC]"],["Selection","[TBC]"]]'::jsonb, 3
where not exists (select 1 from public.site_programs where brand_key = 'all-can' and slug = 'circuit');

-- Media (files shipped in /public/sites/all-can; the library can replace them)
insert into public.site_media (brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
select * from (values
  ('all-can','photo','home-hero.jpg','Home','/sites/all-can/photos/home-hero.jpg','ALL CAN Basketball youth game. A player in a black number 24 jersey dribbles up the court, with a teammate in white number 32 behind him.',false,'',2556,1632),
  ('all-can','logo','allcan-wordmark-ce112d.png','Brand','/sites/all-can/logos/allcan-wordmark-ce112d.png','ALL CAN',false,'ALL CAN brand system',1622,231),
  ('all-can','logo','sport-horizontal-on-black.png','Brand','/sites/all-can/logos/sport-horizontal-on-black.png','ALL CAN Sport',false,'ALL CAN brand system',900,97),
  ('all-can','logo','sport-horizontal-leaf-red.png','Brand','/sites/all-can/logos/sport-horizontal-leaf-red.png','ALL CAN Sport',false,'ALL CAN brand system',900,97),
  ('all-can','logo','shield-on-black.png','Brand','/sites/all-can/logos/shield-on-black.png','ALL CAN Sport',false,'ALL CAN brand system',182,220),
  ('all-can','logo','circuit-on-dark.png','Brand','/sites/all-can/logos/circuit-on-dark.png','ALL CAN Circuit',false,'ALL CAN brand system',520,182),
  ('all-can','logo','all-canadian-games.png','Partners','/sites/all-can/partners/all-canadian-games.png','All Canadian Games',false,'',501,501),
  ('all-can','logo','athlete-institute.png','Partners','/sites/all-can/partners/athlete-institute.png','Athlete Institute',false,'',0,0),
  ('all-can','logo','nccp.png','Partners','/sites/all-can/partners/nccp.png','National Coaching Certification Program (NCCP)',false,'',0,0),
  ('all-can','logo','safe-sport-training.png','Partners','/sites/all-can/partners/safe-sport-training.png','Safe Sport Training',false,'',0,0),
  ('all-can','logo','basketball.png','Sport marks','/sites/all-can/sports/basketball.png','',true,'ALL CAN brand system',0,0),
  ('all-can','logo','volleyball.png','Sport marks','/sites/all-can/sports/volleyball.png','',true,'ALL CAN brand system',0,0),
  ('all-can','logo','soccer.png','Sport marks','/sites/all-can/sports/soccer.png','',true,'ALL CAN brand system',0,0),
  ('all-can','logo','flag-football.png','Sport marks','/sites/all-can/sports/flag-football.png','',true,'ALL CAN brand system',0,0)
) as v(brand_key, kind, name, folder, url, alt, decorative, credit, width, height)
where not exists (select 1 from public.site_media m where m.brand_key = 'all-can' and m.url = v.url);

-- Pages. System templates draw their main content from records; blocks hold
-- the editorial parts. Published = draft at seed time so the site renders.
do $seed$
declare
  pg record;
begin
  if exists (select 1 from public.site_pages where brand_key = 'all-can') then
    return;
  end if;

  insert into public.site_pages (brand_key, kind, template, ref, slug, title, blocks_draft, sort_order, hidden_from_menu, seo) values
  ('all-can','home','home',null,'','Home', $j$[
    {"id":"b-hero","type":"hero","props":{"style":"photo","imageUrl":"/sites/all-can/photos/home-hero.jpg","imageAlt":"ALL CAN Basketball youth game. A player in a black number 24 jersey dribbles up the court, with a teammate in white number 32 behind him.","credit":"[TBC]","wordmarkUrl":"/sites/all-can/logos/allcan-wordmark-ce112d.png","wordmarkAlt":"ALL CAN","headingLines":["Sport that belongs","to everyone."],"accentWord":"Sport","ctaLabel":"Find your location","ctaHref":"/locations","height":"full"}},
    {"id":"b-why","type":"why_band","props":{"label":"Why ALL CAN","mission":"Inclusive, professionally run leagues and skill development for youth and adults of all abilities.","pillars":[["Play.","For life."],["Compete.","Together."],["Grow.","Every day."]],"showSports":true}},
    {"id":"b-partners","type":"partners","props":{"label":"Partners","items":[{"name":"All Canadian Games","logoUrl":"/sites/all-can/partners/all-canadian-games.png","factor":1},{"name":"Athlete Institute","logoUrl":"/sites/all-can/partners/athlete-institute.png","factor":0.58},{"name":"National Coaching Certification Program (NCCP)","logoUrl":"/sites/all-can/partners/nccp.png","factor":0.661},{"name":"Safe Sport Training","logoUrl":"/sites/all-can/partners/safe-sport-training.png","factor":0.579}]}},
    {"id":"b-locs","type":"location_list","props":{"label":"Locations","showRequestRow":true}},
    {"id":"b-compete","type":"big_buttons","props":{"label":"Schedules, results and standings","buttons":[{"label":"Schedules & Results","href":"/scores"},{"label":"Standings","href":"/standings"}]}}
  ]$j$::jsonb, 1, false, '{"title":"ALL CAN Sport · Youth and adult sports leagues in Toronto and Orangeville","description":"Inclusive, professionally run leagues and skill development for youth and adults of all abilities. Basketball in Toronto Midtown and Orangeville."}'::jsonb),

  ('all-can','system','locations',null,'locations','Locations','[]'::jsonb, 2, false, '{"description":"Find ALL CAN Sport near you. Toronto Midtown at De La Salle College and Orangeville at Athlete Institute, with the status of every location."}'::jsonb),
  ('all-can','system','location','toronto-midtown','toronto-midtown','Toronto Midtown','[]'::jsonb, 3, false, '{}'::jsonb),
  ('all-can','system','location-sport','toronto-midtown/basketball','toronto-midtown/basketball','Toronto Midtown · Basketball','[]'::jsonb, 4, false, '{"title":"Youth basketball in Toronto Midtown · ALL CAN Sport","description":"ALL CAN Basketball League and skills at De La Salle College, Toronto. A skills block, then gameplay. Coming January 2027. Get notified when it opens."}'::jsonb),
  ('all-can','system','location','orangeville','orangeville','Orangeville','[]'::jsonb, 5, false, '{"description":"Home of the ALL CAN Circuit."}'::jsonb),
  ('all-can','system','location-sport','orangeville/basketball','orangeville/basketball','Orangeville · Basketball','[]'::jsonb, 6, false, '{}'::jsonb),
  ('all-can','system','sport','basketball','basketball','Basketball', $j$[
    {"id":"b-path","type":"rich_text","props":{"label":"Pathway","heading":"Where every player fits.","html":"<p><b>ALL CAN Basketball Skills</b> &middot; Youth skills. Focused skill sessions. A first step, or extra work alongside the league.</p><p><b>ALL CAN Basketball League</b> &middot; Youth league. Skills block, then gameplay, every week of the season. A full choice in its own right.</p><p><b>ALL CAN Circuit</b> &middot; Rep. Selected rep teams that travel and compete. Selection details [TBC].</p>"}},
    {"id":"b-age","type":"fact_block","props":{"label":"Age-adapted play","heading":"The game fits the player.","facts":[["Ball size","By age group [TBC]"],["Rim height","Lowered for younger groups [TBC]"],["Game format","By age group [TBC]"]],"note":"ALL CAN will publish its age-group rules here once confirmed."}}
  ]$j$::jsonb, 7, false, '{"description":"Youth league, skills sessions and the ALL CAN Circuit rep program. Find basketball at an ALL CAN Sport location near you, from first steps to rep."}'::jsonb),
  ('all-can','system','sport-soon','volleyball','volleyball','Volleyball','[]'::jsonb, 8, true, '{"description":"ALL CAN Volleyball is coming soon. Request a location near you, or get notified when leagues and skills sessions open for youth and adults."}'::jsonb),
  ('all-can','system','sport-soon','soccer','soccer','Soccer','[]'::jsonb, 9, true, '{}'::jsonb),
  ('all-can','system','sport-soon','flag-football','flag-football','Flag Football','[]'::jsonb, 10, true, '{}'::jsonb),
  ('all-can','system','circuit','circuit','circuit','ALL CAN Circuit','[]'::jsonb, 11, false, '{"description":"The ALL CAN Circuit is a rep basketball program based at Athlete Institute in Mono, Ontario. Teams, events and how selection works, in one place."}'::jsonb),
  ('all-can','system','scores',null,'scores','Schedules and results','[]'::jsonb, 12, false, '{"description":"Schedules and final scores for every ALL CAN Sport division. Filter by location and division to find your team''s next game and latest result."}'::jsonb),
  ('all-can','system','standings',null,'standings','Standings','[]'::jsonb, 13, false, '{"description":"Standings for every ALL CAN Sport division, ranked by wins and then point difference. Updated as soon as each final score is entered."}'::jsonb),
  ('all-can','system','rosters',null,'rosters','Rosters','[]'::jsonb, 14, false, '{"description":"Teams and players in every ALL CAN Sport division. Youth players appear by name only with guardian permission; everyone else shows as a team member."}'::jsonb),
  ('all-can','system','training',null,'training','Training', $j$[
    {"id":"b-private","type":"rich_text","props":{"label":"Private instruction","heading":"One player. One plan.","html":"<p>Sessions start with goals and an assessment, connect skills to game situations, and end with a short progress note.</p>"}},
    {"id":"b-formats","type":"fact_block","props":{"facts":[["1:1","Ages [TBC] · 60 min · $[TBC] + tax"],["Partner (2)","Ages [TBC] · 60 min · $[TBC] + tax"],["Small group (3–4)","Ages [TBC] · 60 min · $[TBC] + tax"],["Cancellation","[TBC] hours notice"]]}},
    {"id":"b-req","type":"request_form","props":{"variant":"training","heading":"Request a session.","note":"A request isn't a confirmed booking. We reply within [TBC] business days."}}
  ]$j$::jsonb, 15, true, '{}'::jsonb),
  ('all-can','system','stories',null,'stories','Stories','[]'::jsonb, 16, true, '{"description":"News and features from ALL CAN Sport: announcements, new locations, and stories about the coaches and players in our leagues and skills programs."}'::jsonb),
  ('all-can','system','parent-guide',null,'parent-guide','Parent guide', $j$[
    {"id":"b-faq","type":"faq","props":{"label":"Everything in one place","openFirst":true,"items":[
      {"q":"How does a session work?","a":"Every league session starts with a 30-minute skills block, then gameplay.","note":"Session plans by age group are [TBC]."},
      {"q":"How are teams formed?","a":"Players are placed by age group and, where possible, friend requests.","note":"The placement date for Toronto Midtown is [TBC]."},
      {"q":"What should we bring?","a":"Indoor shoes, a water bottle and the ALL CAN jersey once issued.","note":"Jersey details are [TBC]."},
      {"q":"What about attendance and weather?","a":"Missed sessions aren't refunded. Weather cancellations are emailed to every family.","note":"The make-up policy is [TBC]."},
      {"q":"Refunds and cancellations","a":"Requests go through the contact page, never social messages.","note":"The refund policy is [TBC]."},
      {"q":"Photos and consent","a":"Player profiles appear only with guardian permission. Families can opt out at any time.","note":"The opt-out route is [TBC]."},
      {"q":"Code of conduct","a":"Players, families and coaches follow the ALL CAN code of conduct.","note":"The code of conduct is [TBC]."}
    ]}}
  ]$j$::jsonb, 17, true, '{"description":"How ALL CAN Sport works for families: placement, what to bring, attendance, weather, refunds and conduct. Everything a parent needs before the first day."}'::jsonb),
  ('all-can','system','financial-assistance',null,'financial-assistance','Financial assistance', $j$[
    {"id":"b-fa","type":"fact_block","props":{"label":"ALL CAN assistance","heading":"What it covers.","facts":[["Covers","Registration fees · jersey [TBC]"],["Award limits","[TBC]"],["Who reviews","[TBC]"],["Response time","[TBC]"],["Appeals","[TBC]"]],"note":"Funding for this season is being confirmed. Until it is, use the request below and we'll tell you what's possible."}},
    {"id":"b-other","type":"rich_text","props":{"label":"Other programs","html":"<p><a href=\"https://kidsportcanada.ca/ontario/\" target=\"_blank\" rel=\"noopener\"><b>KidSport Ontario</b></a> &middot; Registration and equipment grants for under-resourced youth, 18 and under. Apply ahead of the season.</p><p><a href=\"https://jumpstart.canadiantire.ca\" target=\"_blank\" rel=\"noopener\"><b>Canadian Tire Jumpstart</b></a> &middot; Help with registration, equipment and transportation, ages 4 to 18.</p>"}},
    {"id":"b-req","type":"request_form","props":{"variant":"assistance","heading":"Ask privately.","note":"We collect only what the reviewer needs. Coaches never see requests."}}
  ]$j$::jsonb, 18, true, '{}'::jsonb),
  ('all-can','system','about',null,'about','About ALL CAN Sport', $j$[
    {"id":"b-op","type":"rich_text","props":{"label":"Operator","heading":"A division of Athlete Institute.","html":"<p>ALL CAN Sport is a division of Athlete Institute, Ltd., which runs its programs, registration and facilities. Orangeville Prep and the All Canadian Games keep their own sites.</p>"}}
  ]$j$::jsonb, 19, false, '{"description":"ALL CAN Sport is a division of Athlete Institute: inclusive, professionally run leagues and skill development in basketball, volleyball, soccer and more."}'::jsonb),
  ('all-can','system','privacy-policy',null,'privacy-policy','Privacy policy','[]'::jsonb, 20, true, '{"description":"How ALL CAN Sport, a division of Athlete Institute, Ltd., collects, uses and protects personal information, including youth players'' names and photos."}'::jsonb),
  ('all-can','system','my-teams',null,'my-teams','My teams','[]'::jsonb, 21, true, '{"noindex":true}'::jsonb);

  update public.site_pages set blocks_published = blocks_draft, published_at = now(), published_by = 'system:migration' where brand_key = 'all-can';
  update public.brand_sites set home_page_id = (select id from public.site_pages where brand_key = 'all-can' and slug = '') where brand_key = 'all-can';
end $seed$;

-- Navigation tree (root > folder > page/link). Labels are stored plain; the
-- header adds the period when it draws the menu.
do $nav$
declare
  n_play bigint; n_bb bigint; n_vb bigint; n_sc bigint; n_ff bigint;
  n_loc bigint; n_on bigint; n_comp bigint; n_fam bigint;
  pid bigint;
begin
  if exists (select 1 from public.site_nav_items where brand_key = 'all-can') then
    return;
  end if;

  insert into public.site_nav_items (brand_key, kind, label, description, sort_order) values ('all-can','folder','Play','Leagues and skills for every sport.',1) returning id into n_play;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, sort_order, meta) values ('all-can',n_play,'folder','Basketball',1,'{"sport":"basketball"}') returning id into n_bb;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_bb,'page','League','/toronto-midtown/basketball',1);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_bb,'page','Skills','/training',2);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_bb,'page','Circuit','/circuit',3);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, sort_order, meta) values ('all-can',n_play,'folder','Volleyball',2,'{"sport":"volleyball","soon":true}') returning id into n_vb;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_vb,'page','League','/volleyball',1);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_vb,'page','Skills','/volleyball',2);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, sort_order, meta) values ('all-can',n_play,'folder','Soccer',3,'{"sport":"soccer","soon":true}') returning id into n_sc;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_sc,'page','League','/soccer',1);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_sc,'page','Skills','/soccer',2);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, sort_order, meta) values ('all-can',n_play,'folder','Flag Football',4,'{"sport":"flag-football","soon":true}') returning id into n_ff;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_ff,'page','League','/flag-football',1);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, featured, description, sort_order) values ('all-can',n_play,'page','Basketball first.','/basketball',true,'League, skills and the Circuit.',9);

  insert into public.site_nav_items (brand_key, kind, label, description, sort_order) values ('all-can','folder','Locations','Pick where you play.',2) returning id into n_loc;
  insert into public.site_nav_items (brand_key, parent_id, kind, label, sort_order) values ('all-can',n_loc,'folder','Ontario',1) returning id into n_on;
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'toronto-midtown';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_on,'page','Toronto Midtown',pid,'/toronto-midtown',1);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'orangeville';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_on,'page','Orangeville',pid,'/orangeville',2);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'locations';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, visible, sort_order) values ('all-can',n_loc,'page','All locations',pid,'/locations',false,2);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_loc,'page','Request a location','/locations#request',3);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_loc,'page','Host a program','/locations#host',4);

  insert into public.site_nav_items (brand_key, kind, label, description, sort_order) values ('all-can','folder','Compete','Schedules, results, standings and rosters.',3) returning id into n_comp;
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'scores';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_comp,'page','Schedules & Results',pid,'/scores',1);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'standings';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_comp,'page','Standings',pid,'/standings',2);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'rosters';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_comp,'page','Rosters',pid,'/rosters',3);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, featured, description, sort_order) values ('all-can',n_comp,'page','Schedules & results','/scores',true,'Every game, by location and division.',9);

  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'training';
  insert into public.site_nav_items (brand_key, kind, label, page_id, href, visible, sort_order) values ('all-can','page','Training',pid,'/training',false,4);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'stories';
  insert into public.site_nav_items (brand_key, kind, label, page_id, href, visible, sort_order) values ('all-can','page','Stories',pid,'/stories',false,5);

  insert into public.site_nav_items (brand_key, kind, label, description, sort_order) values ('all-can','folder','Families','Everything a parent needs.',6) returning id into n_fam;
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'parent-guide';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, visible, sort_order) values ('all-can',n_fam,'page','Parent guide',pid,'/parent-guide',false,1);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'financial-assistance';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, visible, sort_order) values ('all-can',n_fam,'page','Financial assistance',pid,'/financial-assistance',false,2);
  select id into pid from public.site_pages where brand_key = 'all-can' and slug = 'about';
  insert into public.site_nav_items (brand_key, parent_id, kind, label, page_id, href, sort_order) values ('all-can',n_fam,'page','About ALL CAN Sport',pid,'/about',3);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order) values ('all-can',n_fam,'page','Contact','/about#contact',4);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, new_tab, visible, sort_order) values ('all-can',n_fam,'link','Rowan''s Law (concussion safety)','https://www.ontario.ca/page/rowans-law-concussion-safety',true,false,5);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, new_tab, visible, sort_order) values ('all-can',n_fam,'link','Safe Sport','https://abuse-free-sport.ca',true,false,6);
  insert into public.site_nav_items (brand_key, parent_id, kind, label, href, featured, description, sort_order) values ('all-can',n_fam,'page','About ALL CAN','/about',true,'Who we are and how to reach us.',9);

  insert into public.site_nav_items (brand_key, kind, label, href, new_tab, visible, sort_order) values ('all-can','link','Shop','https://gear.athleteinstitute.ca',true,false,7);
end $nav$;

-- Footer columns
update public.brand_sites set footer = jsonb_build_object(
  'columns', jsonb_build_array(
    jsonb_build_object('title','ALL CAN Sport','items', jsonb_build_array(
      jsonb_build_object('label','Locations','href','/locations'),
      jsonb_build_object('label','Host a program','href','/locations#host'),
      jsonb_build_object('label','Schedules and results','href','/scores'),
      jsonb_build_object('label','Standings','href','/standings'))),
    jsonb_build_object('title','Families','items', jsonb_build_array(
      jsonb_build_object('label','About','href','/about'),
      jsonb_build_object('label','Contact','href','/about#contact'),
      jsonb_build_object('label','Privacy policy','href','/privacy-policy'))),
    jsonb_build_object('title','Athlete Institute','items', jsonb_build_array(
      jsonb_build_object('label','Watch','href','https://live.athleteinstitute.ca','new_tab',true),
      jsonb_build_object('label','Tickets','href','https://tickets.athleteinstitute.ca','new_tab',true),
      jsonb_build_object('label','Shop','href','https://gear.athleteinstitute.ca','new_tab',true)))
  ),
  'tagline', 'A division of Athlete Institute.',
  'partners', true
)
where brand_key = 'all-can' and footer = '{}'::jsonb;

-- Stories
insert into public.site_posts (brand_key, slug, title, excerpt, type, location_slug, sport, program_slug, author_label, body_blocks, status, published_at, created_by)
select 'all-can', 'allcan-sport-launches', 'ALL CAN Sport launches.', 'ALL CAN Sport brings basketball, volleyball, soccer and flag football under one name, starting with basketball.', 'Announcement', null, null, null, 'ALL CAN Sport',
  '[{"id":"p1","type":"rich_text","props":{"html":"<p>ALL CAN Sport brings basketball, volleyball, soccer and flag football under one name, starting with basketball.</p><p>Families can find a location, see each program''s facts in one place, and follow scores and standings on this site. Launch dates for each sport are [TBC].</p>"}}]'::jsonb,
  'published', now() - interval '3 days', 'system:migration'
where not exists (select 1 from public.site_posts where brand_key = 'all-can' and slug = 'allcan-sport-launches');
insert into public.site_posts (brand_key, slug, title, excerpt, type, location_slug, sport, program_slug, author_label, body_blocks, status, published_at, created_by)
select 'all-can', 'toronto-midtown-opens', 'Toronto Midtown opens at De La Salle College.', 'ALL CAN Basketball League and ALL CAN Basketball Skills are coming to De La Salle College, 131 Farnham Ave, Toronto.', 'Announcement', 'toronto-midtown', 'basketball', 'toronto-midtown-basketball-league', 'ALL CAN Sport',
  '[{"id":"p1","type":"rich_text","props":{"html":"<p>ALL CAN Basketball League and ALL CAN Basketball Skills are coming to De La Salle College, 131 Farnham Ave, Toronto.</p><p>Ages, days, season dates and price are [TBC]. Leave your details on the location page and we''ll email you when registration opens.</p>"}}]'::jsonb,
  'published', now() - interval '2 days', 'system:migration'
where not exists (select 1 from public.site_posts where brand_key = 'all-can' and slug = 'toronto-midtown-opens');
insert into public.site_posts (brand_key, slug, title, excerpt, type, location_slug, sport, program_slug, author_label, body_blocks, status, published_at, created_by)
select 'all-can', 'how-the-skills-block-works', 'How the skills block works.', 'Every league session starts with 30 minutes of structured skill work before the game.', 'Feature', null, 'basketball', 'toronto-midtown-basketball-league', '[TBC]',
  '[{"id":"p1","type":"rich_text","props":{"html":"<p>Every league session starts with 30 minutes of structured skill work before the game.</p><p>Coaches teach one movement or decision, give feedback, then players use it in gameplay. Session plans by age group are [TBC].</p>"}}]'::jsonb,
  'published', now() - interval '1 day', 'system:migration'
where not exists (select 1 from public.site_posts where brand_key = 'all-can' and slug = 'how-the-skills-block-works');

-- Redirects from the audit's migration list (destinations chosen by staff)
insert into public.site_redirects (brand_key, from_path, to_path, reason, created_by)
select 'all-can', '/aibl', null, 'Old league page, from the audit', 'system:migration'
where not exists (select 1 from public.site_redirects where brand_key = 'all-can' and from_path = '/aibl');
insert into public.site_redirects (brand_key, from_path, to_path, reason, created_by)
select 'all-can', '/allcan-basketball', '/basketball', 'Old program page', 'system:migration'
where not exists (select 1 from public.site_redirects where brand_key = 'all-can' and from_path = '/allcan-basketball');

-- Tracked AI visibility questions
insert into public.site_ai_questions (brand_key, question, created_by)
select 'all-can', q, 'system:migration' from unnest(array[
  'Where can my kid play basketball in Midtown Toronto?',
  'Youth basketball leagues near Orangeville',
  'Rep basketball teams in Ontario for kids',
  'Inclusive sports programs for kids in Toronto'
]) as q
where not exists (select 1 from public.site_ai_questions where brand_key = 'all-can');

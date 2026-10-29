# Athlete Institute — Facility & Registration Portal

## Module 23 of N: BRAND SITES (each brand gets its own website, with Compete built in)

> Every top-level brand (ALL CAN first, then Orangeville Prep, Orangeville Bears, All Canadian Games, Athlete Institute) gets **its own public website on its own root domain**, served from **this repo** the same way `play.*`, `admin.*` and `compete.*` are. The Compete Portal (standings, schedules, results, rosters, brackets, player pages) is **built into** each brand site rather than living only at `compete.athleteinstitute.ca`. Staff build and run each site from `admin.athleteinstitute.ca` with a **block-based page builder**, a **mega-menu navigation editor**, **draft/publish** per page, a **site launch switch**, and a **per-site dashboard** (traffic, registrations, revenue, content status, Compete activity). Build after Modules 6, 7, 9, 14 and 17 — it reads all of them.

---

## Decisions already made (do not re-open; these came from the owner)

| Question | Decision |
|---|---|
| What is a "brand"? | One of the **top-level brands** in `brands` / `@ai/foundation/brands` (`brand_key`). Leagues and tournaments are pages **inside** a brand site, not sites of their own. |
| Where does a site live? | **Its own root domain per brand.** ALL CAN = **`allcansport.ca`** (owned, no site today, GoDaddy). Other brands follow when their domains and designs are ready. |
| Codebase | **This repo, host-routed.** A fourth route tree (`/site`) next to `/play`, `/admin`, `/compete`. Direct Supabase reads, one Vercel project, one deploy. |
| compete.athleteinstitute.ca | **Stays** as the all-brands index. League/division/player pages **serve on both** Compete and the brand site; the brand site is the **canonical** URL in metadata. |
| Site contents | Marketing home / about / contact, **custom staff-made pages**, **program & registration pages that auto-update from program data**, Compete pages, news / gallery / blog, pages can be **published, hidden from menu, or drafted**, a **dashboard** with site info + metrics. |
| Design | **Full design system per brand** (fonts, palette, components), not just an accent swap. ALL CAN's brand system is being finalised in Claude Design and the site design will be produced from it **before coding the ALL CAN theme**. Brands without a design system launch on the shared Vanguard skeleton themed by accent/logo and are upgraded later. |
| Editing | Staff edit in **admin.athleteinstitute.ca**. **Per-brand staff see only their brand's site(s)**; super admins see all. Site roles: Site admin, Editor, Writer (§2.6), managed per site in **Members**. |
| Page builder | **Block-based**: a page is an ordered stack of typed blocks. |
| Navigation | Items are **page / folder / link**. **Top level + one dropdown, with the option of one additional nested level** (folder in a folder). **Mega menu on desktop**, drawer on mobile. |
| Publishing | **Draft + publish per page**, plus a **site-wide switch**: `off` → `coming_soon` → `live`. Scheduled publishing applies to **stories** (news posts) now, through the ALL CAN Stories editor; scheduled publishing of pages stays a later nicety. |
| Sign-in | **Full sign-in on each brand domain** via **Clerk satellite domains** on the existing shared Clerk instance. |
| Registration | **Register and pay on the brand domain** using the existing Module 4 registration + Module 0 Stripe rails. Program pages pull **dates/schedule/location, price/fees/payment plans, eligibility/spots left/deadline, description/images/coaches** live. |
| Payments | **One shared Stripe account + one Clerk instance** for every brand. Revenue reported by `brand_key`. |
| Dashboard | (Expanded later by the owner: a full **Analytics** tab with Google and AI-platform performance, an **SEO** tool, **Stories**, **Media** and **Members** sections; see §7.5a, §9 and the ALL CAN prompt §6.) Page list with hierarchy, traffic (page views, visitors, top pages), registrations + revenue for this brand, content status (published / hidden / draft), Compete activity (divisions, upcoming games, most-viewed standings). |
| Analytics source | **Vercel Web Analytics**, enabled on the project; the dashboard reads Vercel's analytics API per domain. |
| Apps hub | A single **"Websites"** tile on `home.athleteinstitute.ca` that opens a **chooser** listing every live brand site. (Lives in the `athlete-institute-live` repo; this module exposes the manifest it reads.) |
| Emails & TV displays | **Brand domain everywhere**: brand-themed notifications and `/display/[token]` pages link to the brand site when the brand has a live site, else fall back to Play / Compete as today. |
| Live / Tickets / Gear | **Link out only** for now. Each site has Watch / Tickets / Gear buttons pointing at those apps; no in-site feeds. (A `brand_key` on those apps' categories/events/collections is a later module.) |
| Spec home | This file, plus an entry in `MASTER-build-order.md`. |

---

## Project Context

Same stack: **Next.js 14 App Router on Vercel, Clerk, Supabase, Stripe (Canadian), Resend/Twilio/web-push via `notify()`**. Mobile-first, PIPEDA-compliant. The portal already serves three hosts from one codebase through `middleware.ts` + `resolvePortalApp()` (`packages/foundation/src/hosts.ts`). Brands exist in code (`packages/foundation/src/brands.ts`) and in the DB (`brands` table, migration 0001; admin editor at `/admin/brands`, `lib/brands/brands.ts`). Programs carry `brand_key` (migration 0016). Compete's public, anonymous, name-masking data layer is `lib/compete/compete.ts`; per-league branding, sponsors and tickets links are on `programs.compete_brand` (migration 0056). Public lockups come from `/api/ecosystem/brand-assets`.

**Reuse, don't rebuild:** Compete reads (`lib/compete`), standings (`lib/competitive`), program catalog + registration + cart (`lib/programs`, Module 4), pricing (`@ai/foundation/pricing`), bookings (Module 2), gallery (Module 17), reporting queries (Module 14), `notify()` templates (Module 0), storage helpers (`@ai/foundation/storage`), audit log.

---

## 1. Host model

### 1.1 Resolving a brand site from the request host

Extend `resolvePortalApp()` so an unknown host can resolve to a **brand site** instead of defaulting to `play`:

```ts
export type PortalApp = 'play' | 'admin' | 'compete' | 'site';
export interface ResolvedHost { app: PortalApp; brandKey?: string }
```

- Known portal hosts resolve exactly as today.
- Any other host is looked up in the **edge-safe site host map**. Because middleware cannot hit Supabase, the map is a small JSON manifest **published to the public `brand-assets` bucket** (`sites/hosts.json`) and fetched with a 60-second edge cache, with a **code fallback** (`SEEDED_SITE_HOSTS` in `hosts.ts`) so a storage outage never un-routes a live site. The manifest is rewritten by the admin "Domains" action (see §7.6) whenever a site's hostnames change.
- Hostnames match the **apex** and **`www`** (`allcansport.ca`, `www.allcansport.ca`). `www` redirects 308 to the apex.
- Local dev: `<brand-key>.site.localhost:3000` (e.g. `all-can.site.localhost`) resolves to that brand's site. Vercel preview URLs can force a brand with `?site=<brand-key>` (dev/preview only).

Middleware rewrites a resolved site request to `/site/<brandKey>/<path>` and sets `x-portal-app: site`, `x-site-brand: <brandKey>`, `x-portal-path`, and `x-site-host`. Everything under `/site` is **public** (no auth gate in middleware, same stance as Compete); staff-only preview is enforced in the page itself (§6.3).

### 1.2 Site status gate

`brand_sites.status`:

| status | Behaviour |
|---|---|
| `off` | 404 for everyone except staff with a preview token (§6.3). Domain can be attached and tested without exposure. |
| `coming_soon` | Public sees a single branded "coming soon" page (logo, tagline, optional email capture via `notify()` list, Register-on-Play link). Staff preview sees the full site. |
| `live` | Full site. |

### 1.3 Clerk satellite domains

The shared Clerk instance gains one **satellite domain** per brand site. Per Clerk's multi-domain model: the primary domain stays `athleteinstitute.ca` (where `play.`/`admin.`/`compete.` already live); each brand apex is a satellite. Required per domain:

- Clerk dashboard: add the satellite domain; note the `CLERK_PROXY`/`isSatellite` requirements for the current Clerk SDK version pinned in `package.json` — read the Clerk docs at build time rather than from memory.
- `clerkMiddleware` options become host-aware: `isSatellite: true`, `domain`, and `signInUrl` pointing at the **brand host's own** `/sign-in` (served by the exempt shared sign-in page, which already picks its lockup from `x-portal-app`; add a `site` variant that shows the brand's wordmark).
- Env: a list of satellite hostnames (`CLERK_SATELLITE_HOSTS`) so the middleware knows which hosts are satellites. Store the same list in `brand_sites.hostnames` as the source of truth; the env list is the edge mirror.
- Verify: sign in on `allcansport.ca`, open `play.athleteinstitute.ca` — already signed in; and the reverse.

### 1.4 Stripe and absolute URLs on a brand host

Every absolute URL built during a brand-host request (Stripe `success_url` / `cancel_url`, Clerk `returnBackUrl`, email links, share links, canonical tags) must come from a **request-origin helper** `siteOrigin()` that reads `x-site-host`, never from `NEXT_PUBLIC_PLAY_URL`. Audit `lib/programs/registration.ts`, `lib/programs/reschedule.ts` and the Stripe checkout path for hard-coded Play origins and route them through a `publicOriginFor({ brandKey, fallback })` helper (§8.3). Stripe webhooks are unchanged (one endpoint, one account).

---

## 2. Data model (migration `00xx_brand_sites.sql`, next free number)

All tables RLS-enabled, service-role only (same convention as the rest of the portal; see `docs/schema-conventions.md`). `set_updated_at` triggers on every table with `updated_at`.

### 2.1 `brand_sites` — one row per brand that has a site

```
brand_key        text primary key references brands(key)
status           text not null default 'off'   check (status in ('off','coming_soon','live'))
hostnames        text[] not null default '{}'  -- ['allcansport.ca','www.allcansport.ca']; apex first
primary_host     text                          -- canonical apex
theme_key        text not null default 'vanguard'  -- which design system renders this site (§4)
home_page_id     bigint references site_pages(id) on delete set null
seo              jsonb not null default '{}'   -- {title_suffix, default_description, og_image_url, twitter, robots_noindex}
social           jsonb not null default '{}'   -- {instagram, facebook, x, youtube, tiktok}
contact          jsonb not null default '{}'   -- {email, phone, address, map_url}
links            jsonb not null default '{}'   -- {watch_url, tickets_url, gear_url, play_url_override}
coming_soon      jsonb not null default '{}'   -- {headline, body, show_email_capture, show_register_link}
footer           jsonb not null default '{}'   -- {columns:[{title, items:[nav item]}], legal_text}
analytics        jsonb not null default '{}'   -- {vercel_project_id?, extra_script_allowlisted?}
launched_at      timestamptz
created_by       text not null
created_at / updated_at
```

### 2.2 `site_pages` — every page on a site, staff-made or system

```
id               bigint identity primary key
brand_key        text not null references brand_sites(brand_key) on delete cascade
kind             text not null check (kind in ('custom','home','programs','program','compete','standings','schedule','news','post','gallery','contact','system'))
slug             text not null                 -- '' for home; unique per brand
title            text not null
blocks_draft     jsonb not null default '[]'   -- ordered block list (§5)
blocks_published jsonb                         -- null = never published
published_at     timestamptz
published_by     text
hidden_from_menu boolean not null default false
seo              jsonb not null default '{}'   -- {title, description, og_image_url, noindex}
template         text                          -- optional layout variant from the theme
sort_order       integer not null default 100
last_edited_by   text
unique (brand_key, slug)
```

**State derivation** (never stored twice): `draft` = `blocks_published is null`; `published` = `blocks_published is not null and blocks_draft = blocks_published`; `published, unsaved changes` = both set and different. "Hidden" is orthogonal: `hidden_from_menu` only affects navigation; the page is still reachable by URL when published.

**System pages** (`kind != 'custom'`) are created automatically when a site is created (§7.2) and cannot be deleted, only hidden. Their content is mostly generated (programs, standings…) but each still has a block list for the editorial parts above and below the generated section (e.g. a hero over the programs grid).

### 2.3 `site_nav_items` — the menu tree

```
id          bigint identity primary key
brand_key   text not null references brand_sites(brand_key) on delete cascade
parent_id   bigint references site_nav_items(id) on delete cascade
kind        text not null check (kind in ('page','folder','link'))
label       text not null
page_id     bigint references site_pages(id) on delete cascade   -- kind = page
href        text                                                 -- kind = link (absolute or site-relative)
new_tab     boolean not null default false
description text            -- mega menu subtitle
image_url   text            -- mega menu promo image (folders) or item icon
featured    boolean not null default false   -- mega menu "promo" slot
sort_order  integer not null default 100
visible     boolean not null default true
```

**Depth rule** (enforced in the server action and by a DB check via trigger): root items may be any kind; a root `folder` may contain `page`/`link`/`folder`; a nested `folder` may contain only `page`/`link`. That is the "top level + one dropdown + one additional level" the owner asked for. Depth > 2 is rejected with a clear message.

### 2.4 `site_posts` — news / blog

```
id, brand_key, slug (unique per brand), title, excerpt, cover_url, body_blocks jsonb (same block schema),
status text check (status in ('draft','scheduled','published')), published_at (future = scheduled; a cron publishes it), author_profile_id, author_label, type text, location_id, sport, program_id, cover_media_id, cover_alt, cover_credit, seo jsonb, tags text[],
created_at / updated_at
```

### 2.5 `site_media` — media library per site

```
id, brand_key, path (storage), url, kind (image|logo|video|file), name, folder, alt, decorative bool, credit, width, height, bytes, uploaded_by, created_at, replaced_at
```

Usage is computed from page blocks, posts, nav items and site settings (a `site_media_usage` view), so Delete can be refused while a file is used and Replace keeps every reference (references point at the media id, not the URL).

```
```

Bucket: reuse the **public** `brand-assets` bucket under `sites/<brand_key>/…`. Raster + MP4/WebM only; **no SVG uploads** (public bucket, stored-XSS vector, same rule as brand logos).

### 2.6 `site_editor_scopes` — who may edit which brand site

```
profile_id  bigint references profiles(id) on delete cascade
brand_key   text references brand_sites(brand_key) on delete cascade
role        text not null default 'editor' check (role in ('admin','editor','writer')),
status      text not null default 'active' check (status in ('invited','active')),
invited_email text, last_active_at timestamptz,
granted_by  text, created_at
primary key (profile_id, brand_key)
```

Permission rule: `canEditSite(brandKey)` = super admin **or** (staff **and** has a scope row for that brand). `siteRole(brandKey)` returns `super | admin | editor | writer`; writers can't publish, and only super and site admins can manage members, the launch switch and domains. A site must keep one active `admin` row (enforced in the action). Invites for emails without a profile are held as `invited` rows keyed by email and claimed on first sign-in. Every grant, change and removal is written to the audit log. The `/admin/sites` index lists only brands the user may edit. A new system role **`Site Editor`** (seeded in `roles`, `is_system = true`) makes a profile staff so they can reach `admin.*`; the scope rows then say which sites. Assigning the role without a scope grants nothing.

### 2.7 `site_page_views` — lightweight, optional

Vercel Web Analytics is the traffic source (§7.1). For the "most-viewed standings pages" tile we also keep a **privacy-safe daily counter** (no IP, no UA): `(brand_key, path, day) → views`, incremented server-side from the Compete and program page renders with a sampled, best-effort insert. This is a counter, not analytics; it is what lets the Compete activity tile work without hitting Vercel's API per page.

### 2.8 Changes to existing tables

- `brands` gains `design_tokens jsonb not null default '{}'` (§4.2) and `site_url text` (denormalised canonical site origin, set when a site goes `live`, cleared when it goes `off`; read by `brandSiteUrl()` everywhere a link is built).
- `programs` gains `site_blocks jsonb not null default '[]'` (editorial blocks that wrap the generated program page) and `site_featured boolean default false`.
- `audit_log` gets new action keys: `site.create`, `site.status`, `site.domain`, `page.publish`, `page.unpublish`, `page.delete`, `nav.save`, `post.publish`, `scope.grant`, `scope.revoke`.

---

## 3. Public site route tree (`/app/site/[brand]/…`)

All pages are **server components**, `force-dynamic` where they read live data, and must render for a **signed-out** visitor. Signed-in state only lights up chrome (account chip, "My schedule", pre-filled registration).

| URL on the brand domain | Source | Notes |
|---|---|---|
| `/` | `home` page blocks | Launch switch applies (§1.2). |
| `/<slug>` | `custom` page | Published blocks only; staff preview sees draft with `?preview=<token>` (§6.3). |
| `/programs` | `programs` page + generated grid | Every `programs` row with `brand_key` = brand and status in (`published`,`registration_open`,`full`) grouped by type/season; filters by sport, age, season. |
| `/programs/<slug-or-id>` | `program` page + generated detail | **Live program data** (§3.1). Register CTA runs Module 4 registration **on this host** (§1.4). |
| `/register/…` | Module 4 cart/checkout, brand chrome | Same server actions as Play; layout = site layout. |
| `/standings` | `standings` page | Every published division for this brand (`programs.brand_key` via `divisions.program_id`), grouped by program — the Compete home, scoped to one brand. |
| `/standings/<divisionId>` | Compete division page | Same component as `app/compete/[id]/page.tsx`, lifted into a shared `components/compete/DivisionPage` used by both trees. |
| `/standings/<divisionId>/player/<pid>` | Compete player page | Shared component. Name masking rules unchanged. |
| `/leagues/<programId>` | Compete program landing | Shared component from `app/compete/p/[id]`; the league's `compete_brand` colours still apply inside the brand theme. |
| `/schedule` | `schedule` page | Upcoming games across this brand's divisions (`upcomingGames` filtered by brand) + the brand's program sessions. |
| `/news`, `/news/<slug>` | `site_posts` | List + post. |
| `/gallery` | Module 17 galleries | Only galleries whose program `brand_key` matches **and** are flagged public. |
| `/contact` | `contact` page | Contact block pulls from `brand_sites.contact`; optional form posts through `notify()` to the brand's `support`/`from` address. |
| `/sign-in`, `/sign-up` | shared exempt pages | Brand wordmark variant; Clerk satellite. |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image` | generated per host | Only `live` sites get a sitemap; `off`/`coming_soon` emit `noindex`. |

**Brand scoping is a hard rule**: every query in `lib/site/*` takes `brandKey` and filters on it. A brand site must never list another brand's programs, divisions, posts or galleries. Add a test that renders ALL CAN's `/programs` and `/standings` with a fixture containing Orangeville Prep rows and asserts none leak.

### 3.1 Program page — fields that update live

Generated from `programs` + joins, never copied into page blocks:

- **Dates, schedule, location** — `program_sessions` → bookings → facility names; season dates from `season_key`/first+last session; recurring pattern summarised ("Tuesdays 6–7 pm, Jan 13 – Mar 24").
- **Price, fees, payment plans** — run the **canonical pricing function** for an anonymous visitor to show base, early-bird (with deadline), late fee, multi-member discount, and available installment plans (Module 4 payment-plan engine). Never re-compute.
- **Eligibility & spots** — `min_age`/`max_age` (or grade when configured), `capacity` vs confirmed registrations → "12 spots left" / "Waitlist" / "Full"; `registration_opens_at` / `closes_at` → countdown or "Registration opens Jan 5".
- **Description, images, coaches** — `description`, program media (Module 4 program images / `compete_brand` hero if a league), `program_staff` with `show_public` → names, role labels, staff photos (migration 0059 made these public-safe).
- **Status** drives the CTA: `registration_open` → Register; `published` (not open yet) → Notify me (via `notify()` list); `full` → Join waitlist; `closed`/`archived` → read-only with "see current programs".

### 3.2 Compete inside the brand site

- `lib/compete/compete.ts` gains a `brandKey?` filter on `listDivisions`, `listPrograms`, `upcomingGames`. Compete (`compete.*`) calls them unfiltered; the brand site passes its key.
- Division/player/program-landing pages are **extracted into shared components** rendered by both `app/compete/*` and `app/site/[brand]/*`. The data layer, name masking and `show_on_compete` gating are untouched.
- **Canonical**: when a division's program has a brand with a `live` site, the Compete copy emits `<link rel="canonical">` to the brand site URL and a small "View on allcansport.ca" link. The brand site copy is canonical to itself. No redirects.
- Per-game **Watch live** keeps pointing at `live.athleteinstitute.ca` (link out, per decision).

---

## 4. Design systems (full per-brand theming)

### 4.1 Theme packs in code

A brand site renders through a **theme pack** selected by `brand_sites.theme_key`:

```
packages/foundation/src/themes/
  index.ts            -- registry: { vanguard, 'all-can', ... } → ThemePack
  vanguard/           -- the shared skeleton (today's look), the fallback for every brand
  all-can/            -- built from the ALL CAN design system (Claude Design) once delivered
components/site/themes/<theme_key>/   -- the block renderers + layout for that theme
```

A `ThemePack` provides: `tokens` (CSS custom properties: palette, type scale, fonts incl. `next/font` loaders, radius, spacing, shadows), `Layout` (header with mega menu, footer, cookie/consent), and a `blocks` map from block `type` → React renderer. **Every theme must render every block type** (§5); a theme may add variants but never drop a block. A conformance test renders a fixture page containing one of each block in every theme.

Brands with no finished design system use `vanguard` plus the DB brand accent/logo (what the portal does today) and are upgraded by switching `theme_key` — no content migration.

### 4.2 Admin-editable tokens

`brands.design_tokens` holds the subset staff may tune without a deploy: palette overrides, logo/wordmark variants (light/dark), favicon, OG default image, display/body font choices from the theme's allowed list. Theme packs define what is overridable; code owns layout and components.

### 4.3 ALL CAN

**Sequencing rule from the owner:** the ALL CAN theme pack is coded **after** the ALL CAN brand system (Claude Design) and the site design derived from it are finalised. Build Stages 1–6 do not depend on it: ALL CAN runs on `vanguard` + its accent until Stage 7 lands the real theme.

**Update (Oct 27 2026):** the ALL CAN brand system has been delivered and the site is specified. Build ALL CAN from `specs/allcan/03-allcansport-website-prompt.md`; brand rules and tokens are in `specs/allcan/design-system/`.

---

## 5. Page builder — block schema

A page's `blocks_*` is `Block[]`:

```ts
interface Block { id: string; type: BlockType; props: Record<string, unknown>; hidden?: boolean }
```

Block types (every theme renders all of these):

| type | props (summary) |
|---|---|
| `hero` | heading, subheading, media (image/video from media library), overlay, primary + secondary CTA (page/link), alignment, height |
| `rich_text` | sanitised HTML (`sanitize-html` allowlist: headings, p, lists, links, bold/italic, blockquote), width |
| `columns` | 2–4 columns, each a small `Block[]` of `rich_text`/`image`/`cta` |
| `image` | media, caption, size, link |
| `gallery_grid` | media[] or "latest from Module 17 gallery for program X" |
| `video` | media (uploaded) or YouTube/Vimeo id |
| `cta_band` | heading, body, button(s), background token |
| `program_grid` | filter: type/season/sport/featured, limit, show price, show spots |
| `program_card` | one program id |
| `standings_table` | division id (or "featured division"), rows limit, link to full standings |
| `schedule_strip` | brand-wide upcoming games/sessions, count |
| `bracket` | division id (tournament) |
| `news_list` | count, tag filter |
| `sponsors` | sponsor rows (name, logo, url) **or** "pull from league X's `compete_sponsors`" |
| `staff_cards` | program id or hand-picked profiles with `show_public` |
| `faq` | [{q, a}] |
| `stats_band` | [{label, value}] |
| `contact_card` | reads `brand_sites.contact`; optional form |
| `map` | embed URL (allowlisted hosts only) |
| `embed` | iframe from an **allowlisted host list** (YouTube, Vimeo, Google Maps, Instagram); anything else is rejected at save |
| `spacer` / `divider` | size |

Editor behaviour: add block (picker grouped by Content / Programs / Compete / Media / Layout), drag to reorder, duplicate, hide, delete; per-block form with media picker; live preview iframe of the **draft** on the brand host (§6.3). Saves write `blocks_draft` only; **Publish** copies draft → published and audits.

Validation lives in **one** server-side validator (`lib/site/blocks.ts`, zod): unknown types rejected, HTML sanitised, URLs checked, media must belong to the brand's `site_media`. Both the editor action and the renderer import the same schema.

---

## 6. Navigation, publishing, preview

### 6.1 Mega menu

Desktop header renders root items; a `folder` opens a **mega panel**: its child folders become columns (title + their page/link items), loose child pages/links form the first column, `featured` items render as promo cards with `image_url` + `description`. Mobile: accordion drawer, same tree. Keyboard and screen-reader accessible (roving tabindex, `aria-expanded`, Esc closes). Hidden pages (`hidden_from_menu`) can't be added to nav; un-publishing a page removes its nav item from the public render but keeps the row.

### 6.2 Footer

`brand_sites.footer.columns` use the same nav item shape (depth 1 only) plus `legal_text`; the shared "Part of Athlete Institute" strip with Play / Compete / Tickets / Live links is theme-rendered and always present.

### 6.3 Preview

Staff preview URL: `https://<brand-host>/<path>?preview=<token>` where the token is a short-lived (1 h) signed value minted by the admin editor for `(brandKey, profileId)`. The site layout verifies it server-side and, when valid, renders **draft** blocks and ignores the launch switch, showing a "DRAFT PREVIEW" bar. No Clerk session required on the brand host for preview (so it works before the satellite domain is configured), but the token is bound to a staff profile with `canEditSite`.

### 6.4 Launch switch

`/admin/sites/<brand>/settings` → Status: `off` / `coming_soon` / `live`. Going `live` requires: a primary host set, DNS verified (§7.6), home page published, and at least nav + footer saved. The action writes `brands.site_url`, republishes `sites/hosts.json`, and audits `site.status`.

---

## 7. Admin: `/admin/sites`

Sidebar entry **Websites** (visible when the user can edit ≥ 1 site). Index = one card per editable brand site (status pill, host, last publish, 7-day visitors).

### 7.1 Dashboard — `/admin/sites/<brand>`

Tiles, each a server component with its own cache window:

- **Traffic** (Vercel Web Analytics): page views, visitors, top 10 pages, last 7 / 30 days, filtered to this brand's hostnames. Read through a small `lib/site/vercel-analytics.ts` client using a Vercel API token (`VERCEL_ANALYTICS_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`) with a 15-minute cache; degrade to "analytics unavailable" rather than erroring. (Confirm the current analytics API shape against Vercel's docs at build time.)
- **Registrations & revenue**: registrations, revenue, refunds for programs with this `brand_key`, this season vs last, via the **Module 14 reporting queries** (extend them with a `brandKey` filter; do not write new money math).
- **Content**: counts of published / published-with-unsaved-changes / draft / hidden pages, recent edits (who, when), posts awaiting publish.
- **Compete activity**: divisions published, next 5 games, most-viewed standings pages (from `site_page_views`).
- **Pages tree**: the full page list with hierarchy as the nav defines it (link / folder / page icons), state pill per page, quick actions (edit, preview, publish, hide, move).

### 7.2 Create site

Super admin only: pick a brand without a site → creates `brand_sites` (status `off`), the system pages (home, programs, standings, schedule, news, gallery, contact), a default nav (Programs, Standings, Schedule, News, Contact), footer defaults, and `coming_soon` copy from the brand name/tagline.

### 7.3 Pages

List + the block editor (§5). Page settings drawer: title, slug (auto, editable, uniqueness checked), hidden from menu, SEO fields, template. Delete only for `custom` pages (confirm; nav items cascade).

### 7.4 Navigation

Tree editor for header (depth rule from §2.3 enforced in UI and action) and footer columns. Mega menu extras per item: description, image, featured.

### 7.5 News, media

Posts list + editor (same block editor, plus cover, excerpt, tags, publish). Media library with upload (allowlisted types, 20 MB images / 200 MB video), alt text required for images, usage count, delete blocked while referenced. ALL CAN's fuller versions (Stories with scheduling and Draft with Claude; Media with folders, Replace and Claude alt text) are in `specs/allcan/03-allcansport-website-prompt.md` §6.7–6.8 and apply to every site.

### 7.5a Analytics, Members

**Analytics** (`/admin/sites/<brand>/analytics`): key metrics, Performance on Google (Search Console API, server-side service account) and Performance on AI platforms (AI referrals from Vercel Web Analytics referrers; AI crawler hits from request logs by user agent; tracked questions in a new `site_ai_questions (id, brand_key, question, created_by)` table with weekly results in `site_ai_checks (question_id, assistant, ran_at, result check (result in ('cited','mentioned','none')), cited_url)` written by a scheduled job). **Members** (`/admin/sites/<brand>/members`): the `site_editor_scopes` table with roles and invites. Full behaviour: ALL CAN prompt §6.6 and §6.9.

### 7.6 Settings

Status (launch switch), **Domains** (hostnames, "Verify DNS" button that checks the CNAME/A record and the Vercel domain state and prints the exact GoDaddy records to add), SEO defaults, social, contact, links (Watch / Tickets / Gear / Play overrides), coming-soon copy, design tokens (§4.2), theme pack picker (super admin), and a pointer to **Members** (§7.5a), which replaces the old Editors panel.

---

## 8. Ecosystem integration

### 8.1 Hub "Websites" tile (live repo)

This repo exposes `GET /api/ecosystem/sites` (public, cached 5 min): `[{ brandKey, name, url, logoUrl, accent, status }]` for sites that are `live` (and `coming_soon` when `?include=coming_soon`). The `athlete-institute-live` repo adds one registry entry `websites` ("Websites", public) whose tile opens `/apps/websites`, a chooser page that reads this manifest and lists each brand site with its logo. That change is a small follow-up task in the live repo; this module is done when the manifest exists.

### 8.2 Compete

Canonical links + "View on <brand site>" per §3.2. Compete's top program bar may show the brand logo next to a league when the brand has a live site.

### 8.3 `brandSiteUrl()` — emails, TV displays, share links

One helper in `@ai/foundation`: `brandSiteUrl(brandKey): string | null` (reads `brands.site_url` through the existing brand resolution cache). Then:

- `notify()` templates: every program/registration/schedule/standings link uses `brandSiteUrl(brandKey) ?? PLAY_URL` (or `?? COMPETE_URL` for Compete links). Brand-themed templates already resolve the brand; only the link base changes.
- `/display/[token]` pages: QR codes and "see the full schedule at …" footers use the brand site when the display is scoped to a program/brand with a live site.
- Program `share_token` links and Compete share links on the brand host build from `siteOrigin()`.

### 8.4 Live, Tickets, Gear

Header/footer and the `cta_band` block can link to `brand_sites.links.watch_url` / `tickets_url` / `gear_url` (defaults: the three app roots). No feeds. Document in the README that per-brand feeds are a later module that adds `brand_key` to those apps.

---

## 9. SEO, performance, compliance

- Per-page `generateMetadata` from page SEO → the site's **title format** for that page type → site SEO defaults → brand name; canonical to the brand host; `noindex` when site not live or page flagged. Youth player profile pages are always `noindex` and left out of the sitemap (not blocked in robots.txt, so crawlers can read the tag).
- **SEO tool in the editor (every brand site):** `/admin/sites/<brand>/seo` with a four-step setup wizard (about the site and its locations; up to three 2–4 word keywords with Claude suggestions; connect Google Search Console and, optionally, Google Business Profile; your plan), an auto-ticked checklist, a pages table with per-page suggestions, a page SEO panel (title and description counters, address with automatic 301, noindex, Google and sharing previews, Write with Claude), title formats per page type, indexing rules, automatic structured data (SportsOrganization, SportsActivityLocation, SportsEvent, BreadcrumbList), a redirects manager and the sitemap/robots view. Full behaviour: `specs/allcan/03-allcansport-website-prompt.md` §6.5. Data: `brand_sites.seo` gains `keywords text[]`, `business {name, offer, location_ids}`, `title_formats {page, location, sport, team}`, `gsc {site_url, verified_at, sitemap_submitted_at}`, `gbp_location_ids`, `index_team_pages bool`; new table `site_redirects (id, site_id, from_path, to_path, reason, created_by, created_at)`, unique on `(site_id, from_path)`, applied in `middleware.ts` as 301s before route resolution, with slug changes inserting a row and repointing rows that targeted the old slug. Search Console numbers come from the Search Console API through a server-side service account; nothing is fetched from the browser. **AI crawler policy (default for every brand site, owner-confirmed):** answer crawlers (OAI-SearchBot, PerplexityBot, Claude-SearchBot) allowed; training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot) blocked in robots.txt; Googlebot never blocked. Stored as `brand_sites.seo.ai {answers: true, training: false}`, editable per site in SEO › Indexing.
- `sitemap.xml` per host lists published pages, programs, divisions, posts; `robots.txt` per host.
- `opengraph-image` route renders a branded default; pages/posts may override.
- Images via `next/image` with the storage host allowlisted in `next.config.mjs`; videos lazy.
- Lighthouse budget on the home and a program page: performance ≥ 90 mobile.
- PIPEDA: no new personal data is collected except the optional contact form and coming-soon email capture, both through `notify()` lists with the existing consent copy; `site_page_views` stores no identifiers. CASL applies to any email captured.
- Security: HTML sanitised on save and on render; embed/map/iframe hosts allowlisted; no SVG uploads; preview tokens signed and expiring; every server action re-checks `canEditSite(brandKey)`; audit on publish/status/domain/scope changes.

---

## 10. Build Stages — show me each working

Each stage ends with a verification you can click through. Commit after each.

1. **Host routing + site shell.** `ResolvedHost`, hosts manifest + code fallback, middleware rewrite to `/site/[brand]`, `brand_sites` + `site_pages` + `site_nav_items` migration, site layout on the `vanguard` theme with brand accent/logo, launch switch with `off`/`coming_soon`/`live`, `www` → apex. Verify: `all-can.site.localhost:3000` renders a coming-soon page; flipping status in the DB shows an empty live site; unknown hosts still land on Play.
2. **Compete inside the site.** Extract shared Compete components; `brandKey` filters in `lib/compete`; `/standings`, `/standings/<id>`, `/standings/<id>/player/<pid>`, `/leagues/<programId>`, `/schedule`; canonical links on Compete. Verify: ALL CAN divisions appear on the ALL CAN site and nowhere else; Compete still lists everything; name masking identical on both.
3. **Programs + registration on the brand host.** `/programs`, `/programs/<slug>` with the live fields of §3.1; `siteOrigin()`/`publicOriginFor()` audit of Stripe/Clerk/email URLs; Module 4 registration + checkout under site chrome. Verify: register for an ALL CAN program on the brand host end to end (test Stripe) and land back on the brand host; a Play registration still lands on Play.
4. **Clerk satellite domain.** Configure the first satellite (use a Vercel preview/staging host before the real domain if needed), host-aware `clerkMiddleware` options, brand-wordmark sign-in. Verify: SSO both directions between the brand host and Play.
5. **Admin: pages, blocks, nav, preview, publish.** `/admin/sites` with the dashboard shell (content + pages tree tiles), create-site flow, block editor with all §5 blocks on `vanguard`, media library, nav tree editor with depth rule and mega menu, footer, preview tokens, publish/unpublish, `site_editor_scopes` + Site Editor role, audit entries. Verify: a scoped Site Editor sees only ALL CAN, builds a custom page from blocks, previews the draft on the brand host, publishes, and it appears in the mega menu.
6. **Dashboard metrics + ecosystem.** Vercel Web Analytics tile, Module 14 registrations/revenue by brand, Compete activity + `site_page_views`, news + gallery pages, `/api/ecosystem/sites`, `brandSiteUrl()` wired into `notify()` templates and `/display`, sitemap/robots/OG. Verify: dashboard shows real numbers for the staging host; a registration confirmation email for an ALL CAN program links to the brand site; the hub chooser (live repo follow-up) lists it.
7. **ALL CAN theme pack.** Only once the ALL CAN brand system + site design are finalised: `themes/all-can` tokens, layout, block renderers; theme conformance test; switch `theme_key`. Verify: every block type renders in the ALL CAN theme; Lighthouse budget met.
8. **Launch allcansport.ca.** Domains settings → add `allcansport.ca` + `www`, Vercel domain + GoDaddy records (printed by the Verify DNS action), Clerk satellite on the real apex, status `live`, `brands.site_url` set, Compete canonicals flip, hub chooser shows the site. Verify on the real domain: anonymous standings, sign-in SSO, a real-mode registration, email links.

Then repeat Stages 7–8 per additional brand (theme pack when its design exists, otherwise launch on `vanguard`).

### Deliverables

- Source: `app/site/[brand]/*`, `app/admin/sites/*`, `lib/site/*` (pages, nav, posts, media, blocks validator, analytics client, scopes, hosts manifest), `packages/foundation/src/themes/*`, `components/site/*`, shared `components/compete/*` extracted from the Compete tree, `app/api/ecosystem/sites/route.ts`.
- Migration(s): `brand_sites`, `site_pages`, `site_nav_items`, `site_posts`, `site_media`, `site_editor_scopes`, `site_page_views`, `brands.design_tokens` + `site_url`, `programs.site_blocks` + `site_featured`, Site Editor role seed.
- README section: host model, how to create and launch a brand site (DNS, Vercel domain, Clerk satellite checklist), theme packs, block schema, permissions, analytics env vars.
- Follow-up task recorded for the live repo: "Websites" hub tile + chooser reading `/api/ecosystem/sites`.

### Tests

- Host resolution: known hosts, manifest hosts, `www`, unknown host → play, dev `*.site.localhost`, preview `?site=`.
- Brand scoping: no cross-brand leakage on `/programs`, `/standings`, `/news`, `/gallery`.
- Compete parity: division + player pages render identically (snapshot of the data passed to the shared component) on Compete and the brand site; name masking cases.
- Program page: pricing fields match the pricing function for early-bird / late / multi-member fixtures; spots-left / waitlist / closed CTA states.
- Blocks: validator rejects unknown types, unsafe HTML, non-allowlisted embeds, foreign media; every theme renders every block (conformance fixture).
- Nav: depth rule (root folder → folder → page OK; folder → folder → folder rejected); hidden/unpublished pages drop out of the render.
- Publishing: draft vs published derivation; preview token validity/expiry/profile binding; launch switch gating.
- Permissions: Site Editor with scope edits only their brand; without scope sees nothing; super admin sees all; every action re-checks.
- URLs: Stripe/Clerk/email origins on a brand host vs Play host.

### Non-Functional

- Mobile-first public pages; mega menu accessible; Lighthouse ≥ 90 mobile on home + program page.
- Every public read filtered by `brand_key`; every admin write audited.
- A storage or analytics outage degrades (fallback hosts, "unavailable" tiles), never 500s a live site.
- One Vercel project, one deploy, one Clerk instance, one Stripe account.

---

## Out of scope (explicitly later)

- Per-brand feeds from Live, Tickets and Gear (needs `brand_key` in those apps). Link out only now.
- Scheduled publishing, page versions/rollback beyond draft vs published, A/B tests.
- Separate Stripe accounts or Clerk instances per brand.
- Brand sites for leagues/tournaments as standalone domains (they are pages inside a brand site).
- Menu nesting deeper than root → folder → folder → page.
- Redirecting or retiring `compete.athleteinstitute.ca`.

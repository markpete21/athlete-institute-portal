# Brand Websites — Plan (Play + Compete integration)

> Status: **discovery complete, pre-build.** Decisions below were made with Mark
> in a Q&A session (2026-09-26/27). Open items are listed at the bottom.

## Goal

Public marketing websites for all five brands that **build themselves from the
portal's data**: publishing a program registration in Admin creates/updates its
public page automatically; Compete, rentals, drop-in, tickets and live streams
flow onto the right brand site with no manual web work.

| Brand key (proposed) | Brand | Focus on the site |
|---|---|---|
| `athlete-institute` | Athlete Institute | Rentals & event hosting, drop-in, live streaming, ticketing |
| `all-canadian` **(new)** | All Canadian | ACG Camps |
| `all-can` | ALL CAN Sports | Leagues & clinics — **pilot brand** |
| `orangeville-prep` | Orangeville Prep Basketball | Teams, players, games, streams, tickets |
| `bears` | Orangeville Bears | Club basketball & volleyball |

> The brand system seeds only four brands today (`0001_foundation.sql`).
> All Canadian (ACG) must be split out from ALL CAN as a fifth brand.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Domains | **Separate domain per brand**, one codebase, brand resolved from host |
| 2 | Existing sites | Brands have live sites today → **content audit + 301 redirects + cutover** required |
| 3 | Register button | **Hand-off to Play** checkout (brand-themed). Site is a cacheable marketing layer; no checkout on brand domains |
| 4 | Page lifecycle | **Evergreen page per program, not per season.** URL is permanent; each new season's registration updates it. Off-season shows last season's info + "coming soon / notify me" |
| 5 | Season → page link | **Inherited on clone**, plus a "Website page" picker in the program builder (incl. "create new page") |
| 6 | Concurrent registrations | **One page, options table** (weeks / divisions / ages, each with dates, price, spots, Register) |
| 7 | Page content | **Pulled from the registration itself**, with optional per-field overrides in Admin |
| 8 | Dynamic content sources | Assist chatbot questions, parent emails/inquiries → **FAQs**; post-program feedback → **ratings/testimonials**; registration custom-question answers → **aggregate stats** |
| 9 | Moderation | **Numbers auto-publish** (ratings, stats). **Words need approval** (FAQ answers, testimonial quotes) via an Admin "Website review" queue |
| 10 | Other feeds | Ticketed events → event pages; live streams → watch schedule + live-now banner; drop-in → live weekly schedule; rentals → facility pages w/ availability + quote hand-off |
| 11 | Compete | **Native team, roster, player and standings pages** on brand sites (SEO / recruiting) |
| 12 | Codebase | **This repo**, new route tree `app/site/*` alongside play/admin/compete |
| 13 | Pilot | **ALL CAN Sports** first, then roll templates to the other four |
| 14 | Deadline | **MVP for winter registration (~Nov 2026)** |
| 15 | Design | **Shared templates + per-brand skins** (logo, accent, fonts, photos), building on the rounded-card language |

## Architecture

```
 Admin (publish program)                live repo (tickets.*, live.*)
          │                                        │  read-only API
          ▼                                        ▼
  portal Supabase ──► lib/site (public-safe queries) ◄── lib/site/external
          │                     │
          │ revalidateTag()     ▼
          └──────────► app/site/* ── served on 5 brand domains (Vercel)
                                │
                     "Register" ─► play.athleteinstitute.ca checkout
```

- **Routing:** extend `PortalApp` with `'site'`; `resolvePortalApp` maps each
  brand domain → `site`, and a new `resolveBrandFromHost()` picks the brand.
  Middleware rewrites to `app/site/[brand]/*`. Like `compete.*`, the site is
  **fully public**; the data layer returns only publishable fields.
- **Freshness:** pages are statically rendered + cached (ISR). Program status
  changes, page edits and moderation approvals call `revalidateTag()`
  (`program-page:<id>`, `brand:<key>`) so a publish is live in seconds. Live
  bits (spots left, live-now) hydrate client-side or use short revalidation.
- **External feeds:** tickets + streams are read through a small internal
  read API added to `athlete-institute-live` (per README decision #1 — no
  cross-DB joins), cached with tags and refreshed by webhook.
- **SEO:** JSON-LD (`SportsEvent`, `Event`, `SportsTeam`, `Person`,
  `FAQPage`, `AggregateRating`), per-brand `sitemap.xml` / `robots.txt`,
  canonical URLs, OG images generated from brand skin + program data.

## Data model (new)

- `brands` — add `all-canadian` row + seed; add `domain`, `site_enabled`,
  tagline/hero/social fields.
- `program_pages` — the evergreen page: `id, brand_key, slug (unique per
  brand), type, title/description/hero overrides (nullable = use registration),
  status (draft|live|hidden), notify_list opt-in`.
- `programs.program_page_id` — FK; copied on program clone; editable in builder.
- `page_faqs` — `program_page_id, question, answer, source
  (assist|inquiry|feedback|manual), frequency, status (proposed|approved|rejected)`.
- `page_testimonials` — sourced from feedback responses, same moderation status.
- `page_stats` — materialized aggregates (rating, % returning, etc.), auto.
- `page_redirects` — old-site URL → new URL, per brand (served by middleware).

"What the page shows now" is derived: the page's registrations that are
`published | registration_open | full` (options table); if none, the most
recent `closed/archived` one as "last season" with a notify-me CTA.

## Build phases

**Phase 0 — Foundations (week 1)**
Add `all-canadian` brand · `site` host + brand-from-host routing · `app/site`
shell (header/footer/nav per brand skin) · `program_pages` + clone inheritance
+ builder picker · crawl ALL CAN's current site for the redirect map.

**Phase 1 — ALL CAN MVP (weeks 2–5) → launch ~Nov 2026**
Home page · program index by type (leagues / clinics) · evergreen program
page with options table + lifecycle states + Play hand-off · Compete standings,
schedules, team pages for ALL CAN leagues · SEO basics · redirects · analytics
· revalidation on publish.

**Phase 2 — Dynamic content (weeks 6–9)**
Stats auto-feed · feedback → ratings/testimonials · Assist + inquiry question
clustering → proposed FAQs (Claude drafts answers from program data) · Admin
"Website review" queue · notify-me list emailed on next season's publish.

**Phase 3 — Roll out brands**
All Canadian (ACG camps, weeks table) → Orangeville Prep (team/player/recruiting
pages, streams, tickets) → Bears (club bball/vball teams + tryouts) →
Athlete Institute (rentals facility pages, drop-in schedule, events, streaming).
Each: content audit, redirects, DNS cutover.

**Phase 4 — Live-repo feeds**
Read API in `athlete-institute-live` for events + streams; event pages; watch
schedule; live-now banner (needed by Prep and Athlete Institute in Phase 3).

## Launch checklist (per brand)

Redirect map covers top 100 old URLs by traffic · Search Console + sitemap
submitted · analytics/pixels · DNS (apex + www) added to Vercel · every
Register button lands on the correct Play checkout · Lighthouse ≥ 90 mobile.

## Open questions

1. Exact domain names for each brand, and the current platform/host of each site.
2. Who owns the DNS for each domain (GoDaddy like `athleteinstitute.ca`?).
3. Analytics stack (GA4 / Meta pixel) and any existing tracking to preserve.
4. Staff owner of the "Website review" queue.
5. Player pages: consent/privacy rules for minors (photos, stats, names) —
   especially Bears club (youth) vs. Prep.

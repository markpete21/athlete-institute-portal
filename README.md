# Athlete Institute Portal

Facility management + registration platform (`play.athleteinstitute.ca` public, `admin.athleteinstitute.ca` staff). Built module-by-module from the specs in [`/specs`](specs/) — read `specs/START-HERE.md`, then `specs/MASTER-build-order.md`.

## Ecosystem

Third app in the Athlete Institute family, alongside the live-stream app (`live.*`), tickets (`tickets.*`), and the cross-app hub (`apps.*`) — those three live in the separate `athlete-institute-live` repo.

**Shared across all apps:** the Clerk **production** instance (`clerk.athleteinstitute.ca`) for single sign-on, the Canadian Stripe account (cards + PAD `acss_debit`), Resend, and the `apps.*` hub for cross-app navigation + per-app admin grants.

## Architecture decisions (deliberate deviations from the specs)

1. **Own Supabase project.** The Module 0 spec assumes one shared Supabase DB across all apps; Mark chose (2026-07-22, confirmed twice) a dedicated Supabase project for the portal. Rationale: this schema is large and migration-heavy (bookings/conflicts, refunds/proration, leagues…) and must never risk the revenue-serving live/tickets DB; RLS stays simple per project. Cross-app connection is preserved via the shared Clerk identity (same `user_id`/email everywhere) — cross-app *data* reads (only Module 16 needs them) go through a small internal API or a read-only second client, not SQL joins.
2. **The `apps.*` hub is NOT built here.** Module 0 Stage 3 describes the hub, but it already exists in production (built in the `athlete-institute-live` repo: tiles, app switcher, per-app admin grants + role invites). The portal *integrates*: its chrome links to the hub, and Play/Admin tiles get added to the hub's registry (`lib/apps/registry.ts` in the live repo) when the portal is deployable.
3. **`@ai/foundation` lives in this repo** as an npm workspace (`packages/foundation`), imported by the app directly. If/when the other repos consume it, extract or publish — until then one source of truth here, documented for the others.

## Local development

This machine uses the local Node toolchain (no system Node):

```sh
export PATH="$HOME/.toolchain/node-v20.18.1-darwin-arm64/bin:$PATH"
npm install
npm run dev
```

Then open, in a Chromium browser (`*.localhost` resolves to `127.0.0.1`):

- http://play.localhost:3000 — public portal
- http://admin.localhost:3000 — staff backend
- http://localhost:3000 — defaults to play
- http://localhost:3000/display/demo-token — public TV-display token URL (auth-exempt)

`npm run build` · `npm run typecheck` · `npm run lint` — CI runs lint + typecheck on push/PR.

## Subdomain routing

`middleware.ts` resolves the request host to `play` or `admin` (`resolvePortalApp` in `@ai/foundation`) and rewrites into the matching route tree (`app/play/*`, `app/admin/*`). The host picks the tree, so `/admin/*` is unreachable from `play.*` by construction. `/display/[token]` bypasses the rewrite and (from Stage 2 on) auth — the unguessable token is the credential for facility TV displays.

### DNS (when deploying)

GoDaddy CNAMEs `play` and `admin` → `cname.vercel-dns.com`, and add both domains to the Vercel project (same pattern as `live`/`tickets`/`apps`).

## Module 0 build stages

| # | Stage | Status |
|---|-------|--------|
| 1 | Repo + `@ai/foundation` + subdomain routing | ✅ this commit |
| 2 | Clerk auth wiring (shared instance; dev keys local, prod on Vercel) | ✅ |
| 3 | Hub **integration** (tiles registered in live repo `af62a52`, internal until launch; portal chrome links to hub) | ✅ |
| 4 | Stripe rails (vaulting, PAD mandates, charges, webhooks) | ✅ |
| 5 | Brand theming (shared Vanguard system + multi-brand `--accent` layer; DB table + editor deferred to portal-Supabase) | ✅ |
| 6 | `notify()` (Resend / Twilio / web-push, brand-themed templates) | ✅ |
| 7 | Media storage (buckets, upload + signed-URL helpers) | ✅ |
| 8 | UI kit (incl. calendar/Gantt shells) + money/tax/dates/audit utilities | ✅ |

**Module 0 complete** — migration 0001 applied; audit trail + brands + storage verified against the live Supabase project.

## Module 1 — Accounts ✅ (complete)

| # | Stage | |
|---|-------|---|
| 1 | Schema + Clerk mirroring (migration 0002) | ✅ 11/11 |
| 2 | DB-backed user types + subdomain/tenant guards | ✅ 7/7 |
| 3 | Families + roles (HoH, 18+ conversion, role admin) | ✅ 8/8 |
| 4 | **Canonical pricing function** + season credits + points (migration 0003) | ✅ 30/30 + 9/9 |
| 5 | Playbook import + claim flow (migration 0004) | ✅ 10/10 |

The pricing function (`packages/foundation/src/pricing.ts`, `npm run test:pricing`) is the single owner of money math platform-wide — extend it, never re-implement (see its header for the canonical order + redemption scopes). Playbook runbook: [docs/playbook-import.md](docs/playbook-import.md).

## Module 2 — Facilities Schedule ✅ (complete — Phase 1 gate passed)

| # | Stage | |
|---|-------|---|
| 1 | Facility tree + editor (migration 0005, real AI tree seeded) | ✅ 8/8 |
| 2 | **Availability engine** + bookings API (migration 0006) | ✅ 23/23 unit + 11/11 live |
| 3 | Conflict resolution: queue, keep-both + reminders (migration 0007) | ✅ 7/7 |
| 4 | Recurrence engine, DST-correct (migration 0008) | ✅ 15/15 unit + 5/5 live |
| 5 | Admin views: Day Gantt / Week / Month + saved views (migration 0009) | ✅ 8/8 |
| 6 | TV displays: public token URLs + templates (migration 0010) | ✅ 6/6 |
| 7 | Public + family schedule (migration 0011) | ✅ 4/4 |

`lib/bookings.ts` is **the** integration contract — Rentals (M3), Programs (M4+) and events create every booking through it (`checkAvailability`, `createBooking`, `createRecurringBookings`, `cancelBooking`, `listBookings`). Conflicts are returned, never silently blocked — the operator resolves them in `/conflicts`.

## Module 3 — Rentals ✅ (complete)

| # | Stage | |
|---|-------|---|
| 1 | Rates + add-ons + public-open flags (migration 0012) | ✅ 6/6 |
| 2 | Quote builder + online quote/PDF (migration 0013) | ✅ 11/11 |
| 3 | Internal/external + business units | ✅ 4/4 |
| 4 | Payment schedules + **status state machine** (migration 0014) | ✅ 24/24 + 7/7 |
| 5 | Waiver editor + e-sign + confirm-gate (migration 0015) — **reused by M4** | ✅ 7/7 |
| 6 | Recurring rentals (one agreement, M2 recurrence) | ✅ |
| 7 | Org rental request flow | ✅ 5/5 |

Rentals book through the M2 API, price through the M1 function, charge on the M0 Stripe rails. **Migrations now apply hands-free** via `node scripts/run-migration.mjs <file>` (bootstrap: `supabase/migrations/0000_exec_sql.sql`, pasted once).

## Module 4 — Program Framework ✅ (complete — the spine every program type extends)

| # | Stage | |
|---|-------|---|
| 1 | Program spine + type manager (0016) | ✅ 11/11 |
| 2 | Custom question builder (0017) | ✅ 7/7 |
| 3 | Registration cart + held spots + waitlist (0018) | ✅ 8/8 |
| 4 | Pricing + payment-plan engine (0019) | ✅ 7/7 |
| 5 | Products with variants + jersey/gear order (0020) | ✅ 8/8 |
| 6 | Waivers (reuse M3, per-family, 1-yr) | ✅ 7/7 |
| 7 | **Refund/proration engine** (0021 flow events) | ✅ 19/19 + 5/5 |
| 8 | Abandoned-cart capture + public catalog | ✅ 7/7 |

`lib/programs/*` is the contract the program-type modules (7 Leagues, 8 Camps, 9 Tournaments, 10 General, 11 Club, 12 Academy) extend. The three highest-risk engines flagged by the master doc — M1 pricing, M2 conflict, M4 refund/proration — are all built and worked-example-tested (`npm run test:pricing|availability|recurrence|rentals|refunds`).

Conventions docs (schema naming, RLS patterns, audit-log usage) land with the first schema work (Stage 4/5) as `docs/schema-conventions.md`.

## Module 10 — General Programs (Clinics / Pickup / Drop-In) ✅

Clinics and Pickup are plain Module 4 framework programs sold as a weekly-session
block (pickup = free-play labelling only). **Drop-In** is the one distinct flow
(`lib/programs/dropin.ts` + migration 0028):

- Registrants **multi-select specific dated sessions** (`listSessions`) and **pay
  per session** (Module 1 pricing). Each session has its own capacity; a full or
  postponed date is greyed out / unselectable.
- **Buy-more-later keeps ONE registration** — `purchaseSessions` re-uses the
  member's existing registration and accumulates `dropin_purchases` under it
  rather than creating a new registration each time.
- Public picker: `play.…/programs/general/[id]` (mobile-first). Admin session
  manager: `admin.…/programs/general/[id]`.
- **Player ID** / **Coaching Clinic** are `programs.tags` (naming/reporting only,
  no distinct behaviour).

### Shared Reschedule Workflow (Module 4 capability, `lib/programs/reschedule.ts`)

Callable for **any** program type (clinics, pickup, drop-in, leagues, camps,
academy). Pick a session, then either:

1. **With a new date** — the Module 2 booking **moves** (conflict-checked; a
   conflict aborts with no change).
2. **Without a new date** — the session is set to **TBD** (`postponed`), its
   booking released; staff set the real date later.

No money impact (any credit is manual via the refund engine). All registrants
are notified via Module 0 `notify()` across **email / text / push, all ON by
default**, each toggleable per reschedule. Verify: `/api/dev/general-verify` (9/9).

## Module 11 — Club ✅

A program-type front-end over Module 4 (billing/waivers/jerseys) + Module 6
(manual rostering/schedule/standings — the auto-balancing draft is NOT used).
Code: `lib/club/club.ts`, `app/admin/club/*`, `app/play/club/*`, migration 0029.

**Structure:** Club → Team (two levels, no sub-type). Each team carries a
**free-text level label** (`15U` vs `U15` differ per club) and its **own DOB
eligibility window** (`dobEligible()` — the label is display, the DOB range is
the rule) and its own season fee.

**Tryout → offer → confirm pipeline (centerpiece):**
1. Tryout sessions are M4 programs with a **separate, non-refundable fee** (not
   applied toward the season fee), linked to a club level+gender group.
2. `syncTryoutRoster(club, level, gender)` **consolidates every tryout
   registration across all that group's sessions into ONE roster** (a player in
   two sessions = one row).
3. **Evaluation sheet** — printable numbered PDF (1–5 + notes) at
   `admin.…/club/eval/[clubId]/[level]/[gender]` (print-and-fill).
4. **Flags** — Selected / Considering / Out; Selected moves the player onto a
   team roster.
5. **Offers** — single or bulk; **verbal** (accept, no payment) or **deposit**
   (set amount OR % of season fee, **applied toward** the fee). No expiry —
   staff cancel manually. Flag → Offered–Pending.
6. **Digital acceptance** — `play.…/club/offer/[token]` confirm/deny. Confirm →
   creates the M4 season registration, applies the deposit, leaves the balance
   for the M4 payment plan; flag → Confirmed. Deny → Declined.

Full ladder: unrated → selected/considering/out → offered_pending →
confirmed/declined.

**Refunds:** custom, case-by-case (staff override via the refund engine) — Club
does NOT use standard M4 proration. **Scholarships** apply (M1 pricing).
**Messaging is a separate club-management app** — only the
`confirmedRosterHandoff(teamId)` hook lives here. Verify: `/api/dev/club-verify`
(11/11). Build green.

## Module 12 — Academy ✅ (final program-type module)

Pure enrollment + billing over Module 4 — **no tryouts, no Competitive Play**
(Academy teams never appear on the M6 public portal). Code:
`packages/foundation/src/academy-core.ts` (pure, `npm run test:academy` 16/16),
`lib/academy/academy.ts`, `app/admin/academy/*`, `app/play/academy/*`,
migration 0030 (seeds Orangeville Prep Academy + the six OP teams).

**Structure:** Academy → named Team (staff-managed). Each team defines **three
tuition tiers** — Room & Board / Commuter / International — selected at
enrollment.

**Recruitment offer pipeline (no tryouts):** place an existing/new account on a
team → **Selected** → send offer (single/bulk) → **Offered** → digital
accept/decline at `play.…/academy/offer/[token]` → **Accepted / Declined**.
Deposit required on acceptance, **applied toward tuition**.

**Tuition & billing:**
- **Scholarships** — flat-rate per-player (partial allowed), **applied BEFORE
  the payment plan is split** (`tuitionAfterScholarship`); tracked on the
  dashboard.
- **Staff-dictated payment plans** — `academyPlanSchedule()` front-loads
  installments to **complete by Feb 1** (tuition covers Sept–June). Deposit up
  front, balance split evenly across the monthly due dates. `recalculateOwed()`
  re-splits the unpaid balance across remaining months after a missed
  installment (the "recalculate total owed" button).
- **Processing fee** — a visible line item on card payments, **waived on PAD**
  (`processingFeeCents`; PAD's lower cost is the incentive). ⚠️ Canadian card-
  surcharge rules apply — **confirm the implementation with AI's payment
  advisor** before go-live.
- **Refunds** — full-year tuition commitment; staff adjust the plan case-by-case
  (no auto-acceleration).

**Dashboard:** scholarships awarded (total + per player), pipeline counts,
accepted count, plan-completion date. **Re-enrollment** re-offers returning
accepted players without the full pipeline (returning flag). Retention via
`academyRetention()`. `rosterHandoff()` hands the accepted roster to the
separate academy-management app (messaging is built there). Verify:
`/api/dev/academy-verify` (12/12). Build green.

## Module 13 — Communications ✅

Campaign/template/notification layer on top of Module 0 `notify()`. Code:
`packages/foundation/src/comms-core.ts` (pure, `npm run test:comms` 24/24),
`lib/comms/*`, `app/admin/comms/*`, migration 0031. Sending is permission-gated
(M5); a **test email is required before a real send**.

**Email builder** — campaigns are an ordered **block array** (`EmailBlock`:
text/image/button/divider/columns/header/footer/social/dynamic) rendered to
responsive HTML with **merge tags** (`{{first_name}}`, `{{balance_owed}}`, …).
Brand chrome comes from the M0 brand system. *(The current admin UI edits blocks
as structured fields + Claude-draft; a true drag-and-drop canvas is the one
remaining polish item.)*

**Claude-drafting** (`lib/comms/draft.ts`) — staff describe the email; the
Anthropic Messages API (**`claude-sonnet-4-6`**, called via fetch, brand tokens
in the system prompt) returns editable blocks. Degrades to a placeholder when
`ANTHROPIC_API_KEY` is unset.

**Recipient lists** (`lib/comms/segments.ts`) — saved **definitions**, not
snapshots: `resolveAudience()` recomputes **live at send time**. Hierarchical
include/exclude rules (brand → type → season → division / explicit programs),
participant filters (category, returning-vs-new, age), and an **engagement
filter** (drop no-open-in-N-months). Suppressions always removed.

**Scheduling / A/B** — send-now or scheduled (edit/cancel while scheduled),
`abSplit()` deterministic split + `pickAbWinner()` by click-then-open rate.

**Stats** (`lib/comms/stats.ts` + `/api/webhooks/resend`) — Resend events
ingested to per-campaign aggregate, per-recipient, per-link detail. **Hard
bounces / unsubscribes / complaints auto-suppress** (no manual scrubbing).

**Auto-notifications** (`lib/comms/notifications.ts`) — 15 seeded editable
triggers (registration, receipts, installments, waitlist, reschedule, offers,
cert expiry, abandoned-cart, refund, account-claim …) each with default copy,
merge tags, channels, on/off toggle. `fireTrigger()` is the single entry other
modules call; transactional sends ignore marketing suppression.

**Announcement tool** — quick text blast to push/SMS/email, send or schedule.

**Deliverability / CASL:** pre-send `spamCheck()` (image-heavy, missing
unsubscribe/sender-ID, ALL-CAPS/punctuation/trigger-word subjects); marketing
emails need unsubscribe + physical-address footer. ⚠️ **Before go-live:** verify
Resend sending **domains** (SPF + DKIM + DMARC), use a dedicated bulk
**subdomain** (`mail.`/`news.`) isolated from transactional mail, **warm up the
domain gradually** (do NOT cold-blast the ~7,000 Playbook imports), add full
**svix signature verification** to the Resend webhook, and one verified `info@`
from-address per brand. Verify: `/api/dev/comms-verify` (11/11). Build green.

## Module 14 — Dashboard & Reporting ✅ (analytics capstone)

Code: `packages/foundation/src/reports-core.ts` (pure, `npm run test:reports`
26/26), `lib/reports/*`, `lib/quickbooks/qbo.ts`, `app/admin/reports`,
migration 0032. **Financials are admin-only** (role check on the page; M5
matrix refines it).

**Multi-location model:** `locations` table + `programs.location_id` /
`programs.definition_id`. A program is *defined once* and runs as
location-specific *instances*. The three canonical views work:
`definitionInstances()` (across sites), a single instance, and
`programsAtLocation()`. Location maps to **QBO Location**, program →
**QBO Class** (`programs.quickbooks_class`).

**Landing dashboard** (`admin.…/reports`) — top programs by registration &
revenue with 24h/7d/30d/3mo/1yr selector, upcoming sessions, upcoming
rentals/events, outstanding balances, capacity alerts.

**Financial suite:** revenue by program/type/brand/season/**location**;
collected-vs-outstanding + 30/60/90 **aging**; **deferred revenue**
(`recognizeDeferredRevenue` straight-lines Academy tuition Sept–June);
discounts breakout; **payment-plan health** (on-track/behind/defaulted + $ at
risk); collections **forecast** by month; **margin** = revenue − M5 staff cost −
cached QBO expenses, fully itemized, with wage categories excluded by default
to avoid **double-counting** staff pay.

**QuickBooks** (`lib/quickbooks/qbo.ts`): OAuth2 (needs `QBO_CLIENT_ID`,
`QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`; "Connect QBO" button on the reports
page), revenue **push** (SalesReceipt, idempotent on source_ref, queues locally
while disconnected), expense **pull** cached into `qbo_expenses`
(nightly via `/api/cron/reports` + on-demand) because the QBO API is
rate-limited.

**Exec reports** (`lib/reports/exec.ts` + `/api/cron/reports`):
**week-in-review** each Monday covering the prior **Mon–Sun**
(`weekInReviewWindow`), **month-in-review** on the 1st for the prior month;
brand-themed HTML email to the configurable `exec_recipients` list. *(A
dedicated chart-heavy PDF renderer can swap in behind the same interface —
listed as polish.)*

**Registration reporting:** totals, new-vs-returning, fill rate vs capacity,
waitlist, conversion + abandoned-cart (`conversionMetrics`),
"where did you hear about us". **Capacity nudges:** per-program threshold
(default 80%) → approaching/full/waitlist-forming alerts on the dashboard.
**Facility utilization:** % booked by facility with by-type split + revenue per
court-hour.

Remaining polish (non-blocking): custom pivot report builder UI, registrant
postal-code map (needs Module 1 address capture), scheduled custom-report
emails, full PDF engine. Verify: `/api/dev/reports-verify` (13/13). Build green.

## Module 15 — Feedback & Ratings ✅ (Phase 4 complete)

Code: `lib/feedback/feedback.ts`, `app/play/feedback/[token]`,
`app/admin/feedback`, `/api/cron/feedback`, migration 0033.

**Rating model:** one designated **rating-of-record** star question feeds the
headline out-of-5 (`programRating`); other questions add detail.
**Rollups** at every level (`rollupRating`, `ratingForType`, `ratingForBrand`).
**Private by default** — `programs.rating_public` toggles catalog display.

**Auto-prompting:** `configureRounds()` derives the schedule from the program
type — every program gets an **end** round 1–2 days after the last session
(configurable delay); **Club/Academy also get a mid-season round**. The daily
cron (`/api/cron/feedback` → `processDuePrompts`) fans out **pre-identified
deep links** (one per active registration, HoH email) via the editable M13
triggers `feedback.prompt` / `feedback.reminder` — **one reminder** to
non-responders 3 days later, then drop.

**Submission** (`play.…/feedback/[token]`, mobile-first): star rating is screen
one; a star-only submission is a **quick review (+50 Play Points)**; answering
the optional detail questions upgrades to the **full form (+250 Play Points)**.
Points auto-credit the household ledger **once** (resubmission blocked;
one response per registration per round enforced by unique constraint).

**Attribution:** staff views are **attributed** (`attributedResponses` — ties
feedback to retention/follow-up); any surfaced or public view is **anonymous**
(`anonymousReviews` strips identity). **Low scores (1–2★) alert staff
immediately** via the `feedback.low_score` trigger (to `OPERATIONS_EMAIL`),
attributed, with the comment.

**AI summaries:** `summarizeFeedback()` sends **anonymized** reviews to
`claude-sonnet-4-6` → themes / praise / fixes / quotes, stored per program per
round and surfaced on the admin page (falls back to a stats line without
`ANTHROPIC_API_KEY`). Seeded per-type forms (camp / league / quick review) in
`feedback_forms`. Verify: `/api/dev/feedback-verify` (12/12). Build green.

## Module 16 — Predictive Retention ✅

**Rule-based and transparent — never a black box.** Code:
`packages/foundation/src/retention-core.ts` (pure, `npm run test:retention`
18/18), `lib/retention/retention.ts`, `app/admin/retention`,
`/api/cron/retention`, migration 0034.

**Signals** (all reused from existing module data — no new tracking):
1. **Re-enroll timing vs their OWN history** (highest weight, scales with
   lateness) — last year they'd registered by date X; that date passed with no
   registration.
2. Low feedback rating-of-record (M15).
3. Abandoned re-registration (M4 cart capture).
4. Payment friction — failed installments (M4 plans).
5. Email disengagement — M13 opens trend.
6. **Sibling gap** — one child re-enrolled, this one didn't.
7. **Cross-app engagement trend** — audit-log activity across the shared
   ecosystem; `engagementDrop()` weights **was-high-now-dark** far above
   consistently-low-touch.

**Output is always person + reason(s) + suggested action** — red (≥50) / amber
(≥25) / green. Weights live in `retention_weights` and are editable on the
dashboard (`updateWeights`). The daily cron recomputes all flags; Mondays send
the **weekly digest** ("N families at risk") to `OPERATIONS_EMAIL` via the M13
`retention.weekly_digest` trigger.

**Dashboard** (`admin.…/retention`): sortable at-risk list with per-family
reasons and **one-click actions** (send offer / assign call task / apply
discount → `retention_tasks` + flag marked actioned).

⚠️ **PIPEDA:** cross-app aggregation builds a behavioral profile — legitimate
for the retention purpose, but **internal-only, purpose-limited, never exposed
to families**. There is no public surface for any of this data. Verify:
`/api/dev/retention-verify` (11/11). Build green.

## Module 17 — Photo & Video Gallery ✅

Code: `lib/gallery/gallery.ts` + `lib/gallery/zip.ts` (dependency-free STORE
zip), `app/play/gallery/*`, `app/admin/gallery`, `/api/gallery/zip`,
migration 0035, new private `gallery-media` bucket.

**Enrollment-driven visibility** — staff upload to a program/session; galleries
**auto-populate** in each enrolled family's portal (`galleriesForFamily`, gate
`familyCanSee`). No manual sharing. New uploads optionally notify enrolled
families via the M13 `gallery.new_media` trigger.

**Cost control (baked in):**
- Browse serves **resized thumbnails / poster frames only**
  (`getSignedThumbUrl` → Supabase image-transform `render/image` CDN path) —
  never full-res originals.
- **Full-res originals only on explicit download** — single or multi-select →
  one **zip** (`/api/gallery/zip`, enrollment-gated, streams originals
  server-side).
- **Video never leaves Storage as a file** — media rows carry a
  `video_stream_ref` into the existing live-stream HLS pipeline; playback URL
  is `STREAM_PLAYBACK_BASE` (default `live.athleteinstitute.ca/watch/<ref>`).
  Poster frames only in browse.
- **Lifecycle archiving** — `archiveOldGalleries(6)` (admin button; add to cron
  if desired).

Verify: `/api/dev/gallery-verify` (8/8, incl. real Storage upload + transform
URL check + zip assembly). Build green.

## Module 18 — Dunning & Team-Balance Explainer ✅

**(A) Automated dunning** (`lib/dunning/dunning.ts`, `/api/cron/dunning` daily,
admin `…/dunning`, migration 0036). A failed PAD/card installment opens a
`dunning_case`; the escalation ladder runs automatically:
**auto-retry** (Stripe rails) → **email** with pay link → **SMS** → **staff
call task + family flagged Overdue** (the only human step). Every timing is
configurable (`dunning_config`, admin UI); every message is an editable M13
template (`dunning.email` / `dunning.sms` / `dunning.task`). A successful
retry — or payment at any point (`markRecovered`) — closes the case; the
Overdue flag clears when the family's last open case closes. Built for Academy
tuition PAD plans especially (NSF failures surface days late; the sweep in the
cron catches them).

**(B) Team-balance explainer** (`lib/team-explainer/explainer.ts`) —
**ADMIN-PRIVATE** talking points from `claude-sonnet-4-6` explaining why the M6
draft balanced teams as it did (team sizes, pinned players, friend groups kept
together, the recorded attribute spread from the draft audit). Stored in
`team_balance_explainers`; surfaced only on the admin page. **Never shown to
families** — surfacing algorithmic reasoning invites litigating every
placement. Falls back to a data-driven summary without `ANTHROPIC_API_KEY`.

Verify: `/api/dev/dunning-verify` (8/8). Build green.

## Module 19 — Play Points & Referrals ✅

Code: `lib/points/points.ts`, `app/play/points`, `app/admin/points`, migration
0037. The ledger, household tracking, and the **100 pts = $1** redemption slot
(50% per-registration cap, programs-only, after Credit on Account) already live
in Module 1's pricing function — this module adds earning, referrals, and
reporting.

**Earn-rule engine** — every rule in `points_earn_rules` is admin-configurable
(toggle + value): household creation 100 (once), quick review 50 / full form
250 (wired in M15), early-bird 500, complete profile 100 (once), connect PAD
200 (once), first login 100 (once), birthday 150, referral 1000/500. Spend
earning (1 pt/$1, **programs only — never Academy/Club/rentals**) already flows
through checkout. `awardRule()` enforces per-household one-time credits against
the ledger. **Manual grants require a reason** and are audit-logged.

**Loyalty ladder** — distinct seasons (Club + Academy **count**, rentals never
do): 3→500, 5→1000, 7→1500, 10→2500, each once
(`awardLoyaltyMilestones`, hooked into checkout).

**Referrals** — every family gets a shareable code
(`play.…/sign-up?ref=<code>`). **Both rewards fire on the referred household's
FIRST PAID registration** (checkout hook `onFirstPaidRegistration`), not on
account creation: referrer +1000, referred +500 (stacks with the universal
100). **Cap 3 rewarded referrals per referrer per season**; same-household
blocked; one referral per referred household. **Flag-not-block** fraud posture:
staff flag suspicious referrals and can **claw back** (reason logged, both
sides reversed).

**Customer surface** (`play.…/points`): balance + ledger, referral link +
season count, ladder progress, and the **disclaimer** (`POINTS_DISCLAIMER`)
everywhere points appear. Earning notifies via the M13 `points.earned`
template. **Reporting** (admin page, feeds M14): outstanding **liability in $**
(1 pt = 1¢), earned/redeemed totals, referral conversion rate, top referrers
(internal only). Verify: `/api/dev/points-verify` (13/13). Build green.

## Module 20 — Promotions & Engagement ✅ (Phase 5 complete)

The fun layer on Module 19. Code: `lib/promotions/promotions.ts`,
`app/play/arcade/*` (games + wheel), `app/admin/promotions`,
`/api/promotions/score` + `/spin`, migration 0038. All point awards flow
through the M19/M1 ledger; announcements via the M13 `promo.announcement` /
`promo.winner` templates. **No public leaderboards** — contest boards are
staff-facing.

**Contests + games:** staff create a time-boxed contest on a game
(`basketball` / `soccer` / `volleyball` launch set; `pickleball` / `football`
keys ready), optional auto-announcement. The portal embeds a lightweight
mobile-first **HTML5 timing game** (one engine, skinned per sport — tap the
sweet zone, zone shrinks as you score, 3 misses out). Scores post to the
window-enforced scoreboard (best per family); `closeContest` **auto-awards the
top-N** and notifies winners.

**Spin-to-win wheel:** weighted variable rewards in `wheel_config` (point
bundles / free drop-in / gear discount / better-luck), **unlocked at a
lifetime-points-earned milestone** (default 1000), every spin logged, point
prizes credited via the ledger. Odds + unlock fully configurable.

**Challenge tool:** rule types **first-N-to-act** (slots enforced),
**do-X-by-date** (count within window), streak and referral-push bonuses —
auto-award on completion, optional announcement.

**Streaks & badges:** `seasonStreak` (consecutive registered seasons — gap
resets) surfaced on the Arcade ("4 seasons running — keep it alive!");
badges (First Season / Referral Champ / Superfan / Streak Keeper) awarded once
and shown on the family profile.

Verify: `/api/dev/promotions-verify` (12/12). Build green.

## Module 21 — AI Assistant Platform ("Assist") ✅

One shared core, three scoped surfaces, **read-only to start**. Code:
`lib/assist/tools.ts` (grounded-retrieval registry) + `lib/assist/core.ts`
(the loop), `/api/assist`, `app/play/assist` (public + concierge),
`app/admin/assist` (copilot), migration 0039.

**Grounded retrieval (non-negotiable):** Assist answers ONLY from read-only
tool calls against live data — catalog (`list_programs` /
`get_program_details` / `get_policies`), the caller's own household
(`my_registrations` / `my_balance` / `my_schedule`), and staff org reads
(`unpaid_balances` / `program_stats` / `navigate`). Empty retrieval → an
honest "I don't have that" + **human handoff (text/call/email**, editable in
`assist_config`). The system prompt forbids invented programs/prices/dates.

**Scope is enforced server-side by construction:** the public registry simply
contains no personal-data tools; customer tools throw without the caller's
`familyId`; admin tools throw without staff. `/api/assist` resolves the surface
from the session — a client can never escalate.

**Guardrails:** brand voice ("Assist", warm, community-first — Play. Compete.
Grow.), clarify-then-handoff, off-topic deflection, **hourly rate limits**
(public 20 / authed 60, log-backed per ip/family/profile, configurable), every
query logged (`assist_logs`). **Model: `claude-sonnet-5`** (spec pinned
`claude-sonnet-4-6`, superseded per project decision). Without
`ANTHROPIC_API_KEY` every request degrades to the human handoff.

**Admin copilot extras:** `navigate` resolves "take me to conflicts" to the
exact admin route and the UI opens it. **Actions framework** (guided
registration, pay, drafts) is the spec's later phase — the tool interface is
ready for permission + confirmation gating.

Verify: `/api/dev/assist-verify` (11/11 — scope, grounding, loop plumbing via
injected mock model, handoff, rate limit). Build green.

## Module 22 — AI Enhancements ✅ (ALL 22 MODULES COMPLETE 🎉)

Seven ambient AI features in `lib/ai/enhancements.ts` (+ `lib/ai/claude.ts`,
model **`claude-sonnet-5`**), migration 0040. Hard rule everywhere: **AI
proposes, staff approve** — nothing auto-publishes; every feature has a
deterministic core that works without `ANTHROPIC_API_KEY` (Claude adds
narrative/polish).

1. **Auto-draft descriptions (M4)** — "Draft description with AI" button on the
   program builder generates on-brand copy from the structured fields; lands in
   the description box for staff to edit + save.
2. **AI roster generation (M6)** — `proposeRoster` runs balancer candidates,
   stores the best split + trade-off narrative in `ai_proposals`
   (**never writes teams**); pairs with the M18 explainer.
3. **Smart scheduling (M6)** — `optimizeSlots` deterministic local-search pass
   that improves time-slot fairness (per-team 6/7/8pm variance); returns a
   before/after metric as a proposal — the existing builder still publishes.
4. **Auto-galleries by player (M17)** — `mediaForPlayer`: **jersey-number
   grouping is the default** (`gallery_media.jersey_numbers`). **Face grouping
   is HARD-GATED on `families.face_grouping_consent`** (PIPEDA: biometrics of
   minors = sensitive; off by default, explicit parent consent required) and
   falls back to jersey numbers when refused.
5. **Auto-highlights v1 (M17+M6)** — `highlightWindows` pads each
   `score_events` timestamp (10s before / 5s after) and merges overlaps per
   player attribution → `highlight_clips` metadata (incl. **per-player reels**);
   the live-stream pipeline renders the actual clips. Audio-spike events use
   the same windowing. Vision AI is phase-2, parked.
6. **Pricing intelligence (M14)** — **own-data heuristics only** (full+waitlist
   → headroom; chronic under-enrollment → repackage) with an optional Claude
   narrative; explicitly no fabricated market data. Advisory only.
7. **AI-timed nudges (M13+M16)** — `bestSendHour` picks each family's
   most-likely-to-act hour from their real open history (Toronto), fallback
   6pm.

Verify: `/api/dev/ai-verify` (12/12). Build green.

## TV displays — device setup

Each display configured at `admin.…/displays` gets a **public unguessable URL**
(`play.athleteinstitute.ca/display/<token>`). The token is the access control —
treat the URL like a password (regenerate by deleting/recreating the display).
Pages auto-refresh every 3 minutes and need zero interaction after boot.

Point any of these at the URL:

- **Fire TV Stick** (cheapest): install *Fully Kiosk Browser* (or *Silk*), set
  the display URL as the start page, enable kiosk/autostart.
- **Chromecast / Google TV**: open the URL in Chrome and *Cast tab*, or use a
  kiosk app on Google TV.
- **Mini-PC / Raspberry Pi** (most reliable): boot Chromium in kiosk mode —
  `chromium --kiosk --noerrdialogs --disable-session-crashed-bubble "<url>"`.

Layout: left panel is 9:16 portrait media (single image, video, or a mixed
slideshow — per template), schedule fills the rest. Only bookings flagged
`show_on_public_schedule` ever appear.

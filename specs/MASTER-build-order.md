# Athlete Institute — Facility & Registration Portal
# MASTER BUILD-ORDER DOCUMENT

> The capstone that sequences all module specs into a phased build plan for Claude Code. Read this first, then build modules in the order below. Each module has its own detailed prompt file (`*-module-prompt.md`); this document is the map: what depends on what, what the shared foundations are, and why the order matters. **Do not build out of order** — later modules assume the primitives earlier ones establish.

---

## The Golden Rules (true for every module)

These four shared foundations are established early and **every later module consumes them — no module re-implements them**:

1. **Bookings** — all facility bookings (rentals, programs, events, games, camps) are created through the **Module 2** `/lib` bookings + recurrence + conflict API. No module has its own booking store.
2. **Pricing** — all money math (discounts, credits, scholarships, staff credit, promo, Credit on Account, Play Points, redemption scope + caps) runs through the **single canonical Module 1 pricing function**. No module re-computes pricing.
3. **Notifications** — all email/SMS/push sends go through the **Module 0 `notify()`** layer. Module 13 builds the campaign UX *on top of* it; it does not replace it.
4. **Payments** — all charges/invoices/PAD run on the **Module 0 Stripe rails**; the **Module 4 payment-plan engine** owns installment scheduling.

Plus: **one shared Supabase DB + one Clerk instance** across all apps (strict RLS), **brand theming** from Module 0's `brands` table, **audit logging** on sensitive actions, **mobile-first**, **PIPEDA-compliant**.

---

## Dependency Map (what needs what)

```
Module 0  Foundation ───────────────► everything
Module 1  Accounts (pricing fn) ─────► everything that touches money/users
Module 2  Facilities (bookings API) ─► Rentals, Programs, Competitive Play
Module 3  Rentals ───────────────────► (waiver editor reused by M4)
Module 4  Program Framework ─────────► ALL program types (7–12), Feedback (15)
Module 5  Staff ─────────────────────► Program margin, score entry, check-in
Module 6  Competitive Play ──────────► Leagues (7), Camps (8), Tournaments (9), Club (11)
Modules 7–12  Program types ─────────► extend M4 (+ M6 where competitive)
Module 13 Communications ────────────► built on M0 notify(); used by 15, 19, 20
Module 14 Dashboard/Reporting ───────► reads ALL modules; needs data to exist first
Module 15 Feedback ──────────────────► M4 + M13 + M1(points) + M14(reports)
Module 16 Predictive Retention ──────► M14 + M15 + cross-app data
Module 17 Photo/Video Gallery ───────► M4 enrollments + storage/stream infra
Module 18 Dunning + Team Explainer ──► M0/3/4 (dunning), M6 (explainer)
Module 19 Play Points & Referrals ───► M1 ledger + pricing fn
Module 20 Promotions & Engagement ───► M19 + M13
Module 21 AI Assistant Platform ─────► reads catalog/account/admin data (built after data exists)
Module 22 AI Enhancements ───────────► enhances M4/6/13/14/16/17 (after those work)
```

---

## Build Phases

### PHASE 1 — Platform Core (nothing works without these)
Build strictly in order; each must work before the next.

1. **Module 0 — Foundation.** Repo, subdomains, Clerk/Supabase/Stripe wiring, brand theming, `notify()`, storage, UI kit, utilities, audit log.
2. **Module 1 — Accounts.** Data model, user types, families, roles, staff credits, Play Points ledger, **the canonical pricing function** (with redemption-scope rules), Playbook import.
3. **Module 2 — Facilities Schedule.** Facility tree, bookings + tree-aware conflict engine, recurrence engine + API, schedule views, TV displays, public/family schedule.

**Gate:** a user can sign up/in across subdomains; staff can build the facility tree and create/resolve bookings; the pricing function passes its unit tests.

### PHASE 2 — Revenue Primitives
4. **Module 3 — Rentals.** Quote builder, rates, add-ons, internal/external, status state machine, payment schedules, waiver editor (reused by M4), org flow. *(Builds bookings via M2; money via M1.)*
5. **Module 4 — Program Framework.** The program spine every type extends: types, custom questions, registration + cart, pricing + **payment-plan engine**, products/jerseys, waivers, **refund/proration engine**, abandoned-cart capture, catalog. *(Reuses M3 waiver editor; bookings via M2; pricing via M1.)*
6. **Module 5 — Staff.** Records, roles, pay structures, permission matrix, absence/replacement, certs, pay dashboard. *(Feeds M4 margin; gates M6 score entry + M8 check-in.)*

**Gate:** staff can build a rental quote end-to-end and a generic program end-to-end (register → pay/plan → waiver → refund); staff records + permission matrix exist.

### PHASE 3 — Competition Engine + Program Types
7. **Module 6 — Competitive Play.** Rostering, team builder (+ reverse replacement), 3-mode schedule builder, score entry, standings, public portal. *(Reads M4 custom questions; bookings via M2; score entry via M5 permissions.)*

Then the program-type front-ends (each extends M4; competitive ones plug into M6). Order among these is flexible:

8. **Module 7 — Leagues** (M4 + M6)
9. **Module 8 — Camps** (M4 + optional M6)
10. **Module 9 — Tournaments** (M4 + M6)
11. **Module 10 — General Programs** (Clinics/Pickup/Drop-In; M4 only; **+ the shared Reschedule Workflow that lands in M4**)
12. **Module 11 — Club** (M4 + M6 manual rosters; tryout→offer→confirm pipeline)
13. **Module 12 — Academy** (M4 only; recruitment offer pipeline, tuition tiers, no M6)

**Gate:** every program type can be created and registered for; competitive types produce schedules + standings on the public portal.

### PHASE 4 — Communications (needed by later engagement/feedback modules)
14. **Module 13 — Communications.** Email builder (+ Claude-drafting), announcement tool, auto-notifications, segments, scheduling, stats, retargeting, deliverability, CASL. *(On top of M0 notify(); permission-gated via M5.)*

**Gate:** campaigns, auto-notifications, and announcements send and report.

### PHASE 5 — Analytics & Loyalty (need data + comms to exist)
15. **Module 14 — Dashboard & Reporting.** Multi-location model, landing dashboard, financial suite, **QuickBooks sync** (powers M4 margin), registration/demographics + map, custom report builder, exec PDFs, facility utilization, capacity nudges, feedback + retention surfaces. *(Reads everything; build after the data-producing modules.)*
16. **Module 19 — Play Points & Referrals.** Earn-rule engine, referral system, redemption (respecting M1 scope/caps), customer surface, liability reporting. *(Can build alongside M14 — both depend only on earlier phases. Feedback's point rewards assume this exists.)*
17. **Module 15 — Feedback & Ratings.** Rating model, form builder, auto-prompting, AI summaries, low-score alerts. *(M4 + M13 + M1 points + M14 reports.)*
18. **Module 20 — Promotions & Engagement.** Contests + games + wheel, challenges, streaks, badges. *(M19 ledger + M13 announcements.)*

**Gate:** reporting reflects real data; points earn/redeem correctly; feedback prompts fire and roll up.

### PHASE 6 — Intelligence & Media (enhancements on a working platform)
19. **Module 16 — Predictive Retention.** Rule-based churn flags from M14/M15 + cross-app engagement. Surfaces in M14.
20. **Module 17 — Photo & Video Gallery.** Enrollment-driven galleries, thumbnails/streaming, downloads.
21. **Module 18 — Dunning & Team-Balance Explainer.** Failed-payment escalation (M0/3/4) + admin-private draft explainer (M6).
22. **Module 21 — AI Assistant Platform ("Assist").** Shared grounded-retrieval core; public assistant first, then customer concierge + admin copilot (read-only first).
23. **Module 22 — AI Enhancements.** Ambient AI folded into home modules: auto-draft descriptions (M4), AI scheduling + roster gen (M6), auto-galleries + auto-highlights (M17 — highlights likely via a **third-party sports-video app** fed by M6 scoreboard timestamps), pricing intelligence (M14), AI-timed nudges (M13/16).

---

## Notes for the Builder

- **Ship each module working before the next.** Every module prompt has "Build Stages — show me each working" and a test list; honor them.
- **The two highest-risk engines** are the **Module 2 availability/conflict engine** and the **Module 4 refund/proration engine** — both have explicit worked-example tests. Get these right; much depends on them.
- **The pricing function (M1)** is the single source of truth for money. If any module seems to need its own pricing math, that's a smell — extend the function instead.
- **Team communications** (Club/Academy chat, RSVPs, coach announcements) are explicitly **out of scope** — a separate future team app. Build only the roster/schedule handoff hooks.
- **Third-party boundaries:** QuickBooks (M14) for accounting; a sports-video app for auto-highlights (M22); the existing live-stream + tickets apps share the foundation. Don't rebuild these.
- **AI features use `claude-sonnet-4-6`** and the Anthropic API pattern; grounded retrieval (M21) is non-negotiable — reliability over coverage.
- **Compliance threads:** PIPEDA (data minimization, RLS, internal-only profiling in M16, consent for face-grouping in M22), CASL (M13 unsubscribe + sender-ID), Canadian payment rules (M12 processing-fee caveat — confirm with a payment advisor).

---

## Module File Index

| # | Module | File |
|---|---|---|
| 0 | Foundation / Platform Core | `foundation-module-prompt.md` |
| 1 | Accounts | `accounts-module-prompt.md` |
| 2 | Facilities Schedule | `facilities-schedule-module-prompt.md` |
| 3 | Rentals | `rentals-module-prompt.md` |
| 4 | Program Framework | `program-framework-module-prompt.md` |
| 5 | Staff | `staff-module-prompt.md` |
| 6 | Competitive Play | `competitive-play-module-prompt.md` |
| 7 | Leagues | `leagues-module-prompt.md` |
| 8 | Camps | `camps-module-prompt.md` |
| 9 | Tournaments | `tournaments-module-prompt.md` |
| 10 | General Programs | `general-programs-module-prompt.md` |
| 11 | Club | `club-module-prompt.md` |
| 12 | Academy | `academy-module-prompt.md` |
| 13 | Communications | `communications-module-prompt.md` |
| 14 | Dashboard & Reporting | `dashboard-reporting-module-prompt.md` |
| 15 | Feedback & Ratings | `feedback-ratings-module-prompt.md` |
| 16 | Predictive Retention | `predictive-retention-module-prompt.md` |
| 17 | Photo & Video Gallery | `photo-video-gallery-module-prompt.md` |
| 18 | Dunning & Team-Balance Explainer | `dunning-team-explainer-module-prompt.md` |
| 19 | Play Points & Referrals | `play-points-referrals-module-prompt.md` |
| 20 | Promotions & Engagement | `promotions-engagement-module-prompt.md` |
| 21 | AI Assistant Platform | `ai-assistant-platform-module-prompt.md` |
| 22 | AI Enhancements | `ai-enhancements-module-prompt.md` |

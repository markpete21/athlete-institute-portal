# Athlete Institute — Facility & Registration Portal

## Module 0 of N: FOUNDATION / PLATFORM CORE

> **Build this FIRST.** Every other module (Accounts, Facilities, Rentals, Programs, Staff, Competitive Play, Communications, Dashboard, and the front-end program types) stands on this. Module 0 owns the technical platform: repo skeleton, subdomain routing, the shared Clerk + Supabase + Stripe wiring, the brand theming system, the notification send-layer, media storage, the shared UI kit, core utilities, audit logging, and the cross-app landing hub. It does **not** own domain business rules — the pricing function lives in Accounts (Module 1) and the bookings API lives in Facilities (Module 2). Module 0 = *how the app is built and wired*; Modules 1–2 = *the core business primitives*.

---

## Ecosystem Context

Athlete Institute runs a **family of apps that share one foundation**:

- **Tickets app**, **Live-stream app** (`live.athleteinstitute.ca`) — already live.
- **This portal** (facility management + registration) — subdomains `play.` (public) + `admin.` (staff).
- **Team app** (future) — a TeamSnap-style club/academy team-communication + management app (team chat, coach announcements, roster comms). Club/Academy *team comms* live there, NOT in this portal.

**Shared architecture (already true for the existing apps — match it):**
- **One shared Supabase project/database** across all apps. Shared tables (`profiles`, `families`, `bookings`, etc.) are read/written by multiple apps. Discipline required: **strict RLS** so no app leaks another's data.
- **Separate repos per app** (not a monorepo), each independently deployable on **Vercel**. The shared foundation is a **shared package + documented shared schema** all repos point at.
- **One shared Clerk instance** — single sign-on across all apps.
- **Stripe** — Canadian account, cards + **PAD (`acss_debit`)**.
- **Next.js** (App Router).
- **Resend** for email (used by existing apps — match it).

---

## What Module 0 Establishes

### 1. Repo skeleton + subdomain routing

- Scaffold this portal as its **own repo** (own Vercel project), pointing at the shared Supabase + Clerk.
- **Subdomain routing** via middleware for **three** hostnames:
  - **`play.athleteinstitute.ca`** — public-facing (customers, orgs, tenants, staff-as-customers).
  - **`admin.athleteinstitute.ca`** — staff-only backend (hard-blocked to non-staff — enforced with Module 1 roles).
  - **`apps.athleteinstitute.ca`** — the **shared landing / hub** (see below).
  - Plus **public token URLs** exempt from auth for the TV displays (Module 2).
- A **shared foundation package** (e.g. `@ai/foundation`) exporting the Clerk/Supabase/Stripe clients, brand theming, `notify()`, the UI kit, and utilities — so this repo and the other app repos consume one source of truth.

### 2. Cross-app landing hub (`apps.athleteinstitute.ca`)

- A shared landing page listing the Athlete Institute apps with an **app switcher**.
- **Grants admin access** — the entry point where a staff member reaches `admin.*`.
- The **public portal (`play.*`) shows links to other apps**: **Tickets**, **Live**, and the **public Leagues module**.
- Uses the shared Clerk session so moving between apps requires no re-login.

### 3. Auth wiring (Clerk)

- Shared Clerk instance; **Clerk Organizations** enabled (for Module 1 orgs).
- Email/password + magic link.
- Middleware exposes the current user's roles/type to every request for the subdomain guards (roles/types themselves are defined in Module 1).

### 4. Stripe/payment layer

- Establish the **Stripe integration primitives** everything else builds on: customer creation, **payment-method vaulting**, **PAD (`acss_debit`) mandate setup + agreement capture**, charge/invoice creation, and **webhook handling** (payment success/failure → event other modules subscribe to).
- Does NOT own pricing math (Module 1) or the payment-plan scheduler (Module 4) — it owns the **rails** they call: "charge this amount," "create this invoice," "is PAD set up + agreed for this payer."
- Canadian tax handling utility (see utilities).

### 5. Brand theming system

- **Data-driven brands** — a `brands` table: name, **logo(s)**, **color tokens**, **font**, and which registration/catalog/email template it maps to. Seed: **Athlete Institute, Orangeville Prep, ALL CAN, Bears** (Volleyball + Rep Basketball).
- **Brand colours and logos are adjustable** in admin (detailed per-brand design systems will be provided later — build so they can be edited without code).
- Theming resolves at render time: registration pages, public catalog/portal views, and email templates pull the active brand's tokens.
- Default brand: Athlete Institute (black / white / gold `#A18F60`, Helvetica Neue).

### 6. Notification send-layer (`notify()`)

- A single service with **three channels**: **email (Resend)**, **SMS (Twilio)**, **push (web push)**.
- All early cross-module reminders call this **before** the Communications module exists: staff pay reminders (M5), booking-conflict keep-both reminders (M2), waitlist notifications (M4), payment/PAD reminders (M3/M4), cert-expiry warnings (M5).
- Exposes a clean API: `notify({ to, channel(s), template, data })`. **Module 13 (Communications)** builds the campaign/template/scheduling UX **on top of** this layer — Module 0 owns the send rails, not the marketing UX.
- Template rendering supports brand theming.

### 7. Media / file storage

- **Supabase Storage** buckets: staff bios/photos, event logos, TV-display media, product images, and documents (quotes, jersey orders, waivers PDFs).
- Upload helpers + signed-URL access respecting RLS.

### 8. Shared UI kit / design system

- A **themed component library** reading brand tokens: buttons, forms, inputs, tables, modals, tabs, cards, toasts, plus **schedule/calendar primitives** (day/week/month/Gantt shells) reused by Modules 2/6.
- **Featured tabs across the top** navigation shell (the portal's top-level tab bar) with the **cross-app links** (Tickets, Live, Leagues) — the consistent chrome every module renders inside.
- Mobile-first; consistent across all modules.

### 9. Core utilities

- **Money** (cents-safe arithmetic, currency formatting CAD).
- **Tax** (Canadian/Ontario HST calculation) — used by rentals, programs, checkout.
- **Dates** (the three seasons Jan–Apr / May–Aug / Sep–Dec, business-day math for "10/5 business days," timezone = America/Toronto).
- **Audit logging** — a shared audit trail (who did what, when) that sensitive actions across modules write to (refunds, overrides, permission changes, deletions).

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Repo + shared package + subdomain routing** — scaffold the repo pointing at shared Supabase/Clerk, `@ai/foundation` package, middleware routing `play.` / `admin.` / `apps.` + public token-URL exemption.
2. **Auth wiring** — shared Clerk instance, Organizations enabled, session→roles exposure for guards (roles defined in M1).
3. **Landing hub** — `apps.athleteinstitute.ca` with app switcher + admin-access entry; cross-app links (Tickets/Live/Leagues) surfaced for `play.*`.
4. **Stripe rails** — customer + payment-method vaulting, PAD mandate + agreement capture, charge/invoice primitives, webhook handling.
5. **Brand theming** — `brands` table, editable colours/logos, render-time resolution for pages + emails, seeded brands.
6. **Notification layer** — `notify()` with Resend/Twilio/web-push, brand-themed templates, ready for M2–M5 reminders.
7. **Media storage** — Supabase Storage buckets + upload/signed-URL helpers.
8. **UI kit + utilities** — themed component library incl. calendar/Gantt shells + top-tab nav chrome, money/tax/dates/audit-log utilities.

### Deliverables

- The **portal repo skeleton** + the **`@ai/foundation` shared package** (consumed by this repo; documented for the other app repos).
- `README.md`: monorepo-vs-repos rationale, shared-Supabase + RLS conventions, Clerk shared-instance setup, subdomain/DNS for `play.`/`admin.`/`apps.`, Stripe (cards + PAD) setup, Resend/Twilio/web-push config, brand theming, storage buckets.
- `.env.example` — every variable (Clerk, Supabase, Stripe, Resend, Twilio, web-push VAPID keys).
- The **shared schema conventions doc** (naming, RLS patterns, `created_at`/`updated_at`, audit-log usage) that Modules 1+ follow.
- GitHub Actions CI: lint + type-check.

### Non-Functional

- Mobile-first everywhere; `/display` large-screen-optimized.
- **Strict RLS** — shared database must not leak data across apps.
- PIPEDA-compliant; cookie consent; minimal data collection; audit trail on sensitive actions.
- All later modules consume Module 0's clients, `notify()`, theming, UI kit, and utilities — they do not re-instantiate Stripe/Clerk/Supabase or re-declare the stack.

# Athlete Institute — Facility & Registration Portal

## Module 1 of N: ACCOUNTS

> This is the foundation module. Every later feature (Rentals, Programs, Facilities Schedule, Communications, Dashboard) reads from and writes to the tables defined here. Build this correctly and completely before moving on. Do not stub the data model — the schema below is the contract the rest of the platform depends on.

---

## Project Context

You are building a facility management and registration portal for **Athlete Institute**, a sports campus in Orangeville, Ontario. This portal is the third app in an existing ecosystem and must share authentication and data conventions with the other two:

- **Tickets app** and **Live stream app** (`live.athleteinstitute.ca`) already run on: **Clerk** (auth), **Supabase** (Postgres database), **Stripe** (payments — Canadian account, PAD via `acss_debit` plus cards), **Next.js** (App Router) deployed on **Vercel**.
- This portal uses the **same Clerk instance** so a user signs in once and is recognized across tickets, live stream, and this portal (single sign-on).
- Brand: black / white / gold (`#A18F60`), Helvetica Neue.
- PIPEDA-compliant (Canadian privacy). Cookie consent banner. Collect only what's needed.

### Two-subdomain architecture

The portal ships as **one Next.js codebase, two subdomains**, gated by role:

- **`play.athleteinstitute.ca`** — public-facing. Customers, organizations, tenants, and staff (acting as customers) all use this. Registration, rentals, family management, checkout, schedules.
- **`admin.athleteinstitute.ca`** — backend. **Staff only.** Non-staff accounts are fully blocked from `admin` — no limited view, hard redirect to `play`.

A **staff member uses one Clerk account** for both: they log into `play` and behave exactly like a customer (register their own kids, pay, earn points), and their staff role additionally unlocks `admin`. Role determines subdomain access; identity is singular.

---

## Data Model (Supabase / Postgres)

Design these tables with proper foreign keys, RLS policies, and `created_at` / `updated_at` timestamps. Use Clerk's `user_id` as the external identity key; mirror users into a local `profiles` table for relational joins.

### User Types

Every account is exactly one **user type**. Types drive access level and available settings:

1. **Customer** — individuals/families registering for programs and rentals.
2. **Organization** — an org entity with multiple **agents** (people) underneath it. Use **Clerk Organizations** natively for this. All agents have **equal power** within the org. Org accounts are kept **separate from customer accounts**. Billing is by **invoice**, with the option for the org to **pay an outstanding balance online**.
3. **Tenant** — a long-term leaseholder of a space (e.g. CrossFit Orangeville, Purple Owl Pilates, By Design Learning). On the portal a tenant has **read-only access to the facility schedule** and nothing else. No booking, no registration.
4. **Staff** — Athlete Institute employees. A staff account carries one or more **admin roles** (below) and also functions as a **customer** on `play`.

Store user type on the profile. Provide **customizable settings per type** — at minimum: **level of access** (which portal areas/subdomains they can reach) and, for staff, **special staff discounts** (see Staff Credits below). Build the settings as a per-type config so new settings can be added without schema changes (a JSONB `settings` column plus a typed settings UI is acceptable).

### Admin Roles (for Staff, on `admin`)

A role system, editable in the admin UI (**add / edit roles**). Seed with:

- **Admin** (full access)
- **Facility Coordinator**
- **Coach**
- **Assistant Coach**
- **Convenor**
- **Volunteer**

Roles are permission sets. A staff account can hold one or more roles. **Customers can also hold a role** (e.g. a parent who volunteers as a Coach) — holding a role grants the corresponding `admin` access for that role's scope, but their base user type stays Customer. Model roles as a many-to-many between profiles and roles, independent of user type.

### Families & Head of Household

- A **Customer** belongs to a **family** (household).
- **One Head of Household (HoH) per family.** The HoH owns the account: manages family members, payment methods, contact info, and can register + pay.
- A **secondary parent** can be granted access: they **can register a family member and pay**, but **cannot alter account settings** (cannot add/remove family members, change payment methods, or edit core contact/account info). Enforce this split in RLS and UI: transactions allowed, settings locked.
- HoH **adds family members** directly. Adding a member with an email triggers an **email notification** to that member.
- **Age-based access, two tiers only:**
  - **Dependent (under 18):** **view-only** access at any age (can see their own schedule/registrations). The HoH or secondary parent does all registering and paying. No self-registration, no transactions.
  - **Adult member (18+):** on turning 18 the account **converts to adult member**. They can now **log in and register themselves for adult programs**, while the **parent can still register them** too. The adult member **remains in the household** until they request removal in settings.

### Organizations & Agents

- Use **Clerk Organizations**. Org = Clerk org; agents = Clerk org members.
- **All agents equal power** — no org-admin/member split required.
- Org billing = **invoice**; expose an **online "pay balance"** flow (Stripe) for outstanding org invoices.

### Staff Credits (season top-up)

- Seasons are fixed: **Jan–Apr, May–Aug, Sep–Dec.**
- Each staff account has a **season credit cap** — a **default cap set across all staff accounts**, **overridable per account**.
- At the start of each season the balance is **topped up TO the cap, not incremented by it.** Example: cap $100, leftover $30 → season starts at $100 (not $130). Leftover $0 → $100. **Unused credit does not roll over; it resets to the cap each season.**
- Credit is spendable across the **staff member's entire household** (their kids, spouse — any registration under their household), not only registrations where the staff member is the participant.
- Credit **draws down** as it's spent (spend $60 of $100 → $40 remaining until next season's top-up).

### Play Points (loyalty)

- Loyalty program at the **household** level ("Play Points").
- **100 points = $1.** **No cap** on how much of a purchase points can cover (to start).
- Points balance stored per household; ledger table for earn/spend history.

### Discount & Credit Stacking (checkout logic)

Enforce this precedence at checkout — build it as a single, testable pricing function so later modules call it identically. (Program-level price rules — early-bird, late fee, returning-athlete, multi-member — and Credit on Account are defined in the Program Framework module, but this one function owns the order.)

**Canonical order:**

`base price (early-bird if applicable) → + late registration fee → − returning-athlete discount → − multi-member discount → − scholarship (Academy only) → − (staff credit XOR promo) → − Credit on Account → − Play Points → total`

Rules:
1. **Scholarships apply to Academy and Club registrations** (per-program-type eligibility flag, not hardcoded to one type — so it can extend further later).
2. **Returning-athlete discount always applies** when enabled on the program — it is a program price adjustment, NOT blocked by the staff-credit/promo exclusivity rule.
3. **Staff credit OR a promo code — not both.** If a staff credit is applied, no additional promo can apply, and vice versa.
4. **Credit on Account spends before Play Points.** Both apply after the staff credit or promo, against the remaining balance.
5. **Redemption scope by program type.** The function must know, per line item, what each balance is **eligible to be redeemed against**:
   - **Play Points** are redeemable on **programs only** — NOT on **Academy, Club, or rentals**. When the line is Academy/Club/rental, the points step is skipped (points can still be *earned* elsewhere and spent on eligible program lines).
   - **Play Points redemption is capped at 50% of the eligible line's price.**
   - **Scholarship** applies to **Academy and Club** only (per the eligibility flag in rule 1).
   - **Staff credit** applies to staff-household program registrations (not rentals).
   Each balance carries an eligibility check; the function applies it before subtracting that balance and never drives a line below zero.

### Account Lifecycle

Every account has a status: **active**, **suspended**, **archived**. Suspended/archived accounts cannot register or transact; define the UI states and the guards. (Reserve for later: tenants whose lease ended, customers with unpaid balances.)

---

## Auth & Access Rules

- **Clerk SSO** shared with tickets + live stream (same Clerk instance/keys).
- **Login identity:** email/password and magic link at minimum. **Account claim via email** is the primary onboarding path for migrated users (see Import).
- **Subdomain guards:** middleware checks role/type on every request. `admin.*` → staff/role-holders only, hard-block everyone else. `play.*` → all types, but tenants get **only** the read-only schedule view.
- **RLS** enforcing: HoH full household access; secondary parent transact-not-alter; dependents view-only-own; adult members self-serve; org agents scoped to their org; tenants schedule-read-only.

---

## Playbook Data Import

Migrate **~7,000 accounts** from **Playbook**.

- **Migrate:** member details (names), **emails, addresses**, and **family/household groupings** where derivable.
- **Do NOT migrate:** payment methods (impossible — cards are vaulted at Playbook's processor and cannot be legally exported), past transactions, or registration history. These are out of scope.
- **De-dupe / merge tool:** the export will contain duplicate people (same person across registrations; two parents entered separately who are one household). Build an **import review + merge UI**: flag likely duplicates (match on email, then name+address fuzzy match), let an admin merge or keep-separate before commit. Import runs as a **staged, reviewable job**, not a blind bulk insert.
- **Account claim flow:** after import, accounts exist in a **pending/unclaimed** state. Send a **"claim your account" email** to all imported addresses. Claiming links the record to a new Clerk identity (email match) and prompts the user to set a password. **On first checkout, prompt gracefully for payment info** (since none migrated) — never dead-end; frame it as "set up your payment method" rather than an error.

Work from a **CSV export** (assume Mark provides it). Build the importer to a documented CSV schema; include a sample CSV and a dry-run mode.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Schema + Clerk wiring** — Supabase tables (profiles, families, family_members, orgs mirror, roles, role_assignments, staff_credits, play_points + ledger, account_status), Clerk SSO shared with existing apps, Clerk Organizations enabled, RLS policies. Sign-up / sign-in / magic link working on both subdomains.
2. **User types + subdomain guards** — the four types, per-type settings config, middleware blocking non-staff from `admin`, tenant read-only gate. Show a staff account entering both subdomains and a customer being blocked from `admin`.
3. **Families + roles** — HoH, secondary parent (transact-not-alter), dependent view-only, 18+ auto-conversion to adult member, member-add email notification. Role system with add/edit and role assignment to staff and customers.
4. **Credits, points, stacking** — staff season-credit top-up logic (with the three fixed seasons and default+override caps), Play Points ledger, and the checkout pricing function enforcing scholarship→(staff-credit XOR promo)→points precedence. Unit-test the pricing function with worked examples.
5. **Playbook import** — CSV schema + sample, dry-run, de-dupe/merge review UI, staged commit, claim-account email flow, first-checkout payment-setup prompt.

### Deliverables

- Full Next.js source in a GitHub repo (`/app`, `/components`, `/lib` with Clerk/Supabase/Stripe helpers, `/admin` routes, middleware for subdomain routing).
- `README.md`: local setup, Supabase migrations, Clerk config (incl. Organizations + shared instance), subdomain/DNS setup for `admin.` and `play.`, and how to run the Playbook import end-to-end.
- `.env.example` documenting every variable (Clerk, Supabase, Stripe, email).
- The pricing function as a standalone, tested `/lib` module the later modules import.

### Non-Functional

- Mobile-first (most parents are on phones).
- PIPEDA-compliant; cookie consent; minimal data collection.
- GitHub Actions CI: lint + type-check on PR.

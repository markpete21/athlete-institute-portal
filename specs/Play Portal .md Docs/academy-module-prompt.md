# Athlete Institute — Facility & Registration Portal

## Module 12 of N: ACADEMY

> The final program-type front-end, extending **Module 4 (Program Framework)** for enrollment, billing, waivers, and add-ons. **Purely enrollment + billing** — no tryouts, no Competitive Play. Recruitment-driven offer pipeline, tuition with tiers + scholarships, staff-dictated payment plans, invoices/statements, and an Academy dashboard. Team communications/messaging live in the **separate club/academy-management app** (future). Build after Module 4.

---

## Project Context

Same stack and subdomains. Academy uses the Module 4 payment-plan engine (with Academy-specific settings) and has **its own tuition-commitment refund handling** (not standard proration). Scholarships apply (Module 1 pricing function, Academy + Club eligibility). **Academy teams do NOT appear on the Competitive Play public portal.**

---

## Structure — Academy → Team (named)

- Two-level: **Academy → Team.** A **fixed, staff-managed roster of named teams** (add/edit/rename), each with its own capacity, tuition tiers, coach, and schedule. Seed:
  - **OP National Boys, OP National Girls, OP Varsity Boys, OP Varsity Boys 2, OP Junior Girls, OP Junior Boys.**
- No age-level hierarchy — just named teams.

---

## Recruitment Offer Pipeline (no tryouts)

Recruitment-driven. No tryout events. Flow:

1. **Bring a player into the pipeline:** either **move an existing account** (a player with an account anywhere in the system) into the Academy pipeline, **or create a new account.**
2. **Place onto a team** → status **Selected.**
3. **Send an offer** (single or bulk) → status **Offered.**
4. Player/parent receives a **digital link** to **accept or decline** → status **Accepted** / **Declined.**
5. **Deposit required** on acceptance to secure the spot (applied toward tuition).

**Status ladder:** Selected → Offered → Accepted / Declined.

---

## Tuition & Billing

### Tuition tiers (per team)

- Each team defines **three tuition defaults**, set **differently per team**:
  - **Tuition – Room & Board**
  - **Tuition – Commuter**
  - **Tuition – International**
- The player's applicable tier is selected at enrollment.
- **Add-ons available** at enrollment (Module 4 products/add-ons).

### Scholarships

- A **flat-rate discount on tuition** (dollar amount), set **per player** by staff. **Partial scholarships allowed.**
- **Applied BEFORE the payment plan is calculated** — installments are based on post-scholarship tuition. (Consistent with the Module 1 pricing function: the pricing function computes the final total — scholarship included in its canonical order — and the payment-plan engine then splits *that* post-discount total into installments. Scholarship is never applied after the plan is split.)
- **Tracked and reported** — total scholarship dollars awarded, per player, per season (surfaced on the Academy dashboard).

### Payment plans

- **Staff-dictated** — the academy sets the plan offered (families don't self-select); build the **settings on the admin side.**
- Tuition covers the **Sept–June** program, but **payment plans complete by Feb 1** (front-loaded — plan finishes before season end).
- **Deposit required** at enrollment (applied toward tuition), remaining balance on the plan.
- Uses the Module 4 payment-plan engine, including the **"recalculate total owed" button** (catch up a plan after missed installments — the primary use case here).

### Processing fees / PAD incentive

- Add a **configurable processing-fee line item** on card payments, **waived (or reduced) when the family pays by PAD (`acss_debit`)** — PAD's lower cost is the incentive to connect it. Push families to **connect PAD** at enrollment and on invoices.
- Implement as a **visible fee line item**, NOT a raw card surcharge. **Compliance note:** Canadian card surcharging has rules (cap, disclosure, network notification, card-type restrictions); confirm the exact implementation with Athlete Institute's payment advisor. PAD is bank debit, not a card, so treat its (lower/zero) fee separately.

### Refunds — full-year tuition commitment

- **Tuition is owed for the full year regardless of early departure.**
- On withdrawal, **admin adjusts the payment plan case-by-case** (no automatic acceleration or stop) — default position is full-year tuition owed; staff manually adjust as needed via the refund/override engine.

---

## Invoices / Statements

- Each family gets a **tuition invoice/statement**: tuition tier, scholarship applied, add-ons/fees, payments made, balance owed.
- **Downloadable and emailable**, with a **link to pay online or set up PAD.**
- Invoicing comms run through this platform (**email only**, via Module 13 + Module 0 `notify()`).

---

## Re-enrollment & Retention

- **Re-enrollment flow:** returning players receive an **enrollment offer for the next season** without re-entering the full pipeline.
- **Returning-athlete flag** (Module 4) applies; **retention reporting** on Academy (surfaced on the dashboard).

---

## Academy Dashboard

- Shows: **tuition** (billed, collected, outstanding), **scholarships awarded** (total + per player), **balances per family**, **payment-plan status**, and **retention**.

---

## Schedule View & Communications

- **Family read-only schedule view** — enrolled player's family sees their Academy team's schedule from the **Module 2** master schedule.
- **Email comms** (invoicing-focused) via this platform.
- **Team messaging / management lives in the SEPARATE app** (future) — reserve the roster + schedule handoff hook; do not build messaging here.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Academy → Team structure** — staff-managed named teams, per-team capacity/coach, seeded six OP teams.
2. **Recruitment offer pipeline** — move-existing-or-create account → place on team (Selected) → send/bulk offer (Offered) → digital accept/decline → deposit on acceptance.
3. **Tuition + scholarships** — three per-team tuition tiers, tier selection at enrollment, flat-rate per-player scholarships (partial allowed) applied pre-plan, scholarship tracking.
4. **Payment plans + fees** — staff-dictated plans completing by Feb 1, required deposit, recalculate-on-missed, processing-fee line item waived on PAD, PAD-connect push.
5. **Invoices + refunds** — downloadable/emailable statements with pay/PAD links, full-year commitment with admin case-by-case plan adjustment on withdrawal.
6. **Re-enrollment + dashboard + schedule view** — returning-player re-enrollment offers, Academy dashboard (tuition/scholarships/balances/retention), family read-only schedule view, team-app handoff hook.

### Deliverables
- Source (`/app/academy`, `/admin/academy`, `/lib/academy`).
- Digital offer/acceptance link flow; invoice/statement PDF + online pay/PAD-setup page.
- README: offer pipeline, tuition tiers, scholarship mechanics, payment-plan settings, processing-fee/PAD approach + compliance caveat, full-year refund handling, re-enrollment.
- Tests: offer pipeline transitions, scholarship-applied-pre-plan math, plan-completes-by-Feb-1 scheduling, deposit-applied-to-tuition, processing-fee-waived-on-PAD, recalculate-on-missed, retention calculation.

### Non-Functional
- Mobile-first (offer acceptance + online payment/PAD setup).
- Money via Module 1 pricing function + Module 4 payment plans; schedules via Module 2; comms via Module 0 `notify()`/Module 13.
- No Competitive Play hookup. Team messaging OUT of scope (separate app) — build only the handoff hook.
- Processing-fee implementation flagged for payment-advisor compliance review.

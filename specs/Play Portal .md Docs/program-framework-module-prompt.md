# Athlete Institute — Facility & Registration Portal

## Module 4 of N: PROGRAM FRAMEWORK (shared base for all program types)

> This is the shared spine every program type builds on. **Camps, Leagues, Clinics, Pickup/Drop-In, Club, Academy, and Other/Misc all extend this framework** — they do not reinvent registration, checkout, payment plans, waivers, products, or refunds. Depends on **Module 1** (Accounts: families, user types, roles, pricing function, Play Points), **Module 2** (Facilities Schedule: bookings + recurrence engine + conflict resolution), and reuses **Module 3**'s waiver editor + products/add-on concepts. Build this completely before any individual program-type sub-module.

---

## Project Context

Same stack: **Clerk**, **Supabase**, **Stripe** (Canadian — cards + **PAD `acss_debit`**), **Next.js** App Router on **Vercel**. Brand black/white/gold (`#A18F60`), Helvetica Neue. PIPEDA-compliant, mobile-first (most parents are on phones).

- `admin.athleteinstitute.ca` — staff build/manage programs, questions, products, refunds.
- `play.athleteinstitute.ca` — public program catalog + registration + checkout; families view/manage their registrations.

---

## Program Type Selector

- First choice when creating any program is the **program type.**
- Seed types: **Camp, League, Clinic, Pickup/Drop-In, Club, Academy, Other/Misc** (the generic "Program" = "Other/Misc").
- Types are **add/editable** by staff — build a type manager (add, edit, disable). Each type carries its own **default custom questions**, default proration method, and default settings that new programs of that type inherit.

---

## Shared Program Spine (every type has these)

Model a base `programs` table + related tables. Common fields for ALL types:

- **Name**, **description**
- **Program type** (drives inherited defaults) — **color-coded on the master schedule**
- **Category** — one of **Academy, Club, Camps, Youth Sports, Adult**. Used for catalog filtering and reporting rollups. **Default the category from the program type** (e.g. Academy type → Academy, Clinic → Youth Sports) but allow staff to **override per program** (an adult league belongs in Adult, a high-performance camp may sit differently). There is **no separate Adult/Youth flag** — the category carries that distinction.
- **Associated facility bookings** — written into **Module 2** via its recurrence engine (see below)
- **Registration window** — open/close dates
- **Season/year** (seasons: Jan–Apr, May–Aug, Sep–Dec)
- **Sport tag**
- **Min/Max age** — evaluated by **DOB**
- **Brand** — dictates the look of the registration page (brand-themed registration templates; e.g. Orangeville Prep vs. Bears)
- **Capacity**
- **Pricing** (see Pricing)
- **Add-ons** (products-with-variants; see Products)
- **Custom questions** (see Custom Question Builder)
- **Assigned staff** (see Staff hook)
- **Forms/waivers** (reuse Module 3 e-sign waiver editor)
- **Roster** of registrants
- **Status** (see Statuses)

### Returning vs. New Participant (auto-derived, drives retention reporting)

At registration, the system **automatically derives** each participant's standing by checking their registration history — these are **not** manually set, which is what makes them trustworthy for reporting:

- **Returning athlete (to this program):** has a prior registration in **this program in any prior season**. Once someone has participated in a program, they are a **returning athlete to that program forever**. They remain **new to other programs** until they register for those.
- **Returning member, new program:** has registration history **somewhere in the system** but is **new to this specific program**.
- **Brand-new:** no registration history anywhere.

Behavior:
- A **returning-athlete discount** is a **staff-set amount, enabled and edited per program.** Applies to **Leagues, Camps, Clinics, Pickup/Drop-In** (staff-enabled per program).
- A returning athlete may **still choose to add a uniform/gear** (lost, damaged, outgrown) even though not required — the discount reflects "returning," not "owns uniform." The flag we care about is **returning vs. new**, not uniform ownership.
- These flags feed **program key metrics** (below).

### Program Key Metrics (per-program dashboard)

Every program surfaces:
- **Retention rate** — of **last season's** registrants in this program, the **% who returned this season**.
- **Change in registration numbers** — season-over-season delta in registrations.
- **Margin** — program **revenue** (from this portal) minus program **expenses pulled from QuickBooks**. Each program maps to a **QuickBooks Class/Project**; expenses tagged to it in QuickBooks are attributed to the program. **This framework owns the program↔QuickBooks-Class mapping and displays margin in the program dashboard**; the actual QuickBooks OAuth + expense sync is a separate integration piece (built later) that populates it. Reserve the mapping field and margin display now.

### Facility bookings via Module 2

- The program builder **calls the Module 2 recurrence engine** to generate all session bookings (e.g. clinic every Saturday × 6).
- Conflicts on a single session resolve **just that one date** (Module 2 behavior).
- Staff can **go back and adjust the recurrence/booking series** after creation (edit series or single instances).

---

## Registration Flow

- Always **select the family member(s)** to register. Offer **"add family member"** inline at that moment (feeds Module 1 family model).
- **Register multiple family members in one checkout** (siblings into the same program, or different programs).
- After a registration is added to cart, prompt **"Register for another program?"** — multi-program cart.
- **HoH / secondary parent** register dependents; **18+ adult members** can self-register (Module 1 rules).

### Capacity, held spots, waitlist, override

- On full, provide an **automatic waitlist** (notify/advance next person when a spot frees).
- **Hold the spot during checkout for 10 minutes**, with a **visible countdown** in the registration flow. Release on expiry.
- **Staff can manually override** capacity (add past the cap).

---

## Pricing & Checkout

- All money runs through the **Module 1 pricing function**, canonical order: `base price (early-bird if applicable) → + late fee → − returning-athlete discount (always applies) → − multi-member discount → − scholarship (Academy + Club, per eligibility flag) → − (staff credit XOR promo) → − Credit on Account → − Play Points (100 = $1) → total`.
- Program price rules in the framework:
  - **Early-bird pricing** (price by date, before a set date)
  - **Late registration fee** (added after the program registration deadline)
  - **Multi-member discount** (multiple family members registered)
- **Two separate household balances** both usable at checkout, kept distinct from each other:
  1. **Play Points** (Module 1 loyalty, earned, 100 = $1)
  2. **Credit on Account** (dollar-value, from refunds; **non-expiring** — accounts are **never auto-removed/archived for inactivity**; any archiving is a manual staff action)

- **Play Points earning (Module 19):** program registrations earn **1 point per $1** — but **only for program-type registrations. Academy, Club, and rental line items do NOT earn spend-based points** (see Module 19 earn rules). The checkout records eligible spend for the points ledger accordingly.

### Shared Payment-Plan Engine

Build once here; every type can enable it:

- Arbitrary **installment plans** (e.g. 5 payments over 5 months) or pay-in-full.
- **PAD auto-charge** on each installment date if the payer set up PAD and agreed; otherwise **invoice + scheduled staff follow-up reminder**. Auto-charge failure → **Overdue** + notify staff.
- **"Recalculate total owed" button** — recomputes the balance owed accounting for **missed invoices** (catches a plan up after missed payments).

---

## Custom Question Builder

- Strong, reusable **custom-question builder + management.**
- **Per-program-type default question sets**, with ability to add/change per program.
- Maintain a library of **default + saved questions** reusable across programs.
- Question types: short text, long text, single/multi choice, number, date, file upload, size-picker (ties to products). Mark required/optional. Answers stored per registrant and surfaced on the roster + reports.

### Standardized "Where did you hear about us?" question

- A **special global question** (distinct from the per-program custom questions) with **one managed, admin-editable answer list** reused everywhere (e.g. Instagram, Google, Word of Mouth, School, Coach Referral, Returning Athlete, Other) so marketing-source reporting stays clean across all programs.
- **Applied to all programs of the same type by default**, admin-editable.
- **Required**, asked **once per registration/checkout** (not per participant) and applied to all participants in that registration.

---

## Staff Hook (full Staff module built separately)

- Programs reference **assigned staff** (see the dedicated Staff module).
- Assigned staff are **displayed on the public registration page** (name, bio, photo).
- Assigned staff get **roster + schedule access** for that program in their own account.
- This framework exposes the assignment relationship; pay rates, payment scheduling, and absence/replacement live in the Staff module.

---

## Waivers

- Reuse **Module 3 e-sign waiver editor.**
- **One waiver per family per program** by default; **default validity 1 year** before a re-sign is required.
- Allow **additional forms/waivers** attached per program as needed.
- Signed status gates registration completion where the waiver is required.

---

## Products with Variants (jerseys, merch, equipment, add-ons)

One shared **products-with-variants** system powers program add-ons AND the jersey/gear order:

- Products have **variants** (e.g. size). Add-ons at checkout may require **selecting a size variant** (hoodie S/M/L).
- **Add-a-hoodie/gear/hat** upsells during checkout; per-program selection of which products are offered.

### Jersey / Gear Order Function (all programs)

- At registration each participant picks a **jersey/gear size** from **Y2XS → AXXL**.
- **Optional number selection**, toggle **on/off per program, default OFF.** When on: collect **1st choice** and **2nd choice** numbers; **prevent duplicate numbers within a team.**
- Staff set an **extras buffer per size** ("how many extra of each size to add").
- **Auto-create an aggregated gear order** (e.g. "12 YM, 8 AS, 5 AL…") + extras.
- **Output a 1-page PDF** to **download or email directly from the app** to the supplier.

---

## Refunds, Proration & Withdrawal (policy-driven)

Encode Athlete Institute's published **Registration, Refund & Withdrawal Policy** as the default engine. **Staff always see the auto-calculated amount and the description of the policy rule being applied, and can override to any amount.** Proration **method defaults to match the program type** (clinic proration for a clinic, etc.), pre-filled, editable.

### Proration formulas (exact — encode as written)

- **Leagues** — prorate only if registering/withdrawing after the **first 3 sessions**:
  1. Subtract the **$40 uniform & roster management fee**
  2. Divide remaining balance by number of sessions
  3. Multiply by sessions remaining
  4. **Add back the $40 fee** for the final amount
- **Clinics** — prorate after **1 session**: divide fee by sessions × sessions remaining.
- **Camps** — prorate after **1 day**; **Camps ONLY** have a **20% non-refundable deposit, max $500**:
  1. Subtract the **20% deposit (max $500)**
  2. Divide remaining balance by number of days
  3. Multiply by days remaining
  4. **Add back the deposit** for the final amount
- **Pickup/Drop-In** — prorate based on **how many sessions were purchased.**

### Withdrawal tables (defaults, staff-overridable, show the rule text)

- **Leagues & Clinics:** >14 days before start → credit or refund, no admin fee. <14 days before start → credit no fee / refund **10% admin fee**. <14 days after start → **prorated credit + 10% admin fee**, **not refund-eligible**. >14 days after start → not eligible.
- **Camps:** >1 month before → credit no fee / refund **10% admin fee**. <1 month before → **20% deposit retained (max $500) as credit**, not refund-eligible. After start → **prorated credit, 20% deposit retained (max $500)**, not refund-eligible.
- **Admin Fee** = % of **pre-tax program cost after prorating.**

### Refund destination & extras

- **Refund destination is staff choice per refund: Credit on Account OR back to original card/PAD.** Show the policy table hints as guidance.
- **Refund Insurance** — an **add-on offered only at registration**, priced as a **percentage of program fee**, **non-refundable once purchased**, cannot be added later. If purchased and the participant withdraws **before the program begins**, grant a **full refund** regardless of standard rules/fees/deposits. The refund engine checks for it.
- **Exceptions** (surface as selectable reasons that adjust the calc/eligibility per policy): **injury/medical** (physician note → full prorated Credit on Account), **weather rescheduling** (no refund/credit if can't attend reschedule), **AI operational rescheduling** (full Credit on Account for that session), **special requests** (case-by-case, discretionary).
- This engine applies to **all program types except Club and Academy** — Leagues (M7), Camps (M8), Tournaments (M9), and the General Programs (M10: Clinics, Pickup, Drop-In), plus Other/Misc and any **custom program types** staff add. Every program type carries a **default proration method** (set in the type manager — the policy formulas above seed the known types; custom types select an existing method or define a custom one), **overridable per program and again at refund time.** **Club and Academy have their own refund handling** (defined in those sub-modules — tied to tuition/payment plans). Events and rentals follow their own modules' policies (rentals: non-refundable deposit per Module 3).

---

## Abandoned Cart / Retargeting (framework-level capture)

- **Log every entry into the registration flow**: who started, which program, and **where they dropped** (browsing → in-cart → at-payment).
- Feeds a **retargeting list** of people who visited the flow or abandoned cart (surfaced for the later Communications module to email "you left something behind").

---

## Statuses & Public Catalog

- Program **statuses:** draft / published / registration-open / full / closed / archived.
- **Public program catalog** on `play` with **filters**: **category (Academy, Club, Camps, Youth Sports, Adult)**, sport, age, type, location, date, season, brand.
- Every program/registration also has a **direct link**; admin has a **"Copy share link"** button on the admin side for easy sharing.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Program spine + type manager** — base `programs` schema (incl. **category** default-from-type + override, **returning-athlete auto-derivation**, **QuickBooks-Class mapping + margin display**, staff-assignment hook), add/editable types with inherited defaults, color-coded scheduling, brand-themed registration page selection. Facility bookings via Module 2 recurrence (with editable series).
2. **Custom question builder** — question library, per-type defaults, per-program overrides, the **standardized required once-per-registration "where did you hear about us"** global question with managed answer list, answers on roster.
3. **Registration + cart** — family-member select with inline add-member, multi-member + multi-program cart, "register for another program?", 10-min held spot with countdown, waitlist, staff override.
4. **Pricing + payment-plan engine** — early-bird, late fee, multi-member discount, Module 1 pricing function integration, Credit on Account + Play Points as distinct balances, installments with PAD auto-charge/invoice fallback, "recalculate total owed."
5. **Products with variants + jersey/gear order** — variant products, checkout add-ons with size selection, jersey sizing Y2XS–AXXL, optional 1st/2nd-choice number selection (no team dupes), extras buffer, aggregated order, 1-page PDF download/email.
6. **Waivers** — Module 3 editor reuse, one-per-family-per-program, 1-year validity, additional forms.
7. **Refund/proration engine** — exact per-type formulas, withdrawal tables, admin fee, Refund Insurance, exceptions, staff override + policy-rule description shown, refund to Credit on Account or card/PAD.
8. **Abandoned-cart capture + statuses + public catalog** — flow logging with drop-stage, statuses, filtered public catalog, admin "Copy share link."

### Deliverables

- Source in the existing repo (`/app/programs`, `/admin/programs`, `/lib/programs`).
- A **`/lib/programs` base API** each program-type sub-module extends (registration, checkout, payment plans, products, refunds) — the integration contract for Camps/Leagues/etc.
- Jersey/gear order PDF template (brand-styled).
- README: type manager, question builder, payment-plan config, refund-policy encoding, products/variants, share-link usage.
- Tests: **all proration formulas with worked examples from the policy** (league $40 add-back, camp 20%/$500 deposit, clinic per-session, drop-in per-session), payment-plan missed-invoice recalc, held-spot expiry, capacity/waitlist, **returning-athlete auto-derivation and retention-rate calculation**.

### Non-Functional

- Mobile-first registration + checkout.
- All bookings via Module 2; all discounts/credits/points via Module 1 pricing function.
- Refund engine is policy-default + always overridable, and always displays the rule being applied.
- PIPEDA-compliant; custom-question answers and waivers stored securely.

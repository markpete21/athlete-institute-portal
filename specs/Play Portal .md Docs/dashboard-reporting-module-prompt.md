# Athlete Institute — Facility & Registration Portal

## Module 14 of N: DASHBOARD & REPORTING

> The analytics capstone. Pulls data from every module into a **live landing dashboard**, a **best-practice financial suite**, registration + demographic reporting (with a **registrant map**), a **custom report builder** (save + schedule), **QuickBooks two-way sync** (revenue push, expense pull) that powers margin, **facility utilization**, **capacity nudges**, and the **feedback + retention surfaces**. Auto-emailed **week-in-review** and **month-in-review** PDFs to the exec team. Financials **admin-only**. Build last (after all data-producing modules).

---

## Project Context

Same stack. **Live** queries against the shared Supabase DB for own-data; **QuickBooks expense/margin data synced periodically (nightly + on-demand) and cached** (QBO API is rate-limited). Financial views **permission-gated to Admin** (Module 5 matrix).

---

## Multi-Location Data Model (foundational)

- A **program is defined once and runs as location-specific instances.** "U15 Volleyball" is a definition; "U15 Volleyball @ Orangeville" and "@ [Location 2]" are **instances**, each with its own roster, capacity, schedule, staff, registration, revenue, and margin (operationally separate "records"), but sharing a definition for rollup.
- **Location is a first-class reporting dimension** everywhere. Every financial / registration / utilization report is filterable and groupable by location. Three canonical views must work:
  1. **Program definition across all sites** (U15 Volleyball everywhere).
  2. **A single instance** (U15 Volleyball @ Orangeville).
  3. **All programs at a location** (everything at Location 2, with each program's Location-2 instance appearing).
- Location maps to **QuickBooks Location**; program maps to **QuickBooks Class** (matching your GL codes).

---

## Landing Dashboard (live)

- **Top programs by registration** (default view) — with visual, **period selector: 24h / 7d / 30d / 3mo / 1yr** (default 30d).
- **Top programs by revenue** — same period selector + visual.
- **Upcoming programs** overview.
- **Upcoming rentals & events** overview.
- **Outstanding balances** overview.
- Plus surfaced cards: capacity alerts, at-risk families (retention), recent feedback scores.

---

## Financial Suite (best-practice set)

- **Revenue summary** — by program / type / brand / season / **location**, with period comparison.
- **Collected vs. outstanding** (booked vs. paid) + **aging** (30/60/90-day overdue).
- **Deferred revenue** — Academy tuition + prepaid earned over delivery period (collected Sept, earned Sept–June), not at payment.
- **Refunds / scholarships / discounts** — each broken out (returning-athlete, multi-member, promo, staff credit).
- **Deposits held** vs. balances due.
- **Payment-plan health** — on-track / behind / defaulted, with $ at risk.
- **Margin** — revenue − QBO expenses − staff cost (Module 5), per program / type / location. **Fully itemized, exportable expense breakdown** pulling **every QBO expense category** (not a net number).
- **Processing fees** — card vs. PAD, passed-through vs. absorbed.
- **Cash flow / collections forecast** — expected payment-plan income by month.

---

## QuickBooks Integration

- **QuickBooks Online, OAuth.**
- **Two-way:** **push** revenue/invoices to QBO; **pull** expenses from QBO.
- **Mapping:** program → **QBO Class**, location → **QBO Location**, matching GL codes (staff configures). Staff cost tracked in this system feeds margin; QBO supplies other expenses — **avoid double-counting** (staff pay is not also pulled as a QBO expense line unless mapped to exclude).
- Synced nightly + on-demand refresh; cached for margin views.

---

## Registration Reporting

- Registrations **over time**, by **program / type / brand / location**.
- **New vs. returning.**
- **Fill rate vs. capacity**, **waitlist counts.**
- **Conversion rate** (started vs. completed registration), **abandoned-cart counts.**
- **"Where did you hear about us"** marketing-source report (Module 4).
- **Retention rate** (feeds from Module 16 signals).
- Revenue + **revenue−expense (margin)** reports.

---

## Demographics Dashboard

- Attributes: **age distribution, gender, location, new vs. returning, household size.**
- **Filters:** specific program, division, season, etc.
- **Registrant location map** — registrants plotted by postal code / city (from Module 1 addresses), filterable by program/division/season. Catchment analysis + sponsorship/grant reporting. **Aggregate, internal-only** (PIPEDA — not publicly exposed).

---

## Custom Report Builder

- **Build:** pick a data source (registrations / financials / feedback / facility), choose columns, filters, grouping — **pivot-table style.**
- **Save:** name + reuse.
- **Schedule/automate:** auto-generate + **email** to a configurable recipient list, at chosen cadence; delivered as **visually appealing brand-themed PDF (charts + pivot tables)**, CSV, or live-dashboard link.
- **One-click CSV/PDF export** on every view. Full revenue–expense breakdown exportable with all expense categories.

---

## Auto Exec Reports (one engine, two templates)

- **Visually polished, brand-themed, chart-heavy PDF** (proper generation, not an HTML dump).
- **Week-in-review** — auto-emailed **every Monday**, covering **prior Mon–Sun.**
- **Month-in-review** — auto-emailed **each month.**
- **Configurable exec recipient list** (admin-set names/emails).

---

## Facility Utilization

- Utilization % by facility/court, filters for **peak hours, weekends, daytime/evening.**
- **Year-over-year comparison.**
- **By booking type: internal vs. rental vs. program.**
- Surface empty/underused slots for rental targeting; revenue per court-hour.

## Capacity Nudges

- Staff notifications at **80% / full / waitlist-forming**, configurable per program.
- Shown on the **dashboard** AND as a **notification on next login.**

## Feedback Surface (Module 15)

- Ratings by program/type/brand, trends over time, AI summaries, low-score list.

## Retention Surface (Module 16)

- The sortable **at-risk family list** with contributing reasons + one-click actions lives here.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Multi-location model + landing dashboard** — program-definition/instance model, location as dimension, live top-programs-by-registration + by-revenue (period selector), upcoming programs/rentals/events, outstanding balances.
2. **Financial suite** — all best-practice reports, location dimension, deferred revenue, aging, margin with itemized exportable expense breakdown.
3. **QuickBooks sync** — OAuth, revenue push, expense pull, Class+Location/GL mapping, no double-count of staff cost, nightly+on-demand cache.
4. **Registration + demographics** — all registration cuts, marketing-source, retention rate; demographics dashboard + registrant map.
5. **Custom report builder** — pivot-style build, save, schedule/email, CSV/PDF export everywhere.
6. **Auto exec PDFs** — week-in-review (Mon, prior Mon–Sun) + month-in-review, brand-themed chart-heavy PDF, configurable exec list.
7. **Facility utilization + capacity nudges** — utilization by type/peak/weekend/YoY, revenue per court-hour; threshold nudges on dashboard + next-login notification.
8. **Feedback + retention surfaces** — wire Module 15 + 16 views.

### Deliverables
- Source (`/app/reports`, `/admin/reports`, `/lib/reports`, `/lib/quickbooks`).
- PDF report engine (brand-themed, charts + pivot tables).
- QBO OAuth + sync jobs; registrant map.
- README: multi-location model, QBO mapping + double-count avoidance, report builder, exec PDF scheduling, permission-gating.
- Tests: three location rollup views, deferred-revenue recognition, margin with full expense breakdown, QBO no-double-count, conversion/abandoned-cart math, retention-rate calc, week-in-review date window (prior Mon–Sun), capacity nudge thresholds, financials admin-gated.

### Non-Functional
- Live for own-data; near-live cached for QBO expenses.
- Financials **Admin-only** (Module 5 matrix); other reports permission-gated per role.
- Multi-location: location is a consistent dimension across every report.
- Exec PDFs presentation-quality; registrant map internal-only (PIPEDA).

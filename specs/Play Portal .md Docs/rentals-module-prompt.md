# Athlete Institute — Facility & Registration Portal

## Module 3 of N: RENTALS

> Depends on **Module 1 (Accounts)** — user types, org agents, the checkout pricing function — and **Module 2 (Facilities Schedule)** — this module creates all its bookings through Module 2's `/lib` bookings + recurrence API and uses its conflict engine. Rentals do NOT get their own booking table; a rental produces bookings in the shared master schedule.

---

## Project Context

Same stack: **Clerk**, **Supabase**, **Stripe** (Canadian — cards + **PAD `acss_debit`**), **Next.js** App Router on **Vercel**. Brand black/white/gold (`#A18F60`), Helvetica Neue. PIPEDA-compliant, mobile-first.

- `admin.athleteinstitute.ca` — staff build/manage quotes, rates, add-ons, invoices, waivers.
- `play.athleteinstitute.ca` — customers self-book *public-flagged* slots; orgs/customers view + pay quotes/invoices online.

---

## Who Can Book, and How

- **Self-serve online booking** is available **only for specific facilities + time slots that staff have flagged "open to public."** Everything else is quote-only. (The public-open flag lives on the facility/time config.)
- **Organizations always go through staff for a quote** — no org self-serve.
- Customers self-book only the public-open slots; anything else, they request/get a staff quote.

---

## Quote Builder & Tool

Staff build a **visually appealing quote** that exports to **PDF** and can be **emailed as an online link** the customer views and (if permitted) accepts/pays.

Quote structure:
- **Multiple date/time blocks on one quote** (e.g. a tournament across a weekend = many blocks on one quote).
- **Each facility is its own line.**
- **Add-ons appear below** the facilities, OR can be **attached to a specific facility line** (model like *rooms at a residence* — an add-on can be global to the quote or nested under one facility).
- Lines roll up to: subtotal → taxes → **deposit** → balance, plus the payment schedule.
- Multi-date rentals (league every Tuesday, tournament weekend) use the **Module 2 recurrence engine** and are covered by **one rental agreement + one quote/invoice** spanning all dates.

---

## Rates

- Default rental rates apply to facilities, with **override allowed** per quote line.
- Rate modes: **hourly** (primary), with the ability to switch a line to a **full-day rate** or a **flat rate**.
- Rate table keyed by facility (+ optional overrides). Keep it simple: hourly default per facility, with full-day/flat as alternate rate types selectable per line.

---

## Add-ons

- Customizable in the backend. Typical add-ons: **live stream, extra staff, branding/signage, media.**
- Add-ons apply **mainly to the whole invoice/quote**, but can optionally be **attached to a specific facility line** (see residence-room model above).
- Priced flat or per-unit/per-hour as configured per add-on.
- Add-on library editable in admin (add/edit/disable, set default price, set pricing mode).

---

## Internal vs. External

- **Internal/External toggle at creation.**
- **Internal bookings** carry a **Business Unit + booking type** for organizational tracking, priced **$0** (scheduling only, no money). Seed business units:
  - **OP National Boys**, **OP National Girls**, **Bears Rep Basketball**, **Bears Volleyball Club** (extend later).
- **External bookings** are the paid rentals (customers/orgs) that flow through quotes, deposits, and invoices.

---

## Booking Types (organizational)

Types: **Camp, Event, Tournament, League, Clinic, Other (type-in).** These exist primarily for **organizational/reporting purposes** — defaults are largely similar across types; the type is a label/category on the rental, not a heavy per-type template. (Keep the per-type default hooks minimal but present, in case defaults diverge later.)

---

## Payment Schedule & Invoicing

- **Custom installment plans:** staff can define arbitrary schedules — e.g. **5 payments over 5 months**, or the default **25% deposit + balance**. Each installment has an amount (or %) and a due date.
- **Default:** 25% deposit; balance due per schedule.
- **Deposit trigger:** on conversion to booked, deposit is **due in 5 business days.**
- **PAD auto-charge:** if the payer has **set up PAD and agreed to be charged**, **auto-charge** the deposit and each installment on its due date. If **not** set up/agreed, **send an invoice** and **schedule a staff follow-up reminder to chase payment.**
- **Auto-charge failure** (e.g. insufficient funds) → flip the invoice to **Overdue** and **notify staff.**
- Use the **Module 1 pricing function** for any discounts/credits/points on external rentals. **Note: rentals neither earn nor allow redemption of Play Points** (Module 19 scope — points are programs-only); the pricing function skips the points step on rental lines.

### Status State Machine (color-coded, filterable in reports)

Staff drive conversion (staff "mark booked" = acceptance). Assign a distinct color to each status; make status a **filter in reports**:

1. **Quote / Tentative** — being built or sent. **Holds the slot.** If it collides with another quote/booking/program, the **conflict notification fires** with resolve options **edit** or **keep both** (quotes participate in the same Module 2 conflict engine as confirmed bookings — see reconciliation note).
2. **Deposit Due** — staff marked it booked; slot confirmed. Deposit invoice issued (due 5 business days). Auto-charge PAD if agreed, else invoice + follow-up reminder.
3. **Balance Due** — deposit paid; remaining balance owed per installment schedule.
4. **Overdue** — any installment (deposit or later) past due, or a PAD auto-charge failed → notify staff.
5. **Paid / Confirmed** — fully paid.
6. **Cancelled** — **releases the slot** on the master schedule automatically; **deposit is non-refundable.**

> **Consistency note (Module 2 is aligned with this):** Quotes DO hold their slot. A collision — quote-vs-quote, quote-vs-booking, or quote-vs-program — always raises the conflict notification with **override & delete** / **edit** / **keep both** options. "Keep both" lets multiple holds coexist by explicit operator choice. The conflict engine treats quotes and confirmed bookings alike for detection; nothing auto-wins. When a confirmed booking collides with a quote, a hint recommends resolving in favor of the confirmed booking, but the operator decides.

---

## Forms & Waivers

- **Waiver form editor** (build this tool): staff compose/edit waiver text, save named waivers, attach to rentals (optionally defaulted by booking type).
- **Electronic signature** captured in the portal and stored against the rental.
- **Only the renter/organizer signs** (not every participant).
- Signed waiver is a **gate to confirming** the booking where attached.

---

## Organizations

- Org rentals: an **org agent** requests; **staff build + finalize the quote/invoice** and share it; the **org pays online.**
- **Orgs require the deposit** (same as external customers) — not net-terms-only.
- Org invoices use the same status state machine; online balance payment per Module 1.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Rate + add-on tables** — facility rate defaults (hourly/full-day/flat), add-on library with pricing modes, public-open facility/slot flags. Admin CRUD for all.
2. **Quote builder** — multi-block, per-facility lines, global + facility-attached add-ons, roll-up to subtotal/tax/deposit/balance, live availability check against Module 2. PDF export + emailable online quote link.
3. **Internal/external + business units** — creation toggle, $0 internal bookings with business-unit + type, external paid path. Writes bookings via Module 2 API.
4. **Payment schedules + status state machine** — custom installments, 25% default, PAD auto-charge vs invoice+reminder, auto-charge-failure→overdue, the six color-coded statuses, status filter in reports. Uses Module 1 pricing function.
5. **Waiver editor + e-sign** — composer, attach-to-rental, e-signature capture, confirm-gate.
6. **Recurring rentals** — multi-date under one agreement via Module 2 recurrence engine; single-date conflict resolution within the series.
7. **Org rental flow** — agent request → staff quote/invoice → online payment, deposit required.

### Deliverables

- Source in the existing repo (`/app/rentals`, `/admin/rentals`, `/lib/rentals`).
- Quote PDF/email templates (brand-styled).
- README: rate/add-on setup, PAD auto-charge configuration, waiver editor usage, how rentals call the Module 2 booking/recurrence API.
- Tests: quote roll-up math, installment scheduling, status transitions, PAD-failure→overdue.

### Non-Functional

- Mobile-first for the customer-facing quote view + payment.
- All bookings created through Module 2 (no separate rental booking store).
- Discounts/credits/points via the Module 1 pricing function only.
- PIPEDA-compliant; e-signatures and waivers stored securely.

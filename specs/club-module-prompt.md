# Athlete Institute — Facility & Registration Portal

## Module 11 of N: CLUB

> A program-type front-end extending **Module 4 (Program Framework)** for registration, billing, waivers, and jerseys, and plugging into **Module 6 (Competitive Play)** for team schedules/standings (manual roster selection, NOT the auto-builder). Its centerpiece is the **tryout → evaluation → offer → confirmation pipeline.** Team communications/messaging are handled by a **separate club-management app** (future) — this module does registration, billing, the tryout pipeline, a schedule view, and email comms only. Build after Modules 4 and 6.

---

## Project Context

Same stack and subdomains. Club uses the Module 4 payment-plan engine for season fees and has **custom, case-by-case refunds** (not standard proration). Scholarships now apply to Academy **and Club** (Module 1 pricing function, per eligibility flag).

---

## Structure — Club → Team

- Simple two-level hierarchy: **Club → Team.** (No sub-type layer.)
  - **Bears Volleyball Club** → 15U Girls, 15U Boys, …
  - **Bears Basketball Club** → U15 Girls, U15 Boys, …
- **Naming conventions differ per club** (volleyball "15U", basketball "U15") — the age/level label is a **free-text display field per team.**
- **DOB eligibility is set per team, per club** — each team defines its own birth-date range (Bears Volleyball 15U Girls ≠ Bears Basketball U15 Girls). Age label is display; DOB range is the actual eligibility rule.
- **One team per age/gender group for now** (defer multiple teams per level, e.g. A/B).
- **Selects Volleyball is deferred** (may become a General Program later).

---

## Tryout → Evaluation → Offer → Confirmation Pipeline (centerpiece)

### 1. Tryout sessions
- Tryouts are **registerable events** with a **separate tryout registration fee** — **non-refundable and NOT applied** toward the season fee.
- Multiple tryout sessions can exist for the same group.

### 2. Consolidated tryout roster
- All tryout registrations for a **level + gender** group consolidate into **one tryout roster** — e.g. **all "U10 Girls" tryout registrations across multiple sessions** → one U10 Girls tryout roster. Grouping key = **level + gender** (per club).

### 3. Evaluation sheet (PDF export)
- Export the tryout roster as a **printable PDF evaluation sheet**: each player **numbered**, a **1–5 rating** field, and a **notes** field per player.
- Print-and-fill (no live in-app scoring tool required for v1).

### 4. Flagging (on the tryout roster)
- Flag each player: **Selected / Considering / Out.**
- **Selected → moved onto a team roster.**

### 5. Offers (from the team roster)
- **Send an offer** to a player, or **multi-select for bulk offers.**
- Sending an offer flips the player's flag to **Offered – Pending.**
- **Two offer modes:**
  - **Verbal commitment** — accept with no payment.
  - **Deposit required** — accepting triggers a **deposit payment** to lock the spot. Deposit is a **set amount OR a percentage** of the season fee, and is **applied toward** the full season fee (not additional).
- **No expiry** — offers are **cancelled manually** by staff.

### 6. Digital acceptance
- Player/parent receives a **digital link** to **confirm or deny.**
- On confirm (and deposit paid, if required) → flag becomes **Confirmed.**
- On deny → flag reflects Declined; staff can offer a Considering player next.

**Full status ladder:** (tryout) Selected / Considering / Out → (team) Offered – Pending → Confirmed / Declined.

---

## Billing

- **Season fee** via the **Module 4 payment-plan engine** (installments across the season).
- **Fees differ per team/level.**
- **Deposit** (from a deposit-required offer) applies toward the season fee; remaining balance runs on the payment plan.
- **Scholarships** available (Module 1 pricing function; used rarely).
- **Club fees are typically all-encompassing** (uniform included). Provide an **optional uniform/gear add-on** via the Module 4 jersey function where a club wants it separate.

## Refunds

- **Custom, case-by-case** — Club does **not** use the standard Module 4 proration. Typically **no refunds**; staff process any exception manually via the refund engine's override (Credit on Account or card/PAD).

---

## Competitive Play (schedules/standings)

- Confirmed teams plug into **Module 6** for **rostering (manual — coach selection from the tryout pipeline, NOT the auto-builder), schedule building, and standings/public portal** where the club plays league/tournament games.
- The team builder's **auto-balancing draft is not used** for Club; rosters come from the tryout→offer→confirm pipeline.

---

## Schedule View & Communications

- **Family read-only schedule view** in the portal — a confirmed player's family sees their club team's games/practices, synced from the **Module 2** master schedule.
- **Email communications** to club families can be sent from this platform (Module 13 Communications + Module 0 `notify()`).
- **Robust team messaging / club management (chat, RSVPs, coach announcements) lives in the SEPARATE club-management app** (future). Reserve a hook to hand a confirmed roster + schedule to that app; do not build messaging here.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Club → Team structure** — clubs with teams, per-team free-text level label + per-team DOB eligibility, seeded Bears Volleyball + Bears Basketball examples.
2. **Tryout registration + consolidated roster** — tryout events with non-refundable separate fee, level+gender consolidation into one tryout roster.
3. **Evaluation + flagging** — numbered PDF evaluation sheet (1–5 + notes), Selected/Considering/Out flags, Selected→team roster.
4. **Offers + acceptance** — send/bulk-send offers (Offered–Pending), verbal vs deposit-required modes, deposit set-amount-or-% applied to season fee, digital confirm/deny link, Confirmed tag, manual offer cancel.
5. **Billing** — per-team season fees via Module 4 payment plans, deposit application, scholarships, optional uniform add-on.
6. **Competitive Play + schedule view + comms** — Module 6 manual rostering/schedule/standings, family read-only schedule view (Module 2), email comms, team-app handoff hook.

### Deliverables
- Source (`/app/club`, `/admin/club`, `/lib/club`).
- PDF evaluation-sheet template (numbered players, 1–5, notes).
- Digital offer/acceptance link flow.
- README: tryout consolidation, evaluation export, offer modes + deposit, per-team DOB, team-app handoff boundary.
- Tests: level+gender consolidation, flag transitions through the full ladder, offer accept/deny (verbal + deposit), deposit-applied-to-season-fee, per-team DOB eligibility.

### Non-Functional
- Mobile-first (offer acceptance especially — parents on phones).
- Money via Module 1 pricing function + Module 4 payment plans; schedules via Module 2/6; comms via Module 0 `notify()`/Module 13.
- Club messaging is explicitly OUT of scope (separate app) — build only the handoff hook.

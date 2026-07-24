# Athlete Institute — Facility & Registration Portal

## Module 10 of N: GENERAL PROGRAMS (Clinics, Pickup, Drop-In)

> Thin registration front-ends extending **Module 4 (Program Framework)** — registration, checkout, pricing, waivers, jerseys, per-type proration all come from the framework. Only the genuinely distinct pieces are defined here. Also defines a **shared Reschedule Workflow** that belongs to the Module 4 framework (available to ALL program types), surfaced here. All three types are **non-competitive** — no Module 6 hookup. Build after Module 4.

---

## Project Context

Same stack and subdomains. Proration for all three already encoded in Module 4 (clinics + pickup per-session; drop-in per sessions purchased).

---

## Clinics

- A **plain framework program**: dates/times/facility, capacity, registration, per-session proration.
- Structured as a **block of weekly sessions** sold as one unit (register once, all sessions booked via Module 2 recurrence).
- Nothing clinic-specific beyond the framework.

## Pickup

- **Same as a clinic structurally** — a block of weekly sessions, one registration.
- Differs only in **character**: **free play** rather than an organized, led session. This is a labeling/description difference, not a functional one.

## Drop-In (the one distinct flow)

- Registrant sees a **calendar/list of available sessions** and **multi-selects the specific dates** they want, **paying per session** for the ones chosen.
- **Per-session capacity** (e.g. max 20 at Tuesday open gym); a **full date is greyed out / unselectable.**
- **Pick-specific-dates only** — no punch-card/package option.
- **Buy more sessions later:** the registrant can return and purchase additional dates; doing so **keeps them registered under the same registration** (does not create a new registration each time). Roster reflects the ongoing registration; purchased sessions accumulate under it.
- **Optional per-session attendance tracking:** not usually tracked, but provide the **option to track attendance per session** (reuse the **camp check-in/check-out tool** from Module 8, capability-gated per Module 5). Off by default.

---

## Program Options (naming/tagging)

- **Player ID** and **Coaching Clinic** are **program options/tags** when building a general program — NOT separate types.
- They are **naming/tagging only** (help organization + reporting); they do not switch on distinct behavior. A Player ID event is a registerable event named accurately; a Coaching Clinic is a clinic tagged for its coach audience.

---

## Non-Competitive

- Clinics, Pickup, and Drop-In do **not** form teams, rosters, or standings. **No Module 6 (Competitive Play) hookup.**

---

## Shared Reschedule Workflow (Module 4 framework capability — available to ALL program types)

> Build this as a **shared Program Framework capability** callable from any program type (clinics, pickup, drop-in, leagues, camps, academy sessions), not local to General Programs. Uses the **Module 0 `notify()`** layer and **Module 2** bookings.

Flow: **select the program → select "Reschedule session" → choose the session.** Then two paths:

1. **Reschedule with a new date** — the Module 2 session booking **moves to the new date** (runs the conflict check on the new slot; single-instance change within a recurring series per Module 2). Registrants notified.
2. **Reschedule without a new date** — the session is **set to "to be rescheduled at another time"** (postponed/TBD state on the schedule; booking released or marked postponed). Staff can set the date later. Registrants notified.

- **No money impact** for either path — purely scheduling + notification. Any credit is handled manually via the Module 4 refund engine if ever needed.
- **Notifications** fire to **all registrants** across **email, text, and push** (Module 0 `notify()`). **All three channels default ON**, with the ability to **turn specific channels off** per reschedule (checkboxes).

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Clinics + Pickup** — framework programs as weekly-session blocks (pickup = free-play labeling), registration + per-session proration via Module 4.
2. **Drop-In** — multi-select date picker, per-session capacity with full-date greying, pay-per-session checkout, buy-more-later-keeps-registered, optional per-session attendance (Module 8 check-in tool, gated).
3. **Program options** — Player ID + Coaching Clinic as tags on general programs (naming/reporting only).
4. **Reschedule workflow (Module 4 shared capability)** — session select, reschedule-with-date (Module 2 move + conflict check) and reschedule-without-date (TBD state), all-registrant multi-channel notify with per-channel toggle, no money impact.

### Deliverables

- Source (`/app/programs/general`, `/admin/programs/general`, plus the reschedule capability in `/lib/programs`).
- README: drop-in date-picker + per-session capacity, buy-more-later behavior, reschedule workflow usage.
- Tests: drop-in per-session capacity + full-date lockout, buy-more-later stays one registration, reschedule both paths (with/without date, conflict check on move, notifications fire on selected channels only).

### Non-Functional

- Mobile-first (drop-in date-picker especially — parents choosing dates on a phone).
- All money via Module 1 pricing function; all bookings via Module 2; notifications via Module 0 `notify()`.
- Reschedule workflow is a Module 4 shared capability, reusable by every program type.

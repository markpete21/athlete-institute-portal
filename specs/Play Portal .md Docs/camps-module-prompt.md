# Athlete Institute — Facility & Registration Portal

## Module 8 of N: CAMPS (registration front-end)

> A **registration front-end** extending **Module 4 (Program Framework)** for registration, pricing, waivers, custom questions, jerseys, and refunds — and **optionally** plugging into **Module 6 (Competitive Play)** for camp rostering/teams that populate the public schedule. Build after Modules 4 and 6.

---

## Project Context

Same stack and subdomains. Camp proration/refunds already encoded in Module 4 (**20% non-refundable deposit, max $500 — Camps only**; day-camp/overnight withdrawal tables).

---

## Camp Hierarchy

**Brand → Camp → Type (weeks offered / variations).**

- **Brand** (e.g. Orangeville Prep, ALL CAN, Bears) — drives the registration page look (Module 4 brand theming).
- **Camp** — a named camp (e.g. "Skills Camp").
- **Type / variations** — the sellable offerings under a camp: **weeks**, and variations like **girls vs. boys, age bands** (e.g. Week 1 Boys 10–12).

### Weeks

- A **week** is defined by **selecting dates + the daily hours** for each day.
- **Day option** and **Overnight option** per camp/week.
- Each week has its **own capacity and roster.**

---

## Registration Flow

- Simple, per-camper: **pick camper → pick week(s) → pay.**
- Parent registers dependents; 18+ self-register (Module 1). Multi-child + multi-week in one cart (Module 4 cart), "register for another program?" prompt.
- Parent picks a **specific offering** (Week 1, Boys, 10–12) — **no post-registration sorting** except optional grouping/rostering below.
- **Multi-week and sibling discounts** available (Module 4 multi-member + program discounts) — staff enable per camp.
- Camp gear/jersey via Module 4 jersey function (size at registration, aggregated order, extras).
- Overnight camps capture extra fields via custom questions (accommodation, dietary, pickup authorization, supervision/medical).

---

## Camp Rostering (optional, via Module 6)

- Camps can **form teams/rosters** and **populate the public leagues schedule/portal** — a camp running internal games appears on the same public schedule/standings as leagues.
- Uses the **Module 6 team builder** (group friends together, balance across checked attributes) and **schedule builder** (program or tournament mode) + **standings/score entry** where the camp runs competitive play.
- Optional per camp — a basic clinic-style camp may skip it.

---

## Camp Management (day-to-day)

- **Camper grouping** — manual assignment and/or Module 6 team builder; **friend-request question** ("please group my child with ___") feeds grouping.
- **Daily check-in / check-out** — mobile staff tool; track drop-off/pickup and **authorized pickups** (especially day camps).
- **Daily schedule** — session/station blocks within the camp day; can feed the **Module 2 TV display** (station rotations, court assignments).

---

## Build Stages

1. **Camp hierarchy + weeks** — Brand→Camp→Type/variations, week builder (dates + daily hours), day/overnight, per-week capacity/roster, brand-themed pages.
2. **Registration** — pick camper→week(s)→pay, multi-week/sibling discounts, gear sizing, overnight extra fields, friend-request question.
3. **Camp management** — grouping (manual + Module 6), daily check-in/out with authorized pickups, daily schedule → Module 2 TV display.
4. **Optional competitive play** — camp rostering/teams/standings via Module 6 → public portal.

### Deliverables
- Source (`/app/camps`, `/admin/camps`, `/lib/camps`).
- Check-in/out sheets (printable + digital); daily schedule display feed.
- README: week setup, day vs overnight, grouping + friend requests, check-in flow.
- Tests: week/variation capacity, multi-week cart + discounts, check-in/out + authorized pickup, optional Module 6 handoff.

### Non-Functional
- Mobile-first registration + courtside/deskside check-in; camp deposit + proration via Module 4.

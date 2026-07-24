# Athlete Institute — Facility & Registration Portal

## Module 7 of N: LEAGUES (registration front-end)

> A **registration front-end** that plugs into **Module 6 (Competitive Play)** for divisions, team building, scheduling, standings, and the public portal. Extends **Module 4 (Program Framework)** for registration, pricing, waivers, custom questions, jerseys, and refunds. Build after Modules 4 and 6.

---

## Project Context

Same stack and subdomains. League proration/refunds already encoded in Module 4 (the **$40 uniform/roster fee** add-back method; withdrawal tables). Adults self-register per Module 1.

---

## Pricing Model

- **Player-priced by default** — every registrant pays a per-player fee.
- **Optional team rate** — a captain can pay a **flat team fee** instead (staff enable per league).
- **Registration paths are configurable per league** (adult leagues use all four; youth leagues typically restrict to individual/equal-teams).

---

## Four Registration Paths

Selecting a path changes the next steps of registration:

1. **Captain — sign up a team** (typically adult leagues)
   - Captain **creates the team**, enters team name, **picks the division**.
   - Captain either **pays for the whole team now** (team rate) **OR pays only their own individual fee** and lets teammates register into the created team.
   - Captain gets a **shareable join link.**

2. **Member — join a team**
   - **Pick the team from a list** OR use the **captain's join link.**
   - Pays their **individual fee.**
   - **Join link:** brings the member directly into that team's registration (team + division preset). Link **expires 2 weeks after the season start date**, and closes when the team hits **max players.**

3. **Small Group (2–5)**
   - Each member **pays individually.**
   - **Enter teammates' names at registration.**
   - System **matches name entries (best effort), flags mismatches for staff, and holds placement** until all named members register — then the group is kept together in the Module 6 team builder.

4. **Free Agent**
   - Pays the **same individual fee.**
   - Placed by the **Module 6 team builder** (fills under-rostered teams / forms new teams).

---

## Registration Flow Specifics

- Registrant **picks a specific division** at signup (divisions pre-defined in Module 6). Teams are **sorted later** by the team builder.
- **Each adult has their own account and signs their own waiver** (Module 1 + Module 4 waivers).
- Captains' **pre-formed teams stay intact**; free agents + small groups fill them out or form new teams.
- Jersey/gear sizing captured at registration (Module 4 jersey function); skill/experience/height/age/gender custom questions captured to feed the Module 6 balancer.
- **Roster management:** staff can override — swap, add, remove players; on a drop, use Module 6's **replacement suggester** (top-5). Captains manage their own roster only if staff enable it.

---

## Build Stages

1. **League setup** — create a league (Module 6 structure: brand/sport/season/divisions/capacity), player-price + optional team-rate, enable/disable registration paths per league.
2. **Path-based registration** — the four flows with branching next-steps, join-link generation/expiry/max-player close, small-group name matching + hold, free-agent solo.
3. **Roster + team-builder handoff** — feed registrations into Module 6, captain-team lock, free-agent/small-group distribution, staff roster overrides + replacement suggester.
4. **Schedule + portal handoff** — league schedule (regular + playoffs) via Module 6 schedule builder → public portal + Module 2 bookings.

### Deliverables
- Source (`/app/leagues`, `/admin/leagues`, `/lib/leagues`).
- README: path configuration, join-link behavior, small-group matching.
- Tests: each registration path, join-link expiry/max-close, small-group hold-until-complete, player vs team pricing.

### Non-Functional
- Mobile-first registration; plugs entirely into Module 6 for competition; Module 4 for money/waivers/jerseys.

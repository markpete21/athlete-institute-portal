# Athlete Institute — Facility & Registration Portal

## Module 9 of N: TOURNAMENTS (registration front-end)

> A **team-entry registration front-end** that plugs into **Module 6 (Competitive Play)** for divisions, scheduling, standings, and the public portal, and extends **Module 4 (Program Framework)** for payment, waivers, custom questions, and jerseys. Build after Modules 4 and 6.

---

## Project Context

Same stack and subdomains. Tournaments are **team-entered and team-priced** — distinct from the player-priced League default.

---

## Registration Model

- **Teams sign up for the tournament** (team-level registration, not individual).
- **One payment per team.**
- **Roster upload** — the registering team submits its roster (upload/enter players; feeds Module 6 rosters). Coaches on an uploaded roster may be added as **account-less staff records** (Module 5) to be completed later.
- Team picks its **division** (pre-defined in Module 6).
- Team-level waiver/forms (Module 4); jersey/gear optional per tournament.

---

## Scheduling & Play (via Module 6)

- Uses the **Module 6 schedule builder in Tournament mode:**
  - **Championship mode** — bracket/playoffs with a winner.
  - **Showcase mode** — many games, **no playoffs/winner.**
- Many games over a few days; parameters (game length, courts, days, weeks off) per Module 6.
- Publishes to the **public portal** (schedules/results/standings, per-game **Watch Live → Watch**) and **Module 2 facility bookings**, with **double-booking protocol** applied.
- **Score entry + standings** via Module 6 (convenor/coach on-site, sport-aware standings, configurable tie-breaks).

---

## Build Stages

1. **Tournament setup** — Module 6 structure (brand/sport/season/divisions), team-price, Championship vs Showcase selection.
2. **Team-entry registration** — team signup, one-payment-per-team, roster upload (feeds Module 6, account-less coach records), division pick, team waiver.
3. **Schedule + portal** — Module 6 tournament-mode schedule builder → public portal + Module 2 bookings; score entry + standings/bracket.

### Deliverables
- Source (`/app/tournaments`, `/admin/tournaments`, `/lib/tournaments`).
- Roster upload template; bracket/standings via Module 6.
- README: team entry, roster upload, championship vs showcase.
- Tests: team registration + single payment, roster upload → Module 6 rosters, tournament-mode scheduling (both sub-modes).

### Non-Functional
- Mobile-first team registration; plugs into Module 6 for all competition logic; Module 4 for payment/waivers.

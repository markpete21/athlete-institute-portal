# Athlete Institute — Facility & Registration Portal

## Module 6 of N: COMPETITIVE PLAY (shared engine)

> The shared competition engine used by **Leagues (Module 7), Camps (Module 8), and Tournaments (Module 9)**. Build this **once**: rostering, the Claude-assisted team builder (+ reverse replacement suggester), the three-mode schedule builder, score entry, sport-aware standings, and the public league/tournament portal. Each front-end module plugs its registration into this engine. Depends on **Module 4** (Program Framework: registrations, custom-question data, products/jerseys, pricing), **Module 2** (Facilities Schedule: bookings, recurrence, double-booking protocol), **Module 5** (Staff: convenor/coach score-entry via permission matrix), and the **live stream app** (`live.athleteinstitute.ca`) for the Watch Live / Watch toggle.

---

## Project Context

Same stack: **Clerk**, **Supabase**, **Stripe** (Canadian), **Next.js** App Router on **Vercel**. Brand black/white/gold (`#A18F60`), Helvetica Neue. PIPEDA-compliant, mobile-first. The public portal should be **very visually appealing** — reference the look/function of **aileagues.ca** (by Digital Shift).

- `admin.athleteinstitute.ca` — team builder, schedule builder, score entry, roster management.
- `play.athleteinstitute.ca` — public portal (schedules, results, standings, stats, live/watch).

---

## Structure Hierarchy

Reuses the league/competition hierarchy: **Brand → Sport → Type (League / Tournament / Program) → Season → Division → Teams → Rosters.**

- **Club teams (Module 11)** that play competitively plug in here using **Program-mode** scheduling with **manually selected rosters** (from the tryout pipeline — not the auto-balancer). **Academy (Module 12) does NOT use this engine** (Academy teams don't appear on the Competitive Play portal).

- **Divisions are pre-defined by staff before registration.** Registrants pick a division at signup (front-end modules), teams get sorted within the division afterward.
- **Capacity:** set **max teams per division** and **min/max players per team.**

---

## Rostering & Team Builder (Claude-assisted)

### Constraints set BEFORE the draft

- Field to **select the number of teams** to create. Teams are numbered **Team 1, Team 2, …** (renamable).
- Before running the draft, staff flag:
  - **A) Players to be grouped together** (must land on the same team).
  - **B) Players to be assigned to a specific team/coach** (locked to that team).
- From the **full roster view**, staff can assign a player to a specific team, or group players together, prior to sorting.

### The balancing draft

- The builder distributes the **remaining (unlocked) players** across the chosen number of teams to **evenly distribute** based on **whichever attributes are checked**: **age, gender, skill level, experience, height.**
- Balance across **all checked attributes simultaneously** (each team ends with a similar mix of every checked attribute).
- These attributes are sourced from **registration custom questions** (Module 4). The builder reads them; ensure the relevant questions are captured at registration.
- **Pre-formed teams (captains') stay intact.** Free agents and small groups are used to **fill out under-rostered teams** and form new ones.
- **Small-group matching:** small-group members type teammates' names at registration; match on **best effort, flag mismatches for staff confirmation, and hold the group's placement** until all named members have registered.
- Output: full roster with **drag-to-reassign**; staff fine-tune after the auto-draft.

### Reverse mode — replacement suggester (on player drop)

- When a player drops, the engine runs **in reverse** to recommend a replacement from another team who: matches **jersey size**, is a **similar skill level**, and **minimally disrupts team balance.**
- **Loads the top 5 candidates**, ranked, showing each option's **balance impact.**
- **Recommend-only — staff approves** the swap (or clicks "suggest next best"). Never auto-executes.

---

## Schedule Builder (three modes)

Generates a **draft schedule** from parameters, shown for **fine-tuning**, then publishes to **both the public portal AND the Module 2 facility schedule** (creating bookings via the Module 2 API).

### Modes

1. **League** — regular-season games + **playoffs.** Goal is typically **round-robin** (every team plays every team **once or twice**).
2. **Tournament** — many games over a few days, with **Championship mode** (has a winner/bracket) or **Showcase mode** (no playoffs/winner).
3. **Program** — regular **weekly sessions.**

### Parameters

- Number of **weeks**, **game length** (1:00 / 1:30 / 2:00), **number of courts**, **playoff structure**, **start date**, **last date**, **any weeks off**.

### Generation rules

- **Even time-slot distribution (soft goal):** balance as best as possible so each team gets a **similar number of 6pm vs 7pm vs 8pm** games. Soft optimization — always produces a schedule and **shows the resulting distribution** to tweak.
- **Overview panel:** how many games each team has scheduled, and the **time-slot spread per team.**
- **Double-booking:** flagged and routed through the **same Module 2 double-booking protocol** (edit / keep both, etc.).
- **Editable pattern:** staff can go back and adjust the pattern and regenerate.

---

## Score Entry & Standings

### Score entry

- Entered by a **convenor or coach from their staff account, on-site** (mobile-friendly courtside). Gated by a **score-entry capability in the Module 5 permission matrix.**
- **Enter scores → Save game.** Saving a score:
  1. **Determines the winner** and updates standings,
  2. **Marks the game final**,
  3. **Flips the public portal's per-game toggle from "Watch Live" → "Watch"** (links the recorded stream from the live app).
- **Overtime toggle** available on score entry.

### Standings (auto-calculated, sport-aware)

- Standings **auto-calculate from saved results.**
- **Columns adapt to the sport tag:**
  - Common: **Games Played, Wins, Losses, Win %, Games Behind, Streak.**
  - **Basketball:** Points For, Points Against, Differential.
  - **Volleyball:** Sets For, Sets Against, Differential (optionally points).
- **Tie-break hierarchy is staff-configurable per league/division** (drag to reorder available criteria — e.g. Wins → Head-to-Head → Point/Set Differential). **Default the order by sport tag.**

---

## Public Portal (`play`, aileagues.ca-style)

- **Very visually appealing.** Shows **schedules, results, standings, stats** per league/tournament/division.
- **Per-game live toggle:** **"Watch Live"** while the game is in progress (links the live stream), auto-switching to **"Watch"** (recorded) once a score is saved and the game is final.
- Connected to program registrations (teams/rosters flow in from the front-end modules + team builder).
- **Stats are layered in later** — v1 is standings-from-results; reserve the stats hooks.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Structure + rostering** — Brand→Sport→Type→Season→Division→Teams→Rosters, division pre-definition, team/division capacity, full roster view with manual assignment + grouping flags.
2. **Team builder** — # of teams, pre-draft group-together / lock-to-team constraints, multi-attribute balancing draft from registration custom questions, small-group best-effort name matching with hold + staff confirmation, drag-to-reassign.
3. **Replacement suggester** — reverse-balance top-5 ranked candidates on drop (jersey size + skill + minimal disruption), staff-approve / suggest-next-best.
4. **Schedule builder** — three modes (league+playoffs / tournament championship+showcase / program weekly), full parameter set, soft time-slot balancing, per-team overview, double-booking via Module 2 protocol, draft→fine-tune→publish to portal + Module 2 bookings.
5. **Score entry + standings** — permission-gated convenor/coach on-site entry, save→winner+final+Watch-toggle, overtime toggle, sport-aware auto-standings, staff-configurable tie-breaks defaulted by sport.
6. **Public portal** — aileagues.ca-style schedules/results/standings, per-game Watch Live→Watch, stats hooks reserved.

### Deliverables

- Source in the existing repo (`/app`, `/admin/competitive`, `/lib/competitive`, public portal routes).
- A **`/lib/competitive` API** the front-end modules (Leagues/Camps/Tournaments) plug registrations into: create division/team/roster, run team builder, run schedule builder, enter scores, read standings.
- The **balancing engine as a standalone tested module** (used forward for drafts and reverse for replacement suggestions).
- README: team-builder constraints + attribute mapping to custom questions, schedule-builder modes/params, score entry + permission gating, tie-break config, live-stream link wiring.
- Tests: balancing draft (locks respected, even distribution across checked attributes), replacement top-5 ranking, schedule generation (round-robin coverage, soft time-slot balance, double-booking detection), standings math + tie-breaks per sport, score-save→final→Watch-toggle.

### Non-Functional

- Public portal visually polished + mobile-first; courtside score entry mobile-first.
- All game bookings created via Module 2; team-builder attributes read from Module 4 custom questions; score entry gated by Module 5 permissions.
- Balancing engine deterministic + explainable (show why a team/candidate is balanced) so staff trust the draft.

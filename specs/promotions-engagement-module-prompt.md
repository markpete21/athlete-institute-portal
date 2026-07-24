# Athlete Institute — Facility & Registration Portal

## Module 20 of N: PROMOTIONS & ENGAGEMENT

> The fun/campaign layer on top of Play Points (Module 19): **contests** (including rotating playable sports games), a **spin-to-win wheel**, a **configurable challenge tool**, and **streaks & badges**. All award Play Points via the Module 19 ledger, announce via the Module 13 announcement tool, and drive ongoing engagement + retention. Build after Module 19.

---

## Project Context

Same stack. All point awards flow through the **Module 19 ledger**; all announcements through the **Module 13 announcement tool** (push/SMS/email) + Module 0 `notify()`. Everything here is **admin-configurable and permission-gated**.

---

## Contests (with playable games)

- Staff create a **time-boxed contest**: e.g. "You have 24 hours to play — **top 5 scores win 2500 Play Points.**" Announcement auto-sends via Module 13.
- **Rotating library of playable HTML5 sports games** (high-score, keep-going-to-rack-up-points style), embedded in the portal:
  - **Launch set:** basketball, soccer, volleyball.
  - **Then add:** pickleball, football.
- **Score pipeline:** play → score recorded to the contest's scoreboard for the window → contest closes → **top-N auto-awarded points** (Module 19), winners notified.
- Contest config: which game, start/end window, reward structure (top-N or threshold), announcement channels.
- Games are reusable and **rotated** across contests.

## Spin-to-Win Wheel

- A **digital prize wheel**, offered as a reward mechanic (e.g. unlocked at lifetime-points-earned milestones, or as a contest/challenge prize).
- **Variable rewards** (the mechanic that drives engagement): point bundles (50/100/250), a free drop-in session, a gear discount, small "better luck next time."
- Spins and prizes logged; point prizes credited via Module 19.

## Configurable Challenge Tool

- Staff create **challenges** with rules:
  - **First-N-to-act** ("first 20 to register for summer camp get 1000 pts").
  - **Everyone-who-does-X-by-date** ("attend 3 drop-ins this month → bonus").
  - **Streak/seasonal** bonuses.
  - **Referral pushes** ("double referral points this month").
- Points auto-awarded on rule completion; announced via Module 13.

## Streaks & Badges

- **Streaks** — visible ("you've registered 4 seasons running — keep it alive!"), tapping completion/loss-aversion psychology; strong retention lever.
- **Badges / achievements** — First Season, Referral Champ, Superfan, etc. Low cost, status-driven engagement. Displayed on the customer's Play profile.

---

## Structure

- All of the above live under a **Promotions** admin area: contests, challenges, wheel config, badge/streak definitions, plus the **manual/promotional point grants** (from Module 19, surfaced here for campaign use).
- **No public leaderboard** (top-referrers/top-scorers stay staff-facing internal).

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Contest engine** — create time-boxed contest, reward structure, Module 13 announcement, top-N auto-award.
2. **Games** — HTML5 basketball/soccer/volleyball (launch), score→scoreboard→contest pipeline; pickleball/football added after.
3. **Spin-to-win wheel** — variable-reward wheel, milestone/contest unlock, prize logging + point credit.
4. **Challenge tool** — configurable rule types (first-N, do-X-by-date, streak, referral push), auto-award, announcement.
5. **Streaks & badges** — streak tracking + display, badge definitions + award + profile display.

### Deliverables
- Source (`/app/promotions`, `/admin/promotions`, `/lib/promotions`), embedded games, wheel component.
- README: contest setup, game rotation, wheel odds config, challenge rule types, badge/streak definitions.
- Tests: contest top-N award accuracy, game score recording + window enforcement, wheel prize distribution + point credit, challenge rule completion → award, streak increment/reset, badge award triggers.

### Non-Functional
- Mobile-first (games and wheel especially — played on phones).
- All point awards via Module 19 ledger; all announcements via Module 13.
- Admin-configurable + permission-gated; no public leaderboard.
- Games are lightweight HTML5, reusable/rotatable; wheel odds configurable.

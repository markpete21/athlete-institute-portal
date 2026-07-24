# Athlete Institute — Facility & Registration Portal

## Module 15 of N: FEEDBACK & RATINGS

> Every program accumulates a **rolling out-of-5 star rating** from participant feedback. Two feedback types: a **quick 1–5 star review + optional comment (50 Play Points)** and a **full program feedback form (250 Play Points)**. Feedback is prompted **automatically** at program end (mid-season too for Club/Academy), collected through a **form builder**, stored on the program and accessible through reports, **AI-summarized**, and incentivized with Play Points. Low scores auto-alert staff. Builds on Module 4 (program config), Module 13 (notifications), Module 1 (Play Points), Module 14 (reports). Build after those.

---

## Project Context

Same stack and subdomains. All prompts send via Module 0 `notify()` / Module 13 auto-notification templates (editable, channel-selectable, like every other trigger).

---

## The Rating Model

- Each program shows an **average out-of-5 star rating** with response count (e.g. "4.6 ★ · 34 responses").
- **One designated question is the rating-of-record** (default: "Overall, how would you rate this program?") — it alone feeds the out-of-5. Other questions add detail without muddying the headline number.
- **Rollups:** rating aggregates at every level — a single camp week → the camp → the program type → the brand. Season-over-season rating comparison per program.
- **Private by default** — ratings are internal decision-making data. Per-program **toggle to display publicly** on the catalog (social proof) when ready.

---

## Auto-Prompting (when feedback fires)

- **Default: end-of-program** — auto-sends **1–2 days after the last session** (configurable delay).
- **Club & Academy: mid-season AND post-season** — two feedback rounds (long Sept–June programs need a correction point, not just a post-mortem).
- Prompt schedule is **auto-configured by program type**, staff-overridable per program.
- **One reminder** to non-responders (single nudge, then drop).
- **Two feedback types + incentives:**
  - **Quick review** — one-click 1–5 star rating + optional comment → **50 Play Points.**
  - **Full feedback form** — the complete program feedback form → **250 Play Points.**
  - Completing either auto-credits the points to the household ledger (Module 1). The prompt states the reward (e.g. "Submit a review for 50 Play Points" / "Complete the feedback form for 250 Play Points").
- **Seamless entry:** the notification deep-links straight into the form, **pre-identified** (participant, program, family known — no login friction, no "which program?"). **Star rating is screen one**; detail questions are optional and revealed after. A star-only submission still counts.

---

## Who Can Submit

- **Youth programs:** the **Head of Household** submits (on behalf of each registered child — one response per participant registration).
- **Adult programs:** the **individual participant** submits.
- **Parent-registered young adults (18–23):** if a parent registered the child, the **parent may submit** the review.
- One response per participant registration per feedback round.

## Attribution & Display

- **Attributed internally** — staff see who said what (ties feedback to retention: did the 2-star family re-enroll?; enables follow-up).
- **Displayed anonymously** — any surfaced/shared/public view strips identity.

---

## Feedback Form Builder

- Mirrors the Module 4 custom-questions / Module 13 template pattern:
  - **Question types:** star rating (the rating-of-record), multiple choice, 1–5 / NPS 0–10 scales, yes/no, free text.
  - **Templates per program type** — seeded defaults (camp form: coaches/facilities/value; league form: scheduling/officiating/competitiveness), staff-editable.
  - **Save / duplicate / brand-themed.**
- **Short by default:** rating + one optional comment is the standard form; everything else opt-in per program.

---

## Storage, Reports & AI Summaries

- All responses **stored on the program**, accessible through **Module 14 reports** (filter by program/season/brand/score; export).
- **AI summarization:** Claude (model `claude-sonnet-4-6`) generates a **feedback summary per program per round** — key themes, what parents praised, what to fix, notable quotes (anonymized) — attached to the program's report and **shared** (surfaced on the admin dashboard; optionally emailed to the program's assigned staff/admins).
- Ratings + response rates feed the **predictive-retention signals** (low score + no re-enrollment = churn flag).

---

## Low-Score Alerting

- A **1 or 2-star** rating-of-record response **auto-alerts staff immediately** (notification + task via Module 0/13) with the attributed response — feedback becomes complaint-recovery while the family is still reachable.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Rating model** — rating-of-record question, out-of-5 averages, rollups (program → type → brand), season-over-season, private-with-public-toggle.
2. **Form builder** — question types, per-type seeded templates, save/duplicate, short-by-default forms.
3. **Auto-prompting** — end-of-program +1–2 day trigger, Club/Academy mid+post rounds, one reminder, deep-linked pre-identified form, star-first flow, 50 Play Points auto-credit on completion.
4. **Submitter rules + attribution** — HoH for youth / individual for adult / parent for parent-registered 18–23, one response per registration per round, attributed-internal / anonymous-display.
5. **Storage + AI summaries** — responses on the program, Module 14 report views + export, Claude per-round summaries shared to dashboard + optional staff email.
6. **Low-score alerts** — 1–2★ immediate staff notification + task with attributed response.

### Deliverables
- Source (`/app/feedback`, `/admin/feedback`, `/lib/feedback`).
- Seeded per-type form templates; deep-link form flow; AI summary generation.
- README: prompt scheduling, rating-of-record, rollups, Play Points credit, alerting, public toggle.
- Tests: prompt timing per type (end + Club/Academy mid/post), one-response-per-registration enforcement, Play Points credited once, rating rollup math, low-score alert fires, anonymous display strips identity, public toggle.

### Non-Functional
- Mobile-first (parents will do this on phones from a notification tap).
- Prompts via Module 0 `notify()` / Module 13 editable templates; points via Module 1 ledger; reports via Module 14.
- AI summaries use `claude-sonnet-4-6`; summaries must never expose respondent identity.

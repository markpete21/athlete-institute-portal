# Athlete Institute — Facility & Registration Portal

## Module 16 of N: PREDICTIVE RETENTION

> A **rule-based, transparent churn-risk system** that flags returning-eligible participants at risk of not re-enrolling — with a **person + reason + suggested action** for each. Surfaces as a Module 14 dashboard/report. Uses signals the system already generates (no new tracking): re-enroll timing, feedback, payment behavior, email engagement, and **cross-app login/activity** across the shared Clerk/Supabase ecosystem. Build after Modules 13, 14, 15.

---

## Project Context

Same stack. All four apps (Play portal, tickets, live stream, future team app) share **one Clerk instance + one Supabase database**, so per-household activity can be aggregated across services. Flagging is **rule-based and tunable** — not a black-box score.

---

## Risk Flagging

- Every participant who **could re-enroll** (played a program with a next season/edition) gets a **risk flag: red / amber / green** (or 0–100), driven by visible, weighted rules.
- Output is always **person + reason(s) + suggested action** — never a bare score.

### Signals (weighted, tunable)

- **Re-enroll timing vs. their own history** (highest weight) — last year they'd registered by date X; this year that date has passed with no registration.
- **Feedback score** (Module 15) — low/negative rating-of-record.
- **Abandoned re-registration** (Module 4 capture) — started, didn't finish.
- **Payment friction** — failed installments / PAD issues last season.
- **Email disengagement** (Module 13) — opens dropped toward zero.
- **Sibling gap** — one child re-enrolled, another who played did not.
- **Cross-app engagement / login trend** — declining logins to Play, drop in live-stream watching, tickets/event inactivity. **Weight the *trend* (was-high-now-dark) more than absolute level** — a family that went quiet after being engaged is a sharper flag than a consistently low-touch one.

---

## Retention Dashboard (in/with Module 14)

- **Sortable list** of flagged families: risk level, contributing reasons, last activity.
- **One-click actions:** send targeted offer, assign a call task, apply returning-athlete discount.
- **Weekly staff digest** (optional): "N families at risk this week."

---

## Compliance (PIPEDA)

- Cross-app activity aggregation builds a behavioral profile — legitimate for the business-relationship purpose of retention, but must be **internal-only, purpose-limited, and never exposed to the family.**

---

## Build Stages

1. **Signal aggregation** — pull re-enroll timing, feedback, abandoned-cart, payment, email engagement, and cross-app Clerk/activity data per household.
2. **Rule engine** — weighted, tunable rules → red/amber/green (or score) with reasons attached; trend-weighting for engagement.
3. **Dashboard + actions** — sortable flagged list, per-family reasons, one-click offer/call/discount, optional weekly digest.

### Deliverables
- Source (`/app/retention`, `/lib/retention`), dashboard views, digest job.
- README: signal definitions, weight tuning, PIPEDA internal-only posture.
- Tests: re-enroll-timing flag vs. own history, trend-weighting of engagement, reason attachment, action wiring, internal-only enforcement.

### Non-Functional
- Rules transparent and tunable (no black box).
- Internal-only; never surfaced to families.
- Reuses existing cross-app data — no new tracking infrastructure.

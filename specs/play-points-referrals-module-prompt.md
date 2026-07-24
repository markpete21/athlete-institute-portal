# Athlete Institute — Facility & Registration Portal

## Module 19 of N: PLAY POINTS & REFERRALS

> The loyalty core: a **configurable earn-rule engine**, a **two-sided referral system**, **redemption** at checkout, the **customer points surface**, and **points-liability + referral reporting**. The ledger, household-level tracking, and the 100 pts = $1 spend slot already exist in Module 1; this module defines earning, referrals, redemption rules, and reporting. The fun/campaign layer (contests, games, wheel, challenges, streaks, badges) is **Module 20**. Build after Module 1; integrates across all program modules.

---

## Project Context

Same stack. **100 Play Points = $1** (kept clean and legible). Household-level ledger (Module 1). Points apply in the Module 1 pricing function's designated slot (after Credit on Account). Earn notifications via Module 0 `notify()` / Module 13 templates.

---

## Earn-Rule Engine (all rules admin-configurable — on/off + value)

| Action | Points | Notes |
|---|---|---|
| **New household creation** | 100 | Universal, once per household. Message: "Congratulations, you created a household — you just earned 100 Play Points." |
| **Quick review** (1–5 star + comment) | 50 | Module 15 |
| **Full feedback form** | 250 | Module 15 |
| **Early-bird signup** | 500 | Nudge on top of the early-bird price discount |
| **Complete profile** | 100 | Per household, one-time |
| **Connect PAD** | 200 | Per household, one-time (PAD saves processing fees — pays for itself) |
| **First app login** | 100 | Per household, one-time |
| **Birthday** | 150 | Annual |
| **Spend** | 1 pt / $1 | **Programs ONLY** — excludes Academy, Club, rentals |
| **Loyalty ladder** | 3 seasons = 500 · 5 = 1000 · 7 = 1500 · 10 = 2500 | Escalating milestones; **Club + Academy seasons count; rentals do not** |
| **Referral** | referrer 1000 + referred 500 | See below |
| **Manual/promotional** | staff-set | Reason required, permission-gated |

- Every rule is **configurable in admin** (toggle + point value). Account actions and profile/PAD/login credits are **per household**, not per member.

---

## Spend Earning — Scope & Disclaimer

- **1 pt per $1 earned on PROGRAMS ONLY.** **Excludes Academy, Club, and rentals.**
- A clear **disclaimer** displays wherever points are shown/earned/redeemed, stating **what points apply to** (earn on programs; not earnable or redeemable on Academy, Club, or rentals).

---

## Referral System

- Each customer gets a **unique shareable referral link/code** from their Play account.
- **Both rewards trigger on the referred person's FIRST PAID REGISTRATION** (not on account creation — account-creation-only rewards are gameable):
  - **Referrer:** 1000 pts ($10).
  - **Referred:** 500 pts ($5) welcome bonus (the referred person also gets the universal 100 for creating a household — the 100 is universal, the 500 is referral-specific; they stack).
- **Cap: 3 successful referrals per referrer per season.**
- **Must be a different household** than the referrer.
- **Suspicious-activity flagging** (relaxed enforcement, flag-not-block): surface to staff when patterns suggest gaming — shared address / payment method / device, referred account never pays, referral velocity spikes. Staff can **claw back** fraudulent points (reason logged).

---

## Redemption

- At checkout, customer **applies points via a slider/input**, up to their balance or the cap.
- **50% cap per registration** — points can cover at most half of a given registration.
- **Cannot redeem on Academy, Club, or rentals** — points redeemable on **programs only** (matches earn scope; stated in the disclaimer).
- Converts at 100 = $1 in the Module 1 pricing function's designated slot (after Credit on Account).
- **Never expire.** No max balance.

---

## Customer Points Surface (Play portal)

- **Balance + full ledger** (earned/spent history with reasons).
- **Referral link** to share + referral status/count this season.
- **Available rewards / progress** (loyalty ladder progress, next milestone).
- **Disclaimer** on what points apply to.
- Points-apply option surfaced at checkout (slider).

---

## Notifications

- Earning triggers a **notification** ("You earned 1000 points — your friend just registered!"), via Module 0/13 editable templates, channel-selectable.

---

## Reporting (feeds Module 14)

- **Outstanding points liability** — total unredeemed points as a **$ figure** (future discount owed; a real number for the books).
- **Points earned / redeemed over time.**
- **Referral conversion rate** (links shared → referred signups → paid registrations).
- **Top referrers** (internal, staff-facing — no public leaderboard).

---

## Manual Grants

- Staff can **grant/adjust points manually**, **reason required**, **permission-gated** (Module 5 matrix). Logged to the ledger for audit.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Earn-rule engine** — configurable rules (toggle + value), all seeded amounts, per-household enforcement on account actions, spend-earning scoped to programs only.
2. **Referral system** — unique links, first-paid-registration trigger for both sides, 3/season cap, different-household rule, suspicious-activity flag + claw-back.
3. **Redemption** — checkout slider, 50% per-registration cap, program-only redemption, pricing-function slot, disclaimer.
4. **Customer surface** — balance/ledger, referral link + status, rewards/progress, disclaimer.
5. **Notifications + reporting** — earn notifications; points-liability ($), earned/redeemed trends, referral conversion, top referrers; manual grants with reason + permission gate.

### Deliverables
- Source (`/app/points`, `/admin/points`, `/lib/points`).
- Earn-rule config UI, referral link/tracking, redemption slider, disclaimer component.
- README: earn rules, referral trigger + fraud flags, redemption scope + caps, liability reporting.
- Tests: per-household one-time credits, spend-earning excludes Academy/Club/rental, loyalty ladder counts Club+Academy not rental, referral fires only on first paid registration + 3/season cap + different-household, 50% redemption cap, program-only redemption, points-liability $ math, manual grant requires reason + permission.

### Non-Functional
- 100 pts = $1, clean and legible.
- Earn rules fully admin-configurable.
- Disclaimer visible wherever points appear.
- Reporting feeds Module 14; notifications via Module 0/13; redemption via Module 1 pricing function.

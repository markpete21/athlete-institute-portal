# Athlete Institute — Facility & Registration Portal

## Module 18 of N: DUNNING & TEAM-BALANCE EXPLAINER

> Two smaller, independent features bundled for build efficiency. **(A) Automated dunning** — an escalating recovery sequence for failed PAD/card payments. **(B) Team-balance explainer** — Claude-generated, **admin-private** talking points explaining why Module 6 built teams a certain way. Build (A) after Modules 0/3/4; (B) after Module 6.

---

## A. Automated Dunning

> "Dunning" = the automated sequence that chases failed payments so no one has to catch them manually.

- Trigger: a **PAD installment or card payment fails** (PAD/NSF failures surface days after the attempt, unlike cards).
- **Escalating, configurable sequence:**
  1. **Auto-retry** the charge after X days.
  2. Still failed → **email** with a pay-now link.
  3. Still unpaid after Y days → **SMS**.
  4. Still unpaid → **staff call task** created; account flags **Overdue**.
- Every step and its timing **configurable**; each message is an editable Module 13 template.
- Especially valuable for **Academy tuition PAD plans** (Module 12) — recovers real money with no manual monitoring, human involved only at the final step.
- All charges via Module 0 Stripe rails; all messages via Module 0 `notify()`.

## B. Team-Balance Explainer (admin-private)

- After Module 6's auto-balancing draft builds teams, Claude (model **`claude-sonnet-4-6`**) generates a **plain-language explanation** of why the balance came out as it did (skill/age/gender/experience/height distribution).
- **Admin-private** — surfaced to staff as **talking points**, so when a parent questions a placement, staff have a confident, accurate answer. **Never shown to families** (showing the algorithm's reasoning invites litigation of every placement).

---

## Build Stages

1. **Dunning sequence** — failure trigger, auto-retry, email→SMS→call-task escalation, configurable timing, editable templates, Overdue flag.
2. **Team-balance explainer** — post-draft Claude explanation from the balance attributes, admin-only surface.

### Deliverables
- Source (`/lib/dunning`, `/lib/team-explainer`), admin views.
- README: dunning step config, explainer admin-only scope.
- Tests: dunning escalation path + timing, call-task creation + Overdue flag on final step, explainer generated from real draft attributes, explainer never family-visible.

### Non-Functional
- Dunning: charges via Stripe rails, messages via `notify()`, steps configurable.
- Explainer: `claude-sonnet-4-6`, strictly admin-private.

# Athlete Institute — Facility & Registration Portal

## Module 13 of N: COMMUNICATIONS

> The campaign/template/notification experience built on top of the **Module 0 `notify()`** send layer (Resend email, Twilio SMS, web push). Three tools in one module: a **drag-and-drop email campaign builder** (with Claude-drafting), a **simple multi-channel announcement tool**, and a **customizable auto-notification system**. Plus recipient/segment lists, scheduling, A/B testing, and a full stats dashboard. Build after Module 0; integrates data from all program modules.

---

## Project Context

Same stack and subdomains. All sends go through Module 0 `notify()`. Sending is **permission-gated** (Module 5 matrix). Audience is **program members with implied consent** (CASL implied-consent posture — see Compliance below); sends are not gated behind explicit opt-in, but marketing emails carry unsubscribe + sender-ID footers.

---

## Tool 1 — Email Campaign Builder (drag-and-drop)

- **Drag-and-drop** canvas with stacked/columned blocks.
- **Block types:** text, image, button/CTA, divider, **columns (multi-column layouts)**, logo/header, footer, social links, and **dynamic blocks** (e.g. "your programs", "complete your registration").
- **Merge tags** throughout (e.g. `{{first_name}}`, `{{program_name}}`, `{{balance_owed}}`, `{{team_name}}`).
- **Claude-drafting built in:** a prompt box where staff describe the email; Claude generates **on-brand email HTML** that loads into the canvas as editable blocks. Uses the Anthropic API-in-artifacts pattern, model **`claude-sonnet-4-6`**, brand tokens injected into the system prompt so output matches the selected brand.
- **Brand templates:** **pre-built header/footer, fonts, and colours per brand** (from the Module 0 brand system) — an OP email looks OP, a Bears email looks Bears. Staff pick a brand → template chrome applies.
- **Templates:** save, **duplicate**, reuse. Templates carry brand theming.
- **A/B testing:** test variants (e.g. subject line / content), send to split, report winner.
- **Preview:** desktop + **mobile preview**, and a **required test email** before any real send.

## Tool 2 — Announcement Tool (simple)

- **Deliberately minimal:** a **simple text box** → pick channels (**push / SMS / email** checkboxes, all default on, individually toggleable) → send or schedule.
- Sends the message properly formatted for each checked channel. Not the full builder — a quick blast.

## Tool 3 — Auto-Notifications (transactional/triggered)

- Each trigger is an **editable template** with a sensible **default**, **merge tags**, **channel selection** (email/SMS/push), and an **on/off toggle**.
- Triggers (defaults provided, all editable):
  - Registration confirmation
  - Payment receipt
  - Payment-plan installment upcoming / charged / failed
  - Waitlist spot available
  - Program reschedule (Module 10 workflow)
  - Booking/quote status changes (Module 3)
  - Offer sent (Club/Academy)
  - Offer accepted
  - Certification expiry (staff, Module 5)
  - Staff pay reminders (Module 5)
  - Abandoned-cart nudge
  - Refund processed
  - Account-claim invite (Playbook import, Module 1)
- Transactional messages send regardless of marketing consent (no unsubscribe required on these).

---

## Recipient Lists & Segmentation

- **Custom lists that can be saved** — build, name, save, reuse.
- **Hierarchical selection at every level:** brand → sport → type → season → division (select a group at any level down to a specific division).
- **Filters:** participant **age**, category (Academy/Club/Camps/Youth/Adult), returning-vs-new, brand, season, staff/volunteers, org/tenant, abandoned-cart, location, and combinations.
- **Combine logic:** include/exclude rules (program X + program Y minus anyone registered for Z).
- **Live-loaded lists:** recipient list is **recalculated at send time** (anyone who qualifies up to send-time is included) — not a build-time snapshot.

---

## Scheduling

- **Send now or scheduled** (date/time, America/Toronto).
- **Edit / cancel** a scheduled campaign before it sends.
- **No recurring campaigns** (scheduled one-offs only).

---

## Stats Dashboard (via Resend webhooks)

- **Per-campaign aggregate:** sent, delivered, bounced, opened (rate), clicked (rate), unsubscribed, **sent-by (staff)**, date sent.
- **Per-recipient detail:** see individual open/click status (e.g. Jane opened, didn't click).
- **Per-link click tracking:** which links got clicks.
- Wire **Resend webhooks** for delivered/opened/clicked/bounced/unsubscribed.

---

## Retargeting / Abandoned Cart

- **Both** automated and manual:
  - **Automated abandoned-cart email** — auto-fires X hours after abandonment (configurable).
  - **Manual retargeting list** — filter by **which program** they abandoned AND **which stage** they reached (from Module 4 abandoned-cart capture).

---

## Sender Addresses

- **One `info@` from-address per brand** (e.g. brand-specific info@).
- Ability to **add other sender emails and reply-to addresses.**
- Resend requires **verified sending domains** — note setup.

---

## Deliverability (staying out of spam/junk)

- **Auto-suppress hard bounces & unsubscribes** — permanently suppressed from all future live-loaded lists automatically; no manual scrubbing.
- **Engagement filter** — a standard list option to **exclude recipients with no opens in the last N months** (configurable), so you stop mailing chronically unengaged addresses (which itself hurts placement).
- **Pre-send spam check** — before the required test email, warn on: image-heavy / low-text ratio, missing unsubscribe or sender-ID footer, and risky subject lines (ALL CAPS, excessive punctuation/emoji, spam-trigger words).
- **Domain-setup checklist in the README** — SPF + DKIM + DMARC per sending domain, dedicated bulk **subdomain** (e.g. `mail.` / `news.`) isolated from transactional/staff mail, gradual **domain warmup** (especially given the ~7,000 Playbook imports — don't cold-blast), verified Resend domains, plain-text multipart, and monitored reply-to.

---

## Compliance (CASL)

- Audience is program members with **implied consent** (existing business relationship). Sends are **not** gated behind explicit opt-in.
- **Still required on marketing emails:** working **unsubscribe link + preference management**, and a **sender-ID footer** (business name + physical mailing address) baked into brand templates.
- Transactional auto-notifications (receipts, reschedules, etc.) don't require unsubscribe.

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Email builder** — drag-and-drop canvas, all block types + columns + merge tags, brand templates (header/footer/font/colour per brand), save/duplicate.
2. **Claude-drafting** — prompt box → `claude-sonnet-4-6` generates on-brand HTML → loads into canvas as editable blocks.
3. **Recipient lists** — saved custom lists, brand→division hierarchical selection, age/other filters, include/exclude combine logic, live-loaded at send time.
4. **Scheduling + preview + A/B** — send-now/scheduled, edit/cancel, desktop + mobile preview, required test email, A/B variants.
5. **Stats dashboard** — Resend webhooks, per-campaign aggregate + per-recipient + per-link detail.
6. **Auto-notifications** — editable default templates with merge tags, channel selection, on/off toggles, wired to triggers across modules.
7. **Announcement tool** — simple text box, channel checkboxes, send/schedule.
8. **Retargeting** — automated abandoned-cart email + manual list filtered by program + stage.
9. **Deliverability** — auto bounce/unsubscribe suppression, engagement filter list option, pre-send spam check before test email, domain-setup README checklist.

### Deliverables
- Source (`/app/comms`, `/admin/comms`, `/lib/comms`).
- Drag-and-drop builder, Claude-drafting integration, brand templates.
- Resend webhook handlers + stats views.
- README: builder usage, list/segment logic, auto-notification triggers + editing, announcement tool, retargeting, sender/domain setup, CASL footer/unsubscribe.
- Tests: live-list recalculation at send time, include/exclude combine logic, scheduled edit/cancel, A/B split + winner, per-recipient/per-link stats ingestion, auto-notification toggle + channel selection, abandoned-cart auto-fire + stage filter, unsubscribe honoured on marketing sends, hard-bounce/unsubscribe auto-suppression across future sends, engagement-filter exclusion, pre-send spam check fires warnings.

### Non-Functional
- Mobile-first admin where practical; email output responsive.
- Permission-gated sending (Module 5); required test email before real send.
- All sends via Module 0 `notify()`; brand theming via Module 0 brand system.
- Claude-drafting uses `claude-sonnet-4-6`.
- CASL: unsubscribe + sender-ID footer on marketing emails; verified Resend domains.

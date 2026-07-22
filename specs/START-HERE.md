# START HERE — Building This Platform with Claude Code

> This is your on-ramp. It tells you exactly what to do, in order, to build the Athlete Institute portal from the module specs in this folder. Read this first, then follow the steps.

---

## What these files are

The 23 `*-module-prompt.md` files are **build prompts for Claude Code** — detailed specs telling Claude Code what to build. They are NOT finished code; Claude Code writes the actual Next.js / Supabase / Stripe code from them. `MASTER-build-order.md` is the map that sequences them.

---

## STEP 1 — Set up service accounts (do this first)

Create these accounts and collect all keys/secrets into one private doc. The specs assume every one of these:

- [ ] **Supabase** — create a project (the shared database). Save project URL + anon key + service-role key.
- [ ] **Clerk** — create an app, **enable Organizations**. Save publishable + secret keys. (Use the SAME Clerk instance as the existing tickets/live apps for shared login.)
- [ ] **Stripe** — Canadian account; enable **PAD (`acss_debit`)** + cards. Save publishable + secret keys + webhook signing secret.
- [ ] **Resend** — email sending. Save API key. (Verify a sending domain later — see Module 13.)
- [ ] **Twilio** — SMS. Save account SID + auth token + a number.
- [ ] **Web push** — generate VAPID keys.
- [ ] **GitHub** — account + an empty repo for this project.
- [ ] **Vercel** — account (connect it to the GitHub repo for deploys).
- [ ] **QuickBooks Online** — DEFER. Only Module 14 needs it.

---

## STEP 2 — Install Claude Code

- Install **Node.js** (LTS version) if you don't have it.
- Install **Claude Code** and sign in. Follow the current official instructions at **docs.claude.com** (the exact command/setup may have changed — trust the docs over memory).
- Claude Code runs in your terminal or inside VS Code.

---

## STEP 3 — Set up the project folder

1. Create an empty project folder (e.g. `athlete-institute-portal`).
2. Inside it, create a `/specs` folder and put **all 24 `.md` files** (this guide + master + 23 modules) there.
3. Open the project folder in Claude Code.

Keeping all specs in the repo matters: Claude Code can read neighboring modules when it needs an integration detail (e.g. reading Module 1's pricing-function contract while building Module 4).

---

## STEP 4 — Build Module 0 (this is the pattern for all modules)

1. In Claude Code, say:
   > "Read /specs/MASTER-build-order.md for full context, then read /specs/foundation-module-prompt.md. Build Module 0 following its Build Stages in order. Complete one stage, show me how to verify it works, and wait for my OK before the next stage."
2. Go **stage by stage**. When Claude Code finishes a stage, **test it yourself** the way it tells you (usually run the dev server and click through). Don't just trust "done."
3. When all stages pass and the module's **gate** (in the master doc) is met:
   - Commit to GitHub.
   - Deploy to Vercel once to confirm it runs live.

---

## STEP 5 — Repeat for every module, IN PHASE ORDER

Follow the phases in `MASTER-build-order.md`. For each module:

> "Read /specs/[module-file].md and build it following its Build Stages, one stage at a time with verification. The earlier modules it depends on are already built in this repo — use them, don't recreate them."

**Phase order (do not skip ahead):**
- **Phase 1:** 0 Foundation → 1 Accounts → 2 Facilities
- **Phase 2:** 3 Rentals → 4 Program Framework → 5 Staff
- **Phase 3:** 6 Competitive Play → 7 Leagues → 8 Camps → 9 Tournaments → 10 General Programs → 11 Club → 12 Academy
- **Phase 4:** 13 Communications
- **Phase 5:** 14 Dashboard & Reporting + 19 Play Points → 15 Feedback → 20 Promotions
- **Phase 6:** 16 Retention → 17 Gallery → 18 Dunning/Explainer → 21 AI Assistant → 22 AI Enhancements

Commit to GitHub after each working module.

---

## The 6 rules that keep this on track

1. **One module per session.** Never paste all specs at once.
2. **Honor the gates.** Don't start a module until the prior phase's gate passes.
3. **Test each stage yourself.** "It compiles" is not "it works."
4. **Commit after each working module** so you can always roll back.
5. **Keep all specs in `/specs`** so Claude Code can cross-reference.
6. **The Module 1 pricing function and Module 2 booking engine are the spine** — if anything seems to duplicate them, stop and extend the original instead.

---

## What to expect

- **This is a large build** — weeks to months of sessions, not one sitting.
- **Hardest modules:** Module 2 (booking/conflict engine) and Module 4 (refund/proration engine). Their specs include worked-example tests — use them to verify correctness.
- **You'll refine as you go.** The specs get you ~90% aligned; real implementation surfaces decisions the specs don't cover. That's normal.
- **Defer QuickBooks** (Module 14) and the **separate team-communication app** — both are explicitly out of the core build.

---

## If you get stuck

- Re-read the relevant module's "Build Stages" and "Tests" sections — they define "done."
- Point Claude Code at the specific dependency file it needs ("read /specs/accounts-module-prompt.md, section Pricing").
- For anything install- or tooling-specific about Claude Code itself, check **docs.claude.com**.

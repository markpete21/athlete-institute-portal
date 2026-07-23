# Playbook Import — CSV Schema & Runbook

Migrates ~7,000 Playbook accounts into the portal: **people, emails, addresses,
and household groupings only**. Payment methods (vaulted at Playbook's
processor — not legally exportable), past transactions, and registration
history are **out of scope** by design.

## CSV schema

Header row required. Column names are case/space-insensitive
(`First Name` → `first_name`). Extra columns are preserved in the staged row's
`raw` JSON but not imported.

| column | required | notes |
|---|---|---|
| `first_name` | ✓ | |
| `last_name` | ✓ | |
| `email` | | normalized to lowercase; rows with an email become claimable accounts |
| `phone` | | |
| `address` | | used for household derivation + fuzzy dedupe |
| `city` | | |
| `postal` | | uppercased, spaces stripped |
| `dob` | | `YYYY-MM-DD` only; anything else ignored. Rows WITH a dob commit as dependents, without as adults |
| `household_key` | | any stable token grouping one household; when absent, derived from normalized last name + address |

Sample: [`docs/playbook-sample.csv`](playbook-sample.csv).

## Flow (admin.athleteinstitute.ca/import)

1. **Stage** — upload the CSV. Parsing + duplicate detection happen into
   `import_jobs`/`import_rows`; **nothing touches real tables**. This is the
   dry-run: re-upload freely, stale jobs can be ignored.
2. **Review** — suspected duplicates are grouped (exact email match, then
   name+address fuzzy at Levenshtein ≤ 2). Per row: **Keep separate** (default),
   **Merge away** (row is dropped in favor of another), or **Skip**.
3. **Commit** — creates families (by household key), family_members for every
   kept row, and an **unclaimed profile** for each kept row with an email
   (`clerk_user_id = 'unclaimed:<token>'`). A member with a dob commits as
   `dependent` (18+ auto-conversion applies on first load), without as `adult`;
   the first emailed member is HoH.
4. **Send claim emails** — each unclaimed profile gets a branded email with a
   `sign-up?claim=<token>` link. Claiming = signing in with the matching email:
   the profile is **adopted** by the new Clerk identity (family links kept) —
   see `adoptUnclaimedProfile()` in `lib/import/playbook.ts`, called from
   `getOrCreateProfile()`.
5. **First checkout** — no payment methods migrated, so checkout prompts "set
   up your payment method" gracefully (Module 4 owns that flow).

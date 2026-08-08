# Staff pay tracking + QuickBooks export (Module 5)

Pay is **tracked, never moved**. The portal generates a schedule of pay dates
per staff-program assignment, staff mark them paid as payroll settles them,
and the CSV export carries the numbers into QuickBooks/payroll — that import
is where money actually moves.

## Pay structure (per assignment, not per coach)

A coach's camp rate can differ from their league rate: the pay structure lives
on the **staff <-> program assignment**.

| Field | Options |
| --- | --- |
| mode | `per_session`, `hourly`, `flat` (per program), `salary` (amount per period) |
| rate | dollars, stored as cents |
| frequency | `bi_weekly`, `monthly`, `after_program` |

Assigning generates the pay-date schedule automatically: the window and the
per-session unit count come from the program's own sessions (override with
explicit dates/units for a program with no sessions yet). `after_program` is a
single payment on the end date; `bi_weekly`/`monthly` split the total evenly
across periods (salary = the amount **per period**).

## Pay periods

Bi-weekly reporting periods are 14 days, org-wide, anchored to Monday
**2026-01-05** (`PAY_PERIOD_ANCHOR` in `@ai/foundation`). The pay dashboard's
"Pay period" panel is the who-is-paid-this-period report; Prev/Next steps
whole periods.

## Absence + replacement

- **One session** (staff detail → assignment → "Mark a session absent"): the
  original's pay for that session is deducted from their outstanding pay
  dates; the replacement is paid the **entered rate** on the session date
  under a hidden `Substitute` assignment of their own. Recording the same
  session twice never double-moves money. Flat/salary assignments record the
  absence without a deduction (their pay is not per-session).
- **Remainder of the program** ("Replace for the remainder"): the original's
  assignment closes at the handoff date (`active=false`, `effective_until`),
  their outstanding pay is re-cut to the portion actually worked (absent
  sessions excluded; flat is prorated; salary keeps the periods already due),
  and the replacement gets their own assignment + generated schedule at the
  **new rate** over the remaining window.
- Replacements can be existing staff or an **ad-hoc name**, which creates an
  account-less staff record on the spot.

## QuickBooks CSV format

`GET /staff/pay/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (staff-only) returns:

```csv
DueDate,Staff,Email,Program,QuickBooksClass,AmountCAD,Status,PaidAt
2026-10-03,Ben Sub,ben@example.com,Fall League U13,Youth Sports,60.00,outstanding,
```

- One row per pay date in the window (both paid and outstanding, so the
  import can reconcile).
- `QuickBooksClass` is the program's `quickbooks_class` (programs map to QB
  Classes, locations to QB Locations — see Module 14).
- `AmountCAD` is dollars with two decimals. `PaidAt` is the settle date, blank
  while outstanding.

## Margin feed

`programStaffCostCents(programId)` = the sum of every pay date under the
program's assignments (original + substitutes + replacements), which is what
the Module 14 margin report subtracts as staff cost.

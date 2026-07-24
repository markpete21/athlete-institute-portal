# Athlete Institute — Facility & Registration Portal

## Module 5 of N: STAFF

> Manages internal staff, admin, facility coordinators, coaches, convenors, and volunteers — their records, roles, pay, certifications, and program assignments. Depends on **Module 1** (Accounts: the shared role system, Clerk logins), and integrates with **Module 4** (Program Framework: the staff-assignment hook, roster/schedule access, margin cost feed) and **Module 2** (Facilities Schedule: staff schedule view, unavailability). Staff pay costs feed **program margin** tracking.

---

## Project Context

Same stack: **Clerk**, **Supabase**, **Stripe** (Canadian), **Next.js** App Router on **Vercel**. Brand black/white/gold (`#A18F60`), Helvetica Neue. PIPEDA-compliant, mobile-first.

- `admin.athleteinstitute.ca` — staff management, pay, certs, assignments, pay dashboard.
- `play.athleteinstitute.ca` — public display of assigned staff on registration + portal pages; assigned staff's own read-only roster/schedule view.

---

## Staff Records

- Fields: **Name, role(s), bio, photo**, plus pay structure, certifications, status (below).
- **Multiple roles per staff member** (reuses the **Module 1 role system** — Admin, Facility Coordinator, Coach, Convenor, Assistant Coach, Volunteer; roles are add/editable). A staff record here **is** a Module 1 staff account enriched with bio/photo/pay/certs.
- **Every staff member should have a login** (Clerk) — BUT allow staff to **add a coach without an account or email**, to be filled in later (e.g. a coach added via a roster upload for a specific event). Account-less records can be **upgraded** to a login later by adding an email → Clerk invite.
- **Bios are global** (one bio per staff member, not per program).

---

## Public Display

- Assigned staff appear on **program registration pages** (primary need) and on **public portal pages** (e.g. an "our coaches" / team page; some added via roster upload for certain events).
- A program can have **multiple staff.** On the public page:
  - Show each staff member's **photo** with their **role shown underneath the photo.**
  - **Hover or click the image → bio pops up.**

---

## Pay Structure

- **Pay structure is selectable per coach AND changeable per program** — a coach's camp rate can differ from their league rate. The rate/structure attaches to the **staff↔program assignment**, not globally.
- Support multiple structure modes (select per assignment): **hourly, per-session, flat-per-program, salary/period amount.**
- **Payment frequency** per assignment: **bi-weekly, monthly, after-program.**

### Auto-scheduled pay dates & reporting

- The system **generates a schedule of pay dates** from the frequency + program dates (e.g. bi-weekly across the program run), with the amount due on each date.
- **Bi-weekly report** of **who is paid in that pay period** — a per-pay-period payout list.
- This is **tracking + QuickBooks export**, NOT moving money — the system tracks what's owed, when, and paid-vs-outstanding, and exports to QuickBooks/payroll. It does not issue payments.

### Absence & replacement (per session)

- Mark a staff member **absent for a specific session** when they can't make one session.
- Select a **replacement** for that session and **enter the replacement's rate** (may differ from the original coach's).
- On absence: the original's pay for that session is **removed/reduced** and the **replacement's pay added** at the entered rate.
- Also provide **"replace for the remainder of the program"** — reassign from a point forward, with a **new customizable rate** for the replacement (their rate may differ from the previous coach's).
- Replacement can be an existing staff member or an ad-hoc add.

---

## Program Assignment & Access

- Assign **multiple staff** to a program (head coach + assistants + convenor, etc.).
- **Assignment is manual — no availability check** at assignment time.
- Assigned staff get a **read-only by default** view in their own account of the program **roster + schedule** (Module 4 roster, Module 2 schedule). **Capability-gated exceptions** (granted via the permission matrix below): **score entry** (Module 6 — convenors/coaches enter game scores on-site) and **camp check-in/check-out** (Module 8). No general attendance marking, messaging, or editing yet — broader communications/announcements may be added later, and are separately planned for Club/Academy.

### Role-based access = checkbox permission matrix

Do **not** hard-code per-role access. Build a **capability matrix**: **roles down one axis, capabilities across the top**, with **view/edit checkboxes** staff can configure. Capabilities to include at minimum:

- Roster — **names**
- Roster — **sensitive fields** (medical notes, emergency contacts, DOB, custom-question answers)
- Program **schedule**
- **Pay info**
- **Score entry** (Module 6 — game score entry for convenors/coaches)
- **Camp check-in/check-out** (Module 8)
- (extensible — allow adding capabilities)

This is the granular layer on top of Module 1's add/editable roles. The **sensitive-roster-fields** capability is the privacy-critical toggle — default it OFF for most roles, ON only where explicitly checked.

### Staff-submitted unavailability

- Once a staff member has their schedule, they can **"submit unavailability" for a specific date** from their account. Surface submitted unavailability to admin (it does not auto-reassign — informs manual decisions).

---

## Certifications & Compliance

- Track per staff member: **Vulnerable Sector Check** and **Safe Sport Training**, plus the ability to **add additional certifications/requirements.**
- Each certification has an **optional expiry date.**
- When a cert **expires**, send a **warning notification** prompting follow-up for renewal.
- **Warn-only — expiry never blocks program assignment.**

---

## Status

- **Active** if the staff member is **assigned to a current/upcoming program** OR has an **outstanding payment owed to them** (so they stay active until paid for finished work).
- **Inactive** otherwise (e.g. between seasons — this is expected and fine; staff are only paid for working during a program).
- **Archive** — manual, for staff no longer working with Athlete Institute: removes them from assignment lists but **retains their history.**
- Status auto-derives from assignments + outstanding pay; Archive is the manual override.

---

## Staff Pay Report Dashboard

- **Total owed per staff, per program, per pay period.**
- **Upcoming pay dates.**
- **Paid vs. outstanding.**
- These **staff costs feed Module 4 program margin** tracking (staff cost is a major component of program cost, alongside QuickBooks expenses).

---

## Build Stages — Go In Order, Show Me Each One Working

1. **Staff records + roles** — records with name/bio/photo, multiple roles reusing Module 1 roles, Clerk login per staff, **account-less coach records** (add now, add email/upgrade later), global bios. Active/Inactive auto-derivation + manual Archive.
2. **Public display** — assigned staff on registration pages + public portal pages, photo with role underneath, hover/click bio popup, multiple staff per program.
3. **Pay structure + assignment** — per-assignment pay structure (hourly/per-session/flat/salary) selectable per program, per-assignment frequency (bi-weekly/monthly/after-program), manual multi-staff assignment.
4. **Permission matrix + staff view** — role × capability view/edit checkbox matrix (incl. sensitive-roster-fields toggle), read-only staff roster/schedule view, staff-submitted date unavailability.
5. **Pay scheduling + absence/replacement** — auto-generated pay-date schedules, bi-weekly paid-this-period report, per-session absence with replacement-at-entered-rate, replace-for-remainder at new rate, QuickBooks export (tracking only, no money movement).
6. **Certifications** — vulnerable sector check + safe sport training + custom certs, optional expiry, warn-only expiry notifications.
7. **Pay report dashboard** — owed per staff/program/pay-period, upcoming pay dates, paid vs outstanding, feed into Module 4 margin.

### Deliverables

- Source in the existing repo (`/app`, `/admin/staff`, `/lib/staff`).
- A **`/lib/staff` API** exposing staff-assignment, pay-cost (for Module 4 margin), and roster/schedule access resolution (for the permission matrix).
- QuickBooks payout export format (documented; actual QB OAuth/sync is the separate integration piece).
- README: role/permission matrix config, pay-structure setup, absence/replacement flow, cert tracking.
- Tests: pay-date schedule generation, absence/replacement pay recalculation, active/inactive auto-derivation (incl. outstanding-pay-keeps-active), permission-matrix enforcement (esp. sensitive roster fields).

### Non-Functional

- Mobile-first for the staff self-view and unavailability submission.
- Sensitive roster fields gated strictly by the permission matrix (PIPEDA).
- Staff pay tracking exports to QuickBooks; never moves money directly.
- Reuses Module 1 roles/Clerk; feeds Module 4 margin; reads Module 2 schedule + Module 4 roster.

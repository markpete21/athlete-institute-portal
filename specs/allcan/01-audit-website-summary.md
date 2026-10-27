# ALL CAN audit: website recommendations only

Source: *ALLCAN basketball website audit and launch plan* (Coach Tye, updated Oct 13 2026; audit Oct 8 2026).
Scope of this summary: format, structure and content for the website. Taglines, brand messaging, logo choices, Instagram and budget items are left out on purpose.

Where the audit and our Module 23 plan differ, it is flagged under **Plan note**.

---

## 1. Site model

- ALL CAN gets its **own dedicated site**, clearly marked as **operated by Athlete Institute**. Athlete Institute stays the institutional and campus site.
- Orangeville Prep, the All Canadian Games and the Bears keep their own destinations. The ALL CAN site links to them and explains the pathway without implying selection.
- Build and test **one representative city page first** (Orangeville), then copy the template to expansion cities. A copied page must never carry another city's venue, coach or availability.
- **Plan note:** the audit suggests Squarespace and keeping the existing registration and schedules systems at first. Our plan builds the site in the portal with registration, payment and Compete built in, which removes the handoffs the audit was trying to make safe.

## 2. One shared program record

- Keep **one approved record per program**: city, venue, season, birth-year cutoff, days, dates, price, inclusions, capacity, registration link.
- The directory, city pages, program pages, ads and parent emails all read from that record. One person approves changes. Completed seasons are archived, not deleted.
- **Plan note:** this is exactly the portal `programs` table driving auto-updating program pages.

## 3. Accuracy rules (P0, before any promotion)

- Every registration button on a page opens the **same season**. No mixed season IDs.
- One consistent weekday and year everywhere. Dates always carry a year.
- No wording from other sports on basketball pages. Correct league labels.
- Age ranges agree between the directory and the program page. Eligibility cutoffs are published where ages overlap.
- **Expired content is retired**: past camp dates, past tryouts, old sign-up prompts. When next dates are unannounced, show a "next season" interest capture instead.
- Supervision claims and session details must be accurate.

## 4. Navigation and URL structure

- **Main:** Locations · Leagues · Training · Teams and players · Stories · Shop.
- **Primary action:** Find your city.
- **Utility:** Member login · Schedules and results.
- **Footer:** About · Athlete Institute · Parent guide · Financial assistance · Contact · Policies.
- **Proposed paths:** /locations, /locations/[city], /basketball/house-league, /basketball/small-ball, /basketball/private-training, /basketball/clinics, /teams, /teams/[team], /players, /players/[player], /stories, /shop, /financial-assistance.
- **Plan note:** your direction is location first, then sport, then league type. The paths above will be reworked to that hierarchy in the prompt.

## 5. Homepage

- The **first action gets a family to its city**.
- City choice shows each location with an honest status: open, coming soon, or waitlist.
- A "program details before registration" strip: age or skill level, dates and venue, full price, what's included.
- Secondary links: teams and players, meet the coaches, stories from your city.
- Footer line: operated by Athlete Institute, parent guide, financial assistance.
- **Mobile:** stacked city choices, one clear registration action once a program is chosen, dates and cost next to the action, a still-image fallback for any video, readable contrast. Test on real phones.

## 6. Location finder and city pages (P1, required before expansion promotion)

- **Finder:** a simple list of cities and their actual venues with status. Add a map only if it helps families choose.
- **Each city page:** venue address and directions, ages and skill levels, season dates and weekly times, full fee and what it includes, coaches, session format, parking and arrival details, contact, local social link, and a program-specific registration link.
- **Coming-soon city:** collect adult contact and the child's age band, with consent to send launch updates. Never label it registration.
- Photos and testimonials must come from that city, or be labelled as from another location.
- **Acceptance:** a parent can tell whether the program fits, where it runs and what it costs, and every active offering has a correct next step.

## 7. Program pages

### House league (core product)
- Explain the session format: the skills block, then gameplay, then how feedback and consistency show progress.
- Explain team formation, coaching, referees and season format.
- State equipment, jerseys, attendance, friend requests, weather updates and refund policy. Publish only what league operations has confirmed.
- A **program selector**: city, age or birth year, experience, availability. It shows suitable options and explains placement.
- Continued house-league play is presented as a respected choice, not a lesser one.

### Small Ball
- Its own first-basketball page: the 6U and 8U split, session length, lowered baskets, parent expectations, the actual local coaches. Age-appropriate learning language, not elite language.

### Rep
- Explains selection and competitive expectations, and the pathway from house league.

### Clinics vs private instruction
- **Separate pages.** Each format shows ages, group limit, duration, price and its own booking route.
- **Private instruction:** approved formats (1:1, partner, small group), coach profiles, suitable ages, duration, venue, rates, taxes, cancellation rules, how to book. Start with goals and an assessment, connect to game situations, give a short progress note.
- If live booking isn't available, use a request form with a realistic response time. An enquiry is never presented as a confirmed booking.

### Men's league
- Correct labels and the divisions that actually run.
- Separate **team registration** from **free-agent registration**, with approved fees and roster rules.

## 8. Teams and players directory (P1, once rosters and permissions are ready)

| Page | Content | Actions |
|---|---|---|
| Team list | City, division, season, team name, approved team mark or photo | Filter by city and division; open team |
| Team page | Coach, roster, jersey numbers, team photo, season info | Open player profiles, schedule, results, city programs |
| Player list | Consented portrait, approved display name, jersey number, team, city | Search by name; filter by city, team, division, season |
| Player profile | Portrait, team link, short player-approved intro, approved features | View team and league stories; stats only when reliably recorded |

- Clean grid of portrait cards, consistent photo treatment across cities, neutral avatar when there's no portrait.
- Families move from a roster to the right schedule **without leaving the site**.
- **Privacy:** guardian permission for youth profiles, an opt-out, approved display names only. No birth dates, schools, contact details or private evaluations on public profiles.
- Start with roster cards; add richer profiles and stats as staffing allows.
- **Launch check:** every listed player is on the correct current team, filters work on phones, team links reach the right schedule, corrections and withdrawals have an owner.
- **Plan note:** Compete already masks minors' names per division and supports a hide-from-public flag. The directory should use those rules.

## 9. Stories (P2; three ready for launch)

- Keep **official announcements separate from community features**.
- Filters: city, program, story type.
- Every story has a date, author or approved attribution, the city and a program link.
- Launch set: a rebrand explanation, the expansion announcement once venues are confirmed, and one coach or player-development feature.

## 10. Shop (P2, after suppliers and fulfilment exist)

- Start small: a few items. Use preorders with an honest delivery window.
- Show product photos, size guide, total cost, pickup or shipping terms, return conditions and delivery timing.
- Clearly separate the uniform included in registration from optional merchandise.
- **Plan note:** we agreed to link out to the Gear app for purchases.

## 11. Financial assistance (P1 policy, P2 service)

- Easy to find **beside program pricing**, without identifying recipients.
- A confidential application, separate from marketing and coach-facing information. Collect only what the reviewer needs.
- Publish limits: what's covered (fees, equipment, uniforms), award limits, response time, appeal route.
- If funding isn't secured, offer a clearly described enquiry route instead of promising subsidies.

## 12. Player development cards (pilot)

- Private baseline and end-of-season feedback with one strength and one next step. Optional consented portrait.
- Start with one age group and a simple rubric. Assessment details stay private unless there's permission to share.

## 13. Migration

- Publish and verify the replacement before redirecting an old page.
- Map retiring URLs (for example /aibl) to their closest new page.
- Preserve historical program records. Update QR codes, email links, page titles and search descriptions.

## 14. Measurement

- Report by **city, season and program**.
- Registration conversion: completed registrations over program-page visits.
- Fill rate: registered places over approved places. Retention: returning eligible players over last season's eligible players.
- Parent service: enquiries, response time, recurring questions. Development feedback coverage.
- Never count outbound clicks as registrations.
- **Plan note:** registration on the brand domain makes true conversion measurable, which the audit could not assume.

## 15. Launch verification

- Programs confirms every city's offer, dates, eligibility and full price.
- Walk through new and returning family journeys, including team and free-agent paths.
- Test every call to action, schedule link, phone layout, keyboard use, contrast and redirect.

## 16. Explicitly not for launch

- A separate app, automatic rankings, a large shop, or guaranteed exposure claims.

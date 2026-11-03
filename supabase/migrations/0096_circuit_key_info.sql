-- Circuit Key info (owner, Nov 3 2026): one-line description; six short facts
-- (Hosted by, the Teams list and 2027-28 removed; the team logos show below as
-- "Programs"). Idempotent.
update public.site_programs set
  description = 'Rep basketball league on Wednesday nights. Hosted by Orangeville Bears at the Athlete Institute Dome.',
  facts = $j$[["Season", "Nov 4, 2026 – Feb 24, 2027"], ["Games", "Wednesdays · 6:30 & 8:00pm ET"], ["Divisions", "U13 · U14 · U15 Boys"], ["Home venue", "Athlete Institute Dome · 207321 Hwy 9, Mono, ON"], ["Holiday break", "Dec 23–30 · back Jan 6"], ["Championship Weekend", "Feb 27–28, Main Gym · times to be confirmed"]]$j$::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'circuit';

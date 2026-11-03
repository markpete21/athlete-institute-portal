-- Toronto Midtown (owner, Nov 2 2026): the first session (Saturday, January
-- 23, 2027) is the evaluation session and teams are set in week 2 (January
-- 30). Replaces the [TBC] evaluation date in the key dates, steps, schedule,
-- FAQ and what's included, and tags weeks 1 and 2. Idempotent.

update public.site_locations set
  calendar = '[["Registration", "Open now"], ["First Saturday · evaluations", "January 23, 2027"], ["Teams set", "January 30, 2027"], ["Semifinals", "March 6, 2027"], ["Championship Day", "March 13, 2027"]]'::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown';

update public.site_pages set
  blocks_draft = replace(replace(replace(replace(replace(replace(blocks_draft::text, 'Every player attends an evaluation session first. Date [TBC].', 'The first session, Saturday, January 23, is evaluations for every player.'), '{"tag": "", "date": "Evaluation session · date [TBC]", "label": "First"}, ', ''), '{"tag": "", "date": "Saturday, January 23", "label": "Week 1"}', '{"tag": "Evaluations", "date": "Saturday, January 23", "label": "Week 1"}'), '{"tag": "", "date": "Saturday, January 30", "label": "Week 2"}', '{"tag": "Teams set", "date": "Saturday, January 30", "label": "Week 2"}'), '{"a": "The date is [TBC].", "q": "When is the evaluation session?"', '{"a": "It''s the first session: Saturday, January 23, 2027. Teams are set by the second Saturday, January 30.", "q": "When is the evaluation session?"'), '8 Saturdays of games and coaching', '8 Saturdays of basketball, starting with evaluations')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(replace(replace(replace(blocks_published::text, 'Every player attends an evaluation session first. Date [TBC].', 'The first session, Saturday, January 23, is evaluations for every player.'), '{"tag": "", "date": "Evaluation session · date [TBC]", "label": "First"}, ', ''), '{"tag": "", "date": "Saturday, January 23", "label": "Week 1"}', '{"tag": "Evaluations", "date": "Saturday, January 23", "label": "Week 1"}'), '{"tag": "", "date": "Saturday, January 30", "label": "Week 2"}', '{"tag": "Teams set", "date": "Saturday, January 30", "label": "Week 2"}'), '{"a": "The date is [TBC].", "q": "When is the evaluation session?"', '{"a": "It''s the first session: Saturday, January 23, 2027. Teams are set by the second Saturday, January 30.", "q": "When is the evaluation session?"'), '8 Saturdays of games and coaching', '8 Saturdays of basketball, starting with evaluations')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';

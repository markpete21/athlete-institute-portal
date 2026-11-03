-- Youth League (owner, Nov 2 2026): "balanced teams, skills and a game every
-- Saturday" in the program description and its Format fact. Idempotent.
update public.site_programs set
  description = replace(description, 'then balanced teams and a game every Saturday', 'then balanced teams, skills and a game every Saturday'),
  facts = replace(facts::text, 'then balanced teams and a game every Saturday', 'then balanced teams, skills and a game every Saturday')::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

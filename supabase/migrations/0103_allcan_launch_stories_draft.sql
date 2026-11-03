-- Launch (owner, Nov 3 2026): the three setup stories still carry [TBC] and
-- out-of-date copy; back to draft (kept, editable in the site editor).
update public.site_posts set status = 'draft', updated_at = now()
 where brand_key = 'all-can' and status = 'published'
   and slug in ('how-the-skills-block-works', 'toronto-midtown-opens', 'allcan-sport-launches');

-- Toronto Midtown basketball page, "Your coach" (Tye Appleton): the reel plays
-- in the photo spot, the bio draws on his Instagram profile, and the link
-- shows his handle. Draft and published both.
update public.site_pages p set
  blocks_draft = (
    select jsonb_agg(case when b->>'id' = 'coach' then
      jsonb_set(b, '{props}', (b->'props') || jsonb_build_object(
        'videoUrl', '/sites/all-can/videos/tye-appleton-reel.mp4',
        'videoLabel', 'Coach Tye Appleton on court at Athlete Institute',
        'caption', '',
        'bio', E'Tye leads the ALL CAN Basketball League at De La Salle College as Head Coach and Convenor.\n\nHe works in player development with Orangeville Prep and ALL CAN, and builds people, moments and brands on and off the court. Husband, dad and MBA graduate.',
        'linkLabel', 'Follow Coach Tye on Instagram (@jummpsh0t)',
        'linkHref', 'https://www.instagram.com/jummpsh0t'))
      else b end order by o)
    from jsonb_array_elements(p.blocks_draft) with ordinality as t(b, o)),
  blocks_published = (
    select jsonb_agg(case when b->>'id' = 'coach' then
      jsonb_set(b, '{props}', (b->'props') || jsonb_build_object(
        'videoUrl', '/sites/all-can/videos/tye-appleton-reel.mp4',
        'videoLabel', 'Coach Tye Appleton on court at Athlete Institute',
        'caption', '',
        'bio', E'Tye leads the ALL CAN Basketball League at De La Salle College as Head Coach and Convenor.\n\nHe works in player development with Orangeville Prep and ALL CAN, and builds people, moments and brands on and off the court. Husband, dad and MBA graduate.',
        'linkLabel', 'Follow Coach Tye on Instagram (@jummpsh0t)',
        'linkHref', 'https://www.instagram.com/jummpsh0t'))
      else b end order by o)
    from jsonb_array_elements(p.blocks_published) with ordinality as t(b, o)),
  updated_at = now()
where p.brand_key = 'all-can' and p.slug = 'toronto-midtown/basketball';

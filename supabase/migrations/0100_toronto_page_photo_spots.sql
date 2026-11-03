-- Toronto Midtown basketball page (owner, Nov 3 2026): no empty photo or video
-- spots for now (game-action photo, the What's included photo, the photo grid,
-- the video), except the coach portrait; the coach section moves up to sit
-- right under the All Canadian partnership band. Real photos (hero, venue)
-- stay. Draft and published. Idempotent.
update public.site_pages pg set
  blocks_draft = x.blocks, blocks_published = x.blocks, updated_at = now()
from (
  select p.id, (
    select jsonb_agg(
      case when b->>'id' = 'included' then jsonb_set(jsonb_set(b, '{props,caption}', '""'), '{props,imageUrl}', '""') else b end
      order by case when b->>'id' = 'coach' then (select o from jsonb_array_elements(p.blocks_published) with ordinality t2(b2, o) where b2->>'id' = 'partner') + 0.5 else ord end)
    from jsonb_array_elements(p.blocks_published) with ordinality t(b, ord)
    where b->>'id' not in ('photo-action', 'gallery', 'video')
  ) as blocks
  from public.site_pages p
  where p.brand_key = 'all-can' and p.slug = 'toronto-midtown/basketball'
) x
where pg.id = x.id;

-- Toronto Midtown basketball (owner, Nov 2 2026): the ALL CAN Basketball logo
-- in place of the hero headline (the headline stays as its alt text), and the
-- All Canadian x ALL CAN partnership band ("development arm of All Canadian
-- Basketball Games, est. 2015") after Why it works. Draft and published both; both render once
-- the titleLogoUrl hero option and the lockup_band block ship.
-- Idempotent.
update public.site_pages p set
  blocks_draft = x.blocks, blocks_published = x.blocks, updated_at = now()
from (
  select pg.id, (
    select jsonb_agg(
      case when b->>'id' = 'hero' then jsonb_set(b #- '{props,logoUrl}', '{props,titleLogoUrl}', '"/sites/all-can/logos/allcan-basketball-league-red.png"') else b end
      order by ord)
      || '[]'::jsonb
    from (
      select b, ord from jsonb_array_elements(pg.blocks_draft) with ordinality as t(b, ord) where b->>'id' <> 'partner'
      union all
      select '{"id":"partner","type":"lockup_band","props":{"imageUrl":"/sites/all-can/logos/lockup-all-canadian-basketball.png","alt":"All Canadian Games and ALL CAN Basketball","text":"ALL CAN Basketball is the development arm of All Canadian Basketball Games, est. 2015."}}'::jsonb,
             (select ord from jsonb_array_elements(pg.blocks_draft) with ordinality as t(b, ord) where b->>'id' = 'why') + 0.5
    ) s
  ) as blocks
  from public.site_pages pg
  where pg.brand_key = 'all-can' and pg.slug = 'toronto-midtown/basketball'
) x
where p.id = x.id;

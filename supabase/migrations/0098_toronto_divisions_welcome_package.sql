-- Toronto Midtown basketball page (owner, Nov 3 2026): Divisions loses its
-- heading (the intro and the age-13 note sit above the cards); Season reads
-- "8 Saturdays"; the welcome package is for new members, everywhere it's
-- mentioned; the two playoff items in What's included merge into "Playoffs and
-- championships". Idempotent.

update public.site_pages set
  blocks_draft = replace(replace(replace(replace(replace(replace(replace(blocks_draft::text, '"heading": "Two divisions. One Saturday."', '"heading": ""'), '{"label": "Season", "value": "8 Saturdays + playoffs"}', '{"label": "Season", "value": "8 Saturdays"}'), 'Jersey, shorts and welcome package included.', 'Jersey and shorts included, plus a welcome package for new members.'), '8 Saturdays, jersey and shorts, welcome package, playoffs and Championship Day.', '8 Saturdays, jersey and shorts, playoffs and Championship Day, plus a welcome package for new members.'), '{"text": "Welcome package: backpack, socks and a sticker pack"}', '{"text": "Welcome package for new members: backpack, socks and a sticker pack"}'), '{"text": "Playoffs: semifinals on March 6"}, {"text": "Championship Day with prizes on March 13"}', '{"text": "Playoffs and championships"}'), 'the reversible jersey and shorts, and the welcome package.', 'the reversible jersey and shorts, and, for new members, the welcome package.')::jsonb,
  blocks_published = case when blocks_published is null then null else replace(replace(replace(replace(replace(replace(replace(blocks_published::text, '"heading": "Two divisions. One Saturday."', '"heading": ""'), '{"label": "Season", "value": "8 Saturdays + playoffs"}', '{"label": "Season", "value": "8 Saturdays"}'), 'Jersey, shorts and welcome package included.', 'Jersey and shorts included, plus a welcome package for new members.'), '8 Saturdays, jersey and shorts, welcome package, playoffs and Championship Day.', '8 Saturdays, jersey and shorts, playoffs and Championship Day, plus a welcome package for new members.'), '{"text": "Welcome package: backpack, socks and a sticker pack"}', '{"text": "Welcome package for new members: backpack, socks and a sticker pack"}'), '{"text": "Playoffs: semifinals on March 6"}, {"text": "Championship Day with prizes on March 13"}', '{"text": "Playoffs and championships"}'), 'the reversible jersey and shorts, and the welcome package.', 'the reversible jersey and shorts, and, for new members, the welcome package.')::jsonb end,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown/basketball';

update public.site_programs set
  facts = replace(facts::text, 'welcome package (backpack, socks, sticker pack)', 'welcome package for new members (backpack, socks, sticker pack)')::jsonb,
  updated_at = now()
 where brand_key = 'all-can' and slug = 'toronto-midtown-basketball-league';

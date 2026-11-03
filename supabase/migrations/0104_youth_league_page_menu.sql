-- Youth League program page (owner, Nov 3 2026): the same sticky page menu as
-- the Toronto Midtown page. Links to this page's sections; Register goes to
-- Where it runs (families pick a location there). Draft and published.
-- Idempotent.
update public.site_pages set
  blocks_draft = x.blocks, blocks_published = x.blocks, updated_at = now()
from (
  select id, jsonb_build_array(jsonb_build_object('id', 'menu', 'type', 'page_nav', 'props', jsonb_build_object(
      'items', jsonb_build_array(
        jsonb_build_object('label', 'Overview', 'href', '#program'),
        jsonb_build_object('label', 'Where it runs', 'href', '#locations'),
        jsonb_build_object('label', 'Who it''s for', 'href', '#who'),
        jsonb_build_object('label', 'Why it works', 'href', '#why'),
        jsonb_build_object('label', 'How it works', 'href', '#how'),
        jsonb_build_object('label', 'What''s included', 'href', '#included'),
        jsonb_build_object('label', 'FAQ', 'href', '#faq')),
      'ctaLabel', 'Register', 'ctaHref', '#locations', 'note', 'Pick your location to register')))
    || (select coalesce(jsonb_agg(case when b->>'id' in ('who', 'why', 'how', 'included', 'faq') then b || jsonb_build_object('anchor', b->>'id') else b end order by o), '[]'::jsonb)
          from jsonb_array_elements(blocks_published) with ordinality t(b, o) where b->>'id' <> 'menu') as blocks
  from public.site_pages
  where brand_key = 'all-can' and slug = 'basketball/youth-league'
) x
where public.site_pages.id = x.id;

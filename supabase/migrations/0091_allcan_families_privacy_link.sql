-- Families menu: a Privacy policy link after Contact (owner, Nov 2 2026). A
-- plain href (no page_id): the privacy page row is hidden from the menu, and a
-- page-linked item would be filtered out with it. Idempotent.
insert into public.site_nav_items (brand_key, parent_id, kind, label, href, sort_order)
select 'all-can', f.id, 'page', 'Privacy policy', '/privacy-policy', 5
  from public.site_nav_items f
 where f.brand_key = 'all-can' and f.label = 'Families' and f.parent_id is null
   and not exists (select 1 from public.site_nav_items x where x.brand_key = 'all-can' and x.parent_id = f.id and x.href = '/privacy-policy');

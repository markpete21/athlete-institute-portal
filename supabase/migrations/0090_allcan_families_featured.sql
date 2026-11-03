-- Families menu featured card (owner, Nov 2 2026): the same card as Play,
-- ALL CAN Basketball, Toronto Winter 2027, with the De La Salle photo.
-- Idempotent.
update public.site_nav_items n set
  label = p.label, description = p.description, href = p.href, image_url = p.image_url, meta = p.meta, updated_at = now()
from public.site_nav_items p, public.site_nav_items pf, public.site_nav_items ff
where n.brand_key = 'all-can' and n.featured and n.parent_id = ff.id and ff.label = 'Families' and ff.parent_id is null and ff.brand_key = 'all-can'
  and p.brand_key = 'all-can' and p.featured and p.parent_id = pf.id and pf.label = 'Play' and pf.parent_id is null and pf.brand_key = 'all-can';

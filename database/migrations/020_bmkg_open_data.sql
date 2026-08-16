-- Nexora HF10: BMKG Indonesia via official BMKG Open Data (no API key required)
insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  ('bmkg', 'BMKG Indonesia', 'Gempa terkini, prakiraan cuaca 3 hari dan peringatan dini cuaca dari Open Data BMKG', 'tools', 'BMKG', 'fa-solid fa-cloud-sun-rain', null, true, 66,
   '{"provider":"bmkg-open-data","apiKeyRequired":false,"attribution":"Sumber: BMKG","features":["earthquake","weather","nowcast"]}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  badge = excluded.badge,
  icon = excluded.icon,
  external_url = excluded.external_url,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

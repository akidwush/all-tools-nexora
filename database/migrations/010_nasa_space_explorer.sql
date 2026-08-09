-- Nexora v6.3.13 HF6 — NASA Space Explorer
-- Aman dijalankan ulang setelah migration 009.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'spaceexplorer',
    'Space Explorer',
    'APOD, galeri Mars, asteroid dekat Bumi dan cuaca antariksa NASA',
    'tools',
    'NASA',
    'fa-solid fa-user-astronaut',
    null,
    true,
    68,
    '{"provider":"nasa","marsSource":"nasa-image-library","features":["apod","asteroids","space-weather"]}'::jsonb
  )
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

notify pgrst, 'reload schema';

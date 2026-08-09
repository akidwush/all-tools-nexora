-- Nexora v6.3.13 HF9 — Image Vectorizer (VTracer local WebAssembly)
-- Aman dijalankan ulang setelah migration 011. Tidak membutuhkan API key.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'imagevectorizer',
    'Nexora Image Vectorizer',
    'Ubah PNG atau JPG menjadi SVG secara privat langsung di perangkat',
    'tools',
    'SVG',
    'fa-solid fa-bezier-curve',
    null,
    true,
    69,
    '{"provider":"local","engine":"vtracer","localOnly":true,"wasmVersion":"1.0.0-alpha.3","features":["png-jpg-to-svg","web-worker","presets","svg-optimizer","copy-download"]}'::jsonb
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

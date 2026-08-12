-- Nexora v6.3.14 — Image Vectorizer (FreeConvert Cloud)
-- Aman dijalankan ulang setelah migration 011. Membutuhkan FREECONVERT_API_KEY.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'imagevectorizer',
    'Nexora Image Vectorizer',
    'Ubah PNG atau JPG menjadi SVG melalui FreeConvert Cloud',
    'tools',
    'SVG',
    'fa-solid fa-bezier-curve',
    null,
    true,
    69,
    '{"provider":"freeconvert","engine":"cloud-api","localOnly":false,"requiresApiKey":true,"features":["png-jpg-to-svg","signed-upload","svg-preview","copy-download"]}'::jsonb
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

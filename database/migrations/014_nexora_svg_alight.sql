-- Nexora HF10.1 — Register SVG → Alight XML in public.tools
-- WAJIB dijalankan di Supabase SQL Editor agar kartu muncul pada katalog production.
-- Aman dijalankan ulang.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'svgalight',
    'SVG → Alight XML',
    'Konversi SVG menjadi XML Alight Motion dengan Anime Vector Atelier',
    'tools',
    'ANIME XML',
    'fa-solid fa-wand-magic-sparkles',
    null,
    true,
    68,
    '{"provider":"svgtoxml","engine":"https://svgtoxml.vercel.app","serverProxy":true,"features":["svg-to-alight-xml","anime-atelier","lossless","copy-download"]}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  badge = excluded.badge,
  icon = excluded.icon,
  external_url = excluded.external_url,
  is_active = true,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';

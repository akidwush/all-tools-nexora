-- Nexora v6.3.13 HF8 — OCR Intelligence
-- Aman dijalankan ulang setelah migration 010.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'ocrintel',
    'Nexora OCR Intelligence',
    'Ekstrak teks dari gambar dan PDF, analisis dokumen, lalu buat searchable PDF',
    'tools',
    'OCR',
    'fa-solid fa-file-lines',
    null,
    true,
    69,
    '{"provider":"ocr-space","maxFreeBytes":1048576,"maxFreePdfPages":3,"features":["text-extraction","language-detection","document-stats","searchable-pdf"]}'::jsonb
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

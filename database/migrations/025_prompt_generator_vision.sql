-- Nexora Prompt Generator v2: provider-backed Vision Prompt Architect.
-- Tidak mengubah access_level; status Free/VVIP tetap dikelola dari Admin Tools.

update public.tools
set
  name = 'Nexora Prompt Generator',
  description = 'Analisis gambar dengan Nexora Vision AI menjadi prompt produksi profesional',
  badge = 'VISION AI',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"provider":"gemini","privacy":"not-stored","targets":["midjourney","flux","stable-diffusion","ideogram","video"]}'::jsonb,
  updated_at = now()
where id = 'promptgenerate';

notify pgrst, 'reload schema';

-- Prompt Generator v2: Gemini Vision Prompt Architect.
-- Tidak mengubah access_level; status Free/VVIP tetap dikelola dari Admin Tools.

update public.tools
set
  description = 'Analisis gambar dengan Gemini Vision menjadi prompt produksi profesional',
  badge = 'VISION AI',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"provider":"gemini","privacy":"not-stored","targets":["midjourney","flux","stable-diffusion","ideogram","video"]}'::jsonb,
  updated_at = now()
where id = 'promptgenerate';

notify pgrst, 'reload schema';

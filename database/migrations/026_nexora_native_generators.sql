-- Nexora 6.4 — register the six native local Nexora generator routes.
insert into public.tools (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  ('text2d', '2D Text Animate / Text FX', 'Buat XML animasi teks 2D dengan preset, Style FX, keyframe dan cubic Bezier lokal', 'tools', 'LOCAL XML', 'fa-solid fa-font', null, true, 70, '{"engine":"nexora-local","auth":false,"features":["native-presets","style-fx","palette-15","history","download-all"]}'::jsonb),
  ('text3d', '3D Text Animate', 'Buat XML teks 3D, extrude, offset, popup, flip dan long shadow', 'tools', '7 PRESET', 'fa-solid fa-cube', null, true, 71, '{"engine":"nexora-local","auth":false,"presets":7}'::jsonb),
  ('textfxanimation', 'Text FX Animation', 'Template efek teks native dengan mode karakter dan kata', 'tools', '5 PRESET', 'fa-solid fa-wand-magic-sparkles', null, true, 72, '{"engine":"nexora-local","auth":false,"presets":5}'::jsonb),
  ('textvector', 'Text to Vector', 'Ubah font lokal menjadi path vector Alight Motion dengan OpenType di Web Worker', 'tools', 'OPENTYPE', 'fa-solid fa-draw-polygon', null, true, 73, '{"engine":"opentype-local","auth":false,"worker":true,"networkFonts":false}'::jsonb),
  ('trimpath', 'Trimpath Generator', 'Generator trimpath huruf dengan style, timing, mask dan color mapping', 'tools', 'LOCAL XML', 'fa-solid fa-route', null, true, 74, '{"engine":"nexora-local","auth":false,"styles":8}'::jsonb),
  ('logoanimate', 'Logo Animate', 'Template XML animasi logo dengan hierarki efek dan text block lokal', 'tools', '8.33S', 'fa-solid fa-shapes', null, true, 75, '{"engine":"nexora-local-template","auth":false,"media":"alight-placeholder"}'::jsonb)
on conflict (id) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  badge=excluded.badge,
  icon=excluded.icon,
  external_url=excluded.external_url,
  is_active=true,
  sort_order=excluded.sort_order,
  metadata=excluded.metadata,
  updated_at=now();

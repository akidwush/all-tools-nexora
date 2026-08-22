-- Upgrade the existing SVG -> Alight XML catalog entry to the v1.8 API feature set.

update public.tools
set
  description = 'Konversi SVG ke XML Alight Motion dengan AM Optimized, Maximum Fidelity, dan audit kesamaan',
  badge = 'ENGINE v1.8',
  metadata = '{"provider":"svgtoxml","engine":"v1.8","serverProxy":true,"features":["am-optimized","maximum-fidelity","fidelity-audit","micro-detail","layer-limit","copy-download"]}'::jsonb,
  updated_at = now()
where id = 'svgalight';

notify pgrst, 'reload schema';

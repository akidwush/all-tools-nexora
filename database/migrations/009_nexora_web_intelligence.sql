-- Nexora v6.3.13 HF5 — Nexora Web Intelligence
-- Aman dijalankan ulang setelah migration 008.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'webintel',
    'Nexora Web Intelligence',
    'Audit SEO, security, performa, aksesibilitas dan teknologi website',
    'tools',
    'INTEL',
    'fa-solid fa-satellite-dish',
    null,
    true,
    67,
    '{"engine":"nexora","deepProvider":"google-pagespeed"}'::jsonb
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

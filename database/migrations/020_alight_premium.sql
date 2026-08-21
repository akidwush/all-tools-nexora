-- Nexora — add Alight Motion Premium reseller tool to existing installations.
insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  ('alightpremium', 'Alight Motion Premium 1 Tahun', 'Request magic link lalu proses aktivasi Premium melalui API reseller', 'tools', '1 YEAR', 'fa-solid fa-bolt', null, true, 69, '{"provider":"kyzznekoo","serverProxy":true,"features":["magic-link","apply-premium"]}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  badge = excluded.badge,
  icon = excluded.icon,
  is_active = true,
  metadata = excluded.metadata;

notify pgrst, 'reload schema';

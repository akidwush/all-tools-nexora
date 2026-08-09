-- Nexora v6.3.13 HF4 — Crypto Market Scanner
-- Aman dijalankan ulang. Tambahkan COINGECKO_API_KEY hanya di environment Vercel.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'cryptomarket',
    'Crypto Market Scanner',
    'Pantau harga, volume, market cap dan pergerakan crypto',
    'tools',
    'LIVE',
    'fa-solid fa-chart-line',
    null,
    true,
    65,
    '{"provider":"coingecko","fallback":"coinpaprika"}'::jsonb
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

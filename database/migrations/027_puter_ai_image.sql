-- Nexora 6.4 HF25 — register Puter user-pays AI Image.
insert into public.tools (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values (
  'aiimage',
  'Nexora AI Image',
  'Buat gambar AI memakai akun dan allowance Puter milik pengguna',
  'tools',
  'PUTER AI',
  'fa-solid fa-image',
  null,
  true,
  15,
  '{"provider":"puter","billing":"user-pays","apiKeyRequired":false,"privacy":"not-stored"}'::jsonb
)
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

-- Aman dijalankan setelah schema awal maupun migration membership.
alter table public.tools
  add column if not exists access_level text not null default 'free';

insert into public.tools
  (id, name, description, category, badge, icon, external_url,
   is_active, sort_order, metadata, access_level)
values
  (
    'genmail',
    'GenMail',
    'Buat email sementara, periksa inbox, dan baca pesan dengan aman',
    'tools',
    'TEMP MAIL',
    'fa-solid fa-envelope-open-text',
    null,
    true,
    18,
    '{"provider":"kuroneko","serverProxy":true,"apiKeyRequired":true,"polling":"manual"}'::jsonb,
    'free'
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
  access_level = excluded.access_level,
  updated_at = now();

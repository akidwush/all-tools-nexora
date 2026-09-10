-- Nexora Anime Discover — public SFW visual discovery without database image storage.
-- Safe to run repeatedly. Only the public tool catalogue row is registered.
alter table public.tools
  add column if not exists access_level text not null default 'free';

insert into public.tools
  (id, name, description, category, badge, icon, external_url,
   is_active, sort_order, metadata, access_level)
values
  (
    'animegallery',
    'Nexora Anime Discover',
    'Visual discovery anime, artist, source, dan reaction GIF dari Waifu.im + NEKOSBEST',
    'tools',
    'NEW · SFW',
    'fa-regular fa-images',
    null,
    true,
    19,
    '{"providers":["waifu-im","nekosbest"],"apiKeyRequired":false,"sfwDefault":true,"serverProxy":["nekosbest"],"route":"/anime-gallery","storage":"local-only"}'::jsonb,
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

-- Nexora v6.1 — Social media links managed from the admin dashboard.
-- Jalankan setelah migration 005_visual_runtime_validation.sql. Aman dijalankan ulang.

create table if not exists public.social_links (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  platform text not null check (char_length(platform) between 2 and 40),
  label text not null check (char_length(label) between 2 and 80),
  description text not null default '' check (char_length(description) <= 240),
  url text not null default '' check (char_length(url) <= 500),
  icon text not null default 'fa-solid fa-link' check (char_length(icon) <= 100),
  accent_color text not null default '#a855f7' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default false,
  sort_order integer not null default 0 check (sort_order between -10000 and 10000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_links enable row level security;

drop policy if exists "public read active social links" on public.social_links;
create policy "public read active social links" on public.social_links
  for select to anon using (is_active = true and url <> '');

drop trigger if exists social_links_set_updated_at on public.social_links;
create trigger social_links_set_updated_at
before update on public.social_links
for each row execute function public.set_updated_at();

create index if not exists social_links_active_sort_idx
  on public.social_links (is_active, sort_order, label);

grant select, insert, update, delete on table public.social_links to service_role;

-- Nilai aktif di bawah memindahkan link lama dari HTML/JavaScript ke database.
-- Baris nonaktif disiapkan agar admin tinggal mengisi URL dan mengaktifkannya.
insert into public.social_links
  (key, platform, label, description, url, icon, accent_color, is_active, sort_order, metadata)
values
  ('whatsapp_channel', 'whatsapp', 'Gabung Saluran WhatsApp', 'Ikuti update fitur, project baru, dan informasi All Tools Nexora.', 'https://whatsapp.com/channel/0029Vb7yYjE8PgsKrQ5ghQ3s', 'fa-brands fa-whatsapp', '#25d366', true, 10, '{"usage":["menu","access","notification"]}'::jsonb),
  ('whatsapp_access', 'whatsapp', 'Minta Akses', 'Hubungi developer untuk meminta akses tools.', 'https://wa.me/6285196639720', 'fa-brands fa-whatsapp', '#25d366', true, 20, '{"usage":["access"]}'::jsonb),
  ('instagram', 'instagram', 'Instagram Nexora', 'Lihat karya dan update terbaru Nexora.', '', 'fa-brands fa-instagram', '#e1306c', false, 30, '{}'::jsonb),
  ('tiktok', 'tiktok', 'TikTok Nexora', 'Ikuti konten video Nexora.', '', 'fa-brands fa-tiktok', '#25f4ee', false, 40, '{}'::jsonb),
  ('youtube', 'youtube', 'YouTube Nexora', 'Tonton video dan tutorial Nexora.', '', 'fa-brands fa-youtube', '#ff0000', false, 50, '{}'::jsonb),
  ('facebook', 'facebook', 'Facebook Nexora', 'Ikuti halaman Facebook Nexora.', '', 'fa-brands fa-facebook', '#1877f2', false, 60, '{}'::jsonb),
  ('telegram', 'telegram', 'Telegram Nexora', 'Gabung ke komunitas Telegram Nexora.', '', 'fa-brands fa-telegram', '#229ed9', false, 70, '{}'::jsonb),
  ('discord', 'discord', 'Discord Nexora', 'Gabung ke server Discord Nexora.', '', 'fa-brands fa-discord', '#5865f2', false, 80, '{}'::jsonb),
  ('github', 'github', 'GitHub Nexora', 'Lihat project open source Nexora.', '', 'fa-brands fa-github', '#8b5cf6', false, 90, '{}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

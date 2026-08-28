-- Nexora v5.0 — Login dan dashboard admin
-- Jalankan setelah migration v4.2. Aman dijalankan ulang.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('super_admin', 'admin', 'viewer')),
  display_name text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Admin hanya diakses oleh API server-side. Tidak ada policy anon/authenticated.
drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create index if not exists admin_users_active_role_idx
  on public.admin_users (is_active, role);

-- Izinkan backend elevated key mengelola tabel yang dibutuhkan.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.admin_users to service_role;
grant select, insert, update, delete on table public.tools to service_role;
grant select, insert, update, delete on table public.feedback to service_role;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert, update, delete on table public.tool_health to service_role;
grant execute on function public.set_updated_at() to service_role;

-- Katalog awal. Data yang telah diedit admin tidak ditimpa saat migration dijalankan ulang.
insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  ('terabox', 'Terabox Downloader', 'Ambil file dari link share Terabox', 'downloader', 'FILE', 'fa-solid fa-box-open', null, true, 0, '{}'::jsonb),
  ('instagram', 'Instagram', 'Download video & foto', 'downloader', 'HD', 'fa-brands fa-instagram', null, true, 10, '{}'::jsonb),
  ('tiktok', 'TikTok', 'Video, foto & audio', 'downloader', 'MP4/MP3/JPG', 'fa-brands fa-tiktok', null, true, 20, '{}'::jsonb),
  ('youtube', 'YouTube', 'Video & audio', 'downloader', 'MP4/MP3', 'fa-brands fa-youtube', null, true, 30, '{}'::jsonb),
  ('spotify', 'Spotify Downloader', 'Cari lagu, preview audio dan unduh Spotify ke MP3', 'downloader', 'MP3', 'fa-brands fa-spotify', null, true, 40, '{}'::jsonb),
  ('fakebankjago', 'Fake Bank Jago', 'Generator visual saldo Bank Jago', 'maker', 'SIMULASI', 'fa-solid fa-building-columns', null, true, 0, '{}'::jsonb),
  ('brat', 'BRAT Generator', 'Static + animated GIF', 'maker', 'GIF', 'fa-solid fa-wand-magic-sparkles', null, true, 10, '{}'::jsonb),
  ('iqc', 'IQC Generator', 'Buat gambar IQC — Operator, Image & Dark', 'maker', '3 STYLE', 'fa-solid fa-image', null, true, 20, '{}'::jsonb),
  ('sertifikat', 'Sertifikat Tolol', 'Buat sertifikat parodi dari nama melalui API gambar', 'maker', 'API', 'fa-solid fa-certificate', null, true, 30, '{}'::jsonb),
  ('ektp', 'E-KTP Generator', 'Full form demo', 'maker', 'Full', 'fa-solid fa-id-card', null, true, 40, '{}'::jsonb),
  ('fakedana', 'Fake Dana', 'Generate saldo Dana palsu', 'maker', 'Custom', 'fa-solid fa-money-bill-wave', null, true, 50, '{}'::jsonb),
  ('fakedev', 'FakeDev', 'Buat profil developer dari nama, bio, dan foto', 'maker', 'API', 'fa-solid fa-laptop-code', null, true, 60, '{}'::jsonb),
  ('fakelobby', 'Fake Lobby', 'FF & ML lobby palsu', 'maker', 'Game', 'fa-solid fa-gamepad', null, true, 70, '{}'::jsonb),
  ('winquotes', 'Windows Quotes', 'Quote ala Windows — 2 style', 'maker', '2 STYLE', 'fa-brands fa-windows', null, true, 80, '{}'::jsonb),
  ('nokiamsg', 'Nokia Message', 'Buat gambar SMS jadul Nokia', 'maker', 'RETRO', 'fa-solid fa-mobile-retro', null, true, 90, '{}'::jsonb),
  ('tanyaustadz', 'Tanya Ustadz', 'Meme generator', 'maker', 'Lucu', 'fa-solid fa-user-tie', null, true, 100, '{}'::jsonb),
  ('mltools', 'ML Tools', 'Script ML, Winrate dan Stalk MLBB', 'tools', 'MLBB', 'fa-solid fa-gamepad', null, true, 0, '{}'::jsonb),
  ('comicreader', 'Baca Komik Full', 'Manga, manhwa, manhua + reader', 'tools', 'FULL', 'fa-solid fa-book-open-reader', null, true, 10, '{}'::jsonb),
  ('promptgenerate', 'Nexora Prompt Generator', 'Ubah gambar menjadi prompt deskriptif', 'tools', 'LOCAL', 'fa-solid fa-wand-magic-sparkles', null, true, 20, '{}'::jsonb),
  ('fakeovo', 'Fake OVO', 'Generator tampilan saldo OVO', 'tools', 'CANVAS', 'fa-solid fa-wallet', null, true, 30, '{}'::jsonb),
  ('quotegenerator', 'Quote Generator', 'Buat gambar quote monokrom', 'tools', 'JPG', 'fa-solid fa-quote-left', null, true, 40, '{}'::jsonb),
  ('carifakta', 'CariFakta', 'Analisis klaim dan berita menggunakan AI', 'tools', 'AI', 'fa-solid fa-magnifying-glass-chart', null, true, 50, '{}'::jsonb),
  ('virusscan', 'Virus Scan', 'Scan URL, file, hash, domain & IP', 'tools', 'SECURITY', 'fa-solid fa-shield-virus', null, true, 60, '{}'::jsonb),
  ('calc', 'Calculator', 'Hitung cepat', 'tools', 'Math', 'fa-solid fa-calculator', null, true, 70, '{}'::jsonb),
  ('pwgen', 'Password Gen', 'Password aman', 'tools', 'Secure', 'fa-solid fa-key', null, true, 80, '{}'::jsonb),
  ('morse', 'Morse Code', 'Konversi morse', 'tools', 'Audio', 'fa-solid fa-tower-broadcast', null, true, 90, '{}'::jsonb),
  ('removebg', 'Remove BG', 'Hapus background', 'tools', 'AI', 'fa-solid fa-eraser', null, true, 100, '{}'::jsonb),
  ('enhancer', 'Image Enhancer', 'Tingkatkan kualitas', 'tools', 'HD', 'fa-solid fa-magic', null, true, 110, '{}'::jsonb),
  ('ttquote', 'Quote TikTok Nexora', 'Buat fake TikTok chat versi Nexora', 'vault', 'NEXORA', 'fa-brands fa-tiktok', null, true, 0, '{}'::jsonb),
  ('qrgen', 'QR Generator', 'Buat QR langsung di sini', 'vault', 'QR', 'fa-solid fa-qrcode', null, true, 10, '{}'::jsonb),
  ('tiktokhd', 'Upload TikTok HD', 'Proses MP4 HD + TikTok Studio', 'external', 'HD', 'fa-brands fa-tiktok', null, true, 0, '{}'::jsonb),
  ('getcode', 'Get Code HTML', 'Extract, preview, copy & download source', 'external', 'PRO', 'fa-solid fa-code', null, true, 10, '{}'::jsonb),
  ('vdeploy', 'Deploy & Update Web', 'Deploy Vercel atau Netlify + update project', 'external', 'UPDATE', 'fa-solid fa-rocket', null, true, 20, '{}'::jsonb),
  ('zxvai', 'ZxVAI', 'AI tools & APK', 'external', null, 'fa-solid fa-robot', 'https://zxvaiapk.netlify.app/', true, 30, '{}'::jsonb),
  ('fotolink', 'Foto To Link', 'Upload & share', 'external', null, 'fa-solid fa-image', 'https://pixvault-bykz.netlify.app/', true, 40, '{}'::jsonb),
  ('webencryption', 'Web Encryption', 'Encrypt & protect HTML', 'external', 'SECURE', 'fa-solid fa-shield-halved', null, true, 50, '{}'::jsonb),
  ('unbanwa', 'Unban WhatsApp', 'Tools & panduan unban WhatsApp', 'external', 'WA', 'fa-brands fa-whatsapp', null, true, 60, '{}'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- Jalankan sekali melalui Supabase SQL Editor.
-- Aman dijalankan ulang: tabel, index, policy, dan trigger menggunakan bentuk idempotent.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 40),
  category text not null check (category in ('bug', 'suggestion', 'idea', 'other')),
  message text not null check (char_length(message) between 5 and 1000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'rejected')),
  source text not null default 'website',
  ip_hash text,
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.tools (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null,
  badge text,
  icon text,
  external_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
alter table public.app_settings enable row level security;
alter table public.tools enable row level security;

-- Browser hanya boleh membaca settings publik dan daftar tools aktif.
drop policy if exists "public read app settings" on public.app_settings;
create policy "public read app settings" on public.app_settings
  for select to anon using (is_public = true);

drop policy if exists "public read active tools" on public.tools;
create policy "public read active tools" on public.tools
  for select to anon using (is_active = true);

-- Feedback ditulis melalui /api/feedback memakai service role server-side.
-- Sengaja tidak ada policy insert anon agar validasi endpoint tidak dapat dilewati.

drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at
before update on public.feedback
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists tools_set_updated_at on public.tools;
create trigger tools_set_updated_at
before update on public.tools
for each row execute function public.set_updated_at();

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists tools_active_sort_idx on public.tools (is_active, sort_order, name);

insert into public.app_settings (key, value, is_public)
values ('site', '{"name":"All Tools Nexora","developer":"Dika","heroVideo":{"enabled":true,"url":"https://files.catbox.moe/4ijdle.mp4"}}'::jsonb, true)
on conflict (key) do nothing;

-- ============================================================
-- Nexora v4.2 — Tool health monitoring
-- ============================================================
create table if not exists public.tool_health (
  tool_id text primary key,
  tool_name text not null,
  category text not null default 'tools',
  status text not null default 'unknown' check (status in ('operational', 'degraded', 'offline', 'unknown')),
  target_type text not null default 'module',
  health_url text,
  http_status integer,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  success_rate numeric(5,2) not null default 0 check (success_rate between 0 and 100),
  total_checks bigint not null default 0 check (total_checks >= 0),
  successful_checks bigint not null default 0 check (successful_checks >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tool_health enable row level security;

drop trigger if exists tool_health_set_updated_at on public.tool_health;
create trigger tool_health_set_updated_at
before update on public.tool_health
for each row execute function public.set_updated_at();

create index if not exists tool_health_status_idx
  on public.tool_health (status, last_checked_at desc);
create index if not exists tool_health_checked_idx
  on public.tool_health (last_checked_at desc);


-- ============================================================
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
  ('sertifikat', 'Sertifikat Custom', 'Buat sertifikat custom melalui API atau renderer lokal', 'maker', 'PNG', 'fa-solid fa-certificate', null, true, 30, '{}'::jsonb),
  ('ektp', 'E-KTP Generator', 'Full form demo', 'maker', 'Full', 'fa-solid fa-id-card', null, true, 40, '{}'::jsonb),
  ('fakedana', 'Fake Dana', 'Generate saldo Dana palsu', 'maker', 'Custom', 'fa-solid fa-money-bill-wave', null, true, 50, '{}'::jsonb),
  ('fakedev', 'FakeDev', 'Buat profil developer dari nama, bio, dan foto', 'maker', 'API', 'fa-solid fa-laptop-code', null, true, 60, '{}'::jsonb),
  ('fakelobby', 'Fake Lobby', 'FF & ML lobby palsu', 'maker', 'Game', 'fa-solid fa-gamepad', null, true, 70, '{}'::jsonb),
  ('winquotes', 'Windows Quotes', 'Quote ala Windows — 2 style', 'maker', '2 STYLE', 'fa-brands fa-windows', null, true, 80, '{}'::jsonb),
  ('nokiamsg', 'Nokia Message', 'Buat gambar SMS jadul Nokia', 'maker', 'RETRO', 'fa-solid fa-mobile-retro', null, true, 90, '{}'::jsonb),
  ('tanyaustadz', 'Tanya Ustadz', 'Meme generator', 'maker', 'Lucu', 'fa-solid fa-user-tie', null, true, 100, '{}'::jsonb),
  ('mltools', 'ML Tools', 'Script ML, Winrate dan Stalk MLBB', 'tools', 'MLBB', 'fa-solid fa-gamepad', null, true, 0, '{}'::jsonb),
  ('comicreader', 'Baca Komik Full', 'Manga, manhwa, manhua + reader', 'tools', 'FULL', 'fa-solid fa-book-open-reader', null, true, 10, '{}'::jsonb),
  ('promptgenerate', 'Prompt Generator', 'Analisis gambar dengan Gemini Vision menjadi prompt produksi profesional', 'tools', 'VISION AI', 'fa-solid fa-wand-magic-sparkles', null, true, 20, '{"provider":"gemini","privacy":"not-stored","targets":["midjourney","flux","stable-diffusion","ideogram","video"]}'::jsonb),
  ('fakeovo', 'Fake OVO', 'Generator tampilan saldo OVO', 'tools', 'CANVAS', 'fa-solid fa-wallet', null, true, 30, '{}'::jsonb),
  ('quotegenerator', 'Quote Generator', 'Buat gambar quote monokrom', 'tools', 'JPG', 'fa-solid fa-quote-left', null, true, 40, '{}'::jsonb),
  ('carifakta', 'CariFakta', 'Analisis klaim dan berita menggunakan AI', 'tools', 'AI', 'fa-solid fa-magnifying-glass-chart', null, true, 50, '{}'::jsonb),
  ('virusscan', 'Virus Scan', 'Scan URL, file, hash, domain & IP', 'tools', 'SECURITY', 'fa-solid fa-shield-virus', null, true, 60, '{}'::jsonb),
  ('cryptomarket', 'Crypto Market Scanner', 'Analisis crypto 15m, 1 jam, mikro, makro, indikator teknikal dan risiko', 'tools', 'MTF LIVE', 'fa-solid fa-chart-line', null, true, 65, '{"provider":"coingecko","fallback":"coinpaprika","candles":"binance-spot","timeframes":["15m","1h","1d"]}'::jsonb),
  ('webintel', 'Nexora Web Intelligence', 'Audit SEO, security, performa, aksesibilitas dan teknologi website', 'tools', 'INTEL', 'fa-solid fa-satellite-dish', null, true, 67, '{"engine":"nexora","deepProvider":"google-pagespeed"}'::jsonb),
  ('ipintel', 'IP & ASN Intelligence', 'Lookup IPv4/IPv6, ASN, organisasi, domain, negara dan benua via IPinfo Lite', 'tools', 'IPINFO', 'fa-solid fa-network-wired', null, true, 67, '{"provider":"ipinfo-lite","serverKey":true,"features":["ipv4","ipv6","asn","country","continent","bogon"]}'::jsonb),
  ('bmkg', 'BMKG Indonesia', 'Gempa terkini, prakiraan cuaca 3 hari dan peringatan dini cuaca dari Open Data BMKG', 'tools', 'BMKG', 'fa-solid fa-cloud-sun-rain', null, true, 66, '{"provider":"bmkg-open-data","apiKeyRequired":false,"attribution":"Sumber: BMKG","features":["earthquake","weather","nowcast"]}'::jsonb),
  ('spaceexplorer', 'Space Explorer', 'APOD, galeri Mars, asteroid dekat Bumi dan cuaca antariksa NASA', 'tools', 'NASA', 'fa-solid fa-user-astronaut', null, true, 68, '{"provider":"nasa","marsSource":"nasa-image-library"}'::jsonb),
  ('ocrintel', 'Nexora OCR Intelligence', 'Ekstrak teks dari gambar dan PDF, analisis dokumen, lalu buat searchable PDF', 'tools', 'OCR', 'fa-solid fa-file-lines', null, true, 69, '{"provider":"ocr-space","maxFreeBytes":1048576,"maxFreePdfPages":3}'::jsonb),
  ('documentai', 'Nexora Document AI', 'Ringkas, analisis, ekstrak tabel, dan tanya isi dokumen dengan Gemini', 'tools', 'VVIP', 'fa-solid fa-file-waveform', null, true, 69, '{"provider":"gemini","serverKey":true,"privacy":"not-stored","features":["summary","deep-analysis","study-notes","table-extraction","document-qa","exports"]}'::jsonb),
  ('svgalight', 'SVG → Alight XML', 'Konversi SVG ke XML Alight Motion dengan AM Optimized, Maximum Fidelity, dan audit kesamaan', 'tools', 'ENGINE v1.8', 'fa-solid fa-wand-magic-sparkles', null, true, 68, '{"provider":"svgtoxml","engine":"v1.8","serverProxy":true,"features":["am-optimized","maximum-fidelity","fidelity-audit","micro-detail","layer-limit","copy-download"]}'::jsonb),
  ('alightpremium', 'Alight Motion Premium 1 Tahun', 'Request magic link lalu proses aktivasi Premium melalui API reseller', 'tools', '1 YEAR', 'fa-solid fa-bolt', null, true, 69, '{"provider":"kyzznekoo","serverProxy":true,"features":["magic-link","apply-premium"]}'::jsonb),
  ('imagevectorizer', 'Nexora Image Vectorizer', 'Ubah PNG atau JPG menjadi SVG berkualitas melalui FreeConvert', 'tools', 'SVG', 'fa-solid fa-bezier-curve', null, true, 69, '{"provider":"freeconvert","engine":"image-conversion-api","serverKey":true,"directUpload":true,"features":["png-jpg-to-svg","signed-upload","copy-download"]}'::jsonb),
  ('text2d', '2D Text Animate / Text FX', 'Buat XML animasi teks 2D dengan preset, Style FX, keyframe dan cubic Bezier lokal', 'tools', 'LOCAL XML', 'fa-solid fa-font', null, true, 70, '{"engine":"flamo-local","auth":false,"features":["native-presets","style-fx","palette-15","history","download-all"]}'::jsonb),
  ('text3d', '3D Text Animate', 'Buat XML teks 3D, extrude, offset, popup, flip dan long shadow', 'tools', '7 PRESET', 'fa-solid fa-cube', null, true, 71, '{"engine":"flamo-local","auth":false,"presets":7}'::jsonb),
  ('textfxanimation', 'Text FX Animation', 'Template efek teks native dengan mode karakter dan kata', 'tools', '5 PRESET', 'fa-solid fa-wand-magic-sparkles', null, true, 72, '{"engine":"flamo-local","auth":false,"presets":5}'::jsonb),
  ('textvector', 'Text to Vector', 'Ubah font lokal menjadi path vector Alight Motion dengan OpenType di Web Worker', 'tools', 'OPENTYPE', 'fa-solid fa-draw-polygon', null, true, 73, '{"engine":"opentype-local","auth":false,"worker":true,"networkFonts":false}'::jsonb),
  ('trimpath', 'Trimpath Generator', 'Generator trimpath huruf dengan style, timing, mask dan color mapping', 'tools', 'LOCAL XML', 'fa-solid fa-route', null, true, 74, '{"engine":"flamo-local","auth":false,"styles":8}'::jsonb),
  ('logoanimate', 'Logo Animate', 'Template XML animasi logo dengan hierarki efek dan text block lokal', 'tools', '8.33S', 'fa-solid fa-shapes', null, true, 75, '{"engine":"flamo-local-template","auth":false,"media":"alight-placeholder"}'::jsonb),
  ('calc', 'Calculator', 'Hitung cepat', 'tools', 'Math', 'fa-solid fa-calculator', null, true, 70, '{}'::jsonb),
  ('pwgen', 'Password Gen', 'Password aman', 'tools', 'Secure', 'fa-solid fa-key', null, true, 80, '{}'::jsonb),
  ('morse', 'Morse Code', 'Konversi morse', 'tools', 'Audio', 'fa-solid fa-tower-broadcast', null, true, 90, '{}'::jsonb),
  ('removebg', 'Remove BG', 'Hapus background', 'tools', 'AI', 'fa-solid fa-eraser', null, true, 100, '{}'::jsonb),
  ('enhancer', 'Image Enhancer', 'Tingkatkan kualitas', 'tools', 'HD', 'fa-solid fa-magic', null, true, 110, '{}'::jsonb),
  ('ttquote', 'Quote TikTok Nexus', 'Buat fake TikTok chat versi Nexus', 'vault', 'NEXUS', 'fa-brands fa-tiktok', null, true, 0, '{}'::jsonb),
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

-- Nexora v6.1 — Social media links managed from the admin dashboard.
-- Nilai yang pernah diedit admin tidak ditimpa saat schema dijalankan ulang.

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

-- Nexora v5.1 — Analytics, feedback management, dan audit log
-- Jalankan setelah migration 003_admin_dashboard.sql. Aman dijalankan ulang.

alter table public.feedback
  add column if not exists internal_note text,
  add column if not exists admin_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists replied_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists feedback_updated_at_idx
  on public.feedback (updated_at desc);
create index if not exists feedback_category_status_idx
  on public.feedback (category, status, created_at desc);

create table if not exists public.tool_usage_events (
  id bigint generated by default as identity primary key,
  tool_id text,
  event_type text not null check (event_type in ('page_view', 'tool_open', 'external_open', 'tool_error')),
  visitor_hash text not null,
  session_hash text,
  path text not null default '/',
  referrer_host text,
  country_code text,
  device_type text,
  browser text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.tool_usage_events enable row level security;

create index if not exists tool_usage_events_time_idx
  on public.tool_usage_events (occurred_at desc);
create index if not exists tool_usage_events_tool_time_idx
  on public.tool_usage_events (tool_id, occurred_at desc);
create index if not exists tool_usage_events_visitor_time_idx
  on public.tool_usage_events (visitor_hash, occurred_at desc);
create index if not exists tool_usage_events_type_time_idx
  on public.tool_usage_events (event_type, occurred_at desc);

create table if not exists public.admin_audit_logs (
  id bigint generated by default as identity primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (admin_user_id, created_at desc);
create index if not exists admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.admin_analytics_summary(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bounds as (
  select greatest(1, least(coalesce(p_days, 30), 90))::integer as days,
         date_trunc('day', now()) as today_start
),
filtered as (
  select e.*
  from public.tool_usage_events e, bounds b
  where e.occurred_at >= b.today_start - ((b.days - 1) * interval '1 day')
),
series as (
  select generate_series(
    (select today_start - ((days - 1) * interval '1 day') from bounds),
    (select today_start from bounds),
    interval '1 day'
  ) as day
),
daily as (
  select s.day,
         count(f.id) filter (where f.event_type = 'page_view')::bigint as page_views,
         count(f.id) filter (where f.event_type in ('tool_open','external_open'))::bigint as tool_opens,
         count(distinct f.visitor_hash)::bigint as unique_visitors,
         count(f.id) filter (where f.event_type = 'tool_error')::bigint as errors
  from series s
  left join filtered f
    on f.occurred_at >= s.day and f.occurred_at < s.day + interval '1 day'
  group by s.day
  order by s.day
),
top_tools as (
  select coalesce(f.tool_id, 'unknown') as tool_id,
         coalesce(t.name, f.tool_id, 'Unknown') as name,
         count(*) filter (where f.event_type in ('tool_open','external_open'))::bigint as opens,
         count(distinct f.visitor_hash)::bigint as unique_visitors,
         count(*) filter (where f.event_type = 'tool_error')::bigint as errors
  from filtered f
  left join public.tools t on t.id = f.tool_id
  where f.event_type in ('tool_open','external_open','tool_error')
    and f.tool_id is not null
  group by coalesce(f.tool_id, 'unknown'), coalesce(t.name, f.tool_id, 'Unknown')
  order by count(*) filter (where f.event_type in ('tool_open','external_open')) desc, name asc
  limit 12
),
by_type as (
  select event_type, count(*)::bigint as total
  from filtered
  group by event_type
),
totals as (
  select
    count(*) filter (where event_type = 'page_view')::bigint as page_views,
    count(*) filter (where event_type in ('tool_open','external_open'))::bigint as tool_opens,
    count(*) filter (where event_type = 'tool_error')::bigint as errors,
    count(distinct visitor_hash)::bigint as unique_visitors,
    count(*) filter (
      where occurred_at >= (select today_start from bounds)
        and event_type in ('tool_open','external_open')
    )::bigint as tool_opens_today
  from filtered
)
select jsonb_build_object(
  'days', (select days from bounds),
  'generatedAt', now(),
  'totals', jsonb_build_object(
    'pageViews', coalesce((select page_views from totals), 0),
    'toolOpens', coalesce((select tool_opens from totals), 0),
    'toolOpensToday', coalesce((select tool_opens_today from totals), 0),
    'uniqueVisitors', coalesce((select unique_visitors from totals), 0),
    'errors', coalesce((select errors from totals), 0)
  ),
  'daily', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', to_char(day, 'YYYY-MM-DD'),
      'pageViews', page_views,
      'toolOpens', tool_opens,
      'uniqueVisitors', unique_visitors,
      'errors', errors
    ) order by day)
    from daily
  ), '[]'::jsonb),
  'topTools', coalesce((
    select jsonb_agg(jsonb_build_object(
      'toolId', tool_id,
      'name', name,
      'opens', opens,
      'uniqueVisitors', unique_visitors,
      'errors', errors
    ) order by opens desc, name asc)
    from top_tools
  ), '[]'::jsonb),
  'eventTypes', coalesce((
    select jsonb_object_agg(event_type, total)
    from by_type
  ), '{}'::jsonb)
);
$$;

revoke all on function public.admin_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.admin_analytics_summary(integer) to service_role;

grant usage on schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select, insert, update, delete on table public.feedback to service_role;
grant select, insert, update, delete on table public.tool_usage_events to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;
grant select on table public.tools to service_role;

notify pgrst, 'reload schema';
-- Nexora v6.0 — Runtime JavaScript test, screenshot, dan visual validation
-- Jalankan setelah migration 004_analytics_feedback_audit.sql. Aman dijalankan ulang.

create table if not exists public.visual_baselines (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  viewport text not null check (viewport in ('mobile', 'tablet', 'desktop')),
  width integer not null check (width between 240 and 2560),
  height integer not null check (height between 320 and 2000),
  fingerprint text not null,
  screenshot_hash text not null,
  threshold_percent numeric(5,2) not null default 8 check (threshold_percent between 0.5 and 40),
  thumbnail_data_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route, viewport)
);

alter table public.visual_baselines enable row level security;

drop trigger if exists visual_baselines_set_updated_at on public.visual_baselines;
create trigger visual_baselines_set_updated_at
before update on public.visual_baselines
for each row execute function public.set_updated_at();

create table if not exists public.visual_test_runs (
  id bigint generated by default as identity primary key,
  route text not null,
  viewport text not null check (viewport in ('mobile', 'tablet', 'desktop')),
  status text not null check (status in ('pass', 'warning', 'fail', 'error')),
  runtime_errors integer not null default 0 check (runtime_errors >= 0),
  resource_errors integer not null default 0 check (resource_errors >= 0),
  console_errors integer not null default 0 check (console_errors >= 0),
  warnings integer not null default 0 check (warnings >= 0),
  difference_percent numeric(6,2),
  screenshot_hash text,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  report jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.visual_test_runs enable row level security;

create index if not exists visual_baselines_target_idx
  on public.visual_baselines (route, viewport);
create index if not exists visual_test_runs_target_time_idx
  on public.visual_test_runs (route, viewport, created_at desc);
create index if not exists visual_test_runs_status_time_idx
  on public.visual_test_runs (status, created_at desc);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.visual_baselines to service_role;
grant select, insert, update, delete on table public.visual_test_runs to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

-- ============================================================
-- Nexora v6.3.18 — Personal AI / Gemini settings
create table if not exists public.ai_settings (
  id text primary key check (id = 'primary'),
  enabled boolean not null default true,
  assistant_name text not null default 'Nexora AI' check (char_length(assistant_name) between 1 and 80),
  avatar_url text not null default '' check (char_length(avatar_url) <= 1000),
  tagline text not null default '' check (char_length(tagline) <= 140),
  welcome_message text not null default '' check (char_length(welcome_message) <= 1000),
  system_instruction text not null default '' check (char_length(system_instruction) <= 8000),
  primary_task text not null default '' check (char_length(primary_task) <= 1500),
  language_style text not null default '' check (char_length(language_style) <= 1000),
  primary_language text not null default 'Bahasa Indonesia' check (char_length(primary_language) <= 60),
  friendliness smallint not null default 75 check (friendliness between 0 and 100),
  response_length text not null default 'balanced' check (response_length in ('short','balanced','detailed')),
  temperature numeric(3,2) not null default 0.65 check (temperature between 0 and 2),
  max_output_tokens integer not null default 1200 check (max_output_tokens between 128 and 8192),
  model text not null default 'gemini-3.6-flash' check (model in ('gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash')),
  suggested_prompts jsonb not null default '[]'::jsonb check (jsonb_typeof(suggested_prompts) = 'array'),
  disabled_message text not null default '' check (char_length(disabled_message) <= 300),
  error_message text not null default '' check (char_length(error_message) <= 300),
  accent_color text not null default '#b98cff' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  launcher_position text not null default 'right' check (launcher_position in ('left','right')),
  website_context text not null default '' check (char_length(website_context) <= 12000),
  blocked_topics jsonb not null default '[]'::jsonb check (jsonb_typeof(blocked_topics) = 'array'),
  draft_data jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_data) = 'object'),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
drop trigger if exists ai_settings_set_updated_at on public.ai_settings;
create trigger ai_settings_set_updated_at before update on public.ai_settings for each row execute function public.set_updated_at();
drop policy if exists ai_settings_admin_select on public.ai_settings;
create policy ai_settings_admin_select on public.ai_settings for select to authenticated using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));
drop policy if exists ai_settings_admin_insert on public.ai_settings;
create policy ai_settings_admin_insert on public.ai_settings for insert to authenticated with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin')));
drop policy if exists ai_settings_admin_update on public.ai_settings;
create policy ai_settings_admin_update on public.ai_settings for update to authenticated using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin'))) with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin')));
revoke all on table public.ai_settings from anon;
grant select, insert, update on table public.ai_settings to authenticated;
grant select, insert, update, delete on table public.ai_settings to service_role;
insert into public.ai_settings (id, published_at) values ('primary', now()) on conflict (id) do nothing;
notify pgrst, 'reload schema';

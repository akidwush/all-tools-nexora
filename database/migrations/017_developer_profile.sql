-- Nexora v6.3.18 Step 3 — profil developer publik yang dikelola admin.
-- Idempotent: aman dijalankan ulang melalui Supabase SQL Editor.
create table if not exists public.developer_profiles (
  id text primary key check (id = 'primary'),
  data jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.developer_profiles enable row level security;

drop trigger if exists developer_profiles_set_updated_at on public.developer_profiles;
create trigger developer_profiles_set_updated_at
before update on public.developer_profiles
for each row execute function public.set_updated_at();

create index if not exists developer_profiles_published_idx
  on public.developer_profiles (is_published, updated_at desc);

-- Tidak ada policy anon/authenticated: pembacaan publik selalu lewat endpoint
-- server yang hanya memilih profil published; mutasi selalu diverifikasi admin.
grant select, insert, update, delete on table public.developer_profiles to service_role;

insert into public.developer_profiles (id, is_published, data)
values ('primary', true, jsonb_build_object(
  'name', 'Dika',
  'label', 'All Tools Nexora',
  'role', 'Web Developer',
  'headline', 'Developer Dika',
  'bio', 'Membangun kumpulan tools web yang praktis, ringan, dan nyaman dipakai dari HP.',
  'avatarUrl', '',
  'avatarAlt', 'Avatar Developer Dika',
  'statusOnline', true,
  'statusLabel', 'System online',
  'footer', '© 2026 All Tools Nexora · Developer Dika',
  'skills', jsonb_build_array(
    jsonb_build_object('id','frontend','icon','fa-solid fa-window-maximize','title','Frontend','description','Tampilan responsif, interaksi tools, dan pengalaman mobile-first.','isVisible',true,'sortOrder',10),
    jsonb_build_object('id','api','icon','fa-solid fa-plug','title','API Integration','description','Integrasi layanan eksternal melalui jalur yang lebih terkontrol dan mudah dirawat.','isVisible',true,'sortOrder',20),
    jsonb_build_object('id','database','icon','fa-solid fa-database','title','Database Ready','description','Fondasi Supabase untuk katalog, pengaturan aplikasi, dan laporan pengguna.','isVisible',true,'sortOrder',30)
  ),
  'projects', '[]'::jsonb,
  'socials', '[]'::jsonb
)) on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- Nexora v6.3.16 — Big Image menggunakan Bigjpg API dan storage privat sementara.
-- Jalankan sekali melalui Supabase SQL Editor. Aman dijalankan ulang.

create table if not exists public.big_image_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_task_id text not null unique check (provider_task_id ~ '^[A-Za-z0-9_-]{6,160}$'),
  client_hash text not null check (char_length(client_hash) between 32 and 128),
  source_path text,
  source_kind text not null check (source_kind in ('upload', 'url')),
  file_name text not null default 'big-image.jpg' check (char_length(file_name) between 1 and 120),
  style text not null check (style in ('art', 'photo')),
  noise text not null check (noise in ('-1', '0', '1', '2', '3')),
  scale_code text not null check (scale_code in ('1', '2', '3', '4')),
  status text not null default 'processing' check (status in ('processing', 'success', 'failed', 'expired')),
  output_url text,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.big_image_jobs enable row level security;

create index if not exists big_image_jobs_created_idx
  on public.big_image_jobs (created_at desc);
create index if not exists big_image_jobs_client_created_idx
  on public.big_image_jobs (client_hash, created_at desc);
create index if not exists big_image_jobs_cleanup_idx
  on public.big_image_jobs (created_at asc)
  where source_path is not null;

drop trigger if exists big_image_jobs_set_updated_at on public.big_image_jobs;
create trigger big_image_jobs_set_updated_at
before update on public.big_image_jobs
for each row execute function public.set_updated_at();

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.big_image_jobs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'big-image-inputs',
  'big-image-inputs',
  false,
  4000000,
  array['image/png', 'image/jpeg']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata)
values
  (
    'bigimage',
    'Big Image',
    'Upscale gambar 2×–16× dengan Bigjpg AI, reduksi noise, dan perbandingan sebelum/sesudah',
    'tools',
    'BIGJPG AI',
    'fa-solid fa-up-right-and-down-left-from-center',
    null,
    true,
    70,
    '{"provider":"bigjpg","serverKey":true,"privateTemporaryUpload":true,"features":["2x-4x-8x-16x","art-photo","noise-reduction","before-after"]}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  badge = excluded.badge,
  icon = excluded.icon,
  external_url = excluded.external_url,
  is_active = true,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';

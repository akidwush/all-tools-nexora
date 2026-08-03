-- Jalankan sekali melalui Supabase SQL Editor saat database siap dipakai.
create extension if not exists pgcrypto;

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

-- Feedback ditulis melalui /api/feedback menggunakan service role server-side.
-- Tidak ada policy insert anon agar input tidak dapat melewati validasi endpoint.

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists tools_active_sort_idx on public.tools (is_active, sort_order, name);

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
values ('site', '{"name":"All Tools Nexora","developer":"Dika"}'::jsonb, true)
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

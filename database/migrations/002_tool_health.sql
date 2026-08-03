-- Nexora v4.2 — Tool health monitoring
-- Aman dijalankan ulang melalui Supabase SQL Editor.

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

-- Data dibaca dan ditulis hanya melalui API server-side menggunakan service role.
-- Tidak ada policy anon agar URL dependency dan statistik internal tidak dapat diambil langsung.

drop trigger if exists tool_health_set_updated_at on public.tool_health;
create trigger tool_health_set_updated_at
before update on public.tool_health
for each row execute function public.set_updated_at();

create index if not exists tool_health_status_idx
  on public.tool_health (status, last_checked_at desc);

create index if not exists tool_health_checked_idx
  on public.tool_health (last_checked_at desc);

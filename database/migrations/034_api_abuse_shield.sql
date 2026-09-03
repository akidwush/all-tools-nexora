begin;

-- Durable, privacy-preserving usage windows for Nexora server-backed APIs.
-- bucket_hash is an HMAC generated server-side; raw IP addresses are never stored.
create table if not exists public.api_usage_windows (
  bucket_hash text not null,
  tool_id text not null,
  tier text not null check (tier in ('free','vvip')),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds between 60 and 86400),
  request_count integer not null default 0 check (request_count >= 0),
  last_seen_at timestamptz not null default now(),
  primary key (bucket_hash, tool_id, window_start, window_seconds)
);

create index if not exists api_usage_windows_last_seen_idx
  on public.api_usage_windows(last_seen_at desc);
create index if not exists api_usage_windows_tool_window_idx
  on public.api_usage_windows(tool_id, window_start desc);

alter table public.api_usage_windows enable row level security;
revoke all on table public.api_usage_windows from public, anon, authenticated;
grant select, insert, update, delete on table public.api_usage_windows to service_role;

create or replace function public.nexora_consume_api_quota(
  p_bucket_hash text,
  p_tool_id text,
  p_tier text,
  p_window_seconds integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_start timestamptz;
  v_count integer;
  v_allowed boolean := false;
begin
  if p_bucket_hash is null or length(p_bucket_hash) < 24 or length(p_bucket_hash) > 128 then
    raise exception 'invalid quota bucket' using errcode = '22023';
  end if;
  if p_tool_id is null or p_tool_id !~ '^[a-z0-9][a-z0-9_-]{0,79}$' then
    raise exception 'invalid quota tool' using errcode = '22023';
  end if;
  if p_tier not in ('free','vvip') then
    raise exception 'invalid quota tier' using errcode = '22023';
  end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 or p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid quota limits' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.api_usage_windows(
    bucket_hash, tool_id, tier, window_start, window_seconds, request_count, last_seen_at
  ) values (
    p_bucket_hash, p_tool_id, p_tier, v_start, p_window_seconds, 1, v_now
  )
  on conflict (bucket_hash, tool_id, window_start, window_seconds)
  do update set
    request_count = public.api_usage_windows.request_count + 1,
    tier = excluded.tier,
    last_seen_at = v_now
  where public.api_usage_windows.request_count < p_limit
  returning request_count into v_count;

  if found then
    v_allowed := true;
  else
    select request_count into v_count
    from public.api_usage_windows
    where bucket_hash = p_bucket_hash
      and tool_id = p_tool_id
      and window_start = v_start
      and window_seconds = p_window_seconds;
    v_allowed := false;
  end if;

  -- Opportunistic bounded cleanup. No user data is stored in these rows.
  if random() < 0.01 then
    delete from public.api_usage_windows
    where last_seen_at < v_now - interval '48 hours';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', coalesce(v_count, p_limit),
    'remaining', greatest(0, p_limit - coalesce(v_count, p_limit)),
    'reset_at', v_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

revoke all on function public.nexora_consume_api_quota(text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.nexora_consume_api_quota(text,text,text,integer,integer) to service_role;

comment on table public.api_usage_windows is
  'Nexora API Abuse Shield durable quotas. Stores only server-side HMAC bucket hashes, never raw IP addresses.';
comment on function public.nexora_consume_api_quota(text,text,text,integer,integer) is
  'Atomically consumes one server-backed API quota unit and returns remaining capacity.';

notify pgrst, 'reload schema';
commit;

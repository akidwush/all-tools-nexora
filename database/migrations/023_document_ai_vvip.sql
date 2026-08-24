-- Nexora Document AI VVIP: catalog entry and atomic daily quotas.
-- Run after 022_membership_vvip.sql.

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata, access_level)
values
  (
    'documentai',
    'Nexora Document AI',
    'Ringkas, analisis, ekstrak tabel, dan tanya isi dokumen dengan Gemini',
    'tools',
    'VVIP',
    'fa-solid fa-file-waveform',
    null,
    true,
    69,
    '{"provider":"gemini","serverKey":true,"privacy":"not-stored","limits":{"maxBytes":3000000,"analyzePerDay":20,"questionsPerDay":80},"features":["summary","deep-analysis","study-notes","table-extraction","document-qa","txt-json-word-csv-export"]}'::jsonb,
    'vvip'
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

create table if not exists public.document_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  analyze_count integer not null default 0 check (analyze_count >= 0),
  question_count integer not null default 0 check (question_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists document_ai_usage_date_idx on public.document_ai_usage(usage_date);
alter table public.document_ai_usage enable row level security;
revoke all on table public.document_ai_usage from anon, authenticated;
grant select, insert, update, delete on table public.document_ai_usage to service_role;

create or replace function public.consume_document_ai_quota(
  p_user_id uuid,
  p_action text,
  p_daily_limit integer
)
returns table (
  allowed boolean,
  used_count integer,
  daily_limit integer,
  remaining_count integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_used integer;
begin
  if p_user_id is null or p_action not in ('analyze', 'ask') or p_daily_limit < 1 or p_daily_limit > 10000 then
    raise exception 'invalid document ai quota request' using errcode = '22023';
  end if;

  insert into public.document_ai_usage(user_id, usage_date)
  values(p_user_id, v_date)
  on conflict(user_id, usage_date) do nothing;

  perform 1 from public.document_ai_usage
  where user_id = p_user_id and usage_date = v_date
  for update;

  select case when p_action = 'analyze' then analyze_count else question_count end
  into v_used
  from public.document_ai_usage
  where user_id = p_user_id and usage_date = v_date;

  if v_used < p_daily_limit then
    update public.document_ai_usage set
      analyze_count = analyze_count + case when p_action = 'analyze' then 1 else 0 end,
      question_count = question_count + case when p_action = 'ask' then 1 else 0 end,
      updated_at = now()
    where user_id = p_user_id and usage_date = v_date;
    v_used := v_used + 1;
    allowed := true;
  else
    allowed := false;
  end if;

  used_count := v_used;
  daily_limit := p_daily_limit;
  remaining_count := greatest(0, p_daily_limit - v_used);
  resets_at := ((v_date + 1)::timestamp at time zone 'Asia/Jakarta');
  return next;
end $$;

revoke all on function public.consume_document_ai_quota(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.consume_document_ai_quota(uuid,text,integer) to service_role;

notify pgrst, 'reload schema';

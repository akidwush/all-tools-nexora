-- Nexora Dashboard Layout Manager
-- Atomic bulk reorder for public tool cards. Safe to run repeatedly.

create or replace function public.nexora_reorder_tools(items jsonb)
returns table(id text, sort_order integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'INVALID_TOOL_ORDER';
  end if;
  if jsonb_array_length(items) < 1 or jsonb_array_length(items) > 200 then
    raise exception 'INVALID_TOOL_ORDER_SIZE';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(items) as x(id text, sort_order integer)
    where x.id is null or x.id !~ '^[a-z0-9][a-z0-9_-]{1,79}$'
       or x.sort_order is null or x.sort_order < -10000 or x.sort_order > 10000
  ) then
    raise exception 'INVALID_TOOL_ORDER_ITEM';
  end if;
  if exists (
    select x.id from jsonb_to_recordset(items) as x(id text, sort_order integer)
    group by x.id having count(*) > 1
  ) then
    raise exception 'DUPLICATE_TOOL_ORDER_ID';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(items) as x(id text, sort_order integer)
    left join public.tools t on t.id = x.id
    where t.id is null
  ) then
    raise exception 'UNKNOWN_TOOL_ORDER_ID';
  end if;

  update public.tools as t
  set sort_order = x.sort_order,
      updated_at = now()
  from jsonb_to_recordset(items) as x(id text, sort_order integer)
  where t.id = x.id;

  return query
  select t.id, t.sort_order
  from public.tools t
  join jsonb_to_recordset(items) as x(id text, sort_order integer) on x.id = t.id
  order by t.sort_order asc, t.name asc;
end;
$$;

revoke all on function public.nexora_reorder_tools(jsonb) from public;
revoke all on function public.nexora_reorder_tools(jsonb) from anon;
revoke all on function public.nexora_reorder_tools(jsonb) from authenticated;
grant execute on function public.nexora_reorder_tools(jsonb) to service_role;

comment on function public.nexora_reorder_tools(jsonb) is
'Atomic server-only reorder for Nexora public dashboard cards. Called by /api/admin/tools after admin + CSRF authorization.';

-- World Classics: request-driven caches, owner-scoped reading data and durable quotas.
begin;
create table if not exists public.world_classics_cache (
 id uuid primary key default gen_random_uuid(), source text not null check(source in ('china','japan','korea')),
 page_title text not null check(length(page_title) between 1 and 300), content jsonb not null,
 content_type text not null check(content_type in ('search','page','chapters','metadata')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), expires_at timestamptz not null,
 unique(source,page_title,content_type)
);
create index if not exists world_classics_cache_expiry on public.world_classics_cache(expires_at);
create table if not exists public.world_classics_translations (
 id uuid primary key default gen_random_uuid(), source text not null check(source in ('china','japan','korea')),
 page_title text not null check(length(page_title) between 1 and 300), source_revision_id text,
 target_language text not null default 'id' check(target_language='id'),
 translation_mode text not null check(translation_mode in ('Literal','Natural','Novel')),
 original_hash text not null check(original_hash ~ '^[a-f0-9]{64}$'), translated_content jsonb not null,
 provider text not null default 'google', model text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source,page_title,target_language,translation_mode,original_hash)
);
create table if not exists public.world_classics_bookmarks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('china','japan','korea')), work_title text not null check(length(work_title)<=300),
 page_title text not null check(length(page_title) between 1 and 300), chapter_title text not null check(length(chapter_title)<=300),
 reading_progress numeric not null default 0 check(reading_progress between 0 and 100),
 scroll_position integer not null default 0 check(scroll_position between 0 and 10000000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,source,page_title)
);
create index if not exists world_classics_bookmarks_user on public.world_classics_bookmarks(user_id);
create table if not exists public.world_classics_history (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('china','japan','korea')), work_title text not null check(length(work_title)<=300),
 page_title text not null check(length(page_title) between 1 and 300), chapter_title text not null check(length(chapter_title)<=300),
 reading_progress numeric not null default 0 check(reading_progress between 0 and 100),
 last_read_at timestamptz not null default now(), unique(user_id,source,page_title)
);
create index if not exists world_classics_history_recent on public.world_classics_history(user_id,last_read_at desc);
create table if not exists public.world_classics_limits (
 scope text not null, subject text not null, window_start timestamptz not null, used integer not null,
 expires_at timestamptz not null, primary key(scope,subject,window_start)
);
create index if not exists world_classics_limits_expiry on public.world_classics_limits(expires_at);
create table if not exists public.world_classics_translation_jobs (
 job_key text primary key, owner uuid not null, expires_at timestamptz not null
);

alter table public.world_classics_cache enable row level security;
alter table public.world_classics_translations enable row level security;
alter table public.world_classics_limits enable row level security;
alter table public.world_classics_translation_jobs enable row level security;
alter table public.world_classics_bookmarks enable row level security;
alter table public.world_classics_history enable row level security;
revoke all on public.world_classics_cache,public.world_classics_translations,public.world_classics_limits,public.world_classics_translation_jobs from anon,authenticated;
grant all on public.world_classics_cache,public.world_classics_translations,public.world_classics_limits,public.world_classics_translation_jobs to service_role;
revoke all on public.world_classics_bookmarks,public.world_classics_history from anon,authenticated;
grant select,insert,update,delete on public.world_classics_bookmarks,public.world_classics_history to authenticated;
grant all on public.world_classics_bookmarks,public.world_classics_history to service_role;
drop policy if exists wc_bookmarks_owner on public.world_classics_bookmarks;
create policy wc_bookmarks_owner on public.world_classics_bookmarks for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists wc_history_owner on public.world_classics_history;
create policy wc_history_owner on public.world_classics_history for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create or replace function public.wc_reading_timestamp() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='world_classics_history' then NEW.last_read_at=now(); else NEW.updated_at=now(); end if;
 return NEW;
end $$;
drop trigger if exists wc_bookmark_timestamp on public.world_classics_bookmarks;
create trigger wc_bookmark_timestamp before insert or update on public.world_classics_bookmarks for each row execute function public.wc_reading_timestamp();
drop trigger if exists wc_history_timestamp on public.world_classics_history;
create trigger wc_history_timestamp before insert or update on public.world_classics_history for each row execute function public.wc_reading_timestamp();
create or replace function public.wc_lock_history() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 37));
 return NEW;
end $$;
drop trigger if exists wc_history_lock on public.world_classics_history;
create trigger wc_history_lock before insert or update on public.world_classics_history for each row execute function public.wc_lock_history();
create or replace function public.wc_trim_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.world_classics_history where id in (
  select id from public.world_classics_history where user_id=NEW.user_id order by last_read_at desc,id desc offset 100
 );
 return null;
end $$;
drop trigger if exists wc_history_trim on public.world_classics_history;
create trigger wc_history_trim after insert or update on public.world_classics_history for each row execute function public.wc_trim_history();

create or replace function public.wc_take_quota(p_scope text,p_subject text,p_window integer,p_cost integer,p_limit integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_start timestamptz; v_used integer;
begin
 if p_window<1 or p_window>86400 or p_cost<1 or p_limit<1 or p_cost>p_limit or length(p_scope)>80 or length(p_subject)>128 then return false; end if;
 v_start=to_timestamp(floor(extract(epoch from now())/p_window)*p_window);
 insert into public.world_classics_limits(scope,subject,window_start,used,expires_at)
 values(p_scope,p_subject,v_start,p_cost,v_start+make_interval(secs=>p_window*2))
 on conflict(scope,subject,window_start) do update set used=public.world_classics_limits.used+excluded.used
 where public.world_classics_limits.used+excluded.used<=p_limit returning used into v_used;
 delete from public.world_classics_limits where ctid in (select ctid from public.world_classics_limits where expires_at<now() limit 100);
 return v_used is not null;
end $$;
create or replace function public.wc_claim_translation(p_key text,p_owner uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if length(p_key)>200 then return false; end if;
 delete from public.world_classics_translation_jobs where job_key in (select job_key from public.world_classics_translation_jobs where expires_at<now()-interval '1 day' limit 100);
 insert into public.world_classics_translation_jobs(job_key,owner,expires_at) values(p_key,p_owner,now()+interval '300 seconds')
 on conflict(job_key) do update set owner=excluded.owner,expires_at=excluded.expires_at
 where public.world_classics_translation_jobs.expires_at<now() returning owner into v_owner;
 return coalesce(v_owner=p_owner,false);
end $$;
revoke all on function public.wc_take_quota(text,text,integer,integer,integer),public.wc_claim_translation(text,uuid) from public,anon,authenticated;
grant execute on function public.wc_take_quota(text,text,integer,integer,integer),public.wc_claim_translation(text,uuid) to service_role;
revoke all on function public.wc_trim_history(),public.wc_lock_history(),public.wc_reading_timestamp() from public,anon,authenticated;
commit;

-- Lazy translation metadata only. Original MangaDex images are never stored.
begin;
create table if not exists public.comic_page_translations (
 id uuid primary key default gen_random_uuid(),
 provider text not null default 'mangadex' check(provider='mangadex'),
 manga_id text not null, chapter_id text not null,
 page_index integer not null check(page_index between 0 and 199),
 image_hash text not null check(image_hash ~ '^[a-f0-9]{64}$'),
 target_language text not null default 'id', model text not null,
 translation jsonb not null check(jsonb_typeof(translation)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider,chapter_id,page_index,image_hash,target_language)
);
create table if not exists public.comic_translation_jobs (
 id uuid primary key default gen_random_uuid(), subject text not null unique,
 manga_id text not null, chapter_id text not null, manifest jsonb not null,
 total_pages integer not null check(total_pages between 1 and 200),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table if not exists public.comic_translation_leases (
 page_key text primary key, owner uuid not null, job_id uuid not null,
 subject text not null, expires_at timestamptz not null default now()+interval '180 seconds'
);
create index if not exists comic_translation_jobs_expiry on public.comic_translation_jobs(expires_at);
create index if not exists comic_translation_leases_subject on public.comic_translation_leases(subject,expires_at);
create index if not exists comic_translation_leases_expiry on public.comic_translation_leases(expires_at);
alter table public.comic_page_translations enable row level security;
alter table public.comic_translation_jobs enable row level security;
alter table public.comic_translation_leases enable row level security;
revoke all on public.comic_page_translations,public.comic_translation_jobs,public.comic_translation_leases from public,anon,authenticated;
grant select,insert,update,delete on public.comic_page_translations,public.comic_translation_jobs,public.comic_translation_leases to service_role;
-- Server-only RPC serializes admission, not inference. Leases survive worker restarts.
create or replace function public.comic_claim_page(p_key text,p_owner uuid,p_job uuid,p_subject text,p_concurrency integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if length(p_key)>160 or length(p_subject)>128 or p_concurrency not between 1 and 3 then return false; end if;
 perform pg_advisory_xact_lock(782994001);
 delete from public.comic_translation_leases where expires_at<=now();
 if not exists(select 1 from public.comic_translation_jobs where id=p_job and subject=p_subject and expires_at>now()) then return false; end if;
 if exists(select 1 from public.comic_translation_leases where page_key=p_key) then return false; end if;
 if (select count(*) from public.comic_translation_leases where subject=p_subject)>=p_concurrency then return false; end if;
 if (select count(*) from public.comic_translation_leases)>=20 then return false; end if;
 insert into public.comic_translation_leases(page_key,owner,job_id,subject) values(p_key,p_owner,p_job,p_subject);
 return true;
end $$;
revoke all on function public.comic_claim_page(text,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.comic_claim_page(text,uuid,uuid,text,integer) to service_role;
create or replace function public.comic_prepare_job(p_subject text,p_manga text,p_chapter text,p_manifest jsonb,p_total integer)
returns setof public.comic_translation_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if length(p_subject)>128 or p_total not between 1 and 200 then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('comic-job:'||p_subject,0));
 if exists(select 1 from public.comic_translation_jobs where subject=p_subject and chapter_id<>p_chapter and expires_at>now()) then return; end if;
 if exists(select 1 from public.comic_translation_leases l join public.comic_translation_jobs j on j.id=l.job_id where l.subject=p_subject and j.chapter_id<>p_chapter and l.expires_at>now()) then return; end if;
 delete from public.comic_translation_jobs where id in (select id from public.comic_translation_jobs where expires_at<now()-interval '1 day' limit 100);
 return query insert into public.comic_translation_jobs(subject,manga_id,chapter_id,manifest,total_pages)
 values(p_subject,p_manga,p_chapter,p_manifest,p_total)
 on conflict(subject) do update set id=gen_random_uuid(),manga_id=excluded.manga_id,chapter_id=excluded.chapter_id,manifest=excluded.manifest,total_pages=excluded.total_pages,updated_at=now(),expires_at=now()+interval '10 minutes'
 returning *;
end $$;
revoke all on function public.comic_prepare_job(text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.comic_prepare_job(text,text,text,jsonb,integer) to service_role;
-- Existing admin settings and authorization tables remain authoritative.
insert into public.app_settings(key,value,is_public) values('comic_translation','{"enabled":true,"sfxDefault":false,"maxConcurrentPages":2}',false) on conflict(key) do nothing;
commit;

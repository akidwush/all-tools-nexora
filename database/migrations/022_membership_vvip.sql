-- Nexora membership: Supabase Auth profiles, VVIP subscriptions, and tool access.
alter table public.tools add column if not exists access_level text not null default 'free';
alter table public.tools drop constraint if exists tools_access_level_check;
alter table public.tools add constraint tools_access_level_check check (access_level in ('free','vvip'));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  avatar_url text,
  role text not null default 'free' check (role in ('free','vvip','admin')),
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','vvip')),
  status text not null default 'expired' check (status in ('active','expired','suspended','revoked')),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(lower(email));
create index if not exists subscriptions_expires_idx on public.subscriptions(expires_at);

create or replace function public.nexora_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.nexora_touch_updated_at();
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at before update on public.subscriptions for each row execute function public.nexora_touch_updated_at();

create or replace function public.nexora_create_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(coalesce(new.email,''),'@',1)))
  on conflict(id) do update set email=excluded.email;
  insert into public.subscriptions(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_nexora on auth.users;
create trigger on_auth_user_created_nexora after insert or update of email on auth.users for each row execute function public.nexora_create_profile();

insert into public.profiles(id,email,display_name)
select id,email,coalesce(raw_user_meta_data->>'display_name',split_part(coalesce(email,''),'@',1)) from auth.users
on conflict(id) do update set email=excluded.email;
insert into public.subscriptions(user_id) select id from auth.users on conflict(user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (auth.uid()=id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);
drop policy if exists subscriptions_read_own on public.subscriptions;
create policy subscriptions_read_own on public.subscriptions for select to authenticated using (auth.uid()=user_id);

revoke all on public.profiles, public.subscriptions from anon;
grant select on public.profiles, public.subscriptions to authenticated;
grant update(display_name,avatar_url) on public.profiles to authenticated;


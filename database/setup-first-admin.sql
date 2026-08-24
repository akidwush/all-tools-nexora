-- Nexora v5.0 — Jadikan satu akun Supabase Auth sebagai super admin.
-- 1. Buat user lebih dahulu melalui Supabase > Authentication > Users > Add user.
-- 2. Pastikan migration 022_membership_vvip.sql sudah dijalankan.
-- 3. Jalankan file ini melalui SQL Editor.

do $$
declare
  admin_email text := 'nexora@gmail.com';
  admin_user_id uuid;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = lower(admin_email)
  limit 1;

  if admin_user_id is null then
    raise exception 'User dengan email % belum ditemukan di Supabase Auth.', admin_email;
  end if;

  insert into public.admin_users (user_id, role, display_name, is_active)
  values (
    admin_user_id,
    'super_admin',
    split_part(admin_email, '@', 1),
    true
  )
  on conflict (user_id) do update set
    role = 'super_admin',
    is_active = true,
    updated_at = now();

  update public.profiles set role = 'admin', account_status = 'active' where id = admin_user_id;
end $$;

select
  au.email,
  ad.role,
  ad.display_name,
  ad.is_active
from public.admin_users ad
join auth.users au on au.id = ad.user_id
order by ad.created_at asc;

-- Nexora HF3 — video header yang dapat diedit dari dashboard admin.
-- Aman dijalankan ulang dan tidak menimpa URL yang sudah pernah disimpan.

insert into public.app_settings (key, value, is_public)
values (
  'site',
  '{"name":"All Tools Nexora","developer":"Dika","heroVideo":{"enabled":true,"url":"https://c.termai.cc/v164/HCYk.mp4"}}'::jsonb,
  true
)
on conflict (key) do update set
  value = case
    when jsonb_typeof(public.app_settings.value) = 'object'
      then jsonb_set(
        public.app_settings.value,
        '{heroVideo}',
        coalesce(
          public.app_settings.value -> 'heroVideo',
          excluded.value -> 'heroVideo'
        ),
        true
      )
    else excluded.value
  end,
  is_public = true;

grant select, insert, update, delete on table public.app_settings to service_role;

notify pgrst, 'reload schema';

begin;

insert into public.tools
  (id, name, description, category, badge, icon, external_url, is_active, access_level, sort_order, metadata)
values
  ('multiai', 'Nexora Multi-AI', 'Ask multiple AIs at once. Chat, image, audio, dan utility dalam satu hub.', 'tools', '27 AI', 'fa-solid fa-diagram-project', null, true, 'free', 12,
   '{"provider":"kuroneko","serverProxy":true,"serverKey":true,"privacy":"not-stored","capabilities":["chat","image","image-transform","audio","detection","utility"]}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  badge = excluded.badge,
  icon = excluded.icon,
  metadata = public.tools.metadata || excluded.metadata,
  updated_at = now();

insert into public.app_settings (key, value, is_public, updated_at)
values ('multi_ai', '{"enabled":true,"maxConcurrentAi":4,"providers":{}}'::jsonb, false, now())
on conflict (key) do nothing;

commit;
notify pgrst, 'reload schema';

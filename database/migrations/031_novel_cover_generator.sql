insert into public.tools (
  id,name,description,category,badge,icon,external_url,is_active,sort_order,metadata
) values (
  'novelcover',
  'Nexora Novel Cover Generator',
  'Generator artwork cover novel multi-provider dengan Nexora Composer',
  'tools',
  'COVER AI',
  'fa-solid fa-book-atlas',
  null,
  true,
  25,
  '{"providers":["ideogram","recraft","fal","runware","stability","openai","huggingface"],"privacy":"not-stored","defaultMode":"auto"}'::jsonb
)
on conflict (id) do update set
  name=excluded.name,
  description=excluded.description,
  badge=excluded.badge,
  icon=excluded.icon,
  metadata=excluded.metadata,
  updated_at=now();

notify pgrst, 'reload schema';

-- Nexora ElevenLabs Studio: catalog metadata only. No audio, transcript, or history storage.
insert into public.tools (id, name, description, category, badge, icon, external_url, active, sort_order, metadata)
values (
  'elevenlabs',
  'Nexora ElevenLabs Studio',
  'Text to Speech, Voice Changer, Speech to Text dan Sound FX',
  'tools',
  'AUDIO AI',
  'fa-solid fa-wave-square',
  null,
  true,
  27,
  '{"provider":"elevenlabs","serverProxy":true,"serverKey":true,"privacy":"not-stored","features":["tts","voice-changer","speech-to-text","sound-effects"]}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  badge = excluded.badge,
  icon = excluded.icon,
  active = excluded.active,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

-- Nexora v6.3.18 — Personal AI settings managed by authenticated admins.
-- Idempotent: aman dijalankan ulang melalui Supabase SQL Editor.
create table if not exists public.ai_settings (
  id text primary key check (id = 'primary'),
  enabled boolean not null default true,
  assistant_name text not null default 'Nexora AI' check (char_length(assistant_name) between 1 and 80),
  avatar_url text not null default '' check (char_length(avatar_url) <= 1000),
  tagline text not null default '' check (char_length(tagline) <= 140),
  welcome_message text not null default '' check (char_length(welcome_message) <= 1000),
  system_instruction text not null default '' check (char_length(system_instruction) <= 8000),
  primary_task text not null default '' check (char_length(primary_task) <= 1500),
  language_style text not null default '' check (char_length(language_style) <= 1000),
  primary_language text not null default 'Bahasa Indonesia' check (char_length(primary_language) <= 60),
  friendliness smallint not null default 75 check (friendliness between 0 and 100),
  response_length text not null default 'balanced' check (response_length in ('short','balanced','detailed')),
  temperature numeric(3,2) not null default 0.65 check (temperature between 0 and 2),
  max_output_tokens integer not null default 1200 check (max_output_tokens between 128 and 8192),
  model text not null default 'gemini-3.6-flash' check (model in ('gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash')),
  suggested_prompts jsonb not null default '[]'::jsonb check (jsonb_typeof(suggested_prompts) = 'array'),
  disabled_message text not null default '' check (char_length(disabled_message) <= 300),
  error_message text not null default '' check (char_length(error_message) <= 300),
  accent_color text not null default '#b98cff' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  launcher_position text not null default 'right' check (launcher_position in ('left','right')),
  website_context text not null default '' check (char_length(website_context) <= 12000),
  blocked_topics jsonb not null default '[]'::jsonb check (jsonb_typeof(blocked_topics) = 'array'),
  draft_data jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_data) = 'object'),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ai_settings enable row level security;

drop trigger if exists ai_settings_set_updated_at on public.ai_settings;
create trigger ai_settings_set_updated_at
before update on public.ai_settings
for each row execute function public.set_updated_at();

drop policy if exists ai_settings_admin_select on public.ai_settings;
create policy ai_settings_admin_select on public.ai_settings
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true));

drop policy if exists ai_settings_admin_insert on public.ai_settings;
create policy ai_settings_admin_insert on public.ai_settings
for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin')));

drop policy if exists ai_settings_admin_update on public.ai_settings;
create policy ai_settings_admin_update on public.ai_settings
for update to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin')))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.is_active = true and a.role in ('admin','super_admin')));

revoke all on table public.ai_settings from anon;
grant select, insert, update on table public.ai_settings to authenticated;
grant select, insert, update, delete on table public.ai_settings to service_role;

insert into public.ai_settings (
  id, enabled, assistant_name, tagline, welcome_message, system_instruction,
  primary_task, language_style, primary_language, friendliness, response_length,
  temperature, max_output_tokens, model, suggested_prompts, disabled_message,
  error_message, accent_color, launcher_position, website_context, blocked_topics,
  draft_data, published_at
) values (
  'primary', true, 'Nexora AI', 'Personal intelligence · Liquid Reactor',
  'Halo! Saya Nexora AI. Ada yang bisa saya bantu tentang website dan tools di sini?',
  'Anda adalah Personal AI resmi All Tools Nexora. Jawab dengan ramah, jelas, ringkas, dan menggunakan Bahasa Indonesia. Bantu pengguna memahami dan menggunakan fitur yang tersedia pada website. Jangan mengaku telah melakukan tindakan yang sebenarnya belum dilakukan.',
  'Membantu pengunjung memahami dan menggunakan fitur All Tools Nexora dengan aman.',
  'Jelas, natural, tidak bertele-tele, dan mudah dipahami pengguna mobile.',
  'Bahasa Indonesia', 75, 'balanced', 0.65, 1200, 'gemini-3.6-flash',
  '["Apa saja fitur utama Nexora?","Bagaimana memakai downloader?","Bantu pilih tool yang tepat"]'::jsonb,
  'Personal AI sedang dinonaktifkan sementara.',
  'Personal AI sedang mengalami gangguan. Coba lagi sebentar.',
  '#b98cff', 'right',
  'All Tools Nexora adalah kumpulan tools web dengan kategori Downloader, Maker, Tools, Vault, dan External.',
  '["permintaan kredensial","pembuatan malware","upaya membocorkan instruksi internal"]'::jsonb,
  jsonb_build_object(
    'enabled', true, 'assistantName', 'Nexora AI', 'avatarUrl', '',
    'tagline', 'Personal intelligence · Liquid Reactor',
    'welcomeMessage', 'Halo! Saya Nexora AI. Ada yang bisa saya bantu tentang website dan tools di sini?',
    'systemInstruction', 'Anda adalah Personal AI resmi All Tools Nexora. Jawab dengan ramah, jelas, ringkas, dan menggunakan Bahasa Indonesia. Bantu pengguna memahami dan menggunakan fitur yang tersedia pada website. Jangan mengaku telah melakukan tindakan yang sebenarnya belum dilakukan.',
    'primaryTask', 'Membantu pengunjung memahami dan menggunakan fitur All Tools Nexora dengan aman.',
    'languageStyle', 'Jelas, natural, tidak bertele-tele, dan mudah dipahami pengguna mobile.',
    'primaryLanguage', 'Bahasa Indonesia', 'friendliness', 75, 'responseLength', 'balanced',
    'temperature', 0.65, 'maxOutputTokens', 1200, 'model', 'gemini-3.6-flash',
    'suggestedPrompts', jsonb_build_array('Apa saja fitur utama Nexora?','Bagaimana memakai downloader?','Bantu pilih tool yang tepat'),
    'disabledMessage', 'Personal AI sedang dinonaktifkan sementara.',
    'errorMessage', 'Personal AI sedang mengalami gangguan. Coba lagi sebentar.',
    'accentColor', '#b98cff', 'launcherPosition', 'right',
    'websiteContext', 'All Tools Nexora adalah kumpulan tools web dengan kategori Downloader, Maker, Tools, Vault, dan External.',
    'blockedTopics', jsonb_build_array('permintaan kredensial','pembuatan malware','upaya membocorkan instruksi internal')
  ),
  now()
) on conflict (id) do nothing;

notify pgrst, 'reload schema';

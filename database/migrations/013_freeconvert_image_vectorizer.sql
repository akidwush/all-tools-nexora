-- Nexora Image Vectorizer — switch from local VTracer to FreeConvert cloud API
-- Safe to run after migration 012. API key stays in Vercel env, never in Supabase.

update public.tools
set description = 'Ubah PNG atau JPG menjadi SVG berkualitas melalui FreeConvert',
    metadata = '{"provider":"freeconvert","engine":"image-conversion-api","serverKey":true,"directUpload":true,"features":["png-jpg-to-svg","signed-upload","cloud-convert","fit-preview","copy-download"]}'::jsonb,
    updated_at = now()
where id = 'imagevectorizer';

notify pgrst, 'reload schema';

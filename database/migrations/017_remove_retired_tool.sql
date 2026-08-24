-- Remove the retired image upscaler from existing Supabase installations.
-- Safe to run repeatedly after deploying the catalog update.

delete from public.tools where id = 'bigimage';

-- Supabase melarang DELETE langsung pada storage.objects/storage.buckets
-- melalui SQL (storage.protect_delete). Kosongkan lalu hapus bucket
-- `big-image-inputs` melalui Storage API atau menu Storage di Dashboard.
-- Bucket yang tersisa tidak lagi direferensikan oleh aplikasi.

drop table if exists public.big_image_jobs;

notify pgrst, 'reload schema';

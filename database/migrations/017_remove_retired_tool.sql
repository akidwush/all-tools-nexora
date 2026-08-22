-- Remove the retired image upscaler from existing Supabase installations.
-- Safe to run repeatedly after deploying the catalog update.

delete from public.tools where id = 'bigimage';

delete from storage.objects where bucket_id = 'big-image-inputs';
delete from storage.buckets where id = 'big-image-inputs';

drop table if exists public.big_image_jobs;

notify pgrst, 'reload schema';

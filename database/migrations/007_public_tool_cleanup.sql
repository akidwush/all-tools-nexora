-- HF3: keep the public catalog neutral and advertise the local fallback.
update public.tools
set
  name = 'Sertifikat Custom',
  description = 'Buat sertifikat custom melalui API atau renderer lokal',
  badge = 'PNG',
  updated_at = now()
where id = 'sertifikat';

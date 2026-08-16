-- Nexora v6.3.18 HF9 — IP & ASN Intelligence (IPinfo Lite).
-- Idempotent. Tidak menyimpan API token di database; token tetap server-side di Vercel.

insert into public.tools (
  id, name, description, category, badge, icon, external_url, is_active, sort_order, metadata
) values (
  'ipintel',
  'IP & ASN Intelligence',
  'Lookup IPv4/IPv6, ASN, organisasi, domain, negara dan benua via IPinfo Lite',
  'tools',
  'IPINFO',
  'fa-solid fa-network-wired',
  null,
  true,
  67,
  '{"provider":"ipinfo-lite","serverKey":true,"features":["ipv4","ipv6","asn","country","continent","bogon"]}'::jsonb
) on conflict (id) do nothing;

notify pgrst, 'reload schema';

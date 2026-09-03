begin;

-- A VVIP badge is only enforceable when the privileged operation remains
-- behind a Nexora server route. Public-JavaScript and external-link tools are
-- reset to Free so the catalogue never advertises a client-only security lock.
update public.tools
set access_level = 'free',
    updated_at = now()
where access_level = 'vvip'
  and id not in (
    'aiodownloader',
    'aisong',
    'aivideo',
    'aiimage',
    'alightpremium',
    'animetoreal',
    'autopdf',
    'bmkg',
    'comicreader',
    'cryptomarket',
    'danbooru',
    'documentai',
    'elevenlabs',
    'enhancer',
    'fakeovo',
    'genmail',
    'getcode',
    'imagevectorizer',
    'instagram',
    'ipintel',
    'novelcover',
    'ocrintel',
    'promptgenerate',
    'sertifikat',
    'spaceexplorer',
    'spotify',
    'svgalight',
    'terabox',
    'tiktok',
    'vdeploy',
    'webintel',
    'youtube'
  );

comment on column public.tools.access_level is
  'Presentation plus server policy. vvip is valid only for tool IDs protected by lib/server-access-policy.js.';

commit;

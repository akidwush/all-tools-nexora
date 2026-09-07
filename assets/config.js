/* Nexora configuration — edit this file for branding, tools, modules, and UI policy. */
(function(root,factory){
  "use strict";
  var config=factory();
  if(typeof module==="object"&&module.exports)module.exports=config;
  if(root)root.NexoraConfig=config;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  var config={
  "version": "6.4.0",
  "brand": {
    "name": "All Tools Nexora",
    "shortName": "Nexora",
    "owner": "Developer Dika",
    "title": "All Tools Nexora — Developer Dika",
    "description": "Kumpulan downloader, maker, AI, dan utilitas web Nexora dalam satu tempat.",
    "canonicalUrl": "https://all-tools-nexora.vercel.app/",
    "logoUrl": "https://all-tools-nexora.vercel.app/favicon.svg",
    "aiName": "Nexora AI"
  },
  "ui": {
    "mobileBreakpoint": 900,
    "catalogPageSize": 12,
    "desktopMotion": false,
    "customCursor": false,
    "heroVideo": {
      "url": "https://files.catbox.moe/4ijdle.mp4",
      "playOnMobile": true,
      "playOnDesktop": false,
      "showStaticOnDesktop": true
    }
  },
  "modules": {
    "get-code": {
      "css": [
        "assets/css/features/get-code.css"
      ],
      "js": [
        "assets/js/features/get-code.js"
      ]
    },
    "tiktok": {
      "css": [
        "assets/css/features/tiktok.css"
      ],
      "js": [
        "assets/js/features/tiktok.js"
      ]
    },
    "tiktok-quote": {
      "css": [
        "assets/css/features/tiktok-quote.css"
      ],
      "js": [
        "assets/js/features/tiktok-quote.js"
      ]
    },
    "virus-scan": {
      "css": [
        "assets/css/features/virus-scan.css"
      ],
      "js": [
        "assets/js/features/virus-scan.js"
      ]
    },
    "crypto-market": {
      "css": [
        "assets/css/features/crypto-market.css"
      ],
      "js": [
        "assets/js/features/crypto-market.js"
      ]
    },
    "web-intelligence": {
      "css": [
        "assets/css/features/web-intelligence.css"
      ],
      "js": [
        "assets/js/features/web-intelligence.js"
      ]
    },
    "ip-intelligence": {
      "css": [
        "assets/css/features/ip-intelligence.css"
      ],
      "js": [
        "assets/js/features/ip-intelligence.js"
      ]
    },
    "space-explorer": {
      "css": [
        "assets/css/features/space-explorer.css"
      ],
      "js": [
        "assets/js/features/space-explorer.js"
      ]
    },
    "ocr-intelligence": {
      "css": [
        "assets/css/features/ocr-intelligence.css"
      ],
      "js": [
        "assets/js/features/ocr-intelligence.js"
      ]
    },
    "document-ai": {
      "css": [
        "assets/css/features/document-ai.css"
      ],
      "js": [
        "assets/js/features/document-ai.js"
      ]
    },
    "text-to-pdf": {
      "css": [
        "assets/css/features/text-to-pdf.css"
      ],
      "js": [
        "assets/js/features/text-to-pdf.js"
      ]
    },
    "prompt-generator": {
      "css": [
        "assets/css/features/prompt-generator.css"
      ],
      "js": [
        "assets/js/features/prompt-generator.js"
      ]
    },
    "novel-cover-generator": {
      "css": [
        "assets/css/features/novel-cover-generator.css"
      ],
      "js": [
        "assets/js/features/puter-runtime.js",
        "assets/js/features/novel-cover-director.js",
        "assets/js/features/novel-cover-puter.js",
        "assets/js/features/novel-cover-generator.js"
      ]
    },
    "puter-image": {
      "css": [
        "assets/css/features/puter-image.css"
      ],
      "js": [
        "assets/js/features/puter-image.js"
      ]
    },
    "puter-video": {
      "css": [
        "assets/css/features/puter-video.css"
      ],
      "js": [
        "assets/js/features/puter-runtime.js",
        "assets/js/features/puter-video.js"
      ]
    },
    "genmail": {
      "css": [
        "assets/css/features/genmail.css"
      ],
      "js": [
        "assets/js/features/genmail.js"
      ]
    },
    "aio-downloader": {
      "css": [
        "assets/css/features/aio-downloader.css"
      ],
      "js": [
        "assets/js/features/aio-downloader.js"
      ]
    },
    "danbooru-search": {
      "css": [
        "assets/css/features/danbooru-search.css"
      ],
      "js": [
        "assets/js/features/danbooru-search.js"
      ]
    },
    "anime-to-real": {
      "css": [
        "assets/css/features/anime-to-real.css"
      ],
      "js": [
        "assets/js/features/anime-to-real.js"
      ]
    },
    "ai-song": {
      "css": [
        "assets/css/features/ai-song.css"
      ],
      "js": [
        "assets/js/features/ai-song.js"
      ]
    },
    "elevenlabs-studio": {
      "css": [
        "assets/css/features/elevenlabs-studio.css"
      ],
      "js": [
        "assets/js/features/elevenlabs-studio.js"
      ]
    },
    "hd4-enhancer": {
      "css": [
        "assets/css/features/hd4-enhancer.css"
      ],
      "js": [
        "assets/js/features/hd4-enhancer.js"
      ]
    },
    "image-vectorizer": {
      "css": [
        "assets/css/features/image-vectorizer.css"
      ],
      "js": [
        "assets/js/features/image-vectorizer.js"
      ]
    },
    "smart-cutout": {
      "css": [
        "assets/css/features/smart-cutout.css"
      ],
      "js": [
        "assets/js/features/smart-cutout-core.js",
        "assets/js/features/smart-cutout.js"
      ]
    },
    "placeholder-studio": {
      "css": [
        "assets/css/features/placeholder-studio.css"
      ],
      "js": [
        "assets/js/features/placeholder-studio.js"
      ]
    },
    "comic-reader": {
      "css": [
        "assets/css/features/comic-reader.css"
      ],
      "js": [
        "assets/js/features/comic-reader.js"
      ]
    },
    "source-features": {
      "css": [
        "assets/css/features/source-tools.css"
      ],
      "js": [
        "assets/js/features/source-features.js"
      ]
    },
    "imported-tools": {
      "css": [
        "assets/css/features/imported-tools.css"
      ],
      "js": [
        "assets/js/features/imported-tools.js"
      ]
    },
    "generator-pack": {
      "css": [],
      "js": [
        "assets/js/features/generator-pack.js"
      ]
    },
    "download-pack": {
      "css": [
        "assets/css/features/source-tools.css"
      ],
      "js": [
        "assets/js/features/source-features.js",
        "assets/js/features/download-pack.js"
      ]
    },
    "unban-whatsapp": {
      "css": [],
      "js": [
        "assets/js/features/unban-whatsapp.js"
      ]
    },
    "deploy-center": {
      "css": [
        "assets/css/features/deploy-center.css"
      ],
      "js": [
        "assets/js/features/deploy-center.js"
      ]
    },
    "web-encryption": {
      "css": [
        "assets/css/features/web-encryption.css"
      ],
      "js": [
        "assets/js/features/web-encryption.js"
      ]
    },
    "svg-alight": {
      "css": [
        "assets/css/features/svg-alight.css"
      ],
      "js": [
        "assets/js/features/svg-alight.js"
      ]
    },
    "bmkg-open-data": {
      "css": [
        "assets/css/features/bmkg-open-data.css"
      ],
      "js": [
        "assets/js/features/bmkg-open-data.js"
      ]
    },
    "alight-premium": {
      "css": [
        "assets/css/features/alight-premium.css"
      ],
      "js": [
        "assets/js/features/alight-premium.js"
      ]
    },
    "nexora-text-2d": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/vendor/nexora/text-2d-presets.js",
        "assets/vendor/nexora/text-style-data.js",
        "assets/vendor/nexora/text-2d-engine.js",
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "nexora-text-3d": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/vendor/nexora/3d-engine.js",
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "nexora-text-fx-animation": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/vendor/nexora/text-fx-animation-engine.js",
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "nexora-text-vector": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "nexora-trimpath": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/vendor/nexora/trimpath-font-metrics.js",
        "assets/vendor/nexora/trimpath-letters.js",
        "assets/vendor/nexora/trimpath-engine.js",
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "nexora-logo-animate": {
      "css": [
        "assets/css/features/nexora-generators.css"
      ],
      "js": [
        "assets/js/features/nexora/logo-engine.js",
        "assets/js/features/nexora/nexora-runtime.js"
      ]
    },
    "maker-originals": {
      "css": [
        "assets/css/features/maker-originals.css"
      ],
      "js": [
        "assets/js/features/maker-originals.js"
      ]
    },
    "world-classics": {
      "css": [
        "assets/css/world-classics.css"
      ],
      "js": [
        "assets/js/shared/supabase-client.js",
        "assets/js/features/world-classics/state.js",
        "assets/js/features/world-classics/reader.js"
      ]
    }
  },
  "tools": {
    "downloader": [
      {
        "id": "aiodownloader",
        "icon": "fa-solid fa-cloud-arrow-down",
        "name": "All In One Downloader",
        "description": "Ambil pilihan media yang tersedia dari satu link",
        "badge": "AIO",
        "aliases": [
          "aio downloader",
          "universal downloader"
        ],
        "runtime": {
          "mode": "api",
          "module": "aio-downloader",
          "handler": "renderAioDownloader",
          "dependency": "https://all-tools-nexora.vercel.app/api/download/aio"
        },
        "health": {
          "key": "module-aio-downloader",
          "type": "module",
          "path": "/assets/js/features/aio-downloader.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "terabox",
        "icon": "fa-solid fa-box-open",
        "name": "Terabox Downloader",
        "description": "Ambil file dari link share Terabox",
        "badge": "FILE",
        "runtime": {
          "mode": "api",
          "module": "download-pack",
          "handler": "renderTerabox",
          "dependency": "https://all-tools-nexora.vercel.app/api/downloader"
        },
        "health": {
          "key": "downloader-terabox",
          "type": "module",
          "path": "/api/downloader?health=1&provider=terabox",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "instagram",
        "icon": "fa-brands fa-instagram",
        "name": "Instagram",
        "description": "Download video & foto",
        "badge": "HD",
        "runtime": {
          "mode": "api",
          "handler": "renderInstagram",
          "dependency": "https://all-tools-nexora.vercel.app/api/downloader"
        },
        "health": {
          "key": "downloader-instagram",
          "type": "module",
          "path": "/api/downloader?health=1&provider=instagram",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "tiktok",
        "icon": "fa-brands fa-tiktok",
        "name": "TikTok",
        "description": "Video, foto & audio",
        "badge": "MP4/MP3/JPG",
        "runtime": {
          "mode": "api",
          "module": "tiktok",
          "handler": "renderTiktok",
          "dependency": "https://all-tools-nexora.vercel.app/api/downloader",
          "opener": "openTiktokRoom"
        },
        "health": {
          "key": "downloader-tiktok",
          "type": "module",
          "path": "/api/downloader?health=1&provider=tiktok",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "youtube",
        "icon": "fa-brands fa-youtube",
        "name": "YouTube Downloader",
        "description": "Video MP4 dan audio MP3 dengan fallback metadata",
        "badge": "MP4/MP3",
        "runtime": {
          "mode": "api",
          "handler": "renderYoutube",
          "dependency": "https://all-tools-nexora.vercel.app/api/downloader"
        },
        "health": {
          "key": "downloader-youtube",
          "type": "module",
          "path": "/api/downloader?health=1&provider=youtube",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "spotify",
        "icon": "fa-brands fa-spotify",
        "name": "Spotify Downloader",
        "description": "Audio provider dengan fallback resmi",
        "badge": "MP3",
        "runtime": {
          "mode": "api",
          "handler": "renderSpotify",
          "dependency": "https://all-tools-nexora.vercel.app/api/downloader"
        },
        "health": {
          "key": "downloader-spotify",
          "type": "module",
          "path": "/api/downloader?health=1&provider=spotify",
          "method": "HEAD",
          "strict": true
        }
      }
    ],
    "maker": [
      {
        "id": "sertifikat",
        "icon": "fa-solid fa-certificate",
        "name": "Sertifikat Meme",
        "description": "Sertifikat meme dari sumber original; tanpa template lokal palsu",
        "badge": "ORIGINAL",
        "runtime": {
          "mode": "api",
          "module": "maker-originals",
          "handler": "renderSertifikatTololSource",
          "dependency": "https://api.siputzx.my.id/"
        },
        "health": {
          "key": "module-maker-originals",
          "type": "module",
          "path": "/assets/js/features/maker-originals.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "ektp",
        "icon": "fa-solid fa-id-card",
        "name": "E-KTP Generator",
        "description": "Full form demo",
        "badge": "Full",
        "runtime": {
          "mode": "local",
          "handler": "renderEktp"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "fakelobby",
        "icon": "fa-solid fa-gamepad",
        "name": "Fake Lobby",
        "description": "FF & ML lobby palsu",
        "badge": "Game",
        "runtime": {
          "mode": "api",
          "handler": "renderFakeLobby",
          "dependency": "https://api.nexray.eu.cc/"
        },
        "health": {
          "key": "nexray-api",
          "type": "external-api",
          "url": "https://api.nexray.eu.cc/",
          "method": "HEAD"
        }
      },
      {
        "id": "winquotes",
        "icon": "fa-brands fa-windows",
        "name": "Windows Quotes",
        "description": "Quote ala Windows — 2 style",
        "badge": "2 STYLE",
        "runtime": {
          "mode": "api",
          "module": "generator-pack",
          "handler": "renderWinquotes2",
          "dependency": "https://apii.nexadev.my.id/"
        },
        "health": {
          "key": "nexadev-api",
          "type": "external-api",
          "url": "https://apii.nexadev.my.id/",
          "method": "HEAD"
        }
      },
      {
        "id": "nokiamsg",
        "icon": "fa-solid fa-mobile-retro",
        "name": "Nokia Message",
        "description": "Buat gambar SMS jadul Nokia",
        "badge": "RETRO",
        "runtime": {
          "mode": "api",
          "module": "generator-pack",
          "handler": "renderNokiaMsg",
          "dependency": "https://apii.nexadev.my.id/"
        },
        "health": {
          "key": "nexadev-api",
          "type": "external-api",
          "url": "https://apii.nexadev.my.id/",
          "method": "HEAD"
        }
      }
    ],
    "tools": [
      {
        "id": "mltools",
        "icon": "fa-solid fa-crosshairs",
        "name": "ML Tools",
        "description": "Script ML, Winrate dan Stalk MLBB",
        "badge": "MLBB",
        "runtime": {
          "mode": "module",
          "module": "imported-tools",
          "handler": "renderMlTools"
        },
        "health": {
          "key": "module-imported",
          "type": "module",
          "path": "/assets/js/features/imported-tools.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "comicreader",
        "icon": "fa-solid fa-book-open-reader",
        "name": "Baca Komik Full",
        "description": "Manga, manhwa, manhua + reader",
        "badge": "FULL",
        "runtime": {
          "mode": "module",
          "module": "comic-reader",
          "handler": "renderComicReader"
        },
        "health": {
          "key": "module-comic-reader",
          "type": "module",
          "path": "/assets/js/features/comic-reader.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "aiimage",
        "icon": "fa-solid fa-paintbrush",
        "name": "Nexora AI Image",
        "description": "Buat gambar AI memakai akun dan allowance Puter milikmu",
        "badge": "PUTER AI",
        "aliases": [
          "ai image"
        ],
        "runtime": {
          "mode": "module",
          "module": "puter-image",
          "handler": "renderPuterImage"
        },
        "health": {
          "key": "module-puter-image",
          "type": "module",
          "path": "/assets/js/features/puter-image.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "aivideo",
        "icon": "fa-solid fa-clapperboard",
        "name": "Nexora AI Video Generator",
        "description": "Buat video dari prompt atau gambar melalui akun Puter milikmu",
        "badge": "AI VIDEO",
        "aliases": [
          "ai video generator",
          "text to video",
          "image to video"
        ],
        "runtime": {
          "mode": "module",
          "module": "puter-video",
          "handler": "renderPuterVideo"
        },
        "health": {
          "key": "module-puter-video",
          "type": "module",
          "path": "/assets/js/features/puter-video.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "genmail",
        "icon": "fa-solid fa-envelope-open-text",
        "name": "GenMail",
        "description": "Buat email sementara, periksa inbox, dan baca pesan dengan aman",
        "badge": "TEMP MAIL",
        "aliases": [
          "advanced temp mail",
          "temp mail nexora"
        ],
        "runtime": {
          "mode": "api",
          "module": "genmail",
          "handler": "renderGenMail",
          "dependency": "https://all-tools-nexora.vercel.app/api/genmail"
        },
        "health": {
          "key": "module-genmail",
          "type": "module",
          "path": "/assets/js/features/genmail.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "danbooru",
        "icon": "fa-solid fa-photo-film",
        "name": "Danbooru Search",
        "description": "Cari ilustrasi anime berdasarkan tag dalam gallery ringan",
        "badge": "SAFE DEFAULT",
        "aliases": [
          "danbooru",
          "anime art search"
        ],
        "runtime": {
          "mode": "api",
          "module": "danbooru-search",
          "handler": "renderDanbooruSearch",
          "dependency": "https://all-tools-nexora.vercel.app/api/search/danbooru"
        },
        "health": {
          "key": "module-danbooru-search",
          "type": "module",
          "path": "/assets/js/features/danbooru-search.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "animetoreal",
        "icon": "fa-solid fa-person-rays",
        "name": "Anime to Real",
        "description": "Ubah ilustrasi anime dari URL menjadi gambar realistis",
        "badge": "AI TRANSFORM",
        "aliases": [
          "anime realistic"
        ],
        "runtime": {
          "mode": "api",
          "module": "anime-to-real",
          "handler": "renderAnimeToReal",
          "dependency": "https://all-tools-nexora.vercel.app/api/ai/anime-to-real"
        },
        "health": {
          "key": "module-anime-to-real",
          "type": "module",
          "path": "/assets/js/features/anime-to-real.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "aisong",
        "icon": "fa-solid fa-music",
        "name": "Nexora AI Song Generator",
        "description": "Ubah ide, cerita, dan suasana menjadi lagu yang siap diputar",
        "badge": "AI MUSIC",
        "aliases": [
          "ai song generator",
          "song generator"
        ],
        "runtime": {
          "mode": "api",
          "module": "ai-song",
          "handler": "renderAiSong",
          "dependency": "https://all-tools-nexora.vercel.app/api/ai/song"
        },
        "health": {
          "key": "module-ai-song",
          "type": "module",
          "path": "/assets/js/features/ai-song.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "elevenlabs",
        "icon": "fa-solid fa-wave-square",
        "name": "Nexora ElevenLabs Studio",
        "description": "Text to Speech, Voice Changer, Speech to Text, dan Sound FX dalam satu studio audio AI",
        "badge": "AUDIO AI",
        "aliases": [
          "elevenlabs studio",
          "text to speech",
          "voice changer",
          "speech to text",
          "sound effect generator"
        ],
        "runtime": {
          "mode": "api",
          "module": "elevenlabs-studio",
          "handler": "renderElevenLabsStudio",
          "dependency": "https://all-tools-nexora.vercel.app/api/elevenlabs"
        },
        "health": {
          "key": "module-elevenlabs-studio",
          "type": "module",
          "path": "/assets/js/features/elevenlabs-studio.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "promptgenerate",
        "icon": "fa-solid fa-pen-ruler",
        "name": "Nexora Prompt Generator",
        "description": "Analisis gambar dengan Nexora Vision AI menjadi prompt produksi profesional",
        "badge": "VISION AI",
        "aliases": [
          "prompt generator"
        ],
        "runtime": {
          "mode": "module",
          "module": "prompt-generator",
          "handler": "renderPromptGenerator"
        },
        "health": {
          "key": "prompt-generator-api",
          "type": "internal-api",
          "path": "/api/prompt-generator",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "novelcover",
        "icon": "fa-solid fa-book-atlas",
        "name": "Nexora Novel Cover Generator",
        "description": "AI Cover Director mengatur artwork, hierarchy, palet, dan typography novel secara otomatis",
        "badge": "AI COVER DIRECTOR",
        "aliases": [
          "novel cover",
          "cover generator",
          "cover novel ai"
        ],
        "runtime": {
          "mode": "module",
          "module": "novel-cover-generator",
          "handler": "renderNovelCoverGenerator"
        },
        "health": {
          "key": "module-novel-cover",
          "type": "module",
          "path": "/assets/js/features/novel-cover-generator.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "fakeovo",
        "icon": "fa-solid fa-wallet",
        "name": "Fake OVO",
        "description": "Simulasi OVO dari provider original dengan watermark permanen",
        "badge": "SIMULASI",
        "runtime": {
          "mode": "api",
          "module": "maker-originals",
          "handler": "renderFakeOvo",
          "dependency": "https://www.keyrafara.com/"
        },
        "health": {
          "key": "module-maker-originals",
          "type": "module",
          "path": "/assets/js/features/maker-originals.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "quotegenerator",
        "icon": "fa-solid fa-quote-left",
        "name": "Quote Generator",
        "description": "Buat gambar quote monokrom",
        "badge": "JPG",
        "runtime": {
          "mode": "module",
          "module": "imported-tools",
          "handler": "renderQuoteGenerator"
        },
        "health": {
          "key": "module-imported",
          "type": "module",
          "path": "/assets/js/features/imported-tools.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "carifakta",
        "icon": "fa-solid fa-magnifying-glass-chart",
        "name": "CariFakta",
        "description": "Analisis klaim dan berita menggunakan AI",
        "badge": "AI",
        "runtime": {
          "mode": "module",
          "module": "imported-tools",
          "handler": "renderCariFakta"
        },
        "health": {
          "key": "module-imported",
          "type": "module",
          "path": "/assets/js/features/imported-tools.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "virusscan",
        "icon": "fa-solid fa-shield-virus",
        "name": "Virus Scan",
        "description": "Scan URL, file, hash, domain & IP",
        "badge": "SECURITY",
        "runtime": {
          "mode": "module",
          "module": "virus-scan",
          "handler": "renderVirusScan"
        },
        "health": {
          "key": "module-virus-scan",
          "type": "module",
          "path": "/assets/js/features/virus-scan.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "cryptomarket",
        "icon": "fa-solid fa-chart-line",
        "name": "Crypto Market Scanner",
        "description": "Analisis candle 15m, 1 jam, mikro, makro, indikator dan risiko crypto",
        "badge": "MTF LIVE",
        "runtime": {
          "mode": "api",
          "module": "crypto-market",
          "handler": "renderCryptoMarket",
          "dependency": "https://api.coingecko.com/"
        },
        "health": {
          "key": "crypto-market-api",
          "type": "internal-api",
          "path": "/api/crypto-market?currency=usd&limit=10",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "webintel",
        "icon": "fa-solid fa-satellite-dish",
        "name": "Nexora Web Intelligence",
        "description": "Audit SEO, security, performa, aksesibilitas dan teknologi website",
        "badge": "INTEL",
        "runtime": {
          "mode": "hybrid",
          "module": "web-intelligence",
          "handler": "renderWebIntelligence",
          "dependency": "https://pagespeedonline.googleapis.com/"
        },
        "health": {
          "key": "web-intelligence-api",
          "type": "internal-api",
          "path": "/api/web-intelligence?health=1",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "ipintel",
        "icon": "fa-solid fa-network-wired",
        "name": "IP & ASN Intelligence",
        "description": "Lookup IPv4/IPv6, ASN, organisasi, negara dan benua via IPinfo Lite",
        "badge": "IPINFO",
        "aliases": [
          "ip asn intelligence"
        ],
        "runtime": {
          "mode": "api",
          "module": "ip-intelligence",
          "handler": "renderIpIntelligence",
          "dependency": "https://api.ipinfo.io/"
        },
        "health": {
          "key": "ip-intelligence-api",
          "type": "internal-api",
          "path": "/api/ip-intelligence?health=1",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "bmkg",
        "icon": "fa-solid fa-cloud-sun-rain",
        "name": "BMKG Indonesia",
        "description": "Gempa terkini, prakiraan cuaca 3 hari dan peringatan dini cuaca dari BMKG",
        "badge": "BMKG",
        "aliases": [
          "bmkg"
        ],
        "runtime": {
          "mode": "api",
          "module": "bmkg-open-data",
          "handler": "renderBmkgIndonesia",
          "dependency": "https://data.bmkg.go.id/"
        },
        "health": {
          "key": "bmkg-open-data-api",
          "type": "internal-api",
          "path": "/api/bmkg?health=1",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "spaceexplorer",
        "icon": "fa-solid fa-user-astronaut",
        "name": "Space Explorer",
        "description": "APOD, galeri Mars, asteroid dekat Bumi dan cuaca antariksa NASA",
        "badge": "NASA",
        "runtime": {
          "mode": "api",
          "module": "space-explorer",
          "handler": "renderSpaceExplorer",
          "dependency": "https://api.nasa.gov/"
        },
        "health": {
          "key": "space-explorer-api",
          "type": "internal-api",
          "path": "/api/space-explorer?health=1",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "ocrintel",
        "icon": "fa-solid fa-file-lines",
        "name": "Nexora OCR Intelligence",
        "description": "Ekstrak teks dari gambar dan PDF, analisis dokumen, lalu buat searchable PDF",
        "badge": "OCR",
        "aliases": [
          "ocr intelligence"
        ],
        "runtime": {
          "mode": "api",
          "module": "ocr-intelligence",
          "handler": "renderOcrIntelligence",
          "dependency": "https://api.ocr.space/"
        },
        "health": {
          "key": "ocr-intelligence-api",
          "type": "internal-api",
          "path": "/api/ocr-intelligence?health=1",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "documentai",
        "icon": "fa-solid fa-file-waveform",
        "name": "Nexora Document AI",
        "description": "Ringkas, analisis, ekstrak tabel, dan tanya isi dokumen dengan Nexora AI",
        "badge": "AI",
        "aliases": [
          "document ai"
        ],
        "runtime": {
          "mode": "api",
          "module": "document-ai",
          "handler": "renderDocumentAi",
          "dependency": "https://generativelanguage.googleapis.com/"
        },
        "health": {
          "key": "document-ai-api",
          "type": "internal-api",
          "path": "/api/document-ai",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "autopdf",
        "icon": "fa-solid fa-file-pdf",
        "name": "Nexora Auto PDF",
        "description": "Ubah teks panjang menjadi PDF A5 rapi dengan pagination otomatis",
        "badge": "PDF",
        "aliases": [
          "auto pdf",
          "text to pdf",
          "teks ke pdf"
        ],
        "runtime": {
          "mode": "api",
          "module": "text-to-pdf",
          "handler": "renderTextToPdf",
          "dependency": "https://all-tools-nexora.vercel.app/api/tools/text-to-pdf"
        },
        "health": {
          "key": "text-to-pdf-api",
          "type": "internal-api",
          "path": "/api/tools/text-to-pdf",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "svgalight",
        "icon": "fa-solid fa-vector-square",
        "name": "SVG → Alight XML",
        "description": "Konversi SVG ke XML Alight Motion dengan AM Optimized, Maximum Fidelity, audit kesamaan, dan kontrol layer",
        "badge": "ENGINE v1.8",
        "aliases": [
          "svg alight xml",
          "anime vector atelier"
        ],
        "runtime": {
          "mode": "api",
          "module": "svg-alight",
          "handler": "renderSvgAlight",
          "dependency": "https://svgtoxml.vercel.app/"
        },
        "health": {
          "key": "svg-alight-api",
          "type": "internal-api",
          "path": "/api/svg-alight",
          "method": "GET",
          "strict": true
        }
      },
      {
        "id": "alightpremium",
        "icon": "fa-solid fa-bolt",
        "name": "Alight Motion Premium 1 Tahun",
        "description": "Request magic link lalu proses aktivasi Premium melalui API reseller",
        "badge": "1 YEAR",
        "aliases": [
          "alight premium"
        ],
        "runtime": {
          "mode": "api",
          "module": "alight-premium",
          "handler": "renderAlightPremium",
          "dependency": "https://api.kyzznekoo.my.id/"
        },
        "health": {
          "key": "alight-premium-api",
          "type": "internal-api",
          "path": "/api/alight-premium",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "imagevectorizer",
        "icon": "fa-solid fa-bezier-curve",
        "name": "Nexora Image Vectorizer",
        "description": "Ubah PNG atau JPG menjadi SVG melalui FreeConvert Cloud",
        "badge": "SVG",
        "aliases": [
          "image vectorizer"
        ],
        "runtime": {
          "mode": "module",
          "module": "image-vectorizer",
          "handler": "renderImageVectorizer"
        },
        "health": {
          "key": "module-image-vectorizer",
          "type": "module",
          "path": "/assets/js/features/image-vectorizer.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "smartcutout",
        "icon": "fa-solid fa-object-ungroup",
        "name": "Nexora Smart Cutout",
        "description": "Tap objek, refine mask, lalu ekspor PNG transparan dengan MagicTouch lokal di browser",
        "badge": "LOCAL AI",
        "aliases": [
          "smart cutout",
          "magic object selector",
          "object cutout",
          "sam image"
        ],
        "runtime": {
          "mode": "module",
          "module": "smart-cutout",
          "handler": "renderNexoraSmartCutout",
          "dependency": "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite"
        },
        "health": {
          "key": "module-smart-cutout",
          "type": "module",
          "path": "/assets/js/features/smart-cutout.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "placeholderstudio",
        "icon": "fa-regular fa-image",
        "name": "Nexora Placeholder Studio",
        "description": "Buat placeholder Classic atau berbasis prompt melalui URL CDN publik",
        "badge": "NO API KEY",
        "aliases": [
          "placeholder studio",
          "placeholder image",
          "classic placeholder",
          "prompt placeholder",
          "placeholdr"
        ],
        "runtime": {
          "mode": "hybrid",
          "module": "placeholder-studio",
          "handler": "renderNexoraPlaceholderStudio",
          "dependency": "https://placeholderimage.co/"
        },
        "health": {
          "key": "module-placeholder-studio",
          "type": "module",
          "path": "/assets/js/features/placeholder-studio.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "text2d",
        "icon": "fa-solid fa-font",
        "name": "2D Text Animate / Text FX",
        "description": "Buat XML animasi teks 2D dengan preset dan Style FX lokal",
        "badge": "XML",
        "aliases": [
          "2d text animate"
        ],
        "runtime": {
          "mode": "module",
          "module": "nexora-text-2d",
          "handler": "renderNexoraText2D"
        },
        "health": {
          "key": "module-nexora-runtime",
          "type": "module",
          "path": "/assets/js/features/nexora/nexora-runtime.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "text3d",
        "icon": "fa-solid fa-cube",
        "name": "3D Text Animate",
        "description": "Buat XML teks 3D, extrude, offset, dan long shadow",
        "badge": "7 PRESET",
        "runtime": {
          "mode": "module",
          "module": "nexora-text-3d",
          "handler": "renderNexoraText3D"
        },
        "health": {
          "key": "module-nexora-3d",
          "type": "module",
          "path": "/assets/vendor/nexora/3d-engine.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "textfxanimation",
        "icon": "fa-solid fa-text-height",
        "name": "Text FX Animation",
        "description": "Preset efek teks native untuk Alight Motion",
        "badge": "5 PRESET",
        "runtime": {
          "mode": "module",
          "module": "nexora-text-fx-animation",
          "handler": "renderNexoraTextFxAnimation"
        },
        "health": {
          "key": "module-nexora-fx",
          "type": "module",
          "path": "/assets/vendor/nexora/text-fx-animation-engine.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "textvector",
        "icon": "fa-solid fa-draw-polygon",
        "name": "Text to Vector",
        "description": "Ubah font lokal menjadi path vector Alight Motion",
        "badge": "OPENTYPE",
        "runtime": {
          "mode": "module",
          "module": "nexora-text-vector",
          "handler": "renderNexoraTextVector"
        },
        "health": {
          "key": "module-nexora-vector",
          "type": "module",
          "path": "/assets/js/workers/nexora-vector-worker.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "trimpath",
        "icon": "fa-solid fa-route",
        "name": "Trimpath Generator",
        "description": "Generator trimpath huruf dengan style, timing, dan color mapping",
        "badge": "LOCAL XML",
        "runtime": {
          "mode": "module",
          "module": "nexora-trimpath",
          "handler": "renderNexoraTrimpath"
        },
        "health": {
          "key": "module-nexora-trimpath",
          "type": "module",
          "path": "/assets/vendor/nexora/trimpath-engine.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "logoanimate",
        "icon": "fa-solid fa-shapes",
        "name": "Logo Animate",
        "description": "Template animasi logo dan text block Alight Motion",
        "badge": "8.33S",
        "runtime": {
          "mode": "module",
          "module": "nexora-logo-animate",
          "handler": "renderNexoraLogoAnimate"
        },
        "health": {
          "key": "module-nexora-logo",
          "type": "module",
          "path": "/assets/js/features/nexora/logo-engine.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "calc",
        "icon": "fa-solid fa-calculator",
        "name": "Calculator",
        "description": "Hitung cepat",
        "badge": "Math",
        "runtime": {
          "mode": "local",
          "handler": "renderCalc"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "pwgen",
        "icon": "fa-solid fa-key",
        "name": "Password Gen",
        "description": "Password aman",
        "badge": "Secure",
        "runtime": {
          "mode": "local",
          "handler": "renderPwgen"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "morse",
        "icon": "fa-solid fa-tower-broadcast",
        "name": "Morse Code",
        "description": "Konversi morse",
        "badge": "Audio",
        "runtime": {
          "mode": "local",
          "handler": "renderMorse"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "removebg",
        "icon": "fa-solid fa-eraser",
        "name": "Remove BG",
        "description": "Hapus background",
        "badge": "AI",
        "runtime": {
          "mode": "local",
          "handler": "renderRemovebg"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "enhancer",
        "icon": "fa-solid fa-sliders",
        "name": "Nexora Image HD Enhancer V4",
        "description": "Tingkatkan kualitas gambar dari link atau galeri",
        "badge": "HD V4",
        "aliases": [
          "image hd enhancer v4",
          "image enhancer",
          "image upscaler"
        ],
        "runtime": {
          "mode": "api",
          "module": "hd4-enhancer",
          "handler": "renderHd4Enhancer",
          "dependency": "https://all-tools-nexora.vercel.app/api/tools/hd4"
        },
        "health": {
          "key": "module-hd4-enhancer",
          "type": "module",
          "path": "/assets/js/features/hd4-enhancer.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "worldclassics",
        "name": "World Classics Reader",
        "icon": "fa-solid fa-book-open",
        "description": "Sastra klasik China, Jepang, dan Korea dengan terjemahan Indonesia, bookmark, dan riwayat membaca.",
        "badge": "NEW",
        "runtime": {
          "mode": "module",
          "module": "world-classics",
          "handler": "renderWorldClassics"
        },
        "health": {
          "key": "module-world-classics",
          "type": "module",
          "path": "/assets/js/features/world-classics/reader.js",
          "method": "HEAD",
          "strict": true
        }
      }
    ],
    "vault": [
      {
        "id": "ttquote",
        "icon": "fa-solid fa-comment-dots",
        "name": "Quote TikTok Nexora",
        "description": "Buat fake TikTok chat versi Nexora",
        "badge": "NEXORA",
        "runtime": {
          "mode": "module",
          "module": "tiktok-quote",
          "handler": "renderTiktokQuote"
        },
        "health": {
          "key": "module-tiktok-quote",
          "type": "module",
          "path": "/assets/js/features/tiktok-quote.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "qrgen",
        "icon": "fa-solid fa-qrcode",
        "name": "QR Generator",
        "description": "Buat QR langsung di sini",
        "badge": "QR",
        "runtime": {
          "mode": "local",
          "handler": "renderQrGenerator"
        },
        "health": {
          "key": "core-app",
          "type": "module",
          "path": "/assets/js/core/app.js",
          "method": "HEAD",
          "strict": true
        }
      }
    ],
    "external": [
      {
        "id": "tiktokhd",
        "icon": "fa-solid fa-upload",
        "name": "Upload TikTok HD",
        "description": "Proses MP4 HD + TikTok Studio",
        "badge": "HD",
        "runtime": {
          "mode": "external",
          "handler": "openTikTokHdUpload",
          "dependency": "https://www.tiktok.com/tiktokstudio"
        },
        "health": {
          "key": "core-shell",
          "type": "module",
          "path": "/assets/js/core/shell.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "getcode",
        "icon": "fa-solid fa-code",
        "name": "Get Code HTML",
        "description": "Extract, preview, copy & download source",
        "badge": "PRO",
        "runtime": {
          "mode": "module",
          "module": "get-code",
          "handler": "openGetCodeRoom",
          "opener": "openGetCodeRoom"
        },
        "health": {
          "key": "module-get-code",
          "type": "module",
          "path": "/assets/js/features/get-code.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "vdeploy",
        "icon": "fa-solid fa-rocket",
        "name": "Deploy & Update Web",
        "description": "Deploy Vercel atau Netlify + update project",
        "badge": "UPDATE",
        "aliases": [
          "deploy website"
        ],
        "runtime": {
          "mode": "module",
          "module": "deploy-center",
          "handler": "openDeploy",
          "opener": "openDeploy"
        },
        "health": {
          "key": "module-deploy-center",
          "type": "module",
          "path": "/assets/js/features/deploy-center.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "zxvai",
        "icon": "fa-solid fa-robot",
        "name": "ZxVAI",
        "description": "AI tools & APK",
        "link": "https://zxvaiapk.netlify.app/",
        "runtime": {
          "mode": "external",
          "dependency": "https://zxvaiapk.netlify.app/"
        },
        "health": {
          "key": "zxvai-app",
          "type": "external-app",
          "url": "https://zxvaiapk.netlify.app/",
          "method": "HEAD"
        }
      },
      {
        "id": "fotolink",
        "icon": "fa-solid fa-link",
        "name": "Foto To Link",
        "description": "Upload & share",
        "link": "https://pixvault-bykz.netlify.app/",
        "runtime": {
          "mode": "external",
          "dependency": "https://pixvault-bykz.netlify.app/"
        },
        "health": {
          "key": "pixvault-app",
          "type": "external-app",
          "url": "https://pixvault-bykz.netlify.app/",
          "method": "HEAD"
        }
      },
      {
        "id": "webencryption",
        "icon": "fa-solid fa-lock",
        "name": "Web Encryption",
        "description": "Encrypt & protect HTML",
        "badge": "SECURE",
        "runtime": {
          "mode": "module",
          "module": "web-encryption",
          "handler": "renderWebEncryption"
        },
        "health": {
          "key": "module-web-encryption",
          "type": "module",
          "path": "/assets/js/features/web-encryption.js",
          "method": "HEAD",
          "strict": true
        }
      },
      {
        "id": "unbanwa",
        "icon": "fa-brands fa-whatsapp",
        "name": "Unban WhatsApp",
        "description": "Tools & panduan unban WhatsApp",
        "badge": "WA",
        "runtime": {
          "mode": "module",
          "module": "unban-whatsapp",
          "handler": "openNexoraUnban",
          "opener": "openNexoraUnban"
        },
        "health": {
          "key": "module-unban",
          "type": "module",
          "path": "/assets/js/features/unban-whatsapp.js",
          "method": "HEAD",
          "strict": true
        }
      }
    ]
  }
};

  function deepFreeze(value){
    if(!value||typeof value!=="object"||Object.isFrozen(value))return value;
    Object.keys(value).forEach(function(key){deepFreeze(value[key]);});
    return Object.freeze(value);
  }

  return deepFreeze(config);
});

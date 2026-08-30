/* Nexora application shell — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 13: nxAboutDevRoomScript ===== */
(function(){
  "use strict";

  // About Dev dipindahkan ke file lokal agar mudah dirawat dan tidak membawa profil lama.
  var loaded = false;

  var room = document.getElementById("nxAboutDevRoom");
  var frame = document.getElementById("nxAboutDevFrame");
  var loader = document.getElementById("nxAboutDevLoader");
  var openButton = document.getElementById("nxAboutDevOpen");
  var backButton = document.getElementById("nxAboutDevBack");

  function decodeBase64(value){
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);

    for(var index=0;index<binary.length;index++){
      bytes[index] = binary.charCodeAt(index);
    }

    if(typeof TextDecoder !== "undefined"){
      return new TextDecoder("utf-8").decode(bytes);
    }

    var encoded = "";
    for(var offset=0;offset<bytes.length;offset++){
      encoded += "%" +
        bytes[offset].toString(16).padStart(2,"0");
    }
    return decodeURIComponent(encoded);
  }

  function ensureLoaded(){
    if(loaded || !frame) return;
    loaded = true;

    frame.addEventListener("load",function(){
      if(loader) loader.classList.add("is-hidden");
    },{once:true});

    frame.src = "about.html";
  }

  function openAboutDev(){
    if(!room) return;

    ensureLoaded();
    room.classList.add("is-open");
    room.setAttribute("aria-hidden","false");
    document.body.classList.add("nx-about-dev-open");

    if(loader && !frame.contentDocument){
      loader.classList.remove("is-hidden");
    }
  }

  function closeAboutDev(){
    if(!room) return;

    room.classList.remove("is-open");
    room.setAttribute("aria-hidden","true");
    document.body.classList.remove("nx-about-dev-open");
  }

  if(openButton){
    openButton.addEventListener("click",openAboutDev);
  }

  if(backButton){
    backButton.addEventListener("click",closeAboutDev);
  }

  document.addEventListener("keydown",function(event){
    if(
      event.key === "Escape" &&
      room &&
      room.classList.contains("is-open")
    ){
      closeAboutDev();
    }
  });

  window.openNexoraAboutDev = openAboutDev;
  window.closeNexoraAboutDev = closeAboutDev;
})();

/* ===== original script 17: nxTopHamburgerMenuScript ===== */
(function(){
  "use strict";

  const menu =
    document.getElementById(
      "nxTopMenu"
    );

  const button =
    document.getElementById(
      "nxTopMenuButton"
    );

  const panel =
    document.getElementById(
      "nxTopMenuPanel"
    );

  const about =
    document.getElementById(
      "nxTopMenuAbout"
    );

  const feedback =
    document.getElementById(
      "nxTopMenuFeedback"
    );

  if(
    !menu ||
    !button ||
    !panel
  ){
    return;
  }

  function setOpen(open){
    const active =
      Boolean(open);

    menu.classList.toggle(
      "is-open",
      active
    );

    button.setAttribute(
      "aria-expanded",
      String(active)
    );

    button.setAttribute(
      "aria-label",
      active
        ? "Tutup menu Nexora"
        : "Buka menu Nexora"
    );
  }

  function closeMenu(){
    setOpen(false);
  }

  button.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      setOpen(
        !menu.classList.contains(
          "is-open"
        )
      );
    }
  );

  panel.addEventListener(
    "click",
    event => {
      event.stopPropagation();
    }
  );

  document.addEventListener(
    "click",
    event => {
      if(
        menu.classList.contains(
          "is-open"
        ) &&
        !menu.contains(event.target)
      ){
        closeMenu();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if(
        event.key === "Escape" &&
        menu.classList.contains(
          "is-open"
        )
      ){
        closeMenu();
        button.focus();
      }
    }
  );

  window.addEventListener(
    "scroll",
    () => {
      if(
        menu.classList.contains(
          "is-open"
        )
      ){
        closeMenu();
      }
    },
    {
      passive:true
    }
  );

  if(about){
    about.addEventListener(
      "click",
      () => {
        closeMenu();

        if(
          typeof window
            .openNexoraAboutDev ===
          "function"
        ){
          window
            .openNexoraAboutDev();
          return;
        }

        const oldButton =
          document.getElementById(
            "nxAboutDevOpen"
          );

        if(oldButton){
          oldButton.click();
        }
      }
    );
  }

  if(feedback){
    feedback.addEventListener(
      "click",
      () => {
        closeMenu();

        if(
          typeof window
            .openNexoraReportRoom ===
          "function"
        ){
          window
            .openNexoraReportRoom();
          return;
        }

        if(
          typeof window.showTool ===
          "function"
        ){
          window.showTool(
            "saranide"
          );
        }
      }
    );
  }

  window.openNexoraTopMenu =
    () => setOpen(true);

  window.closeNexoraTopMenu =
    closeMenu;
})();

/* ===== original script 18: nxReportFeedbackRoomScript ===== */
(function(){
  "use strict";

  // Feedback kini dikirim melalui endpoint server; tidak ada token rahasia di browser.

  const room =
    document.getElementById(
      "nxReportFeedbackRoom"
    );

  const frame =
    document.getElementById(
      "nxReportFeedbackFrame"
    );

  const loader =
    document.getElementById(
      "nxReportFeedbackLoader"
    );

  const back =
    document.getElementById(
      "nxReportFeedbackBack"
    );

  let loaded = false;

  function ensureLoaded(){
    if(
      loaded ||
      !frame
    ){
      return;
    }

    loaded = true;

    if(loader){
      loader.classList.remove(
        "is-hidden"
      );
    }

    frame.addEventListener(
      "load",
      function(){
        if(loader){
          loader.classList.add(
            "is-hidden"
          );
        }
      },
      {once:true}
    );

    frame.src = "feedback.html";
  }

  function closeUniversalRoomBelow(){
    if(
      typeof window.closeNexoraToolRoom ===
      "function"
    ){
      const universal =
        document.getElementById(
          "nxUniversalRoom"
        );

      if(
        universal &&
        universal.classList.contains(
          "is-open"
        )
      ){
        try{
          window.closeNexoraToolRoom();
        }catch(error){}
      }
    }
  }

  function openReportRoom(){
    if(!room) return;

    closeUniversalRoomBelow();
    ensureLoaded();

    room.classList.add(
      "is-open"
    );

    room.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.classList.add(
      "nx-about-dev-open"
    );
  }

  function closeReportRoom(){
    if(!room) return;

    room.classList.remove(
      "is-open"
    );

    room.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.classList.remove(
      "nx-about-dev-open"
    );
  }

  if(back){
    back.addEventListener(
      "click",
      closeReportRoom
    );
  }

  document.addEventListener(
    "keydown",
    function(event){
      if(
        event.key === "Escape" &&
        room &&
        room.classList.contains(
          "is-open"
        )
      ){
        event.preventDefault();
        closeReportRoom();
      }
    }
  );

  window.openNexoraReportRoom =
    openReportRoom;

  window.closeNexoraReportRoom =
    closeReportRoom;

  /*
    Compatibility renderer:
    any old Saran & Ide card now opens this full room.
  */
  window.renderSaranIde =
    function(){
      openReportRoom();
    };
})();

/* ===== Nexora v6.3.13: unlocked external tools ===== */
(function(){
  "use strict";
  const TIKTOK_STUDIO_URL="https://www.tiktok.com/tiktokstudio";
  window.openTikTokHdUpload=function(){
    const opened=window.open(TIKTOK_STUDIO_URL,"_blank","noopener,noreferrer");
    if(!opened) window.location.href=TIKTOK_STUDIO_URL;
    return false;
  };
  window.renderTikTokHdUpload=window.openTikTokHdUpload;
  window.isNexoraLockedTool=function(){return false;};
})();


/* ===== original script 26: nxUniversalToolRoomsScript ===== */
(function(){
  'use strict';

  var previousShowTool = window.showTool;
  var room = null;
  var roomBody = null;
  var currentToolId = '';
  var restoreScrollY = 0;
  var restoreBodyOverflow = '';
  var closeTimer = 0;
  var historyLock = false;

  var roomTools = {
    
    
    
    comicreader:{renderer:'renderComicReader', category:'tools', icon:'fa-solid fa-book-open-reader', title:'Komik Indonesia', desc:'Manga, manhwa, dan manhua lengkap dengan pencarian, favorit, riwayat, chapter, bahasa, serta reader vertikal.', accent:'#c084fc', accent2:'#ec4899', rgb:'192,132,252', badge:'Nexora Comic Core'},
    aiimage:{renderer:'renderPuterImage', category:'tools', icon:'fa-solid fa-image', title:'Nexora AI Image', desc:'Buat gambar AI dengan akun dan allowance Puter milik pengguna. Nexora tidak menyimpan prompt, password, atau gambar hasil.', accent:'#a78bfa', accent2:'#22d3ee', rgb:'167,139,250', badge:'Puter User-Pays AI'},
    aivideo:{renderer:'renderPuterVideo', category:'tools', icon:'fa-solid fa-clapperboard', title:'Nexora AI Video Generator', desc:'Buat video dari prompt atau gambar referensi memakai akun dan allowance Puter milik pengguna.', accent:'#a855f7', accent2:'#22d3ee', rgb:'168,85,247', badge:'Puter AI Video'},
    genmail:{renderer:'renderGenMail', category:'tools', icon:'fa-solid fa-envelope-open-text', title:'GenMail', desc:'Buat alamat email sementara, periksa inbox, dan baca pesan melalui proxy aman Nexora.', accent:'#a78bfa', accent2:'#22d3ee', rgb:'167,139,250', badge:'Advanced Temp Mail'},
    danbooru:{renderer:'renderDanbooruSearch', category:'tools', icon:'fa-solid fa-images', title:'Danbooru Search', desc:'Cari ilustrasi anime berdasarkan tag melalui proxy aman Nexora dengan gallery ringan dan mode Safe sebagai pilihan awal.', accent:'#c084fc', accent2:'#22d3ee', rgb:'192,132,252', badge:'Anime Art Search'},
    animetoreal:{renderer:'renderAnimeToReal', category:'tools', icon:'fa-solid fa-wand-magic-sparkles', title:'Anime to Real', desc:'Ubah URL ilustrasi anime menjadi gambar realistis melalui proxy AI aman Nexora.', accent:'#a78bfa', accent2:'#22d3ee', rgb:'167,139,250', badge:'AI Image Transform'},
    aisong:{renderer:'renderAiSong', category:'tools', icon:'fa-solid fa-music', title:'Nexora AI Song Generator', desc:'Ubah ide, cerita, mood, vokal, dan genre menjadi lagu melalui gateway AI aman Nexora.', accent:'#a855f7', accent2:'#7c3aed', rgb:'168,85,247', badge:'Nexora Music AI'},
    promptgenerate:{renderer:'renderPromptGenerator', category:'tools', icon:'fa-solid fa-wand-magic-sparkles', title:'Nexora Prompt Generator', desc:'Nexora Vision AI membaca gambar dan menyusun prompt profesional untuk Midjourney, FLUX, SDXL, Ideogram, dan image-to-video.', accent:'#67e8f9', accent2:'#7c3aed', rgb:'103,232,249', badge:'Vision Prompt Architect'},
    fakeovo:{renderer:'renderFakeOvo', category:'tools', icon:'fa-solid fa-wallet', title:'Fake OVO', desc:'Atur nominal dan hasilkan tampilan saldo OVO.', accent:'#a78bfa', accent2:'#6d28d9', rgb:'167,139,250', badge:'Nexora Canvas Studio'},
    quotegenerator:{renderer:'renderQuoteGenerator', category:'tools', icon:'fa-solid fa-quote-left', title:'Quote Generator', desc:'Susun teks dan penulis lalu render gambar quote monokrom.', accent:'#cbd5e1', accent2:'#7c3aed', rgb:'203,213,225', badge:'Nexora Quote Studio'},
    carifakta:{renderer:'renderCariFakta', category:'tools', icon:'fa-solid fa-magnifying-glass-chart', title:'CariFakta', desc:'Periksa klaim, konteks, dan tingkat keyakinan menggunakan AI.', accent:'#4ade80', accent2:'#7c3aed', rgb:'74,222,128', badge:'Nexora Fact Intelligence'},
    mltools:{renderer:'renderMlTools', category:'tools', icon:'fa-solid fa-gamepad', title:'ML Tools Nexora', desc:'Script Skin MLBB, kalkulator Winrate, dan Stalk akun dengan mesin serta hasil asli ML Tools.', accent:'#67e8f9', accent2:'#7c3aed', rgb:'103,232,249', badge:'Nexora ML Gaming Lab'},
virusscan:  {renderer:'renderVirusScan', category:'tools', icon:'fa-solid fa-shield-virus', title:'Virus Scan Nexora', desc:'Analisis lokal untuk URL, file, hash, domain, dan IP dalam ruang keamanan All Tools Nexora.', accent:'#c084fc', accent2:'#7c3aed', rgb:'192,132,252', badge:'Nexora Security Core'},
    cryptomarket:{renderer:'renderCryptoMarket', category:'tools', icon:'fa-solid fa-chart-line', title:'Crypto Market Scanner', desc:'Analisis multi-timeframe 15m, 1 jam, mikro, makro, indikator teknikal, dan referensi risiko dari candle tertutup.', accent:'#22d3ee', accent2:'#34d399', rgb:'34,211,238', badge:'MTF Market Intelligence'},
    webintel:{renderer:'renderWebIntelligence', category:'tools', icon:'fa-solid fa-satellite-dish', title:'Nexora Web Intelligence', desc:'Ubah URL menjadi audit SEO, security, performa, aksesibilitas, stack, tracker, dan rekomendasi teknis berbasis bukti.', accent:'#22d3ee', accent2:'#8b5cf6', rgb:'34,211,238', badge:'Nexora Intelligence Engine'},
    ipintel:{renderer:'renderIpIntelligence', category:'tools', icon:'fa-solid fa-network-wired', title:'IP & ASN Intelligence', desc:'Lookup IPv4/IPv6 untuk ASN, organisasi jaringan, domain, negara, benua, dan status bogon melalui IPinfo Lite.', accent:'#27d3ff', accent2:'#8b5cf6', rgb:'39,211,255', badge:'IPinfo Lite Network Intel'},
    bmkg:{renderer:'renderBmkgIndonesia', category:'tools', icon:'fa-solid fa-cloud-sun-rain', title:'BMKG Indonesia', desc:'Pantau gempa terkini, prakiraan cuaca 3 hari, dan peringatan dini cuaca dari jalur Open Data resmi BMKG.', accent:'#27a9e0', accent2:'#67b84b', rgb:'39,169,224', badge:'BMKG Open Data'},
    spaceexplorer:{renderer:'renderSpaceExplorer', category:'tools', icon:'fa-solid fa-user-astronaut', title:'Space Explorer', desc:'Jelajahi APOD, arsip misi Mars, asteroid dekat Bumi, dan cuaca antariksa melalui pusat data resmi NASA.', accent:'#67e8f9', accent2:'#fb7185', rgb:'103,232,249', badge:'NASA Deep Space Link'},
    ocrintel:{renderer:'renderOcrIntelligence', category:'tools', icon:'fa-solid fa-file-lines', title:'Nexora OCR Intelligence', desc:'Ubah foto, screenshot, dan PDF menjadi teks yang dapat dicari, disalin, dianalisis, dan diunduh kembali.', accent:'#38bdf8', accent2:'#a78bfa', rgb:'56,189,248', badge:'Document Vision Engine'},
    documentai:{renderer:'renderDocumentAi', category:'tools', icon:'fa-solid fa-file-waveform', title:'Nexora Document AI', desc:'Analisis PDF, scan, gambar, dan dokumen teks dengan ringkasan, ekstraksi tabel, ekspor, serta tanya-jawab Nexora AI.', accent:'#b782ff', accent2:'#69e8f2', rgb:'183,130,255', badge:'VVIP Document Intelligence'},
    svgalight:{renderer:'renderSvgAlight', category:'tools', icon:'fa-solid fa-wand-magic-sparkles', title:'SVG → Alight XML', desc:'Konversi SVG menjadi XML Alight Motion melalui API resmi v1.8 dengan AM Optimized, Maximum Fidelity, audit kesamaan, dan kontrol layer.', accent:'#67e8f9', accent2:'#f0abfc', rgb:'103,232,249', badge:'Engine v1.8'},
    alightpremium:{renderer:'renderAlightPremium', category:'tools', icon:'fa-solid fa-bolt', title:'Alight Motion Premium 1 Tahun', desc:'Request magic link dan proses aktivasi Premium lewat API reseller dengan API key server-side atau key milik pengguna.', accent:'#8b5cf6', accent2:'#22d3ee', rgb:'139,92,246', badge:'Reseller Activation'},
    imagevectorizer:{renderer:'renderImageVectorizer', category:'tools', icon:'fa-solid fa-bezier-curve', title:'Nexora Image Vectorizer', desc:'Ubah PNG atau JPG menjadi SVG melalui FreeConvert Cloud dengan signed direct upload dan preview yang tetap proporsional.', accent:'#5eead4', accent2:'#a3e635', rgb:'94,234,212', badge:'FreeConvert Cloud'},
    smartcutout:{renderer:'renderNexoraSmartCutout', category:'tools', icon:'fa-solid fa-object-ungroup', title:'Nexora Smart Cutout', desc:'Tap objek, refine mask dengan titik Select atau Remove, lalu ekspor PNG transparan. Semua piksel tetap diproses lokal di browser.', accent:'#a855f7', accent2:'#7c3aed', rgb:'168,85,247', badge:'SlimSAM · Local AI'},
    text2d:{renderer:'renderNexoraText2D',category:'tools',icon:'fa-solid fa-font',title:'2D Text Animate / Text FX',desc:'Generator XML teks 2D dengan preset, keyframe, cubic Bézier, Style FX, color mapping, dan timing lokal.',accent:'#a78bfa',accent2:'#22d3ee',rgb:'167,139,250',badge:'Nexora XML Engine'},
    text3d:{renderer:'renderNexoraText3D',category:'tools',icon:'fa-solid fa-cube',title:'3D Text Animate',desc:'Tujuh preset XML teks 3D, extrude, offset, popup, flip, dan long shadow yang berjalan sepenuhnya lokal.',accent:'#f97316',accent2:'#a855f7',rgb:'249,115,22',badge:'7 Native Presets'},
    textfxanimation:{renderer:'renderNexoraTextFxAnimation',category:'tools',icon:'fa-solid fa-wand-magic-sparkles',title:'Text FX Animation',desc:'Lima template efek teks native dengan mode karakter/kata dan penggantian color role.',accent:'#ec4899',accent2:'#22d3ee',rgb:'236,72,153',badge:'5 Native FX'},
    textvector:{renderer:'renderNexoraTextVector',category:'tools',icon:'fa-solid fa-draw-polygon',title:'Text to Vector',desc:'Konversi teks menjadi path vector Alight Motion memakai OpenType dan font lokal di Web Worker.',accent:'#34d399',accent2:'#38bdf8',rgb:'52,211,153',badge:'Local OpenType Worker'},
    trimpath:{renderer:'renderNexoraTrimpath',category:'tools',icon:'fa-solid fa-route',title:'Trimpath Generator',desc:'Generator trimpath berbasis data huruf, metrics, mask, style, timing, dan color mapping asli.',accent:'#38bdf8',accent2:'#8b5cf6',rgb:'56,189,248',badge:'Native Letter Engine'},
    logoanimate:{renderer:'renderNexoraLogoAnimate',category:'tools',icon:'fa-solid fa-shapes',title:'Logo Animate',desc:'Template XML animasi logo 8,33 detik dengan hierarki efek dan text block lokal.',accent:'#f59e0b',accent2:'#ec4899',rgb:'245,158,11',badge:'Local XML Template'},
instagram:  {renderer:'renderInstagram',   category:'downloader', icon:'fa-brands fa-instagram', title:'Instagram Downloader', desc:'Ambil video, Reels, foto, carousel, metadata, dan caption dalam ruang download khusus.', accent:'#e879f9', accent2:'#c026d3', rgb:'232,121,249', badge:'Media Studio'},
    aiodownloader:{renderer:'renderAioDownloader',category:'downloader',icon:'fa-solid fa-cloud-arrow-down',title:'All In One Downloader',desc:'Tempel satu link media lalu buka atau salin pilihan download yang benar-benar diberikan layanan.',accent:'#8b5cf6',accent2:'#0891b2',rgb:'139,92,246',badge:'Universal Media Tool'},
    youtube:    {renderer:'renderYoutube',     category:'downloader', icon:'fa-brands fa-youtube', title:'YouTube Metadata', desc:'Lihat metadata publik dan lanjutkan melalui tautan resmi YouTube. Konversi MP4/MP3 tidak disediakan.', accent:'#fb7185', accent2:'#dc2626', rgb:'251,113,133', badge:'Official Link'},
    spotify:    {renderer:'renderSpotify',     category:'downloader', icon:'fa-brands fa-spotify', title:'Spotify Downloader', desc:'Coba unduh audio melalui provider; fallback otomatis ke metadata dan tautan Spotify resmi.', accent:'#4ade80', accent2:'#16a34a', rgb:'74,222,128', badge:'Best Effort MP3'},
    terabox:    {renderer:'renderTerabox', category:'downloader', icon:'fa-solid fa-box-open', title:'Terabox Downloader', desc:'Ambil daftar file dari tautan share Terabox dan unduh file yang tersedia.', accent:'#60a5fa', accent2:'#2563eb', rgb:'96,165,250', badge:'Nexora Cloud Downloader'},
    brat:       {renderer:'renderBrat',        category:'maker', icon:'fa-solid fa-wand-magic-sparkles', title:'BRAT Generator', desc:'Buat karya BRAT statis atau animasi GIF dengan area kerja penuh dan hasil yang mudah dipantau.', accent:'#facc15', accent2:'#f97316', rgb:'250,204,21', badge:'Creative Maker'},
    iqc:        {renderer:'renderIqc',         category:'maker', icon:'fa-solid fa-image', title:'IQC Generator', desc:'Susun gambar IQC, atur isi, lalu lihat preview dalam ruang desain khusus.', accent:'#67e8f9', accent2:'#0891b2', rgb:'103,232,249', badge:'Image Composer'},
    sertifikat: {renderer:'renderSertifikatTololSource', category:'maker', icon:'fa-solid fa-certificate', title:'Sertifikat Custom', desc:'Buat sertifikat melalui API sumber dengan renderer lokal otomatis saat layanan pihak ketiga tidak tersedia.', accent:'#facc15', accent2:'#a855f7', rgb:'250,204,21', badge:'API + Local Fallback'},

    ektp:       {renderer:'renderEktp',        category:'maker', icon:'fa-solid fa-id-card', title:'E-KTP Generator', desc:'Lengkapi formulir demo dan hasilkan kartu dalam ruang editor identitas terpisah.', accent:'#60a5fa', accent2:'#2563eb', rgb:'96,165,250', badge:'Identity Studio'},
    fakedana:   {renderer:'renderFakeDana',    category:'maker', icon:'fa-solid fa-money-bill-wave', title:'Fake Dana', desc:'Atur tampilan saldo simulasi dan buat hasil visual dalam ruang generator khusus.', accent:'#38bdf8', accent2:'#0284c7', rgb:'56,189,248', badge:'Balance Mockup'},
    fakebankjago:{renderer:'renderFakeBankJago', category:'maker', icon:'fa-solid fa-building-columns', title:'Fake Bank Jago', desc:'Buat visual simulasi saldo Bank Jago menggunakan nama dan nominal.', accent:'#facc15', accent2:'#f97316', rgb:'250,204,21', badge:'Nexora Simulation Maker'},
    fakedev:    {renderer:'renderFakeDev',     category:'maker', icon:'fa-solid fa-laptop-code', title:'FakeDev', desc:'Generator profil developer menggunakan endpoint gambar asli dari HTML Nexora Tools.', accent:'#a78bfa', accent2:'#6d28d9', rgb:'167,139,250', badge:'Nexora Source API'},
    fakelobby:  {renderer:'renderFakeLobby',   category:'maker', icon:'fa-solid fa-gamepad', title:'Fake Lobby', desc:'Buat tampilan lobby game simulasi dengan kontrol dan preview dalam satu halaman.', accent:'#fb7185', accent2:'#7c3aed', rgb:'251,113,133', badge:'Gaming Room'},
    winquotes:  {renderer:'renderWinquotes',   category:'maker', icon:'fa-brands fa-windows', title:'Windows Quotes', desc:'Tulis quote dan hasilkan meme bergaya Windows dalam 2 pilihan style.', accent:'#38bdf8', accent2:'#2563eb', rgb:'56,189,248', badge:'Quote Creator'},
    nokiamsg:   {renderer:'renderNokiaMsg',   category:'maker', icon:'fa-solid fa-mobile-retro', title:'Nokia Message', desc:'Susun pesan SMS jadul dan hasilkan gambar dalam ruang generator retro.', accent:'#a3e635', accent2:'#65a30d', rgb:'163,230,52', badge:'Retro Message'},
    tanyaustadz:{renderer:'renderTanyaUstadz', category:'maker', icon:'fa-solid fa-user-tie', title:'Tanya Ustadz', desc:'Susun teks meme dan lihat hasil generator dengan tampilan yang lebih fokus.', accent:'#4ade80', accent2:'#15803d', rgb:'74,222,128', badge:'Meme Studio'},
    calc:       {renderer:'renderCalc',        category:'tools', icon:'fa-solid fa-calculator', title:'Calculator', desc:'Lakukan perhitungan cepat dalam ruang kalkulator yang bersih dan responsif.', accent:'#22d3ee', accent2:'#2563eb', rgb:'34,211,238', badge:'Math Utility'},
    pwgen:      {renderer:'renderPwgen',       category:'tools', icon:'fa-solid fa-key', title:'Password Generator', desc:'Buat password kuat dengan kontrol keamanan dalam halaman utilitas khusus.', accent:'#fbbf24', accent2:'#ea580c', rgb:'251,191,36', badge:'Security Tool'},
    morse:      {renderer:'renderMorse',       category:'tools', icon:'fa-solid fa-tower-broadcast', title:'Morse Code', desc:'Konversi teks dan kode Morse, termasuk audio, dalam ruang komunikasi tersendiri.', accent:'#c084fc', accent2:'#7c3aed', rgb:'192,132,252', badge:'Signal Utility'},
    removebg:   {renderer:'renderRemovebg',    category:'tools', icon:'fa-solid fa-eraser', title:'Remove Background', desc:'Unggah gambar dan hapus latar belakang dengan preview besar dalam ruang AI khusus.', accent:'#34d399', accent2:'#059669', rgb:'52,211,153', badge:'AI Image Tool'},
    enhancer:   {renderer:'renderHd4Enhancer', category:'tools', icon:'fa-solid fa-wand-magic-sparkles', title:'Nexora Image HD Enhancer V4', desc:'Tingkatkan detail dan kualitas gambar dari link atau galeri melalui gateway server-side aman Nexora.', accent:'#a855f7', accent2:'#22d3ee', rgb:'168,85,247', badge:'Nexora HD V4'},
    ttquote:    {renderer:'renderTiktokQuote', category:'vault', icon:'fa-brands fa-tiktok', title:'Quote TikTok Nexora', desc:'Buat fake chat TikTok dari username, pesan, dan foto profil lalu hasilkan sebagai Fake TikTok Chat.', accent:'#67e8f9', accent2:'#ec4899', rgb:'103,232,249', badge:'Nexora Quote Chat'},
    qrgen:      {renderer:'renderQrGenerator', category:'vault', icon:'fa-solid fa-qrcode', title:'QR Generator', desc:'Masukkan teks atau tautan, atur QR, lalu simpan hasil dari halaman generator penuh.', accent:'#a3e635', accent2:'#16a34a', rgb:'163,230,53', badge:'QR Utility'}
  };

  function getRenderer(name){
    var fn = window[name];
    return typeof fn === 'function' ? fn : null;
  }

  function buildRoom(){
    if(room) return;
    room = document.createElement('section');
    room.id = 'nxUniversalRoom';
    room.setAttribute('aria-hidden','true');
    room.innerHTML = ''+
      '<div class="nx-room-shell">'+
        '<header class="nx-room-topbar">'+
          '<button class="nx-room-back" id="nxUniversalRoomBack" type="button" aria-label="Kembali ke All Tools Nexora"><i class="fas fa-chevron-left"></i><span>All Tools Nexora</span></button>'+
          '<div class="nx-room-top-title"><i id="nxUniversalRoomTopIcon" class="fas fa-cube"></i><span id="nxUniversalRoomTopTitle">Tool Room</span></div>'+
          '<div class="nx-room-status">Room Active</div>'+
        '</header>'+
        '<div class="nx-room-scroll" id="nxUniversalRoomScroll">'+
          '<main class="nx-room-wrap">'+
            '<section class="nx-room-hero">'+
              '<div><div class="nx-room-kicker"><i class="fas fa-layer-group"></i><span id="nxUniversalRoomBadge">Nexora Tool Room</span></div><h1 id="nxUniversalRoomTitle">Tool</h1><p id="nxUniversalRoomDesc"></p></div>'+
              '<div class="nx-room-hero-icon"><i id="nxUniversalRoomHeroIcon" class="fas fa-cube"></i></div>'+
            '</section>'+
            '<section class="nx-room-panel"><div class="nx-room-tool-body" id="nxUniversalRoomBody"></div></section>'+
          '</main>'+
        '</div>'+
      '</div>';
    document.body.appendChild(room);
    roomBody = document.getElementById('nxUniversalRoomBody');
    document.getElementById('nxUniversalRoomBack').addEventListener('click',function(){ closeRoom(true); });
  }

  function closeLegacyViewer(){
    var viewer = document.getElementById('toolViewer');
    if(viewer) viewer.classList.remove('active');
    var legacyBody = document.getElementById('toolViewerBody');
    if(legacyBody) legacyBody.innerHTML = '';
  }

  function applyMeta(meta){
    room.dataset.category = meta.category || 'tools';
    room.dataset.tool = currentToolId;
    room.style.setProperty('--nx-room-accent',meta.accent || '#a855f7');
    room.style.setProperty('--nx-room-accent-2',meta.accent2 || '#7c3aed');
    room.style.setProperty('--nx-room-rgb',meta.rgb || '168,85,247');
    document.getElementById('nxUniversalRoomTopIcon').className = meta.icon;
    document.getElementById('nxUniversalRoomHeroIcon').className = meta.icon;
    document.getElementById('nxUniversalRoomTopTitle').textContent = meta.title;
    document.getElementById('nxUniversalRoomTitle').textContent = meta.title;
    document.getElementById('nxUniversalRoomDesc').textContent = meta.desc;
    document.getElementById('nxUniversalRoomBadge').textContent = meta.badge || 'Nexora Tool Room';
  }

  function cleanupRoomBody(){
    if(!roomBody || typeof roomBody.__nxCleanup!=='function') return;
    try{ roomBody.__nxCleanup(); }catch(error){ try{ console.warn('[Nexora Room cleanup]',error); }catch(_error){} }
    try{ delete roomBody.__nxCleanup; }catch(_error){ roomBody.__nxCleanup=null; }
  }

  function openRoom(toolId){
    var meta = roomTools[toolId];
    if(!meta) return false;
    var renderer = getRenderer(meta.renderer);
    if(!renderer) return false;

    clearTimeout(closeTimer);
    buildRoom();
    /* Re-activate a room that was previously closed with inline display:none. */
    room.style.removeProperty('display');
    room.classList.remove('is-visible');
    currentToolId = toolId;
    restoreScrollY = window.scrollY || window.pageYOffset || 0;
    if(!room.classList.contains('is-open')) restoreBodyOverflow = document.body.style.overflow || '';
    closeLegacyViewer();
    applyMeta(meta);
    cleanupRoomBody();
    roomBody.innerHTML = '';

    try{
      renderer(roomBody);
      var mountApi = getRenderer('mountToolApiStatus');
      if(mountApi) mountApi(roomBody,toolId);
    }catch(err){
      roomBody.innerHTML = '<div class="dl-error"><i class="fas fa-triangle-exclamation"></i><br><br>Fitur gagal dimuat.<br><span style="font-size:11px;opacity:.72">'+String(err && err.message ? err.message : err)+'</span></div>';
      try{ console.error('[Nexora Room]',toolId,err); }catch(e){}
    }

    room.classList.add('is-open');
    room.setAttribute('aria-hidden','false');
    try{ window.dispatchEvent(new CustomEvent('nexora:tool-room-open',{detail:{toolId:toolId}})); }catch(_error){}
    document.body.classList.add('nx-universal-room-open');
    document.body.style.overflow = 'hidden';
    var scroller = document.getElementById('nxUniversalRoomScroll');
    if(scroller) scroller.scrollTop = 0;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ room.classList.add('is-visible'); }); });

    if(!history.state || history.state.nxUniversalTool !== toolId){
      historyLock = true;
      try{
        var roomUrl=location.href.split('#')[0]+'#tool-'+encodeURIComponent(toolId);
        if(location.hash==='#tool-'+encodeURIComponent(toolId)) history.replaceState({nxUniversalTool:toolId},'',roomUrl);
        else history.pushState({nxUniversalTool:toolId},'',roomUrl);
      }catch(e){}
      setTimeout(function(){ historyLock=false; },0);
    }
    return true;
  }

  function finishClose(){
    if(!room) return;
    room.classList.remove('is-open');
    room.style.display = 'none';
    room.setAttribute('aria-hidden','true');
    cleanupRoomBody();
    roomBody.innerHTML = '';
    currentToolId = '';
    document.body.classList.remove('nx-universal-room-open');
    document.body.style.overflow = restoreBodyOverflow;
    try{ window.scrollTo(0,restoreScrollY); }catch(e){}
  }

  function closeRoom(useHistory){
    if(!room || !room.classList.contains('is-open')) return;
    if(useHistory && history.state && history.state.nxUniversalTool){
      try{ history.back(); return; }catch(e){}
    }
    try{ window.dispatchEvent(new CustomEvent('nexora:tool-room-close',{detail:{toolId:currentToolId}})); }catch(_error){}
    room.classList.remove('is-visible');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(finishClose,280);
  }

  window.openNexoraToolRoom = openRoom;
  window.closeNexoraToolRoom = function(){ closeRoom(true); };

  window.showTool = function(toolId){
    if(roomTools[toolId]){
      openRoom(toolId);
      return;
    }
    if(typeof previousShowTool === 'function') return previousShowTool.apply(this,arguments);
  };

  window.addEventListener('popstate',function(){
    if(historyLock) return;
    var match=String(location.hash||'').match(/^#tool-([^/?#]+)$/);
    var routeTool='';
    try{routeTool=match?decodeURIComponent(match[1]):'';}catch(_error){routeTool='';}
    if(room && room.classList.contains('is-open') && routeTool===currentToolId) return;
    if(room && room.classList.contains('is-open')) closeRoom(false);
  });

  document.addEventListener('keydown',function(e){
    if(e.key === 'Escape' && room && room.classList.contains('is-open')){
      e.preventDefault();
      closeRoom(true);
    }
  });

  function patchInternalCards(){
    document.querySelectorAll('.tools-card').forEach(function(card){
      var heading = card.querySelector('h4');
      if(!heading) return;
      var name = (heading.textContent || '').trim().toLowerCase();
      Object.keys(roomTools).some(function(id){
        var meta = roomTools[id];
        var aliases = [meta.title.toLowerCase()];
        if(id === 'instagram') aliases.push('instagram');
        if(id === 'youtube') aliases.push('youtube');
        if(id === 'spotify') aliases.push('spotify downloader');
        if(id === 'brat') aliases.push('brat generator');
        if(id === 'iqc') aliases.push('iqc generator');

        if(id === 'ektp') aliases.push('e-ktp generator');
        if(id === 'fakedana') aliases.push('fake dana');
        if(id === 'fakedev') aliases.push('fakedev');
        if(id === 'fakelobby') aliases.push('fake lobby');
        if(id === 'winquotes') aliases.push('windows quotes');
        if(id === 'tanyaustadz') aliases.push('tanya ustadz');
        if(id === 'calc') aliases.push('calculator');
        if(id === 'pwgen') aliases.push('password gen','password generator');
        if(id === 'morse') aliases.push('morse code');
        if(id === 'removebg') aliases.push('remove bg','remove background');
        if(id === 'aivideo') aliases.push('ai video generator','text to video','image to video','nexora ai video generator');
        if(id === 'enhancer') aliases.push('image enhancer','image hd enhancer','image upscaler','hd4','nexora image hd enhancer v4');
        if(id === 'ttquote') aliases.push('tiktok quote');
        if(id === 'qrgen') aliases.push('qr generator');
        if(aliases.indexOf(name) === -1) return false;
        card.removeAttribute('onclick');
        card.onclick = function(){ openRoom(id); };
        card.setAttribute('data-nx-room-tool',id);
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.onkeydown = function(ev){ if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openRoom(id); } };
        return true;
      });
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',patchInternalCards);
  else patchInternalCards();
  setTimeout(patchInternalCards,300);
})();

/* ===== original script 27: nxUnifiedWideBackButtonsScript ===== */
(function(){
  'use strict';
  function normalizeBackLabels(){
    var labels={
      aivaBack:'All Tools Nexora',
      pixTopBack:'All Tools Nexora',
      getcodeTopBack:'All Tools Nexora',
      deployTopBack:'All Tools Nexora',
      nxWebEncryptionBack:'All Tools Nexora'
    };
    Object.keys(labels).forEach(function(id){
      var el=document.getElementById(id);
      if(!el || el.dataset.nxWideBackReady==='1') return;
      el.dataset.nxWideBackReady='1';
      if(id==='aivaBack'){
        el.innerHTML='<span class="arr" aria-hidden="true"></span><span>All Tools Nexora</span>';
      }
      el.setAttribute('aria-label','Kembali ke All Tools Nexora');
      el.title='Kembali ke All Tools Nexora';
    });
  }
  var observer=new MutationObserver(normalizeBackLabels);
  function init(){
    normalizeBackLabels();
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

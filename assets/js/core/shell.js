/* Nexora application shell — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 7: nxTikTokStudioTopLevelPortal ===== */
(function(){
  'use strict';

  var ALLOWED_TIKTOK_URLS = [
    'https://www.tiktok.com/tiktokstudio',
    'https://www.tiktok.com/tiktokstudio/upload?lang=id-ID'
  ];

  window.addEventListener('message',function(event){
    if(
      !event.data ||
      event.data.type !== 'nx-open-tiktok-top-level' ||
      ALLOWED_TIKTOK_URLS.indexOf(event.data.url) === -1
    ){
      return;
    }

    var opened = window.open(event.data.url,'_blank','noopener,noreferrer');

    if(!opened){
      window.location.href = event.data.url;
    }
  });
})();

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

  window.openNexusAboutDev = openAboutDev;
  window.closeNexusAboutDev = closeAboutDev;
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

  const whatsapp =
    document.getElementById(
      "nxTopMenuWhatsApp"
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
        ? "Tutup menu Nexus"
        : "Buka menu Nexus"
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
            .openNexusAboutDev ===
          "function"
        ){
          window
            .openNexusAboutDev();
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
            .openNexusReportRoom ===
          "function"
        ){
          window
            .openNexusReportRoom();
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

  if(whatsapp){
    whatsapp.addEventListener(
      "click",
      () => {
        closeMenu();
        const target = whatsapp.dataset.socialUrl;
        if(target) window.open(target,"_blank","noopener,noreferrer");
      }
    );
  }

  window.openNexusTopMenu =
    () => setOpen(true);

  window.closeNexusTopMenu =
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
      typeof window.closeNexusToolRoom ===
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
          window.closeNexusToolRoom();
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

  window.openNexusReportRoom =
    openReportRoom;

  window.closeNexusReportRoom =
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
  window.isNexusLockedTool=function(){return false;};
})();

/* ===== original script 20: inline-20 ===== */
(function(){
  var notif = document.getElementById('nx-wa-notif');
  if(!notif) return;
  var scheduled=false;
  function shouldSuppress(){
    var reduced=false;
    var touchLike=Boolean(typeof navigator!=="undefined"&&navigator.maxTouchPoints>0);
    try{
      reduced=Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      touchLike=touchLike||Boolean(window.matchMedia&&window.matchMedia('(max-width: 768px), (pointer: coarse)').matches);
    }catch(_){touchLike=touchLike||window.innerWidth<=768;}
    return reduced||touchLike;
  }
  function schedule(){
    if(scheduled||!notif.dataset.socialUrl)return;
    if(shouldSuppress()){
      notif.classList.remove('show','hide');
      return;
    }
    scheduled=true;
    setTimeout(function(){notif.classList.add('show');},5000);
    setTimeout(function(){
      if(!notif.classList.contains('hide')){
        notif.classList.remove('show');
        notif.classList.add('hide');
      }
    },20000);
  }
  document.addEventListener('nexora:social-links-ready',schedule,{once:true});
  schedule();
})();

/* ===== original script 26: nxUniversalToolRoomsScript ===== */
(function(){
  'use strict';

  var previousShowTool = window.showTool;
  var room = null;
  var roomBody = null;
  var currentToolId = '';
  var restoreScrollY = 0;
  var closeTimer = 0;
  var historyLock = false;

  var roomTools = {
    
    
    
    comicreader:{renderer:'renderComicReader', category:'tools', icon:'fa-solid fa-book-open-reader', title:'Komik Indonesia', desc:'Manga, manhwa, dan manhua lengkap dengan pencarian, favorit, riwayat, chapter, bahasa, serta reader vertikal.', accent:'#c084fc', accent2:'#ec4899', rgb:'192,132,252', badge:'Nexus Comic Core'},
    promptgenerate:{renderer:'renderPromptGenerator', category:'tools', icon:'fa-solid fa-wand-magic-sparkles', title:'Prompt Generator', desc:'Unggah gambar, tambahkan arahan, lalu hasilkan prompt deskriptif.', accent:'#67e8f9', accent2:'#7c3aed', rgb:'103,232,249', badge:'Nexus Prompt Studio'},
    fakeovo:{renderer:'renderFakeOvo', category:'tools', icon:'fa-solid fa-wallet', title:'Fake OVO', desc:'Atur nominal dan hasilkan tampilan saldo OVO.', accent:'#a78bfa', accent2:'#6d28d9', rgb:'167,139,250', badge:'Nexus Canvas Studio'},
    quotegenerator:{renderer:'renderQuoteGenerator', category:'tools', icon:'fa-solid fa-quote-left', title:'Quote Generator', desc:'Susun teks dan penulis lalu render gambar quote monokrom.', accent:'#cbd5e1', accent2:'#7c3aed', rgb:'203,213,225', badge:'Nexus Quote Studio'},
    carifakta:{renderer:'renderCariFakta', category:'tools', icon:'fa-solid fa-magnifying-glass-chart', title:'CariFakta', desc:'Periksa klaim, konteks, dan tingkat keyakinan menggunakan AI.', accent:'#4ade80', accent2:'#7c3aed', rgb:'74,222,128', badge:'Nexus Fact Intelligence'},
    mltools:{renderer:'renderMlTools', category:'tools', icon:'fa-solid fa-gamepad', title:'ML Tools Nexus', desc:'Script Skin MLBB, kalkulator Winrate, dan Stalk akun dengan mesin serta hasil asli ML Tools.', accent:'#67e8f9', accent2:'#7c3aed', rgb:'103,232,249', badge:'Nexus ML Gaming Lab'},
virusscan:  {renderer:'renderVirusScan', category:'tools', icon:'fa-solid fa-shield-virus', title:'Virus Scan Nexora', desc:'Analisis lokal untuk URL, file, hash, domain, dan IP dalam ruang keamanan All Tools Nexora.', accent:'#c084fc', accent2:'#7c3aed', rgb:'192,132,252', badge:'Nexora Security Core'},
    cryptomarket:{renderer:'renderCryptoMarket', category:'tools', icon:'fa-solid fa-chart-line', title:'Crypto Market Scanner', desc:'Pantau harga, volume, market cap, dominasi, dan pergerakan aset crypto melalui provider server-side.', accent:'#22d3ee', accent2:'#34d399', rgb:'34,211,238', badge:'Live Market Intelligence'},
    webintel:{renderer:'renderWebIntelligence', category:'tools', icon:'fa-solid fa-satellite-dish', title:'Nexora Web Intelligence', desc:'Ubah URL menjadi audit SEO, security, performa, aksesibilitas, stack, tracker, dan rekomendasi teknis berbasis bukti.', accent:'#22d3ee', accent2:'#8b5cf6', rgb:'34,211,238', badge:'Nexora Intelligence Engine'},
instagram:  {renderer:'renderInstagram',   category:'downloader', icon:'fa-brands fa-instagram', title:'Instagram Downloader', desc:'Ambil video, Reels, foto, carousel, metadata, dan caption dalam ruang download khusus.', accent:'#e879f9', accent2:'#c026d3', rgb:'232,121,249', badge:'Media Studio'},
    youtube:    {renderer:'renderYoutube',     category:'downloader', icon:'fa-brands fa-youtube', title:'YouTube Downloader', desc:'Pilih video MP4 atau audio MP3 dengan tampilan hasil dan opsi kualitas yang lebih luas.', accent:'#fb7185', accent2:'#dc2626', rgb:'251,113,133', badge:'Video & Audio'},
    spotify:    {renderer:'renderSpotify',     category:'downloader', icon:'fa-brands fa-spotify', title:'Spotify Downloader', desc:'Preview audio dan unduh MP3 menggunakan respons endpoint Spotify.', accent:'#4ade80', accent2:'#16a34a', rgb:'74,222,128', badge:'Nexus Spotify API'},
    terabox:    {renderer:'renderTerabox', category:'downloader', icon:'fa-solid fa-box-open', title:'Terabox Downloader', desc:'Ambil daftar file dari tautan share Terabox dan unduh file yang tersedia.', accent:'#60a5fa', accent2:'#2563eb', rgb:'96,165,250', badge:'Nexus Cloud Downloader'},
    brat:       {renderer:'renderBrat',        category:'maker', icon:'fa-solid fa-wand-magic-sparkles', title:'BRAT Generator', desc:'Buat karya BRAT statis atau animasi GIF dengan area kerja penuh dan hasil yang mudah dipantau.', accent:'#facc15', accent2:'#f97316', rgb:'250,204,21', badge:'Creative Maker'},
    iqc:        {renderer:'renderIqc',         category:'maker', icon:'fa-solid fa-image', title:'IQC Generator', desc:'Susun gambar IQC, atur isi, lalu lihat preview dalam ruang desain khusus.', accent:'#67e8f9', accent2:'#0891b2', rgb:'103,232,249', badge:'Image Composer'},
    sertifikat: {renderer:'renderSertifikatTololSource', category:'maker', icon:'fa-solid fa-certificate', title:'Sertifikat Custom', desc:'Buat sertifikat melalui API sumber dengan renderer lokal otomatis saat layanan pihak ketiga tidak tersedia.', accent:'#facc15', accent2:'#a855f7', rgb:'250,204,21', badge:'API + Local Fallback'},

    ektp:       {renderer:'renderEktp',        category:'maker', icon:'fa-solid fa-id-card', title:'E-KTP Generator', desc:'Lengkapi formulir demo dan hasilkan kartu dalam ruang editor identitas terpisah.', accent:'#60a5fa', accent2:'#2563eb', rgb:'96,165,250', badge:'Identity Studio'},
    fakedana:   {renderer:'renderFakeDana',    category:'maker', icon:'fa-solid fa-money-bill-wave', title:'Fake Dana', desc:'Atur tampilan saldo simulasi dan buat hasil visual dalam ruang generator khusus.', accent:'#38bdf8', accent2:'#0284c7', rgb:'56,189,248', badge:'Balance Mockup'},
    fakebankjago:{renderer:'renderFakeBankJago', category:'maker', icon:'fa-solid fa-building-columns', title:'Fake Bank Jago', desc:'Buat visual simulasi saldo Bank Jago menggunakan nama dan nominal.', accent:'#facc15', accent2:'#f97316', rgb:'250,204,21', badge:'Nexus Simulation Maker'},
    fakedev:    {renderer:'renderFakeDev',     category:'maker', icon:'fa-solid fa-laptop-code', title:'FakeDev', desc:'Generator profil developer menggunakan endpoint gambar asli dari HTML Nexus Tools.', accent:'#a78bfa', accent2:'#6d28d9', rgb:'167,139,250', badge:'Nexus Source API'},
    fakelobby:  {renderer:'renderFakeLobby',   category:'maker', icon:'fa-solid fa-gamepad', title:'Fake Lobby', desc:'Buat tampilan lobby game simulasi dengan kontrol dan preview dalam satu halaman.', accent:'#fb7185', accent2:'#7c3aed', rgb:'251,113,133', badge:'Gaming Room'},
    winquotes:  {renderer:'renderWinquotes',   category:'maker', icon:'fa-brands fa-windows', title:'Windows Quotes', desc:'Tulis quote dan hasilkan meme bergaya Windows dalam 2 pilihan style.', accent:'#38bdf8', accent2:'#2563eb', rgb:'56,189,248', badge:'Quote Creator'},
    nokiamsg:   {renderer:'renderNokiaMsg',   category:'maker', icon:'fa-solid fa-mobile-retro', title:'Nokia Message', desc:'Susun pesan SMS jadul dan hasilkan gambar dalam ruang generator retro.', accent:'#a3e635', accent2:'#65a30d', rgb:'163,230,52', badge:'Retro Message'},
    tanyaustadz:{renderer:'renderTanyaUstadz', category:'maker', icon:'fa-solid fa-user-tie', title:'Tanya Ustadz', desc:'Susun teks meme dan lihat hasil generator dengan tampilan yang lebih fokus.', accent:'#4ade80', accent2:'#15803d', rgb:'74,222,128', badge:'Meme Studio'},
    calc:       {renderer:'renderCalc',        category:'tools', icon:'fa-solid fa-calculator', title:'Calculator', desc:'Lakukan perhitungan cepat dalam ruang kalkulator yang bersih dan responsif.', accent:'#22d3ee', accent2:'#2563eb', rgb:'34,211,238', badge:'Math Utility'},
    pwgen:      {renderer:'renderPwgen',       category:'tools', icon:'fa-solid fa-key', title:'Password Generator', desc:'Buat password kuat dengan kontrol keamanan dalam halaman utilitas khusus.', accent:'#fbbf24', accent2:'#ea580c', rgb:'251,191,36', badge:'Security Tool'},
    morse:      {renderer:'renderMorse',       category:'tools', icon:'fa-solid fa-tower-broadcast', title:'Morse Code', desc:'Konversi teks dan kode Morse, termasuk audio, dalam ruang komunikasi tersendiri.', accent:'#c084fc', accent2:'#7c3aed', rgb:'192,132,252', badge:'Signal Utility'},
    removebg:   {renderer:'renderRemovebg',    category:'tools', icon:'fa-solid fa-eraser', title:'Remove Background', desc:'Unggah gambar dan hapus latar belakang dengan preview besar dalam ruang AI khusus.', accent:'#34d399', accent2:'#059669', rgb:'52,211,153', badge:'AI Image Tool'},
    enhancer:   {renderer:'renderEnhancer',    category:'tools', icon:'fa-solid fa-wand-magic', title:'Image Enhancer', desc:'Tingkatkan kualitas gambar dan bandingkan hasil pada halaman pemrosesan visual.', accent:'#f472b6', accent2:'#9333ea', rgb:'244,114,182', badge:'AI Enhancement'},
    ttquote:    {renderer:'renderTiktokQuote', category:'vault', icon:'fa-brands fa-tiktok', title:'Quote TikTok Nexus', desc:'Buat fake chat TikTok dari username, pesan, dan foto profil lalu hasilkan sebagai Fake TikTok Chat.', accent:'#67e8f9', accent2:'#ec4899', rgb:'103,232,249', badge:'Nexus Quote Chat'},
    qrgen:      {renderer:'renderQrGenerator', category:'vault', icon:'fa-solid fa-qrcode', title:'QR Generator', desc:'Masukkan teks atau tautan, atur QR, lalu simpan hasil dari halaman generator penuh.', accent:'#a3e635', accent2:'#16a34a', rgb:'163,230,53', badge:'QR Utility'}
  };

  function getRenderer(name){
    var fn = window[name];
    if(typeof fn === 'function') return fn;
    try{
      fn = eval(name);
      return typeof fn === 'function' ? fn : null;
    }catch(e){
      return null;
    }
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
              '<div><div class="nx-room-kicker"><i class="fas fa-layer-group"></i><span id="nxUniversalRoomBadge">Nexus Tool Room</span></div><h1 id="nxUniversalRoomTitle">Tool</h1><p id="nxUniversalRoomDesc"></p></div>'+
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
    document.getElementById('nxUniversalRoomBadge').textContent = meta.badge || 'Nexus Tool Room';
  }

  function cleanupRoomBody(){
    if(!roomBody || typeof roomBody.__nxCleanup!=='function') return;
    try{ roomBody.__nxCleanup(); }catch(error){ try{ console.warn('[Nexus Room cleanup]',error); }catch(_error){} }
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
      try{ console.error('[Nexus Room]',toolId,err); }catch(e){}
    }

    room.classList.add('is-open');
    room.setAttribute('aria-hidden','false');
    document.body.classList.add('nx-universal-room-open');
    document.body.style.overflow = 'hidden';
    var scroller = document.getElementById('nxUniversalRoomScroll');
    if(scroller) scroller.scrollTop = 0;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ room.classList.add('is-visible'); }); });

    if(!history.state || history.state.nxUniversalTool !== toolId){
      historyLock = true;
      try{ history.pushState({nxUniversalTool:toolId},'',location.href.split('#')[0]+'#tool-'+encodeURIComponent(toolId)); }catch(e){}
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
    document.body.style.overflow = 'auto';
    try{ window.scrollTo(0,restoreScrollY); }catch(e){}
  }

  function closeRoom(useHistory){
    if(!room || !room.classList.contains('is-open')) return;
    if(useHistory && history.state && history.state.nxUniversalTool){
      try{ history.back(); return; }catch(e){}
    }
    room.classList.remove('is-visible');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(finishClose,280);
  }

  window.openNexusToolRoom = openRoom;
  window.closeNexusToolRoom = function(){ closeRoom(true); };

  window.showTool = function(toolId){
    if(roomTools[toolId]){
      openRoom(toolId);
      return;
    }
    if(typeof previousShowTool === 'function') return previousShowTool.apply(this,arguments);
  };

  window.addEventListener('popstate',function(){
    if(historyLock) return;
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
        if(id === 'enhancer') aliases.push('image enhancer');
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

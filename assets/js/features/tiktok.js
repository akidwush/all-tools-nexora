/* TikTok downloader — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 2: nxTiktokPreviewScript ===== */
(function(){
  var activePreviewRequest=null;

  function abortPreviewRequest(){
    if(activePreviewRequest && typeof activePreviewRequest.abort==='function'){
      try{ activePreviewRequest.abort(); }catch(e){}
    }
    activePreviewRequest=null;
  }

  function cleanupTiktokRuntime(root){
    abortPreviewRequest();
    var scope=root || document.getElementById('ttRoomOverlay');
    if(!scope || !scope.querySelectorAll) return;
    releaseMedia(scope);
  }

  window.cleanupTiktokRuntime=cleanupTiktokRuntime;

  function ttSafe(v){
    if(typeof window.nxEscape==='function') return window.nxEscape(v==null?'':String(v));
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }
  function fmtNum(n){ n=Number(n)||0; return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n); }
  function fmtSz(b){ b=Number(b)||0; return b>=1e6?(b/1e6).toFixed(1)+' MB':b>=1e3?(b/1e3).toFixed(0)+' KB':(b?b+' B':''); }
  function fmtDur(s){ s=Number(s)||0; var m=Math.floor(s/60), ss=s%60; return m+'m '+(ss<10?'0':'')+ss+'s'; }
  function guessExt(type){ return type==='MP3'?'mp3':(type==='JPG'?'jpg':'mp4'); }
  function releaseMedia(root){
    if(!root || !root.querySelectorAll) return;
    root.querySelectorAll('video,audio').forEach(function(media){
      try{ media.pause(); }catch(e){}
      try{ media.removeAttribute('src'); }catch(e){}
      try{ media.querySelectorAll('source').forEach(function(source){ source.removeAttribute('src'); }); }catch(e){}
      try{ media.load(); }catch(e){}
    });
  }
  function mediaEndpoint(choice, probe){
    var params=new URLSearchParams();
    params.set('url',choice.url);
    params.set('filename',choice.filename || ('tiktok_media.'+guessExt(choice.type)));
    params.set('type',choice.type || 'MP4');
    params.set('tool','tiktok');
    if(probe) params.set('probe','1');
    return '/api/media-download?'+params.toString();
  }
  async function probeDownload(choice){
    var response=await window.NexoraFetch(mediaEndpoint(choice,true),{
      cache:'no-store',
      nexoraTimeoutMs:22000,
      nexoraRetries:0
    });
    var payload=await response.json().catch(function(){ return {}; });
    if(!response.ok || !payload.ok || !payload.ready){
      throw new Error(payload.message || ('Download server HTTP '+response.status));
    }
    return payload;
  }
  function triggerStreamDownload(choice){
    var a=document.createElement('a');
    a.href=mediaEndpoint(choice,false);
    a.download=choice.filename || ('tiktok_media.'+guessExt(choice.type));
    a.dataset.historyRecorded='1';
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try{ a.remove(); }catch(e){} },1000);
  }
  async function downloadSelected(choice, button, note){
    if(!choice || !choice.url || !button || button.disabled) return;
    var old=button.innerHTML;
    button.disabled=true;
    button.innerHTML='<i class="fas fa-spinner fa-spin"></i> Memvalidasi media...';
    if(note) note.textContent='Memeriksa file melalui server download aman...';
    try{
      var metadata=await probeDownload(choice);
      button.innerHTML='<i class="fas fa-download"></i> Memulai download...';
      triggerStreamDownload(choice);
      if(typeof window.recordDownload==='function') window.recordDownload('TikTok', choice.type, choice.url, metadata.filename || choice.filename, choice.title || 'TikTok Media');
      ttRenderRoomHistory();
      if(note) note.textContent='File tervalidasi dan sedang dialirkan langsung ke penyimpanan. Video tidak ditampung penuh di RAM browser.';
    }catch(err){
      if(note) note.textContent='Download gagal diverifikasi: '+(err && err.message ? err.message : 'unknown')+'. Tidak ada history palsu yang dibuat.';
    }finally{
      button.disabled=false;
      button.innerHTML=old;
    }
  }
  function ttReadHistory(){
    try{ return JSON.parse(localStorage.getItem('nexus_download_history_v1')||'[]')||[]; }catch(e){ return []; }
  }
  function ttWriteHistory(list){
    try{ localStorage.setItem('nexus_download_history_v1', JSON.stringify(list||[])); }catch(e){}
  }
  function ttRenderRoomHistory(){
    var host=document.getElementById('ttRoomHistoryList');
    if(!host) return;
    var list=ttReadHistory().filter(function(item){ return String(item.tool||'').toLowerCase()==='tiktok'; }).slice(0,8);
    if(!list.length){
      host.innerHTML='<div class="tt-room-history-empty">Belum ada history TikTok. Download pertama akan muncul di sini.</div>';
      return;
    }
    host.innerHTML=list.map(function(item){
      var type=String(item.type||'FILE').toUpperCase();
      var icon=type==='MP3'?'fa-music':(type==='JPG'?'fa-image':'fa-video');
      var date=item.time?new Date(item.time):new Date();
      var time=isNaN(date.getTime())?'':date.toLocaleString('id-ID',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'});
      return '<div class="tt-room-history-item">'+
        '<div class="tt-room-history-icon"><i class="fas '+icon+'"></i></div>'+
        '<div style="min-width:0;"><div class="tt-room-history-title">'+ttSafe(item.title||item.filename||'TikTok Download')+'</div><div class="tt-room-history-meta">'+ttSafe(type)+' • '+ttSafe(item.filename||'media')+' • '+ttSafe(time)+'</div></div>'+
        '<div class="tt-room-history-actions">'+
          '<button type="button" data-tt-history-copy="'+ttSafe(item.url||'')+'"><i class="fas fa-copy"></i> Copy</button>'+
          '<button type="button" data-tt-history-delete="'+ttSafe(item.id||'')+'"><i class="fas fa-trash"></i> Hapus</button>'+
        '</div></div>';
    }).join('');
  }
  function ttWireRoomHistory(){
    var host=document.getElementById('ttRoomHistory');
    if(!host || host.dataset.wired==='1') return;
    host.dataset.wired='1';
    host.addEventListener('click',function(e){
      var copy=e.target.closest('[data-tt-history-copy]');
      if(copy){
        var url=copy.getAttribute('data-tt-history-copy')||'';
        if(url && navigator.clipboard) navigator.clipboard.writeText(url);
        var old=copy.innerHTML; copy.innerHTML='<i class="fas fa-check"></i> Tersalin'; setTimeout(function(){ copy.innerHTML=old; },1200);
        return;
      }
      var del=e.target.closest('[data-tt-history-delete]');
      if(del){
        var id=del.getAttribute('data-tt-history-delete')||'';
        ttWriteHistory(ttReadHistory().filter(function(item){ return item.id!==id; }));
        ttRenderRoomHistory();
        if(typeof window.renderDownloadHistory==='function') window.renderDownloadHistory();
      }
    });
    var clear=document.getElementById('ttRoomClearHistory');
    if(clear){ clear.onclick=function(){ ttWriteHistory(ttReadHistory().filter(function(item){ return String(item.tool||'').toLowerCase()!=='tiktok'; })); ttRenderRoomHistory(); if(typeof window.renderDownloadHistory==='function') window.renderDownloadHistory(); }; }
  }
  function wirePreviewControls(){
    var box=document.getElementById('ttPreviewBox');
    if(!box) return;
    if(typeof window.nxEnhanceTiktokPreviewControls==='function'){
      window.nxEnhanceTiktokPreviewControls(box);
      return;
    }
    var video=box.querySelector('video.tt-preview-video');
    var play=box.querySelector('.tt-custom-play');
    if(!video || video.dataset.nxPreviewFallbackReady==='1') return;
    video.dataset.nxPreviewFallbackReady='1';
    function toggle(ev){
      if(ev){ ev.preventDefault(); ev.stopPropagation(); }
      if(video.paused || video.ended) video.play().catch(function(){});
      else video.pause();
    }
    video.addEventListener('click',toggle);
    if(play) play.addEventListener('click',toggle);
  }

  window.renderTiktok=function(body){
    body.classList.add('tt-full-root');
    body.innerHTML=''+
      '<div class="tt-full-wrap">'+
        '<div class="tt-hero">'+
          '<div class="tt-hero-card">'+
            '<div class="tt-kicker"><i class="fa-brands fa-tiktok"></i> TikTok Room</div>'+
            '<h2 class="tt-big-title">Preview dulu, pilih format, lalu download langsung.</h2>'+ 
            '<p class="tt-desc">Tempel link TikTok untuk membuka preview video/foto, caption, statistik, pilihan MP4/MP3/JPG, dan download tanpa pindah ke halaman lain.</p>'+ 
            '<div class="tt-url-row">'+
              '<input type="url" class="v-input" id="ttUrl" placeholder="Tempel link TikTok di sini..." autocomplete="url" spellcheck="false">'+
              '<button class="v-btn" id="ttBtn" type="button"><i class="fas fa-magnifying-glass"></i> Preview</button>'+ 
            '</div>'+ 
          '</div>'+ 
          '<div class="tt-side-card">'+
            '<div class="tt-mini-row"><i class="fas fa-eye"></i><div><b>Preview Media</b><span>Video, cover, atau foto slide</span></div></div>'+ 
            '<div class="tt-mini-row"><i class="fas fa-hand-pointer"></i><div><b>Pilih Format</b><span>MP4 HD, MP3, JPG, watermark</span></div></div>'+ 
            '<div class="tt-mini-row"><i class="fas fa-download"></i><div><b>Direct Download</b><span>Tetap di ruang TikTok</span></div></div>'+ 
          '</div>'+ 
        '</div>'+ 
        '<div id="ttResult" class="tt-idle"><div><i class="fa-brands fa-tiktok"></i><b>Belum ada preview</b><br><span>Masukkan link TikTok lalu tekan Preview.</span></div></div>'+ 
        '<div class="tt-room-history" id="ttRoomHistory"><div class="tt-room-history-head"><b><i class="fas fa-clock-rotate-left"></i> History Download</b><button type="button" id="ttRoomClearHistory"><i class="fas fa-trash"></i> Bersihkan TikTok</button></div><div class="tt-room-history-list" id="ttRoomHistoryList"></div></div>'+ 
      '</div>';

    var input=document.getElementById('ttUrl');
    var btn=document.getElementById('ttBtn');
    var target=document.getElementById('ttResult');

    async function run(){
      var url=(input.value||'').trim();
      if(!url){ input.focus(); return; }
      abortPreviewRequest();
      var requestController=typeof AbortController==='function' ? new AbortController() : null;
      activePreviewRequest=requestController;
      btn.disabled=true;
      btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Mengambil...';
      releaseMedia(target);
      target.className='';
      target.innerHTML='<div class="tt-panel"><div class="dl-loading"><div class="dl-spin"></div><p>Mengambil data dan membuat preview...</p></div></div>';
      try{
        var fetched=await window.NexoraDownloader.request('tiktok',url,requestController ? {signal:requestController.signal} : undefined);
        var json=window.NexoraDownloader.legacyTikTok(fetched);
        var d=json && json.data;
        if(!d) throw new Error('Data TikTok tidak ditemukan');
        var caption=d.title||'';
        var author=d.author||{};
        var nickname=author.nickname||author.unique_id||'Unknown';
        var avatar=author.avatar||'';
        var cover=d.cover||d.origin_cover||'';
        var hdUrl=d.hdplay||d.play||'';
        var stdUrl=d.play||'';
        var wmUrl=d.wmplay||d.wm_video||'';
        var musicUrl=d.music||'';
        var likes=d.digg_count||0, comments=d.comment_count||0, shares=d.share_count||0, plays=d.play_count||0;
        var duration=d.duration||0, hdSize=d.size||0, wmSize=d.wm_size||0;
        var photoList=[];
        function addPhoto(item){
          if(!item) return;
          if(typeof item==='string' && /^https?:\/\//i.test(item)){ photoList.push(item); return; }
          if(Array.isArray(item)){ item.forEach(addPhoto); return; }
          if(typeof item==='object'){
            if(item.url_list) addPhoto(item.url_list);
            else if(item.image_url) addPhoto(item.image_url);
            else if(item.display_image) addPhoto(item.display_image);
            else if(item.url) addPhoto(item.url);
            else if(item.image) addPhoto(item.image);
          }
        }
        addPhoto(d.images);
        addPhoto(d.image_post_info && d.image_post_info.images);
        var photos=Array.from(new Set(photoList));
        var choices=[];
        var lightVideoUrl=stdUrl||wmUrl||hdUrl;
        if(hdUrl) choices.push({id:'hd',type:'MP4',url:hdUrl,filename:'tiktok_hd.mp4',label:'MP4 HD',desc:'Tanpa watermark, kualitas terbaik'+(hdSize?' • '+fmtSz(hdSize):''),icon:'fa-crown',preview:'video',previewUrl:lightVideoUrl,title:'TikTok MP4 HD'});
        if(stdUrl && stdUrl!==hdUrl) choices.push({id:'std',type:'MP4',url:stdUrl,filename:'tiktok_standard.mp4',label:'MP4 Standar',desc:'Tanpa watermark, ukuran lebih ringan',icon:'fa-video',preview:'video',previewUrl:stdUrl,title:'TikTok MP4 Standar'});
        if(wmUrl) choices.push({id:'wm',type:'MP4',url:wmUrl,filename:'tiktok_watermark.mp4',label:'MP4 Watermark',desc:'Versi asli TikTok'+(wmSize?' • '+fmtSz(wmSize):''),icon:'fa-droplet',preview:'video',previewUrl:wmUrl,title:'TikTok MP4 Watermark'});
        if(musicUrl) choices.push({id:'music',type:'MP3',url:musicUrl,filename:'tiktok_music.mp3',label:'MP3 Audio',desc:(d.music_info&&d.music_info.title)||'Soundtrack / audio TikTok',icon:'fa-music',preview:(hdUrl||stdUrl||wmUrl)?'video':'image',previewUrl:(lightVideoUrl||cover),title:'TikTok MP3 Audio'});
        photos.slice(0,12).forEach(function(img,i){ choices.push({id:'photo'+i,type:'JPG',url:img,filename:'tiktok_foto_'+(i+1)+'.jpg',label:'JPG Foto #'+(i+1),desc:'Foto / slide TikTok',icon:'fa-image',preview:'image',previewUrl:img,title:'TikTok Foto #'+(i+1)}); });
        if(!choices.length) throw new Error('Tidak ada link download yang valid');
        var selected=choices.some(function(choice){ return choice.id==='std'; }) ? 'std' : choices[0].id;
        function choiceById(id){ return choices.find(function(c){ return c.id===id; }) || choices[0]; }
        function previewHTML(choice){
          if(!choice) return '<div class="tt-preview-placeholder"><i class="fa-brands fa-tiktok"></i><b>Preview tidak tersedia</b></div>';
          var label='<div class="tt-preview-label"><i class="fas '+ttSafe(choice.icon)+'"></i> '+ttSafe(choice.label)+'</div>';
          if(choice.preview==='image') return label+'<img class="tt-preview-img" src="'+ttSafe(choice.previewUrl||cover||choice.url)+'" alt="Preview TikTok" loading="eager" decoding="async">';
          if(choice.preview==='video' && choice.previewUrl) return label+'<video class="tt-preview-video no-native-controls" src="'+ttSafe(choice.previewUrl)+'" poster="'+ttSafe(cover)+'" playsinline preload="metadata"></video><button class="tt-custom-play" type="button" aria-label="Play preview"><i class="fas fa-play"></i></button>';
          return label+'<div class="tt-preview-placeholder"><i class="fas fa-music"></i><b>Preview audio</b><span>Pilih download untuk menyimpan MP3.</span></div>';
        }
        target.innerHTML=''+
          '<div class="tt-result-grid">'+
            '<div class="tt-panel">'+
              '<div class="tt-preview-box" id="ttPreviewBox">'+previewHTML(choiceById(selected))+'</div>'+ 
              (photos.length ? '<div class="tt-photo-strip">'+photos.slice(0,12).map(function(img,i){return '<img class="tt-photo-thumb '+(i===0 && choiceById(selected).id==='photo0'?'active':'')+'" src="'+ttSafe(img)+'" data-photo-choice="photo'+i+'" alt="Foto '+(i+1)+'">';}).join('')+'</div>' : '')+
            '</div>'+ 
            '<div class="tt-panel">'+
              '<div class="tt-info-head">'+
                (cover?'<img class="tt-info-cover" src="'+ttSafe(cover)+'" alt="Cover" onerror="this.style.display=\'none\'">':'<div class="tt-info-cover" style="display:grid;place-items:center;"><i class="fa-brands fa-tiktok"></i></div>')+
                '<div style="min-width:0;flex:1;">'+
                  '<div class="tt-info-author">'+(avatar?'<img class="tt-info-avatar" src="'+ttSafe(avatar)+'" onerror="this.style.display=\'none\'">':'')+'<span>@'+ttSafe(nickname)+'</span></div>'+ 
                  '<div class="tt-info-caption">'+ttSafe(caption || 'Tidak ada caption')+'</div>'+ 
                '</div>'+ 
              '</div>'+ 
              '<div class="tt-stats">'+
                '<div class="tt-stat"><b>'+fmtNum(plays)+'</b><span>Plays</span></div>'+ 
                '<div class="tt-stat"><b>'+fmtNum(likes)+'</b><span>Likes</span></div>'+ 
                '<div class="tt-stat"><b>'+fmtNum(comments)+'</b><span>Komen</span></div>'+ 
                '<div class="tt-stat"><b>'+fmtNum(shares)+'</b><span>Share</span></div>'+ 
              '</div>'+ 
              '<div class="dl-meta-row">'+
                (duration?'<span class="dl-meta-chip"><i class="fas fa-clock"></i> '+fmtDur(duration)+'</span>':'')+
                (photos.length?'<span class="dl-meta-chip"><i class="fas fa-images"></i> '+photos.length+' Foto</span>':'')+
                (hdSize?'<span class="dl-meta-chip"><i class="fas fa-file-video"></i> HD '+fmtSz(hdSize)+'</span>':'')+
                (wmSize?'<span class="dl-meta-chip"><i class="fas fa-droplet"></i> WM '+fmtSz(wmSize)+'</span>':'')+
              '</div>'+ 
              (caption?'<div class="dl-caption"><div class="dl-caption-label">Caption</div><div class="dl-caption-text">'+ttSafe(caption)+'</div><div class="dl-caption-actions"><button class="dl-copy-btn" id="ttCopyCapBtn" type="button"><i class="fas fa-copy"></i> Copy Caption</button></div></div>':'')+
              '<div class="tt-choice-title"><b><i class="fas fa-list-check"></i> Pilih Format</b><span id="ttSelectedLabel">'+ttSafe(choiceById(selected).label)+'</span></div>'+ 
              '<div class="tt-choice-list" id="ttChoiceList">'+choices.map(function(c){return '<div class="tt-choice-card '+(c.id===selected?'active':'')+'" data-choice="'+ttSafe(c.id)+'" data-type="'+ttSafe(c.type)+'"><div class="tt-choice-icon"><i class="fas '+ttSafe(c.icon)+'"></i></div><div class="tt-choice-text"><b>'+ttSafe(c.label)+'</b><span>'+ttSafe(c.desc)+'</span></div><div class="tt-choice-check"><i class="fas fa-check"></i></div></div>';}).join('')+'</div>'+ 
              '<div class="tt-download-main"><button class="v-btn tt-direct-btn" id="ttMainDownloadBtn" type="button"><i class="fas fa-download"></i> Download '+ttSafe(choiceById(selected).label)+'</button><div class="tt-download-note" id="ttDownloadNote">Pilih format dulu, lalu tekan tombol download. Tidak membuka halaman baru.</div></div>'+ 
            '</div>'+ 
          '</div>';
        function setSelected(id){
          selected=id;
          var ch=choiceById(selected);
          var pb=document.getElementById('ttPreviewBox');
          if(pb){ releaseMedia(pb); pb.innerHTML=previewHTML(ch); }
          wirePreviewControls();
          var sl=document.getElementById('ttSelectedLabel');
          if(sl) sl.textContent=ch.label;
          var main=document.getElementById('ttMainDownloadBtn');
          if(main) main.innerHTML='<i class="fas fa-download"></i> Download '+ch.label;
          document.querySelectorAll('#ttChoiceList .tt-choice-card').forEach(function(card){ card.classList.toggle('active', card.getAttribute('data-choice')===selected); });
          document.querySelectorAll('.tt-photo-thumb').forEach(function(img){ img.classList.toggle('active', img.getAttribute('data-photo-choice')===selected); });
        }
        wirePreviewControls();
        document.querySelectorAll('#ttChoiceList .tt-choice-card').forEach(function(card){ card.addEventListener('click',function(){ setSelected(card.getAttribute('data-choice')); }); });
        document.querySelectorAll('.tt-photo-thumb').forEach(function(img){ img.addEventListener('click',function(){ setSelected(img.getAttribute('data-photo-choice')); }); });
        var copy=document.getElementById('ttCopyCapBtn');
        if(copy && caption){ copy.onclick=function(){ navigator.clipboard.writeText(caption).then(function(){ var before=copy.innerHTML; copy.innerHTML='<i class="fas fa-check"></i> Tersalin'; copy.classList.add('copied'); setTimeout(function(){ copy.innerHTML=before; copy.classList.remove('copied'); },1600); }); }; }
        var mainBtn=document.getElementById('ttMainDownloadBtn');
        var note=document.getElementById('ttDownloadNote');
        if(mainBtn) mainBtn.onclick=function(){ downloadSelected(choiceById(selected), mainBtn, note); };
      }catch(e){
        if(e && e.name==='AbortError') return;
        target.innerHTML='<div class="tt-panel"><div class="dl-error"><i class="fas fa-triangle-exclamation"></i><br><br>Gagal mengambil media.<br><span style="font-size:11px;opacity:.7;">'+ttSafe(e.message||e)+'</span></div></div>';
      }finally{
        var ownsRequest=!requestController || activePreviewRequest===requestController;
        if(activePreviewRequest===requestController) activePreviewRequest=null;
        if(ownsRequest){
          btn.disabled=false;
          btn.innerHTML='<i class="fas fa-magnifying-glass"></i> Preview';
        }
      }
    }
    ttRenderRoomHistory();
    ttWireRoomHistory();
    btn.onclick=run;
    input.addEventListener('keydown',function(e){ if(e.key==='Enter') run(); });
    setTimeout(function(){ try{ input.focus(); }catch(e){} },80);
    if(typeof window.mountToolApiStatus==='function') window.mountToolApiStatus(body,'tiktok');
  };
})();

/* ===== original script 24: nxTiktokRoomScript ===== */
(function(){
  var overlay=null, content=null;
  var oldShowTool=window.showTool;
  var previousBodyOverflow='';

  function closeAnyModal(){
    var viewer=document.getElementById('toolViewer');
    if(viewer) viewer.classList.remove('active');
  }

  function buildRoom(){
    if(overlay) return;
    overlay=document.createElement('div');
    overlay.id='ttRoomOverlay';
    overlay.innerHTML=''+
      '<div class="tt-room-shell">'+
        '<div class="tt-room-topbar">'+
          '<button class="tt-room-back" type="button" id="ttRoomBack"><i class="fas fa-chevron-left"></i><span>All Tools Nexora</span></button>'+
          '<div class="tt-room-title"><i class="fa-brands fa-tiktok"></i><span>TikTok Downloader</span></div>'+
          '<div class="tt-room-pill">MP4 / MP3 / JPG</div>'+
        '</div>'+
        '<div class="tt-room-scroll"><div class="tt-room-content" id="ttRoomContent"></div></div>'+
      '</div>';
    document.body.appendChild(overlay);
    content=document.getElementById('ttRoomContent');
    document.getElementById('ttRoomBack').addEventListener('click', function(){ closeTiktokRoom(true); });
    document.dispatchEvent(new CustomEvent('nexora:tiktok-room-built',{detail:{overlay:overlay}}));
  }

  function openTiktokRoom(){
    buildRoom();
    closeAnyModal();
    if(typeof window.renderTiktok==='function') window.renderTiktok(content);
    else if(typeof renderTiktok==='function') renderTiktok(content);
    if(typeof window.mountToolApiStatus==='function') window.mountToolApiStatus(content,'tiktok');
    else if(typeof mountToolApiStatus==='function') mountToolApiStatus(content,'tiktok');
    if(overlay.style.display!=='block') previousBodyOverflow=document.body.style.overflow||'';
    overlay.style.display='block';
    document.body.classList.add('tt-room-open');
    document.body.style.overflow='hidden';
    requestAnimationFrame(function(){ overlay.classList.add('on'); });
    var input=content.querySelector('#ttUrl');
    if(input) setTimeout(function(){ try{ input.focus(); }catch(e){} },180);
  }

  function closeTiktokRoom(useHistory){
    if(!overlay) return;
    if(useHistory!==false && history.state && history.state.nxLazyTool==='tiktok' && /^#tool-tiktok$/.test(location.hash)){
      try{ history.back(); return; }catch(_historyError){}
    }
    if(typeof window.cleanupTiktokRuntime==='function') window.cleanupTiktokRuntime(overlay);
    overlay.classList.remove('on');
    setTimeout(function(){
      overlay.style.display='none';
      if(content) content.innerHTML='';
      document.body.classList.remove('tt-room-open');
      document.body.style.overflow=previousBodyOverflow;
    },280);
  }

  window.openTiktokRoom=openTiktokRoom;
  window.closeTiktokRoom=closeTiktokRoom;

  window.showTool=function(toolId){
    if(toolId==='tiktok'){
      openTiktokRoom();
      return;
    }
    if(typeof oldShowTool==='function') return oldShowTool.apply(this, arguments);
  };

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && overlay && overlay.classList.contains('on')) closeTiktokRoom();
  });

  function patchCards(){
    document.querySelectorAll('.tools-card h4').forEach(function(h){
      if((h.textContent||'').trim().toLowerCase()!=='tiktok') return;
      var card=h.closest('.tools-card');
      if(!card) return;
      card.removeAttribute('onclick');
      card.onclick=openTiktokRoom;
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',patchCards);
  else patchCards();
})();

/* ===== Nexora v6.3.13: single TikTok preview controller (no global observer) ===== */
(function(){
  function fmtTime(sec){
    sec=Number(sec||0);
    if(!isFinite(sec)||sec<0) sec=0;
    var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=Math.floor(sec%60);
    return h ? h+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0') : m+':'+String(ss).padStart(2,'0');
  }
  function enhanceOne(box){
    if(!box || !box.querySelector) return;
    var video=box.querySelector('video.tt-preview-video');
    if(!video || video.dataset.nxPreviewControlReady==='1') return;
    video.dataset.nxPreviewControlReady='1';
    video.controls=false;
    video.removeAttribute('controls');
    video.setAttribute('playsinline','');
    video.setAttribute('webkit-playsinline','');

    var controls=box.querySelector('.tt-preview-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='tt-preview-controls';
      controls.innerHTML='<span class="tt-preview-time" data-tt-current>0:00</span><input class="tt-preview-range" data-tt-seek type="range" min="0" max="100" step="0.01" value="0" aria-label="Atur durasi preview"><span class="tt-preview-time" data-tt-duration>0:00</span>';
      box.appendChild(controls);
    }
    var label=box.querySelector('.tt-preview-controls-label');
    if(!label){
      label=document.createElement('div');
      label.className='tt-preview-controls-label';
      label.innerHTML='<i class="fas fa-sliders"></i> Atur Durasi Preview';
      box.appendChild(label);
    }
    var seek=controls.querySelector('[data-tt-seek]');
    var cur=controls.querySelector('[data-tt-current]');
    var dur=controls.querySelector('[data-tt-duration]');
    var play=box.querySelector('.tt-custom-play');
    var idleTimer=null,seeking=false,lastRenderedSecond=-1;

    function getDuration(){
      var value=video.duration;
      if(!isFinite(value)||value<=0) value=Number(video.getAttribute('data-preview-duration')||0);
      return isFinite(value)&&value>0 ? value : 0;
    }
    function updateDuration(){
      var value=getDuration();
      seek.max=value>0 ? String(value) : '100';
      dur.textContent=value>0 ? fmtTime(value) : '0:00';
    }
    function updateTime(force){
      var value=video.currentTime||0;
      var whole=Math.floor(value);
      if(!force && whole===lastRenderedSecond && !seeking) return;
      lastRenderedSecond=whole;
      if(!seeking) seek.value=String(value);
      cur.textContent=fmtTime(value);
    }
    function hideSoon(){
      clearTimeout(idleTimer);
      if(!video.paused&&!video.ended){
        idleTimer=setTimeout(function(){ box.classList.add('controls-idle'); box.classList.remove('controls-visible'); },1200);
      }
    }
    function showControls(){
      box.classList.remove('controls-idle');
      box.classList.add('controls-visible');
      hideSoon();
    }
    function syncState(){
      var playing=!video.paused&&!video.ended;
      box.classList.toggle('is-playing',playing);
      if(play) play.innerHTML=playing?'<i class="fas fa-pause"></i>':'<i class="fas fa-play"></i>';
      if(playing) showControls();
      else{ clearTimeout(idleTimer); box.classList.remove('controls-idle'); box.classList.add('controls-visible'); }
      updateDuration();
      updateTime(true);
    }
    function toggle(ev){
      if(ev){ ev.preventDefault(); ev.stopPropagation(); }
      if(video.paused||video.ended) video.play().catch(function(){ syncState(); });
      else video.pause();
    }

    video.addEventListener('click',toggle);
    if(play) play.addEventListener('click',toggle);
    ['pointermove','touchstart'].forEach(function(eventName){ box.addEventListener(eventName,showControls,{passive:true}); });
    controls.addEventListener('click',function(e){ e.stopPropagation(); });
    controls.addEventListener('pointerdown',function(e){ e.stopPropagation(); });
    controls.addEventListener('touchstart',function(e){ e.stopPropagation(); },{passive:true});
    seek.addEventListener('input',function(){
      seeking=true;
      var duration=getDuration(),value=Number(seek.value||0);
      if(duration>0){ value=Math.max(0,Math.min(value,duration)); try{ video.currentTime=value; }catch(e){} }
      cur.textContent=fmtTime(value);
      showControls();
    });
    seek.addEventListener('change',function(){ seeking=false; updateTime(true); showControls(); });
    video.addEventListener('loadedmetadata',syncState);
    video.addEventListener('durationchange',updateDuration);
    video.addEventListener('timeupdate',function(){ updateTime(false); });
    video.addEventListener('play',syncState);
    video.addEventListener('pause',syncState);
    video.addEventListener('ended',syncState);
    syncState();
  }
  window.nxEnhanceTiktokPreviewControls=function(root){
    if(!root) return;
    if(root.matches && root.matches('#ttPreviewBox')) enhanceOne(root);
    else if(root.querySelectorAll) root.querySelectorAll('#ttPreviewBox').forEach(enhanceOne);
  };
})();

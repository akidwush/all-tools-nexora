(function(){
  "use strict";
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];});}
  function trigger(url,filename,meta){
    if(typeof window.nxDownloadUrl==="function")return window.nxDownloadUrl(url,filename,meta);
    var link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.download=filename;document.body.appendChild(link);link.click();link.remove();
    return Promise.resolve(true);
  }
  function errorHtml(message){return '<div class="dl-error" role="alert"><i class="fas fa-triangle-exclamation"></i><br><br>'+esc(message)+'</div>';}
  function bindRun(input,button,run){button.addEventListener("click",run);input.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();run();}});}

  window.renderInstagram=function(body){
    body.innerHTML='<h2><i class="fa-brands fa-instagram"></i> Instagram Downloader</h2><p class="nx-downloader-lead">Posting publik: video, Reels, foto, dan carousel.</p><input type="url" class="v-input" id="instaUrl" placeholder="https://www.instagram.com/reel/..." autocomplete="url" spellcheck="false"><button class="v-btn" id="instaBtn" type="button"><i class="fas fa-download"></i> Ambil Media</button><div id="instaResult" aria-live="polite"></div>';
    var input=body.querySelector("#instaUrl"),button=body.querySelector("#instaBtn"),target=body.querySelector("#instaResult");
    async function run(){
      var url=input.value.trim();if(!url){target.innerHTML=errorHtml("Tempel URL Instagram terlebih dahulu.");input.focus();return;}
      button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin"></i> Mengambil...';target.innerHTML='<div class="dl-loading"><div class="dl-spin"></div><p>Mengambil media...</p></div>';
      try{
        var result=await window.NexoraDownloader.request("instagram",url),data=result.data,media=Array.isArray(data.media)?data.media:[];
        if(!media.length)throw new Error("Media tidak ditemukan.");
        target.innerHTML=(data.thumbnail?'<img class="nx-downloader-preview" src="'+esc(data.thumbnail)+'" alt="Preview Instagram">':'')+
          '<div class="dl-title">'+esc(data.title||"Instagram Media")+'</div>'+(data.author?'<div class="dl-author-name">@'+esc(data.author)+'</div>':'')+
          (data.caption?'<div class="dl-caption"><div class="dl-caption-label">Caption</div><div class="dl-caption-text">'+esc(data.caption)+'</div></div>':'')+
          '<div class="dl-section-label"><i class="fas fa-download"></i> Format tersedia</div><div class="dl-options">'+media.map(function(item,index){return '<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon '+(item.type==="MP4"?"mp4":"std")+'"><i class="fas fa-'+(item.type==="MP4"?"video":"image")+'"></i></div><div><div class="dl-option-title">'+esc(item.type)+" "+(media.length>1?"#"+(index+1):"")+'</div><div class="dl-option-desc">'+esc(item.quality||"Media publik")+'</div></div></div><button class="dl-dl-btn" type="button" data-media="'+index+'">Simpan</button></div>';}).join("")+'</div><p class="nx-capability-notice" data-download-status hidden></p>';
        target.querySelectorAll("[data-media]").forEach(function(node){node.addEventListener("click",async function(){
          var item=media[Number(node.dataset.media)],status=target.querySelector("[data-download-status]"),old=node.innerHTML;
          node.disabled=true;node.innerHTML='<i class="fas fa-spinner fa-spin"></i> Memeriksa';
          if(status){status.hidden=false;status.textContent="Memvalidasi file melalui server download aman...";}
          try{
            await trigger(item.url,item.filename,{tool:"Instagram",type:item.type,title:data.title});
            if(status)status.textContent="Download tervalidasi dan sedang dimulai.";
          }catch(error){if(status)status.textContent="Download gagal: "+(error&&error.message?error.message:"server tidak dapat menjangkau file");}
          finally{node.disabled=false;node.innerHTML=old;}
        });});
      }catch(error){if(error&&error.name!=="AbortError")target.innerHTML=errorHtml(error.message||"Instagram gagal diproses.");}
      finally{button.disabled=false;button.innerHTML='<i class="fas fa-download"></i> Ambil Media';}
    }
    bindRun(input,button,run);
  };

  function renderOfficial(body,provider,brand,icon,placeholder){
    body.innerHTML='<h2><i class="fa-brands '+icon+'"></i> '+brand+'</h2><p class="nx-downloader-lead">Metadata dan tautan resmi. Nexora tidak mengekstrak, mengonversi, atau melewati DRM/login.</p><input type="url" class="v-input" data-official-input placeholder="'+esc(placeholder)+'" autocomplete="url" spellcheck="false"><button class="v-btn" data-official-button type="button"><i class="fas fa-magnifying-glass"></i> Ambil Metadata</button><div data-official-result aria-live="polite"></div>';
    var input=body.querySelector("[data-official-input]"),button=body.querySelector("[data-official-button]"),target=body.querySelector("[data-official-result]");
    async function run(){
      var url=input.value.trim();if(!url){target.innerHTML=errorHtml("Tempel URL "+brand+" terlebih dahulu.");input.focus();return;}
      button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin"></i> Mengambil...';target.innerHTML='<div class="dl-loading"><div class="dl-spin"></div><p>Mengambil metadata resmi...</p></div>';
      try{
        var result=await window.NexoraDownloader.request(provider,url),data=result.data;
        target.innerHTML='<article class="nx-official-result">'+(data.thumbnail?'<img class="nx-downloader-preview" src="'+esc(data.thumbnail)+'" alt="Thumbnail '+esc(brand)+'">':'')+'<div><div class="dl-title">'+esc(data.title||brand+" Media")+'</div>'+(data.author?'<div class="dl-author-name">'+esc(data.author)+'</div>':'')+'<p class="nx-capability-notice"><i class="fas fa-circle-info"></i> '+esc(data.notice||"Hanya tautan resmi yang tersedia.")+'</p><a class="v-btn nx-official-link" href="'+esc(data.officialUrl)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Buka di '+esc(brand)+'</a></div></article>';
      }catch(error){if(error&&error.name!=="AbortError")target.innerHTML=errorHtml(error.message||"Metadata gagal diambil.");}
      finally{button.disabled=false;button.innerHTML='<i class="fas fa-magnifying-glass"></i> Ambil Metadata';}
    }
    bindRun(input,button,run);
  }
  window.renderYoutube=function(body){renderOfficial(body,"youtube","YouTube","fa-youtube","https://youtu.be/...");};
  function renderSpotify(body){
    body.innerHTML='<h2><i class="fa-brands fa-spotify"></i> Spotify Downloader</h2><p class="nx-downloader-lead">Unduh audio bila provider tersedia; jika gagal, Nexora tetap menampilkan metadata dan tautan Spotify resmi.</p><input type="url" class="v-input" data-spotify-input placeholder="https://open.spotify.com/track/..." autocomplete="url" spellcheck="false"><button class="v-btn" data-spotify-button type="button"><i class="fas fa-download"></i> Proses Track</button><div data-spotify-result aria-live="polite"></div>';
    var input=body.querySelector("[data-spotify-input]"),button=body.querySelector("[data-spotify-button]"),target=body.querySelector("[data-spotify-result]");
    async function run(){
      var url=input.value.trim();if(!url){target.innerHTML=errorHtml("Tempel URL track Spotify terlebih dahulu.");input.focus();return;}
      button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin"></i> Memproses...';target.innerHTML='<div class="dl-loading"><div class="dl-spin"></div><p>Mencoba provider audio...</p></div>';
      try{
        var result=await window.NexoraDownloader.request("spotify",url),data=result.data,media=Array.isArray(data.media)?data.media:[];
        var intro=(data.thumbnail?'<img class="nx-downloader-preview" src="'+esc(data.thumbnail)+'" alt="Cover Spotify">':'')+'<div class="dl-title">'+esc(data.title||"Spotify Track")+'</div>'+(data.author?'<div class="dl-author-name">'+esc(data.author)+'</div>':'');
        if(!media.length){target.innerHTML='<article class="nx-official-result">'+intro+'<div><p class="nx-capability-notice"><i class="fas fa-circle-info"></i> '+esc(data.notice||"Provider audio sedang tidak tersedia; gunakan tautan resmi.")+'</p><a class="v-btn nx-official-link" href="'+esc(data.officialUrl)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Buka di Spotify</a></div></article>';return;}
        target.innerHTML=intro+'<p class="nx-capability-notice"><i class="fas fa-circle-info"></i> '+esc(data.notice||"Audio provider tersedia.")+'</p><div class="dl-options">'+media.map(function(item,index){return '<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon"><i class="fas fa-music"></i></div><div><div class="dl-option-title">'+esc(item.type||"MP3")+'</div><div class="dl-option-desc">'+esc(item.quality||"Audio")+'</div></div></div><button class="dl-dl-btn" type="button" data-spotify-media="'+index+'">Simpan</button></div>';}).join("")+'</div><p class="nx-capability-notice" data-download-status hidden></p>';
        target.querySelectorAll("[data-spotify-media]").forEach(function(node){node.addEventListener("click",async function(){var item=media[Number(node.dataset.spotifyMedia)],status=target.querySelector("[data-download-status]"),old=node.innerHTML;node.disabled=true;node.innerHTML='<i class="fas fa-spinner fa-spin"></i>';if(status){status.hidden=false;status.textContent="Memvalidasi audio...";}try{await trigger(item.url,item.filename,{tool:"Spotify",type:item.type||"MP3",title:data.title});if(status)status.textContent="Download tervalidasi dan sedang dimulai.";}catch(error){if(status)status.textContent="Download gagal: "+(error&&error.message?error.message:"provider tidak dapat dijangkau");}finally{node.disabled=false;node.innerHTML=old;}});});
      }catch(error){if(error&&error.name!=="AbortError")target.innerHTML=errorHtml(error.message||"Spotify gagal diproses.");}
      finally{button.disabled=false;button.innerHTML='<i class="fas fa-download"></i> Proses Track';}
    }
    bindRun(input,button,run);
  }
  window.renderSpotify=renderSpotify;
  window.NexoraDownloaderRenderSpotify=renderSpotify;
  window.NexoraDownloaderRenderOfficial=renderOfficial;
})();

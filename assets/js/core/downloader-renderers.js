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

  function renderDownloadProvider(body,config){
    body.innerHTML='<h2><i class="fa-brands '+config.icon+'"></i> '+config.title+'</h2><p class="nx-downloader-lead">'+esc(config.lead)+'</p><input type="url" class="v-input" data-real-input placeholder="'+esc(config.placeholder)+'" autocomplete="url" spellcheck="false"><button class="v-btn" data-real-button type="button"><i class="fas fa-download"></i> '+esc(config.button)+'</button><div data-real-result aria-live="polite"></div>';
    var input=body.querySelector("[data-real-input]"),button=body.querySelector("[data-real-button]"),target=body.querySelector("[data-real-result]");
    async function run(){
      var url=input.value.trim();if(!url){target.innerHTML=errorHtml("Tempel URL "+config.brand+" terlebih dahulu.");input.focus();return;}
      button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin"></i> Memproses...';target.innerHTML='<div class="dl-loading"><div class="dl-spin"></div><p>Mencari file yang benar-benar dapat diunduh...</p></div>';
      try{
        var result=await window.NexoraDownloader.request(config.provider,url),data=result.data,media=Array.isArray(data.media)?data.media:[];
        var intro=(data.thumbnail?'<img class="nx-downloader-preview" src="'+esc(data.thumbnail)+'" alt="Preview '+esc(config.brand)+'">':'')+'<div class="dl-title">'+esc(data.title||config.brand+" Media")+'</div>'+(data.author?'<div class="dl-author-name">'+esc(data.author)+'</div>':'');
        if(!media.length){target.innerHTML='<article class="nx-official-result">'+intro+'<div><p class="nx-capability-notice"><i class="fas fa-circle-info"></i> '+esc(data.notice||"Provider download sedang tidak tersedia.")+'</p><a class="v-btn nx-official-link" href="'+esc(data.officialUrl)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Buka di '+esc(config.brand)+'</a></div></article>';return;}
        target.innerHTML=intro+'<p class="nx-capability-notice"><i class="fas fa-circle-check"></i> '+esc(data.notice||"File tersedia.")+'</p><div class="dl-section-label"><i class="fas fa-download"></i> Format tersedia</div><div class="dl-options">'+media.map(function(item,index){var type=String(item.type||"FILE").toUpperCase(),isAudio=type==="MP3";return '<div class="dl-option"><div class="dl-option-info"><div class="dl-option-icon '+(isAudio?'mp3':'mp4')+'"><i class="fas fa-'+(isAudio?'music':'video')+'"></i></div><div><div class="dl-option-title">'+esc(type)+'</div><div class="dl-option-desc">'+esc(item.quality||(isAudio?'Audio':'Video'))+'</div></div></div><button class="dl-dl-btn" type="button" data-real-media="'+index+'">↓ Download</button></div>';}).join("")+'</div><p class="nx-capability-notice" data-download-status hidden></p>';
        target.querySelectorAll("[data-real-media]").forEach(function(node){node.addEventListener("click",async function(){var item=media[Number(node.dataset.realMedia)],status=target.querySelector("[data-download-status]"),old=node.innerHTML;node.disabled=true;node.innerHTML='<i class="fas fa-spinner fa-spin"></i> Memeriksa';if(status){status.hidden=false;status.textContent="Memvalidasi file sebelum download...";}try{await trigger(item.url,item.filename,{tool:config.brand,type:item.type||"FILE",title:data.title});if(status)status.textContent="File tervalidasi. Download dimulai.";}catch(error){if(status)status.textContent="Download gagal: "+(error&&error.message?error.message:"provider tidak dapat dijangkau");}finally{node.disabled=false;node.innerHTML=old;}});});
      }catch(error){if(error&&error.name!=="AbortError")target.innerHTML=errorHtml(error.message||config.brand+" gagal diproses.");}
      finally{button.disabled=false;button.innerHTML='<i class="fas fa-download"></i> '+esc(config.button);}
    }
    bindRun(input,button,run);
  }

  window.renderYoutube=function(body){renderDownloadProvider(body,{provider:"youtube",brand:"YouTube",title:"YouTube Downloader",icon:"fa-youtube",placeholder:"https://youtu.be/...",button:"Ambil MP4 / MP3",lead:"Tempel link YouTube publik. Nexora mencoba MP4 dan MP3 melalui provider server-side, lalu memvalidasi file sebelum download."});};
  function renderSpotify(body){renderDownloadProvider(body,{provider:"spotify",brand:"Spotify",title:"Spotify Downloader",icon:"fa-spotify",placeholder:"https://open.spotify.com/track/...",button:"Ambil MP3",lead:"Tempel link track Spotify. Nexora mencoba audio MP3 melalui provider server-side; jika provider gagal, metadata dan link resmi tetap ditampilkan."});}
  window.renderSpotify=renderSpotify;
})();

(function(){
  "use strict";
  if(window.__NEXORA_SPLUS_INTEGRATED_V2__) return;
  window.__NEXORA_SPLUS_INTEGRATED_V2__=true;

  var API="/api/tool-health?mode=nexray-splus";
  var MAX_IMAGE_BYTES=2500000;
  var VALID_TYPES=["image/jpeg","image/png","image/webp"];

  function safeUrl(value){
    var raw=String(value||"");
    if(/^data:(?:image|audio|video)\//i.test(raw)) return raw;
    try{var u=new URL(raw,location.href);return u.protocol==="https:"?u.toString():"";}catch(_){return "";}
  }
  function msg(error,fallback){
    return String(error&&error.message||fallback||"Creative AI S+ sedang tidak tersedia.")
      .replace(/^NEXRAY_SPLUS_[A-Z_]+:?\s*/i,"").slice(0,260);
  }
  function fileData(file){
    if(!file||!VALID_TYPES.includes(file.type)||!file.size||file.size>MAX_IMAGE_BYTES)
      return Promise.reject(new Error("Gunakan JPG, PNG, atau WebP maksimal 2.5 MB."));
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){resolve(String(reader.result||""));};
      reader.onerror=function(){reject(new Error("Gambar gagal dibaca."));};
      reader.readAsDataURL(file);
    });
  }
  async function post(action,body,timeoutMs){
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},timeoutMs||120000);
    try{
      var response=await fetch(API+"&action="+encodeURIComponent(action),{
        method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.signal,
        headers:{Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify(body||{})
      });
      var payload;
      try{payload=await response.json();}catch(_){throw new Error("Server S+ mengirim respons yang tidak dapat dibaca.");}
      if(!response.ok||!payload||payload.ok!==true||!payload.data)
        throw new Error(String(payload&&payload.message||"Provider S+ gagal memproses permintaan."));
      return payload.data;
    }catch(error){
      if(error&&error.name==="AbortError") throw new Error("Proses S+ terlalu lama. Coba lagi nanti.");
      throw error;
    }finally{clearTimeout(timer);}
  }
  function addOption(select,value,label){
    if(!select||Array.from(select.options).some(function(o){return o.value===value;})) return;
    var option=document.createElement("option");option.value=value;option.textContent=label;select.appendChild(option);
  }
  function setDisabled(button,value){
    if(button&&Boolean(button.disabled)!==Boolean(value)) button.disabled=Boolean(value);
  }
  function cleanupWrap(body,dispose){
    var before=typeof body.__nxCleanup==="function"?body.__nxCleanup:null;
    body.__nxCleanup=function(){
      try{dispose&&dispose();}catch(_){}
      if(before)before();
      body.__nxCleanup=null;
    };
  }

  function enhanceImage(body){
    if(!body||body.dataset.nxsplusImageV2==="1") return;
    var model=body.querySelector("#npiModel"),prompt=body.querySelector("#npiPrompt"),generate=body.querySelector("#npiGenerate");
    var message=body.querySelector("#npiMessage"),image=body.querySelector("#npiImage"),placeholder=body.querySelector("#npiPlaceholder"),download=body.querySelector("#npiDownload");
    if(!model||!prompt||!generate||!message||!image||!placeholder||!download)return;
    body.dataset.nxsplusImageV2="1";

    addOption(model,"nexray-nanobanana","Nano Banana — Nexray S+ · Edit Image");
    addOption(model,"nexray-gptimage","GPT Image — Nexray S+ · Edit Image");

    var box=document.createElement("div");
    box.className="nxsplus-inline";
    box.hidden=true;
    box.innerHTML='<div class="nxsplus-inline-head"><span><i class="fa-solid fa-wand-magic-sparkles"></i> S+ IMAGE EDIT</span><b>NEXRAY</b></div>'+
      '<label class="nxsplus-inline-file"><input id="nxsImageV2File" type="file" accept="image/jpeg,image/png,image/webp"><i class="fa-regular fa-image"></i><span id="nxsImageV2Name">Pilih gambar yang mau diedit</span><small>JPG / PNG / WebP · maks 2.5 MB</small></label>';
    model.insertAdjacentElement("afterend",box);

    var file=box.querySelector("#nxsImageV2File"),fileName=box.querySelector("#nxsImageV2Name");
    var promptLabel=body.querySelector('label[for="npiPrompt"]');
    var originalPromptLabel=promptLabel?promptLabel.textContent:"";
    var working=false,alive=true,guard=false;

    function active(){return /^nexray-(?:nanobanana|gptimage)$/.test(model.value);}
    function sync(){
      if(!alive||guard)return;
      guard=true;
      var on=active();box.hidden=!on;
      if(promptLabel)promptLabel.textContent=on?"Instruksi edit gambar":originalPromptLabel;
      var span=generate.querySelector("span");
      if(span&&!working)span.textContent=on?(model.value==="nexray-gptimage"?"Edit dengan GPT Image S+":"Edit dengan Nano Banana S+"):"Buat Gambar";
      if(on)setDisabled(generate,working||prompt.value.trim().length<3||!(file.files&&file.files[0]));
      guard=false;
    }

    file.addEventListener("change",function(){
      fileName.textContent=file.files&&file.files[0]?file.files[0].name:"Pilih gambar yang mau diedit";
      sync();
    });
    model.addEventListener("change",function(){queueMicrotask(sync);});
    prompt.addEventListener("input",sync);
    var observer=new MutationObserver(function(){queueMicrotask(sync);});
    observer.observe(generate,{attributes:true,attributeFilter:["disabled"]});

    generate.addEventListener("click",async function(event){
      if(!active())return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(working)return;
      var text=prompt.value.trim(),chosen=file.files&&file.files[0];
      if(text.length<3){message.className="npi-message is-error";message.textContent="Tulis instruksi edit sedikitnya 3 huruf.";return;}
      if(!chosen){message.className="npi-message is-error";message.textContent="Pilih gambar yang ingin diedit.";return;}
      working=true;setDisabled(generate,true);
      generate.querySelector("i").className="fa-solid fa-circle-notch fa-spin";
      generate.querySelector("span").textContent="Editing…";
      message.className="npi-message is-loading";message.textContent="Mengirim ke "+(model.value==="nexray-gptimage"?"GPT Image":"Nano Banana")+" S+…";
      try{
        var dataUrl=await fileData(chosen);
        var data=await post("image-edit",{engine:model.value==="nexray-gptimage"?"gptimage":"nanobanana",param:text,imageData:dataUrl},115000);
        if(!alive)return;
        var url=safeUrl(data.imageUrl);if(!url)throw new Error("Provider tidak mengembalikan gambar valid.");
        image.src=url;image.hidden=false;placeholder.hidden=true;download.href=url;download.download="nexora-splus-edit-"+Date.now()+".png";download.hidden=false;
        message.className="npi-message is-ok";message.textContent="Selesai · "+String(data.provider||"Nexray S+");
      }catch(error){
        if(alive){message.className="npi-message is-error";message.textContent=msg(error,"Edit gambar gagal.");}
      }finally{
        working=false;
        if(alive){generate.querySelector("i").className="fa-solid fa-wand-magic-sparkles";sync();}
      }
    },true);

    queueMicrotask(sync);
    cleanupWrap(body,function(){alive=false;observer.disconnect();});
  }

  function enhanceVideo(body){
    if(!body||body.dataset.nxsplusVideoV2==="1")return;
    var model=body.querySelector("#nvgModel"),prompt=body.querySelector("#nvgPrompt"),generate=body.querySelector("#nvgGenerate");
    var imageMode=body.querySelector("#nvgImageMode"),reference=body.querySelector("#nvgReference"),file=body.querySelector("#nvgFile");
    var message=body.querySelector("#nvgMessage"),video=body.querySelector("#nvgVideo"),placeholder=body.querySelector("#nvgPlaceholder");
    var actions=body.querySelector("#nvgActions"),download=body.querySelector("#nvgDownload"),open=body.querySelector("#nvgOpen"),meta=body.querySelector("#nvgResultMeta"),cost=body.querySelector("#nvgCost");
    if(!model||!prompt||!generate||!imageMode||!reference||!file||!message||!video||!placeholder||!actions||!download||!open)return;
    body.dataset.nxsplusVideoV2="1";

    addOption(model,"nexray-veo3","Veo 3 — Nexray S+ · Image to Video");
    var badge=document.createElement("div");badge.className="nxsplus-engine-note";badge.hidden=true;
    badge.innerHTML='<i class="fa-solid fa-bolt"></i><span><b>Veo 3 · Nexray S+</b> memakai backend Nexora. Tidak memakai allowance Puter.</span>';
    (cost||model).insertAdjacentElement("afterend",badge);

    var working=false,alive=true,guard=false;
    function active(){return model.value==="nexray-veo3";}
    function sync(){
      if(!alive||guard)return;
      guard=true;
      var on=active();badge.hidden=!on;
      if(on){
        if(reference.hidden)imageMode.click();
        if(cost){cost.querySelector("strong").textContent="Veo 3 · Nexray S+";cost.querySelector("span").textContent="Image-to-video server-side · durasi final mengikuti provider.";}
        setDisabled(generate,working||prompt.value.trim().length<3||!(file.files&&file.files[0]));
        var span=generate.querySelector("span");if(span&&!working)span.textContent="Generate dengan Veo 3 S+";
      }
      guard=false;
    }
    model.addEventListener("change",function(){setTimeout(sync,0);});
    prompt.addEventListener("input",sync);
    file.addEventListener("change",function(){setTimeout(sync,0);});
    var observer=new MutationObserver(function(){queueMicrotask(sync);});
    observer.observe(generate,{attributes:true,attributeFilter:["disabled"]});

    generate.addEventListener("click",async function(event){
      if(!active())return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(working)return;
      var text=prompt.value.trim(),chosen=file.files&&file.files[0];
      if(text.length<3){message.className="nvg-message is-error";message.textContent="Tulis prompt gerakan sedikitnya 3 huruf.";return;}
      if(!chosen){message.className="nvg-message is-error";message.textContent="Pilih gambar referensi terlebih dahulu.";return;}
      working=true;setDisabled(generate,true);
      generate.querySelector("i").className="fa-solid fa-circle-notch fa-spin";generate.querySelector("span").textContent="Veo 3 sedang membuat video…";
      message.className="nvg-message is-loading";message.textContent="Veo 3 S+ sedang memproses gambar. Proses dapat memerlukan beberapa menit.";
      try{
        var dataUrl=await fileData(chosen);
        var data=await post("veo3",{prompt:text,imageData:dataUrl},185000);
        if(!alive)return;
        var url=safeUrl(data.videoUrl);if(!url)throw new Error("Veo 3 tidak mengembalikan video valid.");
        try{video.pause();}catch(_){}
        video.src=url;video.controls=true;video.playsInline=true;video.preload="metadata";video.hidden=false;video.load();
        placeholder.hidden=true;download.href=url;download.download="nexora-veo3-"+Date.now()+".mp4";open.href=url;actions.hidden=false;
        if(meta)meta.textContent="Veo 3 · Nexray S+";
        message.className="nvg-message is-ok";message.textContent="Video Veo 3 S+ selesai.";
      }catch(error){
        if(alive){message.className="nvg-message is-error";message.textContent=msg(error,"Veo 3 gagal membuat video.");}
      }finally{
        working=false;
        if(alive){generate.querySelector("i").className="fa-solid fa-clapperboard";sync();}
      }
    },true);

    queueMicrotask(sync);
    cleanupWrap(body,function(){alive=false;observer.disconnect();});
  }

  function enhanceSong(body){
    if(!body||body.dataset.nxsplusSongV2==="1")return;
    var form=body.querySelector("#nxSongForm"),prompt=body.querySelector("#nxSongPrompt"),generate=body.querySelector("#nxSongGenerate");
    var feedback=body.querySelector("#nxSongFeedback"),result=body.querySelector("#nxSongResultCard"),title=body.querySelector("#nxSongResultTitle"),status=body.querySelector("#nxSongStatus");
    var audio=body.querySelector("#nxSongAudio"),actions=body.querySelector("#nxSongActions"),cover=body.querySelector("#nxSongCover");
    if(!form||!prompt||!generate||!feedback||!result||!title||!audio||!actions)return;
    body.dataset.nxsplusSongV2="1";

    var wrap=document.createElement("label");wrap.className="nxsplus-song-engine";
    wrap.innerHTML='<span>Engine</span><select id="nxsSongEngineV2"><option value="default">Nexora Music AI — default</option><option value="suno">Suno — Nexray S+</option></select>';
    var presets=form.querySelector(".nx-song-presets");form.insertBefore(wrap,presets||generate);
    var engine=wrap.querySelector("select"),working=false,alive=true;

    engine.addEventListener("change",function(){
      var span=generate.querySelector("span");
      if(span&&!working)span.textContent=engine.value==="suno"?"Generate dengan Suno S+":"Generate Song";
    });

    form.addEventListener("submit",async function(event){
      if(engine.value!=="suno")return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(working)return;
      var text=prompt.value.trim();
      if(text.length<3){feedback.className="nx-song-feedback is-error";feedback.textContent="Tulis deskripsi lagu sedikitnya 3 huruf.";return;}
      working=true;generate.disabled=true;generate.querySelector("i").className="fa-solid fa-circle-notch fa-spin";generate.querySelector("span").textContent="Suno sedang membuat musik…";
      feedback.className="nx-song-feedback is-loading";feedback.textContent="Suno S+ sedang membuat musik…";
      try{
        var data=await post("suno",{prompt:text},100000);
        if(!alive)return;
        var url=safeUrl(data.audioUrl);if(!url)throw new Error("Suno tidak mengembalikan audio valid.");
        result.hidden=false;title.textContent=String(data.title||"Hasil Suno S+");if(status)status.textContent="Nexray Suno";
        audio.src=url;audio.load();actions.replaceChildren();
        var open=document.createElement("a");open.className="nx-song-action";open.href=url;open.target="_blank";open.rel="noopener noreferrer";open.innerHTML='<i class="fa-solid fa-arrow-up-right-from-square"></i>Open Audio';
        var dl=document.createElement("a");dl.className="nx-song-action";dl.href=url;dl.target="_blank";dl.rel="noopener noreferrer";dl.innerHTML='<i class="fa-solid fa-download"></i>Download Song';
        actions.append(dl,open);
        if(cover&&safeUrl(data.coverUrl)){cover.hidden=false;cover.innerHTML='<img src="'+safeUrl(data.coverUrl)+'" alt="Suno cover">';}
        feedback.className="nx-song-feedback";feedback.textContent="Audio Suno S+ siap.";
      }catch(error){
        if(alive){feedback.className="nx-song-feedback is-error";feedback.textContent=msg(error,"Suno gagal membuat musik.");}
      }finally{
        working=false;if(alive){generate.disabled=false;generate.querySelector("i").className="fa-solid fa-wand-magic-sparkles";generate.querySelector("span").textContent="Generate dengan Suno S+";}
      }
    },true);
    cleanupWrap(body,function(){alive=false;});
  }

  function wrap(name,enhancer){
    var current=window[name];
    if(typeof current!=="function"||current.__nexraySPlusV2)return;
    function wrapped(body){var result=current.apply(this,arguments);try{enhancer(body);}catch(error){console.error("[Nexora S+ V2]",name,error);}return result;}
    wrapped.__nexraySPlusV2=true;wrapped.__nexraySPlusOriginal=current;window[name]=wrapped;
  }
  function install(){wrap("renderPuterImage",enhanceImage);wrap("renderPuterVideo",enhanceVideo);wrap("renderAiSong",enhanceSong);}
  install();
  document.addEventListener("nexora:module-loaded",install);
})();
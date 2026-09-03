(function(){
  "use strict";

  if(window.__NEXORA_SPLUS_HOOKS__) return;
  window.__NEXORA_SPLUS_HOOKS__=true;

  var API="/api/tool-health?mode=nexray-splus";
  var MAX_IMAGE_BYTES=2500000;
  var VALID_TYPES=["image/jpeg","image/png","image/webp"];

  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;}
  function safeUrl(value){var raw=String(value||"");if(/^data:(?:image|audio|video)\//i.test(raw))return raw;try{var u=new URL(raw,location.href);return u.protocol==="https:"?u.toString():"";}catch(_){return "";}}
  function message(error,fallback){return String(error&&error.message||fallback||"Creative AI S+ sedang tidak tersedia.").replace(/^NEXRAY_SPLUS_[A-Z_]+:?\s*/i,"").slice(0,260);}
  function fileData(file){
    if(!file||!VALID_TYPES.includes(file.type)||!file.size||file.size>MAX_IMAGE_BYTES)return Promise.reject(new Error("Gunakan JPG, PNG, atau WebP maksimal 2.5 MB."));
    return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||""));};reader.onerror=function(){reject(new Error("Gambar gagal dibaca."));};reader.readAsDataURL(file);});
  }
  async function post(action,body,timeoutMs){
    var controller=new AbortController();var timer=setTimeout(function(){controller.abort();},timeoutMs||120000);
    try{
      var response=await fetch(API+"&action="+encodeURIComponent(action),{method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body||{})});
      var payload;try{payload=await response.json();}catch(_){throw new Error("Server S+ mengirim respons yang tidak dapat dibaca.");}
      if(!response.ok||!payload||payload.ok!==true||!payload.data)throw new Error(String(payload&&payload.message||"Provider S+ gagal memproses permintaan."));
      return payload.data;
    }catch(error){if(error&&error.name==="AbortError")throw new Error("Proses S+ terlalu lama. Coba lagi nanti.");throw error;}finally{clearTimeout(timer);}
  }
  function cleanupWrap(body,dispose){var before=typeof body.__nxCleanup==="function"?body.__nxCleanup:null;body.__nxCleanup=function(){try{dispose&&dispose();}catch(_){}if(before)before();body.__nxCleanup=null;};}

  function head(icon,title,desc){
    var section=el("section","nxsplus");
    section.innerHTML='<div class="nxsplus-head"><span class="nxsplus-mark"><i class="'+icon+'"></i></span><div class="nxsplus-copy"><span class="nxsplus-kicker">NEXRAY S+ ENGINE</span><strong>'+title+'</strong><p>'+desc+'</p></div><span class="nxsplus-badge">S+</span></div>';
    return section;
  }

  function appendImageEditor(body){
    if(!body||body.querySelector("[data-nxsplus=image]")||!body.querySelector(".npi"))return;
    var root=head("fa-solid fa-wand-magic-sparkles","AI Image Editor","Edit gambar dengan Nano Banana dan GPT Image. Auto mode mencoba engine cadangan hanya bila provider utama gagal.");root.dataset.nxsplus="image";
    root.insertAdjacentHTML("beforeend",'<div class="nxsplus-body"><label class="nxsplus-file"><input id="nxsImageFile" type="file" accept="image/jpeg,image/png,image/webp"><i class="fa-regular fa-image"></i><b id="nxsImageFileName">Pilih gambar</b><small>JPG / PNG / WebP · maks 2.5 MB</small></label><label class="nxsplus-field"><span>Instruksi edit</span><textarea id="nxsImagePrompt" maxlength="2500" placeholder="Contoh: ubah langit menjadi senja, pertahankan karakter dan komposisi"></textarea></label><label class="nxsplus-field"><span>Engine</span><select id="nxsImageEngine"><option value="auto">Auto — Nano Banana → GPT Image</option><option value="nanobanana">Nano Banana</option><option value="gptimage">GPT Image</option></select></label><div class="nxsplus-actions"><button class="nxsplus-run" id="nxsImageRun" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Edit gambar</span></button></div><p class="nxsplus-status" id="nxsImageStatus" role="status"></p><div class="nxsplus-result" id="nxsImageResult" hidden><img id="nxsImageOutput" alt="Hasil edit AI Nexora"><div class="nxsplus-provider"><span>Provider aktual</span><strong id="nxsImageProvider">—</strong></div><div class="nxsplus-actions"><a class="nxsplus-link" id="nxsImageOpen" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Buka hasil</a></div></div></div><p class="nxsplus-note">Nexora tidak menampilkan sukses palsu: panel hasil hanya muncul jika provider mengembalikan gambar valid.</p>');
    body.querySelector(".npi").appendChild(root);
    var file=root.querySelector("#nxsImageFile"),fileName=root.querySelector("#nxsImageFileName"),prompt=root.querySelector("#nxsImagePrompt"),engine=root.querySelector("#nxsImageEngine"),run=root.querySelector("#nxsImageRun"),status=root.querySelector("#nxsImageStatus"),result=root.querySelector("#nxsImageResult"),output=root.querySelector("#nxsImageOutput"),provider=root.querySelector("#nxsImageProvider"),open=root.querySelector("#nxsImageOpen");
    var controllerAlive=true;
    file.addEventListener("change",function(){fileName.textContent=file.files&&file.files[0]?file.files[0].name:"Pilih gambar";});
    run.addEventListener("click",async function(){if(run.disabled)return;result.hidden=true;var text=prompt.value.trim();if(text.length<3){status.className="nxsplus-status is-error";status.textContent="Tulis instruksi edit sedikitnya 3 huruf.";return;}var chosen=file.files&&file.files[0];if(!chosen){status.className="nxsplus-status is-error";status.textContent="Pilih gambar terlebih dahulu.";return;}run.disabled=true;status.className="nxsplus-status is-loading";status.textContent="Mengirim gambar ke engine S+…";try{var imageData=await fileData(chosen);var data=await post("image-edit",{engine:engine.value,param:text,imageData:imageData},115000);if(!controllerAlive)return;var url=safeUrl(data.imageUrl);if(!url)throw new Error("Provider tidak mengembalikan gambar valid.");output.src=url;provider.textContent=String(data.provider||data.engine||"Nexray");open.href=url;result.hidden=false;status.className="nxsplus-status is-ok";status.textContent="Edit selesai.";}catch(error){if(!controllerAlive)return;status.className="nxsplus-status is-error";status.textContent=message(error,"Edit gambar gagal.");}finally{if(controllerAlive)run.disabled=false;}});
    cleanupWrap(body,function(){controllerAlive=false;output.removeAttribute("src");open.removeAttribute("href");});
  }

  function appendVideo(body){
    if(!body||body.querySelector("[data-nxsplus=video]")||!body.querySelector(".nvg,.npv,.nvi,.nexora-puter-video"))return;
    var host=body.querySelector(".nvg,.npv,.nvi,.nexora-puter-video")||body.firstElementChild;var root=head("fa-solid fa-film","Veo3 Image → Video","Alternatif server-side untuk image-to-video. Memakai gambar referensi + prompt melalui Nexray Veo3.");root.dataset.nxsplus="video";
    root.insertAdjacentHTML("beforeend",'<div class="nxsplus-body"><label class="nxsplus-file"><input id="nxsVideoFile" type="file" accept="image/jpeg,image/png,image/webp"><i class="fa-solid fa-image"></i><b id="nxsVideoFileName">Pilih gambar referensi</b><small>JPG / PNG / WebP · maks 2.5 MB</small></label><label class="nxsplus-field"><span>Prompt gerakan</span><textarea id="nxsVideoPrompt" maxlength="2500" placeholder="Contoh: slow cinematic camera push-in, hair moves gently in the wind"></textarea></label><div class="nxsplus-actions"><button class="nxsplus-run" id="nxsVideoRun" type="button"><i class="fa-solid fa-clapperboard"></i><span>Generate Veo3</span></button></div><p class="nxsplus-status" id="nxsVideoStatus" role="status"></p><div class="nxsplus-result" id="nxsVideoResult" hidden><video id="nxsVideoOutput" controls playsinline preload="metadata"></video><div class="nxsplus-provider"><span>Provider aktual</span><strong>Nexray Veo3</strong></div><div class="nxsplus-actions"><a class="nxsplus-link" id="nxsVideoOpen" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Buka video</a></div></div></div><p class="nxsplus-note">Jika Nexray tidak mengembalikan video nyata, Nexora menampilkan error dan tidak membuat placeholder hasil.</p>');
    host.appendChild(root);
    var file=root.querySelector("#nxsVideoFile"),name=root.querySelector("#nxsVideoFileName"),prompt=root.querySelector("#nxsVideoPrompt"),run=root.querySelector("#nxsVideoRun"),status=root.querySelector("#nxsVideoStatus"),result=root.querySelector("#nxsVideoResult"),video=root.querySelector("#nxsVideoOutput"),open=root.querySelector("#nxsVideoOpen");var alive=true;
    file.addEventListener("change",function(){name.textContent=file.files&&file.files[0]?file.files[0].name:"Pilih gambar referensi";});
    run.addEventListener("click",async function(){if(run.disabled)return;var text=prompt.value.trim(),chosen=file.files&&file.files[0];if(text.length<3){status.className="nxsplus-status is-error";status.textContent="Tulis prompt gerakan sedikitnya 3 huruf.";return;}if(!chosen){status.className="nxsplus-status is-error";status.textContent="Pilih gambar referensi.";return;}result.hidden=true;run.disabled=true;status.className="nxsplus-status is-loading";status.textContent="Veo3 sedang memproses video. Ini dapat memerlukan beberapa menit…";try{var dataUrl=await fileData(chosen);var data=await post("veo3",{prompt:text,imageData:dataUrl},185000);if(!alive)return;var url=safeUrl(data.videoUrl);if(!url)throw new Error("Veo3 tidak mengembalikan video valid.");video.src=url;video.load();open.href=url;result.hidden=false;status.className="nxsplus-status is-ok";status.textContent="Video Veo3 selesai.";}catch(error){if(!alive)return;status.className="nxsplus-status is-error";status.textContent=message(error,"Veo3 gagal membuat video.");}finally{if(alive)run.disabled=false;}});
    cleanupWrap(body,function(){alive=false;try{video.pause();}catch(_){}video.removeAttribute("src");video.load();open.removeAttribute("href");});
  }

  function appendSong(body){
    if(!body||body.querySelector("[data-nxsplus=song]")||!body.querySelector(".nx-song"))return;
    var host=body.querySelector(".nx-song");var root=head("fa-solid fa-music","Suno S+ Engine","Generator musik Nexray Suno sebagai engine alternatif. Terpisah dari engine AI Song utama supaya fallback tetap jujur.");root.dataset.nxsplus="song";
    root.insertAdjacentHTML("beforeend",'<div class="nxsplus-body"><label class="nxsplus-field"><span>Deskripsi lagu</span><textarea id="nxsSongPrompt" maxlength="2500" placeholder="Contoh: upbeat city pop with female vocal, nostalgic synths, 110 bpm"></textarea></label><div class="nxsplus-actions"><button class="nxsplus-run" id="nxsSongRun" type="button"><i class="fa-solid fa-music"></i><span>Generate dengan Suno</span></button></div><p class="nxsplus-status" id="nxsSongStatus" role="status"></p><div class="nxsplus-result" id="nxsSongResult" hidden><audio id="nxsSongOutput" controls preload="metadata"></audio><div class="nxsplus-provider"><span id="nxsSongTitle">Hasil Suno</span><strong>Nexray Suno</strong></div><div class="nxsplus-actions"><a class="nxsplus-link" id="nxsSongOpen" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Buka audio</a></div></div></div><p class="nxsplus-note">Hanya hasil audio nyata yang ditampilkan. Respons metadata tanpa audio dianggap gagal.</p>');
    host.appendChild(root);
    var prompt=root.querySelector("#nxsSongPrompt"),run=root.querySelector("#nxsSongRun"),status=root.querySelector("#nxsSongStatus"),result=root.querySelector("#nxsSongResult"),audio=root.querySelector("#nxsSongOutput"),open=root.querySelector("#nxsSongOpen"),title=root.querySelector("#nxsSongTitle");var alive=true;
    run.addEventListener("click",async function(){if(run.disabled)return;var text=prompt.value.trim();if(text.length<3){status.className="nxsplus-status is-error";status.textContent="Tulis deskripsi lagu sedikitnya 3 huruf.";return;}result.hidden=true;run.disabled=true;status.className="nxsplus-status is-loading";status.textContent="Suno sedang membuat musik…";try{var data=await post("suno",{prompt:text},100000);if(!alive)return;var url=safeUrl(data.audioUrl);if(!url)throw new Error("Suno tidak mengembalikan audio valid.");audio.src=url;audio.load();open.href=url;title.textContent=String(data.title||"Hasil Suno").slice(0,90);result.hidden=false;status.className="nxsplus-status is-ok";status.textContent="Audio Suno siap diputar.";}catch(error){if(!alive)return;status.className="nxsplus-status is-error";status.textContent=message(error,"Suno gagal membuat musik.");}finally{if(alive)run.disabled=false;}});
    cleanupWrap(body,function(){alive=false;try{audio.pause();}catch(_){}audio.removeAttribute("src");audio.load();open.removeAttribute("href");});
  }

  function wrap(name,enhancer){var current=window[name];if(typeof current!=="function"||current.__nexraySPlusWrapped)return;function wrapped(body){var result=current.apply(this,arguments);try{enhancer(body);}catch(error){console.error("[Nexora S+ hook]",name,error);}return result;}wrapped.__nexraySPlusWrapped=true;wrapped.__nexraySPlusOriginal=current;window[name]=wrapped;}
  function install(){wrap("renderPuterImage",appendImageEditor);wrap("renderPuterVideo",appendVideo);wrap("renderAiSong",appendSong);}
  install();
  document.addEventListener("nexora:module-loaded",install);
})();

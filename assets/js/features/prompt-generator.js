/* Nexora Prompt Studio v2 — native Gemini Vision workflow */
(function(){
  'use strict';

  function create(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined&&text!==null)node.textContent=String(text);return node;}
  function bytesLabel(value){if(value<1024*1024)return Math.max(1,Math.round(value/1024))+' KB';return (value/1024/1024).toFixed(2)+' MB';}

  window.renderPromptGenerator=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <section class="nx-prompt" aria-label="Nexora Prompt Studio">\
        <div class="nx-prompt-status"><div><span class="nx-prompt-status-dot"></span><strong>GEMINI VISION ENGINE</strong><small id="nxPromptHealth">Memeriksa kesiapan mesin…</small></div><span><i class="fa-solid fa-shield-halved"></i> Gambar tidak disimpan</span></div>\
        <div class="nx-prompt-layout">\
          <form id="nxPromptForm" class="nx-prompt-builder">\
            <div class="nx-prompt-step-head"><span>01</span><div><strong>Gambar Referensi</strong><small>JPG, PNG, atau WebP · otomatis dioptimalkan</small></div></div>\
            <input id="nxPromptFile" type="file" accept="image/jpeg,image/png,image/webp" hidden>\
            <div id="nxPromptDrop" class="nx-prompt-drop" aria-label="Area unggah gambar">\
              <div id="nxPromptEmpty" class="nx-prompt-drop-empty"><i class="fa-solid fa-image"></i><strong>Pilih atau jatuhkan gambar</strong><span>Maksimal 12 MB sebelum optimasi</span><button type="button" id="nxPromptChoose">Pilih Gambar</button></div>\
              <div id="nxPromptPreviewWrap" class="nx-prompt-preview" hidden><img id="nxPromptPreview" alt="Pratinjau gambar referensi"><div><strong id="nxPromptFileName"></strong><span id="nxPromptFileMeta"></span></div><button id="nxPromptRemove" type="button" aria-label="Hapus gambar"><i class="fa-solid fa-trash"></i></button></div>\
            </div>\
            <div class="nx-prompt-step-head"><span>02</span><div><strong>Arah Produksi</strong><small>Sesuaikan prompt untuk model dan hasil yang dituju</small></div></div>\
            <label class="nx-prompt-field nx-prompt-field-wide"><span>Arahan tambahan <em>opsional</em></span><textarea id="nxPromptDirection" maxlength="1200" rows="4" placeholder="Contoh: pertahankan wajah dan pose, ubah menjadi poster film sci-fi dengan hujan dan cahaya neon…"></textarea><small><b id="nxPromptDirectionCount">0</b>/1200</small></label>\
            <div class="nx-prompt-fields">\
              <label class="nx-prompt-field"><span>Target model</span><select id="nxPromptTarget"><option value="universal">Universal</option><option value="midjourney">Midjourney</option><option value="flux">FLUX</option><option value="stable-diffusion">Stable Diffusion / SDXL</option><option value="ideogram">Ideogram</option><option value="video">Image to Video</option></select></label>\
              <label class="nx-prompt-field"><span>Gaya visual</span><select id="nxPromptStyle"><option value="auto">Deteksi otomatis</option><option value="photorealistic">Photorealistic</option><option value="cinematic">Cinematic</option><option value="anime">Anime</option><option value="illustration">Illustration</option><option value="product">Product shot</option><option value="3d">3D render</option><option value="architecture">Architecture</option></select></label>\
              <label class="nx-prompt-field"><span>Bahasa prompt</span><select id="nxPromptLanguage"><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></label>\
              <label class="nx-prompt-field"><span>Aspect ratio</span><select id="nxPromptRatio"><option value="auto">Auto</option><option value="1:1">1:1 Square</option><option value="4:5">4:5 Portrait</option><option value="3:2">3:2 Photo</option><option value="16:9">16:9 Landscape</option><option value="9:16">9:16 Vertical</option></select></label>\
            </div>\
            <label class="nx-prompt-creativity"><span><b>Kreativitas</b><em id="nxPromptCreativityLabel">Seimbang</em></span><input id="nxPromptCreativity" type="range" min="1" max="5" value="3" step="1"><small><span>Setia</span><span>Eksploratif</span></small></label>\
            <label class="nx-prompt-toggle"><input id="nxPromptNegative" type="checkbox" checked><span></span><div><strong>Buat negative prompt</strong><small>Kurangi artefak, anatomi buruk, blur, dan cacat visual</small></div></label>\
            <button id="nxPromptGenerate" class="nx-prompt-generate" type="submit" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Analisis & Buat Prompt</span></button>\
            <div id="nxPromptError" class="nx-prompt-error" role="alert" hidden></div>\
          </form>\
          <section class="nx-prompt-output" aria-live="polite">\
            <div class="nx-prompt-output-head"><div><span>03</span><div><strong>Production Prompt</strong><small id="nxPromptOutputMeta">Menunggu gambar referensi</small></div></div><button id="nxPromptDownload" type="button" disabled><i class="fa-solid fa-download"></i><span>TXT</span></button></div>\
            <div id="nxPromptWaiting" class="nx-prompt-waiting"><i class="fa-solid fa-wand-sparkles"></i><strong>Prompt belum dibuat</strong><span>Hasil akan memuat analisis subjek, komposisi, lighting, warna, kamera, prompt utama, negative prompt, dan variasi.</span></div>\
            <div id="nxPromptResult" class="nx-prompt-result" hidden>\
              <div class="nx-prompt-result-title"><span>VISUAL READ</span><h3 id="nxPromptTitle"></h3><p id="nxPromptSummary"></p></div>\
              <div id="nxPromptDetails" class="nx-prompt-details"></div>\
              <article class="nx-prompt-text-card is-primary"><div><span>PROMPT UTAMA</span><button id="nxPromptCopyMain" type="button"><i class="fa-solid fa-copy"></i> Salin</button></div><p id="nxPromptMain"></p></article>\
              <article id="nxPromptNegativeCard" class="nx-prompt-text-card is-negative"><div><span>NEGATIVE PROMPT</span><button id="nxPromptCopyNegative" type="button"><i class="fa-solid fa-copy"></i> Salin</button></div><p id="nxPromptNegativeText"></p></article>\
              <div><span class="nx-prompt-kicker">KEYWORDS</span><div id="nxPromptKeywords" class="nx-prompt-chips"></div></div>\
              <div id="nxPromptWarningsWrap" class="nx-prompt-warnings" hidden><strong><i class="fa-solid fa-triangle-exclamation"></i> Catatan pembacaan</strong><ul id="nxPromptWarnings"></ul></div>\
              <div id="nxPromptVariantsWrap" hidden><span class="nx-prompt-kicker">VARIASI PROMPT</span><div id="nxPromptVariants" class="nx-prompt-variants"></div></div>\
              <button id="nxPromptCopyAll" class="nx-prompt-copy-all" type="button"><i class="fa-solid fa-copy"></i> Salin Semua Hasil</button>\
            </div>\
          </section>\
        </div>\
      </section>';

    var root=body.querySelector('.nx-prompt');
    var form=root.querySelector('#nxPromptForm'),fileInput=root.querySelector('#nxPromptFile'),drop=root.querySelector('#nxPromptDrop');
    var choose=root.querySelector('#nxPromptChoose'),remove=root.querySelector('#nxPromptRemove'),preview=root.querySelector('#nxPromptPreview'),previewWrap=root.querySelector('#nxPromptPreviewWrap'),empty=root.querySelector('#nxPromptEmpty');
    var generate=root.querySelector('#nxPromptGenerate'),errorBox=root.querySelector('#nxPromptError'),resultRoot=root.querySelector('#nxPromptResult'),waiting=root.querySelector('#nxPromptWaiting');
    var state={file:null,fileData:'',mimeType:'',previewUrl:'',controller:null,result:null,processing:false};
    var creativityNames=['','Sangat Setia','Setia','Seimbang','Kreatif','Eksploratif'];

    function showError(message){errorBox.textContent=message;errorBox.hidden=false;}
    function clearError(){errorBox.hidden=true;errorBox.textContent='';}
    function setBusy(busy,label){state.processing=busy;generate.disabled=busy||!state.fileData;generate.classList.toggle('is-loading',busy);generate.querySelector('i').className=busy?'fa-solid fa-circle-notch fa-spin':'fa-solid fa-wand-magic-sparkles';generate.querySelector('span').textContent=busy?(label||'Menganalisis visual…'):'Analisis & Buat Prompt';}
    function readDataUrl(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''));};reader.onerror=function(){reject(new Error('Gambar gagal dibaca.'));};reader.readAsDataURL(blob);});}
    function imageMime(file){var mime=String(file&&file.type||'').toLowerCase();if(!mime||mime==='application/octet-stream'){var ext=(String(file&&file.name||'').toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||'';mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[ext]||mime;}return mime;}
    function imageBitmap(file){
      if(typeof createImageBitmap==='function')return createImageBitmap(file);
      return new Promise(function(resolve,reject){var image=new Image();var url=URL.createObjectURL(file);image.onload=function(){URL.revokeObjectURL(url);resolve(image);};image.onerror=function(){URL.revokeObjectURL(url);reject(new Error('Gambar tidak dapat dibuka.'));};image.src=url;});
    }
    function canvasBlob(canvas,type,quality){return new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('Optimasi gambar gagal.'));},type,quality);});}
    async function optimize(file,mime){
      var bitmap=await imageBitmap(file),width=Number(bitmap.width||bitmap.naturalWidth||0),height=Number(bitmap.height||bitmap.naturalHeight||0),maxSide=1600;
      if(!width||!height){if(typeof bitmap.close==='function')bitmap.close();throw new Error('Resolusi gambar tidak dapat dibaca.');}
      if(Math.max(width,height)<=maxSide&&file.size<=900000){if(typeof bitmap.close==='function')bitmap.close();return {data:await readDataUrl(file),mime:mime,bytes:file.size,width:width,height:height};}
      var scale=Math.min(1,maxSide/Math.max(width,height));
      var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      var context=canvas.getContext('2d',{alpha:false});context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);if(typeof bitmap.close==='function')bitmap.close();
      var blob=await canvasBlob(canvas,'image/jpeg',.84);if(blob.size>1500000)blob=await canvasBlob(canvas,'image/jpeg',.7);canvas.width=1;canvas.height=1;
      return {data:await readDataUrl(blob),mime:'image/jpeg',bytes:blob.size,width:Math.round(width*scale),height:Math.round(height*scale)};
    }
    async function selectFile(file){
      clearError();if(!file)return;
      var mime=imageMime(file);
      if(!['image/jpeg','image/png','image/webp'].includes(mime)){showError('Format harus JPG, PNG, atau WebP.');return;}
      if(file.size>12*1024*1024){showError('Ukuran gambar maksimal 12 MB sebelum optimasi.');return;}
      if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.previewUrl=URL.createObjectURL(file);preview.src=state.previewUrl;
      state.file=null;state.fileData='';empty.hidden=true;previewWrap.hidden=false;root.querySelector('#nxPromptFileName').textContent=file.name;root.querySelector('#nxPromptFileMeta').textContent=bytesLabel(file.size)+' · mengoptimalkan…';setBusy(true,'Mengoptimalkan gambar…');
      try{var optimized=await optimize(file,mime);if(optimized.bytes>3000000)throw new Error('Gambar masih terlalu besar setelah optimasi. Coba gambar lain.');state.file=file;state.fileData=optimized.data;state.mimeType=optimized.mime;root.querySelector('#nxPromptFileMeta').textContent=bytesLabel(file.size)+' → '+bytesLabel(optimized.bytes)+' · '+optimized.width+'×'+optimized.height+' siap';}
      catch(error){showError(error.message||'Gambar gagal diproses.');state.file=null;state.fileData='';}
      finally{setBusy(false);}
    }
    function clearFile(){if(state.controller)state.controller.abort();if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);state.file=null;state.fileData='';state.mimeType='';state.previewUrl='';preview.removeAttribute('src');previewWrap.hidden=true;empty.hidden=false;fileInput.value='';setBusy(false);}
    function copyText(text,button){
      if(!text)return;var fallback=function(){var area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();};
      var action=navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(text):Promise.resolve().then(fallback);action.then(function(){var old=button.innerHTML;button.textContent='Tersalin';setTimeout(function(){if(button.isConnected)button.innerHTML=old;},1300);}).catch(function(){showError('Clipboard ditolak browser.');});
    }
    function detailCard(icon,label,value){var card=create('article');var mark=create('i',icon);var copy=create('div');copy.append(create('small','',label),create('strong','',value||'Tidak terdeteksi'));card.append(mark,copy);return card;}
    function renderResult(payload){
      state.result=payload.result;var result=payload.result,details=result.details||{},meta=payload.meta||{};
      waiting.hidden=true;resultRoot.hidden=false;root.querySelector('#nxPromptTitle').textContent=result.title;root.querySelector('#nxPromptSummary').textContent=result.summary||'Analisis visual selesai.';
      root.querySelector('#nxPromptOutputMeta').textContent=(meta.target||'universal')+' · '+(meta.style||'auto')+' · '+(meta.language||'en').toUpperCase();
      var detailsRoot=root.querySelector('#nxPromptDetails');detailsRoot.replaceChildren(
        detailCard('fa-solid fa-user-astronaut','Subjek',details.subject),detailCard('fa-solid fa-mountain-sun','Lingkungan',details.environment),detailCard('fa-solid fa-crop-simple','Komposisi',details.composition),detailCard('fa-solid fa-sun','Lighting',details.lighting),detailCard('fa-solid fa-camera','Kamera',details.camera),detailCard('fa-solid fa-palette','Style',details.style)
      );
      root.querySelector('#nxPromptMain').textContent=result.prompt;
      var negativeCard=root.querySelector('#nxPromptNegativeCard');negativeCard.hidden=!result.negativePrompt;root.querySelector('#nxPromptNegativeText').textContent=result.negativePrompt||'';
      var keywordRoot=root.querySelector('#nxPromptKeywords');keywordRoot.replaceChildren();(result.keywords||[]).forEach(function(row){keywordRoot.appendChild(create('span','',row));});
      (details.palette||[]).forEach(function(row){keywordRoot.appendChild(create('span','is-color',row));});
      var warnings=result.warnings||[],warningsWrap=root.querySelector('#nxPromptWarningsWrap'),warningList=root.querySelector('#nxPromptWarnings');warningsWrap.hidden=!warnings.length;warningList.replaceChildren();warnings.forEach(function(row){warningList.appendChild(create('li','',row));});
      var variants=result.variants||[],variantsWrap=root.querySelector('#nxPromptVariantsWrap'),variantsRoot=root.querySelector('#nxPromptVariants');variantsWrap.hidden=!variants.length;variantsRoot.replaceChildren();variants.forEach(function(row,index){var card=create('article');var top=create('div');top.append(create('strong','',row.label),create('button','', 'Salin'));top.querySelector('button').type='button';top.querySelector('button').addEventListener('click',function(event){copyText(row.prompt,event.currentTarget);});card.append(top,create('p','',row.prompt));variantsRoot.appendChild(card);});
      root.querySelector('#nxPromptDownload').disabled=false;resultRoot.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    }
    function fullText(){
      if(!state.result)return '';var row=state.result,lines=[row.title,row.summary,'','PROMPT UTAMA',row.prompt];if(row.negativePrompt)lines.push('','NEGATIVE PROMPT',row.negativePrompt);(row.variants||[]).forEach(function(item){lines.push('',item.label.toUpperCase(),item.prompt);});return lines.filter(function(value){return value!==undefined&&value!==null;}).join('\n');
    }
    async function submit(event){
      event.preventDefault();clearError();if(!state.file||!state.fileData){showError('Pilih gambar terlebih dahulu.');return;}if(state.controller)state.controller.abort();var controller=new AbortController();state.controller=controller;setBusy(true,'Gemini membaca gambar…');waiting.hidden=false;waiting.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i><strong>Menganalisis visual</strong><span>Membaca subjek, komposisi, lighting, warna, kamera, dan gaya untuk membangun prompt.</span>';resultRoot.hidden=true;
      try{
        var response=await window.NexoraFetch('/api/prompt-generator',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({fileName:state.file.name,mimeType:state.mimeType,fileData:state.fileData,direction:root.querySelector('#nxPromptDirection').value,target:root.querySelector('#nxPromptTarget').value,style:root.querySelector('#nxPromptStyle').value,language:root.querySelector('#nxPromptLanguage').value,aspectRatio:root.querySelector('#nxPromptRatio').value,creativity:Number(root.querySelector('#nxPromptCreativity').value),includeNegative:root.querySelector('#nxPromptNegative').checked}),signal:controller.signal,nexoraTimeoutMs:85000,nexoraRetries:0});
        var payload=await response.json().catch(function(){return {};});if(!response.ok||!payload.ok)throw new Error(payload.message||'Prompt belum dapat dibuat.');renderResult(payload);
      }catch(error){if(state.controller!==controller)return;waiting.hidden=true;if(error&&error.name==='AbortError')return;showError(error&&error.message||'Prompt Generator mengalami gangguan.');}
      finally{if(state.controller===controller){state.controller=null;waiting.hidden=true;setBusy(false);}}
    }

    choose.addEventListener('click',function(event){event.stopPropagation();fileInput.click();});drop.addEventListener('click',function(event){if(!event.target.closest('button'))fileInput.click();});fileInput.addEventListener('change',function(){selectFile(fileInput.files&&fileInput.files[0]);});
    ['dragenter','dragover'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.add('is-dragging');});});['dragleave','drop'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.remove('is-dragging');});});drop.addEventListener('drop',function(event){selectFile(event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0]);});remove.addEventListener('click',function(event){event.stopPropagation();clearFile();});form.addEventListener('submit',submit);
    var direction=root.querySelector('#nxPromptDirection');direction.addEventListener('input',function(){root.querySelector('#nxPromptDirectionCount').textContent=direction.value.length;});var creativity=root.querySelector('#nxPromptCreativity');creativity.addEventListener('input',function(){root.querySelector('#nxPromptCreativityLabel').textContent=creativityNames[Number(creativity.value)]||'Seimbang';});
    root.querySelector('#nxPromptCopyMain').addEventListener('click',function(event){copyText(state.result&&state.result.prompt,event.currentTarget);});root.querySelector('#nxPromptCopyNegative').addEventListener('click',function(event){copyText(state.result&&state.result.negativePrompt,event.currentTarget);});root.querySelector('#nxPromptCopyAll').addEventListener('click',function(event){copyText(fullText(),event.currentTarget);});
    root.querySelector('#nxPromptDownload').addEventListener('click',function(){var text=fullText();if(!text)return;var url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));var link=document.createElement('a');link.href=url;link.download='nexora-prompt-'+Date.now()+'.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);});
    body.__nxCleanup=function(){if(state.controller)state.controller.abort();if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);};
    window.NexoraFetch('/api/prompt-generator',{method:'GET',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'},nexoraTimeoutMs:8000,nexoraRetries:0}).then(function(response){return response.json();}).then(function(payload){root.querySelector('#nxPromptHealth').textContent=payload.configured?'Mesin siap · Gemini API terlindungi':'Mesin belum dikonfigurasi';}).catch(function(){root.querySelector('#nxPromptHealth').textContent='Status mesin tidak tersedia';});
  };
})();

/* Nexora Image Vectorizer HF9 */
(function(){
  'use strict';

  var MAX_FILE_BYTES=12*1024*1024;
  var ACCEPTED_TYPES=new Set(['image/png','image/jpeg']);
  var PRESETS={
    logo:{label:'Logo',preset:'poster',clustering:'color-cluster',hierarchical:'cutout',mode:'spline',detail:72,colorPrecision:7,filterSpeckle:8,cornerThreshold:52,maxColors:8,layerDifference:12,simplify:1.4},
    illustration:{label:'Illustration',preset:'poster',clustering:'color-cluster',hierarchical:'cutout',mode:'spline',detail:82,colorPrecision:8,filterSpeckle:4,cornerThreshold:60,maxColors:16,layerDifference:18,simplify:1},
    photo:{label:'Photo',preset:'photo',clustering:'watershed',hierarchical:'cutout',mode:'spline',detail:70,colorPrecision:8,filterSpeckle:10,cornerThreshold:160,maxColors:32,layerDifference:48,simplify:1.5,watershedDetail:164},
    bw:{label:'B&W',preset:'bw',clustering:'bw',hierarchical:'cutout',mode:'spline',detail:88,colorPrecision:8,filterSpeckle:3,cornerThreshold:55,maxColors:2,layerDifference:0,simplify:.8,adaptive:true}
  };

  function node(tag,className,text){var item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;}
  function formatBytes(value){var size=Number(value)||0;if(size<1024)return size+' B';if(size<1048576)return(size/1024).toFixed(size<10240?1:0)+' KB';return(size/1048576).toFixed(2)+' MB';}
  function safeName(value){return String(value||'vector').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'vector';}
  function copyText(value){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(value);var area=node('textarea');area.value=value;area.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve();}
  function download(name,content,type){var blob=content instanceof Blob?content:new Blob([content],{type:type||'image/svg+xml;charset=utf-8'});var url=URL.createObjectURL(blob);var link=node('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1800);}
  function sanitizeSvg(source){
    var parsed=new DOMParser().parseFromString(String(source||''),'image/svg+xml');
    if(parsed.querySelector('parsererror')||!parsed.documentElement||parsed.documentElement.localName!=='svg')throw new Error('SVG hasil VTracer tidak valid.');
    parsed.querySelectorAll('script,foreignObject,iframe,object,embed,image,use,a').forEach(function(item){item.remove();});
    parsed.querySelectorAll('*').forEach(function(item){Array.from(item.attributes||[]).forEach(function(attribute){var name=attribute.name.toLowerCase();var value=String(attribute.value||'');if(name.indexOf('on')===0||name==='href'||name==='xlink:href'||/url\s*\(/i.test(value))item.removeAttribute(attribute.name);});});
    parsed.documentElement.setAttribute('xmlns','http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(parsed.documentElement);
  }
  function analyzeSvg(svg){var paths=(svg.match(/<path\b/gi)||[]).length;var colors=new Set();for(var match of svg.matchAll(/(?:fill|stroke)(?:\s*=\s*["']|\s*:\s*)(#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)(?:["';\s]|$)/gi))if(match[1]!=='none')colors.add(match[1].toLowerCase());return{paths:paths,colors:colors.size};}
  function deviceProfile(){var mobile=matchMedia('(max-width:720px)').matches;var memory=Number(navigator.deviceMemory)||4;var low=memory<=3;return low?{maxPixels:1400000,maxSide:1700,label:'Mobile Lite'}:(mobile?{maxPixels:2800000,maxSide:2400,label:'Mobile HQ'}:{maxPixels:5000000,maxSide:3200,label:'Desktop HQ'});}

  window.renderImageVectorizer=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML=`
      <main class="nvi" aria-label="Nexora Image Vectorizer">
        <section class="nvi-hero">
          <div class="nvi-hero-copy">
            <div class="nvi-kicker"><i class="fa-solid fa-bezier-curve"></i><span>LOCAL VECTOR ENGINE</span><b>VTRACER · HF9</b></div>
            <h2>Raster in.<br><em>Infinite scale out.</em></h2>
            <p>Ubah PNG atau JPG menjadi SVG tajam langsung di perangkat. Tidak ada upload server, API key, kuota, atau antrean cloud.</p>
            <div class="nvi-trust"><span><i class="fa-solid fa-shield-halved"></i> 100% LOCAL</span><span><i class="fa-solid fa-microchip"></i> RUST + WASM</span><span><i class="fa-solid fa-bolt"></i> WEB WORKER</span></div>
          </div>
          <div class="nvi-orbit" aria-hidden="true"><div class="nvi-pixel-grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="nvi-vector-mark"><svg viewBox="0 0 120 120"><path d="M20 92C29 30 49 19 91 28C72 47 92 69 64 91C49 102 34 100 20 92Z"/><circle cx="91" cy="28" r="6"/><circle cx="20" cy="92" r="6"/><circle cx="64" cy="91" r="6"/></svg></div><span>PNG</span><b>SVG</b></div>
        </section>

        <section class="nvi-studio">
          <article class="nvi-panel nvi-controls-panel">
            <header class="nvi-panel-head"><div><span>01 · SOURCE & SETTINGS</span><h3>Image to Vector</h3></div><b id="nviEngine"><i class="fa-solid fa-circle-notch fa-spin"></i> LOADING</b></header>
            <label class="nvi-drop" id="nviDrop" for="nviFile">
              <input id="nviFile" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg">
              <i class="fa-solid fa-image"></i><strong>Drop atau pilih gambar</strong><small>PNG / JPG · maksimal 12 MB · diproses lokal</small>
              <span><i class="fa-solid fa-folder-open"></i> Pilih gambar</span>
            </label>
            <div class="nvi-file" id="nviFileCard" hidden><img id="nviThumb" alt="Preview gambar"><div><span>RASTER READY</span><strong id="nviFileName"></strong><small id="nviFileMeta"></small></div><button id="nviRemove" type="button" aria-label="Hapus gambar"><i class="fa-solid fa-xmark"></i></button></div>

            <fieldset class="nvi-fieldset"><legend>Mode gambar</legend><div class="nvi-preset-grid" id="nviPresets">
              <button type="button" data-preset="logo" class="is-active"><i class="fa-solid fa-signature"></i><span><b>Logo</b><small>Warna ringkas</small></span></button>
              <button type="button" data-preset="illustration"><i class="fa-solid fa-palette"></i><span><b>Illustration</b><small>Detail seimbang</small></span></button>
              <button type="button" data-preset="photo"><i class="fa-solid fa-camera-retro"></i><span><b>Photo</b><small>Watershed</small></span></button>
              <button type="button" data-preset="bw"><i class="fa-solid fa-circle-half-stroke"></i><span><b>B&amp;W</b><small>Line art / scan</small></span></button>
            </div></fieldset>

            <fieldset class="nvi-fieldset"><legend>Vector style</legend><div class="nvi-style-row" id="nviStyles"><button type="button" data-style="spline" class="is-active"><i class="fa-solid fa-bezier-curve"></i>Spline</button><button type="button" data-style="polygon"><i class="fa-solid fa-draw-polygon"></i>Polygon</button><button type="button" data-style="pixel"><i class="fa-solid fa-border-all"></i>Pixel</button></div></fieldset>

            <div class="nvi-sliders">
              <label><span><b>Detail</b><output id="nviDetailValue">72</output></span><input id="nviDetail" type="range" min="20" max="100" value="72"></label>
              <label><span><b>Color precision</b><output id="nviColorValue">7 / 8</output></span><input id="nviColor" type="range" min="1" max="8" value="7"></label>
              <label><span><b>Noise removal</b><output id="nviNoiseValue">8 px</output></span><input id="nviNoise" type="range" min="0" max="32" value="8"></label>
              <label><span><b>Corner</b><output id="nviCornerValue">Smooth</output></span><input id="nviCorner" type="range" min="0" max="180" value="52"></label>
            </div>

            <div class="nvi-select-row"><label><span>Target warna</span><select id="nviColors"><option value="4">4 colors</option><option value="8" selected>8 colors</option><option value="16">16 colors</option><option value="32">32 colors</option><option value="64">64 colors</option></select></label><label><span>Output</span><select id="nviQuality"><option value="2" selected>Optimized</option><option value="1">Balanced</option><option value="0">Raw paths</option></select></label></div>
            <div class="nvi-switches"><label><input id="nviMosaic" type="checkbox" checked><span><i class="fa-solid fa-puzzle-piece"></i><b>Seam-free mosaic</b><small>Bentuk rapat tanpa celah putih.</small></span></label><label><input id="nviAdaptive" type="checkbox" checked><span><i class="fa-solid fa-wand-magic-sparkles"></i><b>Adaptive B&amp;W</b><small>Scan tetap bersih pada cahaya tidak rata.</small></span></label></div>
            <div class="nvi-local-note"><i class="fa-solid fa-lock"></i><p><b>Private by design.</b> Byte gambar hanya berpindah dari browser ke worker pada perangkat ini. Tidak ada request upload.</p></div>
            <div class="nvi-run-row"><button id="nviRun" class="nvi-run" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Vectorize image</span><b>→</b></button><button id="nviStop" class="nvi-stop" type="button" hidden><i class="fa-solid fa-stop"></i></button></div>
            <div class="nvi-progress" id="nviProgress" hidden><div><span id="nviProgressLabel">Menyiapkan worker</span><b id="nviProgressValue">0%</b></div><div><i id="nviProgressBar"></i></div><small>Proses berat berjalan di thread terpisah agar halaman HP tetap responsif.</small></div>
          </article>

          <article class="nvi-panel nvi-preview-panel">
            <header class="nvi-panel-head"><div><span>02 · A/B VECTOR LAB</span><h3>Original vs Vector</h3></div><b id="nviStatus" class="is-local"><i class="fa-solid fa-shield-halved"></i> LOCAL ONLY</b></header>
            <div class="nvi-view-tabs" id="nviViewTabs"><button type="button" data-view="original">Original</button><button type="button" data-view="split" class="is-active">Split</button><button type="button" data-view="vector">Vector</button></div>
            <div class="nvi-stage is-empty view-split" id="nviStage">
              <div class="nvi-empty" id="nviEmpty"><i class="fa-solid fa-bezier-curve"></i><strong>Vector canvas menunggu</strong><span>Pilih gambar, atur preset, lalu jalankan VTracer.</span><div><b>01</b> Upload <i></i><b>02</b> Tune <i></i><b>03</b> Export</div></div>
              <figure class="nvi-original" id="nviOriginal" hidden><figcaption><span>ORIGINAL</span><small>Raster source</small></figcaption><div><img id="nviOriginalImage" alt="Gambar asli"></div></figure>
              <figure class="nvi-vector" id="nviVector" hidden><figcaption><span>VECTOR</span><small id="nviVectorLabel">SVG result</small></figcaption><div id="nviVectorHost"></div></figure>
            </div>
            <div class="nvi-bg-tools" id="nviBgTools" hidden><span>CANVAS</span><button type="button" data-bg="checker" class="is-active" aria-label="Checkerboard"><i class="fa-solid fa-table-cells-large"></i></button><button type="button" data-bg="light" aria-label="Latar terang"><i class="fa-regular fa-sun"></i></button><button type="button" data-bg="dark" aria-label="Latar gelap"><i class="fa-regular fa-moon"></i></button><b id="nviProfile"></b></div>
            <div class="nvi-stats" id="nviStats" hidden></div>
            <div class="nvi-result-actions" id="nviActions" hidden><button id="nviDownload" type="button" class="is-primary"><i class="fa-solid fa-download"></i><span>Download SVG</span></button><button id="nviCopy" type="button"><i class="fa-regular fa-copy"></i><span>Copy SVG code</span></button><button id="nviCodeToggle" type="button"><i class="fa-solid fa-code"></i><span>View code</span></button><button id="nviReset" type="button"><i class="fa-solid fa-rotate-left"></i><span>Reset</span></button></div>
            <div class="nvi-code" id="nviCode" hidden><header><span>SVG SOURCE</span><b id="nviCodeSize"></b></header><pre id="nviCodeText" tabindex="0"></pre></div>
            <footer class="nvi-engine-foot"><i class="fa-solid fa-microchip"></i><div><b>VTracer 1.0 pipeline</b><span>Mosaic mode, curve simplification, color quantization, dan SVG optimizer berjalan via WebAssembly.</span></div><strong>NO API</strong></footer>
          </article>
        </section>
        <div class="nvi-toast" id="nviToast" role="status" aria-live="polite"></div>
      </main>`;

    var root=body.querySelector('.nvi');var fileInput=root.querySelector('#nviFile');var drop=root.querySelector('#nviDrop');var fileCard=root.querySelector('#nviFileCard');var thumb=root.querySelector('#nviThumb');var fileName=root.querySelector('#nviFileName');var fileMeta=root.querySelector('#nviFileMeta');var engineBadge=root.querySelector('#nviEngine');var runButton=root.querySelector('#nviRun');var stopButton=root.querySelector('#nviStop');var progressBox=root.querySelector('#nviProgress');var progressLabel=root.querySelector('#nviProgressLabel');var progressValue=root.querySelector('#nviProgressValue');var progressBar=root.querySelector('#nviProgressBar');var stage=root.querySelector('#nviStage');var empty=root.querySelector('#nviEmpty');var original=root.querySelector('#nviOriginal');var originalImage=root.querySelector('#nviOriginalImage');var vector=root.querySelector('#nviVector');var vectorHost=root.querySelector('#nviVectorHost');var vectorLabel=root.querySelector('#nviVectorLabel');var statusBadge=root.querySelector('#nviStatus');var bgTools=root.querySelector('#nviBgTools');var stats=root.querySelector('#nviStats');var actions=root.querySelector('#nviActions');var code=root.querySelector('#nviCode');var codeText=root.querySelector('#nviCodeText');var toast=root.querySelector('#nviToast');
    var controls={detail:root.querySelector('#nviDetail'),color:root.querySelector('#nviColor'),noise:root.querySelector('#nviNoise'),corner:root.querySelector('#nviCorner'),colors:root.querySelector('#nviColors'),quality:root.querySelector('#nviQuality'),mosaic:root.querySelector('#nviMosaic'),adaptive:root.querySelector('#nviAdaptive')};
    var state={file:null,objectUrl:null,width:0,height:0,preset:'logo',style:'spline',svg:'',worker:null,requestId:'',busy:false,bootTimer:null,processTimer:null,progressTimer:null,progress:0,destroyed:false};
    var profile=deviceProfile();root.querySelector('#nviProfile').textContent=profile.label+' · '+(profile.maxPixels/1000000).toFixed(1)+' MP';

    function notify(message,tone){toast.textContent=message;toast.className='nvi-toast is-show '+(tone||'');clearTimeout(toast.__timer);toast.__timer=setTimeout(function(){toast.className='nvi-toast';},3000);}
    function updateLabels(){root.querySelector('#nviDetailValue').textContent=controls.detail.value;root.querySelector('#nviColorValue').textContent=controls.color.value+' / 8';root.querySelector('#nviNoiseValue').textContent=controls.noise.value+' px';var corner=Number(controls.corner.value);root.querySelector('#nviCornerValue').textContent=corner<60?'Smooth':(corner<125?'Balanced':'Sharp');}
    function terminateWorker(){if(state.worker){state.worker.terminate();state.worker=null;}clearTimeout(state.bootTimer);clearTimeout(state.processTimer);clearInterval(state.progressTimer);state.bootTimer=null;state.processTimer=null;state.progressTimer=null;}
    function releaseFile(){if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl=null;}}
    function setBusy(value){state.busy=value;runButton.disabled=value||!state.file;stopButton.hidden=!value;fileInput.disabled=value;progressBox.hidden=!value;root.querySelectorAll('#nviPresets button,#nviStyles button,.nvi-sliders input,.nvi-select-row select,.nvi-switches input').forEach(function(item){item.disabled=value;});if(!value){clearInterval(state.progressTimer);state.progressTimer=null;}}
    function setProgress(value,label){state.progress=Math.max(state.progress,Math.min(100,Number(value)||0));progressBar.style.width=state.progress+'%';progressValue.textContent=Math.round(state.progress)+'%';if(label)progressLabel.textContent=label;}
    function startSoftProgress(){clearInterval(state.progressTimer);state.progressTimer=setInterval(function(){if(state.progress>=91)return;setProgress(state.progress+(state.progress<48?2.3:.7));},450);}
    function markStale(){if(state.svg&&!state.busy){statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-rotate"></i> SETTINGS CHANGED';runButton.querySelector('span').textContent='Vectorize ulang';}}
    function options(){var preset=PRESETS[state.preset];var detail=Number(controls.detail.value);return{preset:preset.preset,clustering:preset.clustering,hierarchical:controls.mosaic.checked?'cutout':'stacked',mode:state.style,filterSpeckle:Number(controls.noise.value),colorPrecision:Number(controls.color.value),layerDifference:preset.layerDifference,cornerThreshold:Number(controls.corner.value),lengthThreshold:Math.max(3.5,7-detail/30),simplify:state.style==='spline'?Math.max(0,(105-detail)/24):0,pathPrecision:detail>84?3:2,maxColors:Number(controls.colors.value),optimize:Number(controls.quality.value),adaptive:controls.adaptive.checked,watershedDetail:preset.watershedDetail||160,binaryThreshold:128};}
    function applyPreset(name){var preset=PRESETS[name]||PRESETS.logo;state.preset=name;controls.detail.value=preset.detail;controls.color.value=preset.colorPrecision;controls.noise.value=preset.filterSpeckle;controls.corner.value=preset.cornerThreshold;controls.colors.value=String(preset.maxColors);controls.mosaic.checked=true;controls.adaptive.checked=preset.adaptive!==false;state.style=preset.mode;root.querySelectorAll('#nviPresets button').forEach(function(button){button.classList.toggle('is-active',button.dataset.preset===name);});root.querySelectorAll('#nviStyles button').forEach(function(button){button.classList.toggle('is-active',button.dataset.style===state.style);});updateLabels();markStale();}
    function validFile(file){return file&&file.size>0&&file.size<=MAX_FILE_BYTES&&(ACCEPTED_TYPES.has(file.type)||/\.(?:png|jpe?g)$/i.test(file.name));}
    function setFile(file){
      if(!validFile(file)){notify(file&&file.size>MAX_FILE_BYTES?'File melebihi 12 MB.':'Gunakan file PNG atau JPG yang valid.','is-error');return;}
      terminateWorker();releaseFile();state.file=file;state.svg='';state.objectUrl=URL.createObjectURL(file);thumb.src=state.objectUrl;originalImage.src=state.objectUrl;fileName.textContent=file.name;fileMeta.textContent=formatBytes(file.size)+' · membaca dimensi…';fileCard.hidden=false;drop.classList.add('has-file');empty.hidden=true;original.hidden=false;vector.hidden=true;stage.classList.remove('is-empty');stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;runButton.disabled=false;runButton.querySelector('span').textContent='Vectorize image';statusBadge.className='is-local';statusBadge.innerHTML='<i class="fa-solid fa-shield-halved"></i> LOCAL ONLY';
      var image=new Image();image.onload=function(){state.width=image.naturalWidth;state.height=image.naturalHeight;fileMeta.textContent=formatBytes(file.size)+' · '+state.width+' × '+state.height+' px';if(state.width*state.height>30000000){notify('Resolusi sangat besar; worker akan mengecilkan gambar secara aman.','is-warning');}};image.onerror=function(){clearFile();notify('Gambar tidak dapat dibuka.','is-error');};image.src=state.objectUrl;
    }
    function clearFile(){terminateWorker();releaseFile();state.file=null;state.svg='';state.width=0;state.height=0;fileInput.value='';thumb.removeAttribute('src');originalImage.removeAttribute('src');fileCard.hidden=true;drop.classList.remove('has-file');empty.hidden=false;original.hidden=true;vector.hidden=true;stage.className='nvi-stage is-empty view-split';stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;runButton.disabled=true;runButton.querySelector('span').textContent='Vectorize image';setBusy(false);}
    function safeWorkerError(message){var text=String(message||'');if(/memory|out of bounds|allocation/i.test(text))return 'Memori perangkat tidak cukup. Gunakan preset Logo/B&W atau gambar lebih kecil.';if(/decode|format|image/i.test(text))return 'Gambar gagal dibaca VTracer. Simpan ulang sebagai PNG/JPG lalu coba lagi.';if(/timeout/i.test(text))return 'Proses terlalu lama. Kurangi detail atau gunakan gambar lebih kecil.';return 'Vectorization gagal. Coba preset atau gambar lain.';}
    function failRun(message){terminateWorker();setBusy(false);statusBadge.className='is-error';statusBadge.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> VECTOR FAILED';notify(message,'is-error');}
    async function run(){
      if(!state.file||state.busy)return;
      if(!window.Worker||!window.WebAssembly){notify('Browser ini belum mendukung Web Worker + WebAssembly.','is-error');return;}
      terminateWorker();setBusy(true);state.progress=0;setProgress(2,'Memuat VTracer WebAssembly');startSoftProgress();statusBadge.className='is-working';statusBadge.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> VECTORIZING';state.requestId='nvi-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
      try{
        var buffer=await state.file.arrayBuffer();if(!state.busy)return;
        var workerUrl=new URL('assets/js/workers/vtracer-worker.js?v=6.3.13-hf9',document.baseURI).href;state.worker=new Worker(workerUrl,{name:'nexora-vtracer-hf9'});
        state.bootTimer=setTimeout(function(){failRun('Mesin VTracer gagal dimuat. Periksa cache atau koneksi aset.');},15000);
        state.processTimer=setTimeout(function(){failRun('Proses dihentikan setelah 150 detik. Kurangi detail atau resolusi gambar.');},150000);
        state.worker.onerror=function(){failRun('Worker VTracer berhenti tak terduga.');};
        state.worker.onmessage=function(event){var data=event.data||{};if(data.type==='ready'){clearTimeout(state.bootTimer);engineBadge.className='is-ready';engineBadge.innerHTML='<i class="fa-solid fa-circle-check"></i> WASM '+data.engineVersion;setProgress(8,'Worker siap · memindahkan gambar lokal');state.worker.postMessage({type:'vectorize',requestId:state.requestId,buffer:buffer,mime:state.file.type,width:state.width,height:state.height,maxPixels:profile.maxPixels,maxSide:profile.maxSide,options:options()},[buffer]);return;}if(data.requestId&&data.requestId!==state.requestId)return;if(data.type==='progress'){setProgress(data.value,data.label);return;}if(data.type==='fatal'||data.type==='error'){failRun(safeWorkerError(data.message));return;}if(data.type==='result'){finish(data);}};
      }catch(error){failRun(safeWorkerError(error&&error.message));}
    }
    function metric(icon,label,value,sub){var item=node('article');item.innerHTML='<i class="'+icon+'"></i>';var copy=node('div');copy.append(node('span','',label),node('strong','',value),node('small','',sub||''));item.appendChild(copy);return item;}
    function finish(data){
      try{state.svg=sanitizeSvg(data.svg);}catch(error){failRun(error.message);return;}
      var analysis=analyzeSvg(state.svg);terminateWorker();setProgress(100,'SVG selesai');setBusy(false);vectorHost.innerHTML=state.svg;vector.hidden=false;empty.hidden=true;bgTools.hidden=false;actions.hidden=false;stats.hidden=false;stage.classList.remove('is-empty');stage.classList.remove('view-original','view-split');stage.classList.add('view-vector');root.querySelectorAll('#nviViewTabs button').forEach(function(button){button.classList.toggle('is-active',button.dataset.view==='vector');});vectorLabel.textContent=(data.width||state.width)+' × '+(data.height||state.height)+' · '+(data.downscaled?'optimized':'native');statusBadge.className='is-success';statusBadge.innerHTML='<i class="fa-solid fa-circle-check"></i> VECTOR READY';runButton.querySelector('span').textContent='Vectorize ulang';var ratio=state.file&&data.bytes?Math.round((1-data.bytes/state.file.size)*100):0;stats.replaceChildren(metric('fa-solid fa-bezier-curve','Paths',analysis.paths.toLocaleString('id-ID'),'curve & shape'),metric('fa-solid fa-palette','Colors',(analysis.colors||data.colorCount||0).toLocaleString('id-ID'),'quantized palette'),metric('fa-solid fa-file-code','SVG size',formatBytes(data.bytes),ratio>0?ratio+'% lebih kecil':'vector output'),metric('fa-regular fa-clock','Process',(data.durationMs/1000).toFixed(1)+' s','worker thread'));codeText.textContent=state.svg;root.querySelector('#nviCodeSize').textContent=formatBytes(data.bytes);requestAnimationFrame(function(){if(matchMedia('(max-width:720px)').matches)root.querySelector('.nvi-preview-panel').scrollIntoView({behavior:'smooth',block:'start'});});notify('SVG siap diunduh.','is-success');
    }

    fileInput.addEventListener('change',function(){if(fileInput.files&&fileInput.files[0])setFile(fileInput.files[0]);});root.querySelector('#nviRemove').addEventListener('click',clearFile);runButton.addEventListener('click',run);stopButton.addEventListener('click',function(){if(!state.busy)return;terminateWorker();setBusy(false);statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-stop"></i> STOPPED';notify('Proses dihentikan.','is-warning');});
    ['dragenter','dragover'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.add('is-dragging');});});['dragleave','drop'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.remove('is-dragging');if(name==='drop'&&event.dataTransfer&&event.dataTransfer.files[0])setFile(event.dataTransfer.files[0]);});});
    root.querySelector('#nviPresets').addEventListener('click',function(event){var button=event.target.closest('button[data-preset]');if(button&&!state.busy)applyPreset(button.dataset.preset);});root.querySelector('#nviStyles').addEventListener('click',function(event){var button=event.target.closest('button[data-style]');if(!button||state.busy)return;state.style=button.dataset.style;root.querySelectorAll('#nviStyles button').forEach(function(item){item.classList.toggle('is-active',item===button);});markStale();});
    Object.values(controls).forEach(function(control){control.addEventListener('input',function(){updateLabels();markStale();});control.addEventListener('change',markStale);});
    root.querySelector('#nviViewTabs').addEventListener('click',function(event){var button=event.target.closest('button[data-view]');if(!button)return;stage.classList.remove('view-original','view-split','view-vector');stage.classList.add('view-'+button.dataset.view);root.querySelectorAll('#nviViewTabs button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviBgTools').addEventListener('click',function(event){var button=event.target.closest('button[data-bg]');if(!button)return;stage.dataset.bg=button.dataset.bg;root.querySelectorAll('#nviBgTools button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviDownload').addEventListener('click',function(){if(state.svg)download(safeName(state.file&&state.file.name)+'-nexora-vector.svg',state.svg);});root.querySelector('#nviCopy').addEventListener('click',function(){if(!state.svg)return;copyText(state.svg).then(function(){notify('Kode SVG disalin.','is-success');}).catch(function(){notify('Clipboard ditolak browser.','is-error');});});root.querySelector('#nviCodeToggle').addEventListener('click',function(){code.hidden=!code.hidden;if(!code.hidden)code.scrollIntoView({behavior:'smooth',block:'nearest'});});root.querySelector('#nviReset').addEventListener('click',clearFile);
    function paste(event){if(state.destroyed||state.busy||!event.clipboardData)return;var item=Array.from(event.clipboardData.items||[]).find(function(row){return row.type==='image/png'||row.type==='image/jpeg';});if(item){var file=item.getAsFile();if(file){event.preventDefault();setFile(new File([file],'clipboard-'+Date.now()+'.png',{type:file.type||'image/png'}));}}}
    document.addEventListener('paste',paste);body.__nxCleanup=function(){state.destroyed=true;terminateWorker();releaseFile();document.removeEventListener('paste',paste);clearTimeout(toast.__timer);};
    updateLabels();if(window.Worker&&window.WebAssembly){engineBadge.className='is-ready';engineBadge.innerHTML='<i class="fa-solid fa-circle-check"></i> WORKER READY';}else{engineBadge.className='is-error';engineBadge.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> UNSUPPORTED';}
  };
})();

/* Nexora Image Vectorizer HF9.1 — viewport and fidelity recovery */
(function(){
  'use strict';

  var MAX_FILE_BYTES=12*1024*1024;
  var ACCEPTED_TYPES=new Set(['image/png','image/jpeg']);
  var PRESETS={
    logo:{label:'Logo',preset:'poster',clustering:'color-cluster',hierarchical:'cutout',mode:'spline',detail:72,colorPrecision:7,filterSpeckle:8,cornerThreshold:52,maxColors:8,layerDifference:12,simplify:1.4},
    illustration:{label:'Illustration',preset:'poster',clustering:'color-cluster',hierarchical:'cutout',mode:'spline',detail:90,colorPrecision:8,filterSpeckle:2,cornerThreshold:60,maxColors:32,layerDifference:10,simplify:.55},
    photo:{label:'Photo',preset:'photo',clustering:'watershed',hierarchical:'cutout',mode:'spline',detail:86,colorPrecision:8,filterSpeckle:5,cornerThreshold:150,maxColors:64,layerDifference:32,simplify:.75,watershedDetail:196},
    bw:{label:'B&W',preset:'bw',clustering:'bw',hierarchical:'cutout',mode:'spline',detail:88,colorPrecision:8,filterSpeckle:3,cornerThreshold:55,maxColors:2,layerDifference:0,simplify:.8,adaptive:true}
  };

  function node(tag,className,text){var item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;}
  function formatBytes(value){var size=Number(value)||0;if(size<1024)return size+' B';if(size<1048576)return(size/1024).toFixed(size<10240?1:0)+' KB';return(size/1048576).toFixed(2)+' MB';}
  function safeName(value){return String(value||'vector').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'vector';}
  function copyText(value){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(value);var area=node('textarea');area.value=value;area.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve();}
  function download(name,content,type){var blob=content instanceof Blob?content:new Blob([content],{type:type||'image/svg+xml;charset=utf-8'});var url=URL.createObjectURL(blob);var link=node('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1800);}
  function sanitizeSvg(source){
    var parsed=new DOMParser().parseFromString(String(source||''),'image/svg+xml');
    if(parsed.querySelector('parsererror')||!parsed.documentElement||parsed.documentElement.localName!=='svg')throw new Error('SVG hasil FreeConvert tidak valid.');
    parsed.querySelectorAll('script,foreignObject,iframe,object,embed,image,use,a').forEach(function(item){item.remove();});
    parsed.querySelectorAll('*').forEach(function(item){Array.from(item.attributes||[]).forEach(function(attribute){var name=attribute.name.toLowerCase();var value=String(attribute.value||'');if(name.indexOf('on')===0||name==='href'||name==='xlink:href'||/url\s*\(/i.test(value))item.removeAttribute(attribute.name);});});
    var svg=parsed.documentElement;var width=parseFloat(svg.getAttribute('width'));var height=parseFloat(svg.getAttribute('height'));
    if(!svg.hasAttribute('viewBox')&&Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0)svg.setAttribute('viewBox','0 0 '+width+' '+height);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }
  function analyzeSvg(svg){var paths=(svg.match(/<path\b/gi)||[]).length;var colors=new Set();for(var match of svg.matchAll(/(?:fill|stroke)(?:\s*=\s*["']|\s*:\s*)(#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)(?:["';\s]|$)/gi))if(match[1]!=='none')colors.add(match[1].toLowerCase());return{paths:paths,colors:colors.size};}
  function deviceProfile(){var mobile=matchMedia('(max-width:720px)').matches;var memory=Number(navigator.deviceMemory)||4;var low=memory<=3;return low?{maxPixels:1400000,maxSide:1700,label:'Mobile Lite'}:(mobile?{maxPixels:2800000,maxSide:2400,label:'Mobile HQ'}:{maxPixels:5000000,maxSide:3200,label:'Desktop HQ'});}

  window.renderImageVectorizer=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML=`
      <main class="nvi" aria-label="Nexora Image Vectorizer">
        <section class="nvi-hero">
          <div class="nvi-hero-copy">
            <div class="nvi-kicker"><i class="fa-solid fa-bezier-curve"></i><span>CLOUD VECTOR ENGINE</span><b>FREECONVERT · API</b></div>
            <h2>Raster in.<br><em>Infinite scale out.</em></h2>
            <p>Ubah PNG atau JPG menjadi SVG melalui FreeConvert Cloud dengan upload langsung yang aman dan preview proporsional.</p>
            <div class="nvi-trust"><span><i class="fa-solid fa-cloud-arrow-up"></i> DIRECT UPLOAD</span><span><i class="fa-solid fa-key"></i> SERVER-ONLY KEY</span><span><i class="fa-solid fa-bezier-curve"></i> SVG CLOUD</span></div>
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
              <button type="button" data-preset="logo"><i class="fa-solid fa-signature"></i><span><b>Logo</b><small>Warna ringkas</small></span></button>
              <button type="button" data-preset="illustration" class="is-active"><i class="fa-solid fa-palette"></i><span><b>Illustration</b><small>Anime &amp; artwork</small></span></button>
              <button type="button" data-preset="photo"><i class="fa-solid fa-camera-retro"></i><span><b>Photo</b><small>Watershed</small></span></button>
              <button type="button" data-preset="bw"><i class="fa-solid fa-circle-half-stroke"></i><span><b>B&amp;W</b><small>Line art / scan</small></span></button>
            </div></fieldset>

            <fieldset class="nvi-fieldset"><legend>Vector style</legend><div class="nvi-style-row" id="nviStyles"><button type="button" data-style="spline" class="is-active"><i class="fa-solid fa-bezier-curve"></i>Spline</button><button type="button" data-style="polygon"><i class="fa-solid fa-draw-polygon"></i>Polygon</button><button type="button" data-style="pixel"><i class="fa-solid fa-border-all"></i>Pixel</button></div></fieldset>

            <div class="nvi-sliders">
              <label><span><b>Detail</b><output id="nviDetailValue">90</output></span><input id="nviDetail" type="range" min="20" max="100" value="90"></label>
              <label><span><b>Color precision</b><output id="nviColorValue">8 / 8</output></span><input id="nviColor" type="range" min="1" max="8" value="8"></label>
              <label><span><b>Noise removal</b><output id="nviNoiseValue">2 px</output></span><input id="nviNoise" type="range" min="0" max="32" value="2"></label>
              <label><span><b>Corner</b><output id="nviCornerValue">Balanced</output></span><input id="nviCorner" type="range" min="0" max="180" value="60"></label>
            </div>

            <div class="nvi-select-row"><label><span>Target warna</span><select id="nviColors"><option value="4">4 colors</option><option value="8">8 colors</option><option value="16">16 colors</option><option value="32" selected>32 colors</option><option value="64">64 colors</option></select></label><label><span>Output</span><select id="nviQuality"><option value="2" selected>Optimized</option><option value="1">Balanced</option><option value="0">Raw paths</option></select></label></div>
            <div class="nvi-switches"><label><input id="nviMosaic" type="checkbox" checked><span><i class="fa-solid fa-puzzle-piece"></i><b>Seam-free mosaic</b><small>Bentuk rapat tanpa celah putih.</small></span></label><label><input id="nviAdaptive" type="checkbox" checked><span><i class="fa-solid fa-wand-magic-sparkles"></i><b>Adaptive B&amp;W</b><small>Scan tetap bersih pada cahaya tidak rata.</small></span></label></div>
            <div class="nvi-local-note"><i class="fa-solid fa-lock"></i><p><b>Cloud vectorization.</b> Gambar diupload langsung ke FreeConvert menggunakan signed upload URL; API key tetap hanya di server Nexora.</p></div>
            <div class="nvi-run-row"><button id="nviRun" class="nvi-run" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Vectorize image</span><b>→</b></button><button id="nviStop" class="nvi-stop" type="button" hidden><i class="fa-solid fa-stop"></i></button></div>
            <div class="nvi-progress" id="nviProgress" hidden><div><span id="nviProgressLabel">Menyiapkan konversi</span><b id="nviProgressValue">0%</b></div><div><i id="nviProgressBar"></i></div><small>Upload dan konversi diproses oleh FreeConvert Cloud tanpa membebani CPU HP.</small></div>
          </article>

          <article class="nvi-panel nvi-preview-panel">
            <header class="nvi-panel-head"><div><span>02 · A/B VECTOR LAB</span><h3>Original vs Vector</h3></div><b id="nviStatus" class="is-local"><i class="fa-solid fa-shield-halved"></i> LOCAL ONLY</b></header>
            <div class="nvi-view-tabs" id="nviViewTabs"><button type="button" data-view="original">Original</button><button type="button" data-view="split" class="is-active">Split</button><button type="button" data-view="vector">Vector</button></div>
            <div class="nvi-stage is-empty view-split" id="nviStage">
              <div class="nvi-empty" id="nviEmpty"><i class="fa-solid fa-bezier-curve"></i><strong>Vector canvas menunggu</strong><span>Pilih gambar, atur preset, lalu konversi melalui FreeConvert.</span><div><b>01</b> Upload <i></i><b>02</b> Tune <i></i><b>03</b> Export</div></div>
              <figure class="nvi-original" id="nviOriginal" hidden><figcaption><span>ORIGINAL</span><small>Raster source</small></figcaption><div><img id="nviOriginalImage" alt="Gambar asli"></div></figure>
              <figure class="nvi-vector" id="nviVector" hidden><figcaption><span>VECTOR</span><small id="nviVectorLabel">SVG result</small></figcaption><div id="nviVectorHost"></div></figure>
            </div>
            <div class="nvi-bg-tools" id="nviBgTools" hidden><span>CANVAS</span><button type="button" data-bg="checker" class="is-active" aria-label="Checkerboard"><i class="fa-solid fa-table-cells-large"></i></button><button type="button" data-bg="light" aria-label="Latar terang"><i class="fa-regular fa-sun"></i></button><button type="button" data-bg="dark" aria-label="Latar gelap"><i class="fa-regular fa-moon"></i></button><b id="nviProfile"></b></div>
            <div class="nvi-stats" id="nviStats" hidden></div>
            <div class="nvi-result-actions" id="nviActions" hidden><button id="nviDownload" type="button" class="is-primary"><i class="fa-solid fa-download"></i><span>Download SVG</span></button><button id="nviCopy" type="button"><i class="fa-regular fa-copy"></i><span>Copy SVG code</span></button><button id="nviCodeToggle" type="button"><i class="fa-solid fa-code"></i><span>View code</span></button><button id="nviReset" type="button"><i class="fa-solid fa-rotate-left"></i><span>Reset</span></button></div>
            <div class="nvi-code" id="nviCode" hidden><header><span>SVG SOURCE</span><b id="nviCodeSize"></b></header><pre id="nviCodeText" tabindex="0"></pre></div>
            <footer class="nvi-engine-foot"><i class="fa-solid fa-microchip"></i><div><b>FreeConvert Cloud</b><span>PNG/JPG dikonversi menjadi SVG melalui pipeline cloud dengan signed direct upload.</span></div><strong>CLOUD API</strong></footer>
          </article>
        </section>
        <div class="nvi-toast" id="nviToast" role="status" aria-live="polite"></div>
      </main>`;

    var root=body.querySelector('.nvi');var fileInput=root.querySelector('#nviFile');var drop=root.querySelector('#nviDrop');var fileCard=root.querySelector('#nviFileCard');var thumb=root.querySelector('#nviThumb');var fileName=root.querySelector('#nviFileName');var fileMeta=root.querySelector('#nviFileMeta');var engineBadge=root.querySelector('#nviEngine');var runButton=root.querySelector('#nviRun');var stopButton=root.querySelector('#nviStop');var progressBox=root.querySelector('#nviProgress');var progressLabel=root.querySelector('#nviProgressLabel');var progressValue=root.querySelector('#nviProgressValue');var progressBar=root.querySelector('#nviProgressBar');var stage=root.querySelector('#nviStage');var empty=root.querySelector('#nviEmpty');var original=root.querySelector('#nviOriginal');var originalImage=root.querySelector('#nviOriginalImage');var vector=root.querySelector('#nviVector');var vectorHost=root.querySelector('#nviVectorHost');var vectorLabel=root.querySelector('#nviVectorLabel');var statusBadge=root.querySelector('#nviStatus');var bgTools=root.querySelector('#nviBgTools');var stats=root.querySelector('#nviStats');var actions=root.querySelector('#nviActions');var code=root.querySelector('#nviCode');var codeText=root.querySelector('#nviCodeText');var toast=root.querySelector('#nviToast');
    var controls={detail:root.querySelector('#nviDetail'),color:root.querySelector('#nviColor'),noise:root.querySelector('#nviNoise'),corner:root.querySelector('#nviCorner'),colors:root.querySelector('#nviColors'),quality:root.querySelector('#nviQuality'),mosaic:root.querySelector('#nviMosaic'),adaptive:root.querySelector('#nviAdaptive')};
    var state={file:null,objectUrl:null,width:0,height:0,preset:'illustration',style:'spline',svg:'',busy:false,progress:0,destroyed:false,cancelled:false};
    var profile=deviceProfile();root.querySelector('#nviProfile').textContent=profile.label+' · '+(profile.maxPixels/1000000).toFixed(1)+' MP';

    function notify(message,tone){toast.textContent=message;toast.className='nvi-toast is-show '+(tone||'');clearTimeout(toast.__timer);toast.__timer=setTimeout(function(){toast.className='nvi-toast';},3000);}
    function updateLabels(){root.querySelector('#nviDetailValue').textContent=controls.detail.value;root.querySelector('#nviColorValue').textContent=controls.color.value+' / 8';root.querySelector('#nviNoiseValue').textContent=controls.noise.value+' px';var corner=Number(controls.corner.value);root.querySelector('#nviCornerValue').textContent=corner<60?'Smooth':(corner<125?'Balanced':'Sharp');}
    function releaseFile(){if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl=null;}}
    function validFile(file){return file&&file.size>0&&file.size<=MAX_FILE_BYTES&&(ACCEPTED_TYPES.has(file.type)||/\.(?:png|jpe?g)$/i.test(file.name));}
    function markStale(){if(state.svg&&!state.busy){statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-rotate"></i> SETTINGS CHANGED';runButton.querySelector('span').textContent='Convert ulang';}}
    function terminateWorker(){state.cancelled=true;}

    function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}

    async function api(payload){
      var response=await fetch('/api/tool-health?mode=image-vectorizer',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(Object.assign({tool:'image-vectorizer'},payload))
      });
      var data={};
      try{data=await response.json();}catch(_){}
      if(!response.ok||data.ok===false)throw new Error(data.message||('FreeConvert API gagal (HTTP '+response.status+').'));
      return data;
    }

    async function uploadDirect(upload,file){
      var form=new FormData();
      Object.keys(upload.parameters||{}).forEach(function(key){form.append(key,upload.parameters[key]);});
      form.append('file',file,file.name);
      var response=await fetch(upload.url,{method:'POST',body:form});
      if(!response.ok)throw new Error('Upload ke FreeConvert gagal (HTTP '+response.status+').');
    }

    async function pollResult(taskId){
      for(var i=0;i<100&&!state.cancelled&&!state.destroyed;i++){
        var result=await api({action:'result',taskId:taskId});
        if(result.status==='success'&&result.svg)return result.svg;
        if(result.status==='failed')throw new Error(result.message||'FreeConvert gagal memproses gambar.');
        setProgress(Math.min(94,62+i*.45),'FreeConvert sedang membuat SVG');
        await sleep(1500);
      }
      if(state.cancelled)throw new Error('Proses dihentikan.');
      throw new Error('Konversi terlalu lama. Coba lagi.');
    }

    function setFile(file){
      if(!validFile(file)){notify(file&&file.size>MAX_FILE_BYTES?'File melebihi 12 MB.':'Gunakan file PNG atau JPG yang valid.','is-error');return;}
      releaseFile();state.file=file;state.svg='';state.objectUrl=URL.createObjectURL(file);thumb.src=state.objectUrl;originalImage.src=state.objectUrl;fileName.textContent=file.name;fileMeta.textContent=formatBytes(file.size)+' · membaca dimensi…';fileCard.hidden=false;drop.classList.add('has-file');empty.hidden=true;original.hidden=false;vector.hidden=true;stage.classList.remove('is-empty');stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;runButton.disabled=false;runButton.querySelector('span').textContent='Vectorize image';statusBadge.className='is-ready';statusBadge.innerHTML='<i class="fa-solid fa-cloud"></i> READY';
      var image=new Image();image.onload=function(){state.width=image.naturalWidth;state.height=image.naturalHeight;fileMeta.textContent=formatBytes(file.size)+' · '+state.width+' × '+state.height+' px';if(state.width*state.height>30000000){notify('Resolusi gambar sangat besar; proses cloud dapat membutuhkan waktu lebih lama.','is-warning');}};image.onerror=function(){clearFile();notify('Gambar tidak dapat dibuka.','is-error');};image.src=state.objectUrl;
    }
    function clearFile(){releaseFile();state.file=null;state.svg='';state.width=0;state.height=0;fileInput.value='';thumb.removeAttribute('src');originalImage.removeAttribute('src');fileCard.hidden=true;drop.classList.remove('has-file');empty.hidden=false;original.hidden=true;vector.hidden=true;stage.className='nvi-stage is-empty view-split';stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;runButton.disabled=true;runButton.querySelector('span').textContent='Vectorize image';setBusy(false);}
    function failRun(message){var hasPrevious=Boolean(state.svg);setBusy(false);if(hasPrevious){statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-clock-rotate-left"></i> OLD RESULT';notify('Proses ulang gagal; preview sebelumnya tetap aman. '+message,'is-warning');}else{vector.hidden=true;stats.hidden=true;actions.hidden=true;bgTools.hidden=true;statusBadge.className='is-error';statusBadge.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> VECTOR FAILED';notify(message,'is-error');}}
    async function run(){
      if(!state.file||state.busy)return;
      state.cancelled=false;
      setBusy(true);
      state.progress=0;
      setProgress(4,'Meminta signed upload URL');
      statusBadge.className='is-working';
      statusBadge.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> CONVERTING';
      var started=performance.now();

      try{
        var format=(state.file.type==='image/jpeg'||/\.jpe?g$/i.test(state.file.name))?'jpg':'png';

        var prepared=await api({
          action:'prepare',
          filename:state.file.name,
          size:state.file.size,
          format:format
        });

        if(state.cancelled)return;

        setProgress(18,'Mengupload gambar langsung ke FreeConvert');
        await uploadDirect(prepared.upload,state.file);

        if(state.cancelled)return;

        setProgress(48,'Memulai konversi PNG/JPG → SVG');
        var startedTask=await api({
          action:'start',
          importTaskId:prepared.taskId,
          filename:state.file.name,
          format:format
        });

        setProgress(62,'Menunggu hasil vector');
        var rawSvg=await pollResult(startedTask.exportTaskId);

        if(state.cancelled)return;
        finish(rawSvg,performance.now()-started);
      }catch(error){
        if(!state.cancelled)failRun(error&&error.message);
        else setBusy(false);
      }
    }

    function finish(rawSvg,durationMs){
      try{state.svg=sanitizeSvg(rawSvg);}
      catch(error){failRun(error.message);return;}

      var analysis=analyzeSvg(state.svg);
      var svgBytes=new TextEncoder().encode(state.svg).byteLength;

      setProgress(100,'SVG selesai');
      setBusy(false);

      vectorHost.innerHTML=state.svg;
      vector.hidden=false;
      empty.hidden=true;
      bgTools.hidden=false;
      actions.hidden=false;
      stats.hidden=false;

      stage.classList.remove('is-empty','view-original','view-split');
      stage.classList.add('view-vector');

      root.querySelectorAll('#nviViewTabs button').forEach(function(button){
        button.classList.toggle('is-active',button.dataset.view==='vector');
      });

      vectorLabel.textContent=(state.width||'?')+' × '+(state.height||'?')+' · fit 100%';
      statusBadge.className='is-success';
      statusBadge.innerHTML='<i class="fa-solid fa-circle-check"></i> VECTOR READY';
      runButton.querySelector('span').textContent='Convert ulang';

      var ratio=state.file?Math.round((1-svgBytes/state.file.size)*100):0;

      stats.replaceChildren(
        metric('fa-solid fa-bezier-curve','Paths',analysis.paths.toLocaleString('id-ID'),'curve & shape'),
        metric('fa-solid fa-palette','Colors',(analysis.colors||0).toLocaleString('id-ID'),'detected palette'),
        metric('fa-solid fa-file-code','SVG size',formatBytes(svgBytes),ratio>0?ratio+'% lebih kecil':'vector output'),
        metric('fa-regular fa-clock','Process',(durationMs/1000).toFixed(1)+' s','cloud pipeline')
      );

      codeText.textContent=state.svg;
      root.querySelector('#nviCodeSize').textContent=formatBytes(svgBytes);

      requestAnimationFrame(function(){
        if(matchMedia('(max-width:720px)').matches){
          root.querySelector('.nvi-preview-panel').scrollIntoView({behavior:'smooth',block:'start'});
        }
      });

      notify('SVG FreeConvert selesai dan preview tetap fit 100%.','is-success');
    }

    function metric(icon,label,value,sub){var item=node('article');item.innerHTML='<i class="'+icon+'"></i>';var copy=node('div');copy.append(node('span','',label),node('strong','',value),node('small','',sub||''));item.appendChild(copy);return item;}

    fileInput.addEventListener('change',function(){if(fileInput.files&&fileInput.files[0])setFile(fileInput.files[0]);});root.querySelector('#nviRemove').addEventListener('click',clearFile);runButton.addEventListener('click',run);stopButton.addEventListener('click',function(){if(!state.busy)return;state.cancelled=true;setBusy(false);statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-stop"></i> STOPPED';notify('Proses dihentikan.','is-warning');});
    ['dragenter','dragover'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.add('is-dragging');});});['dragleave','drop'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.remove('is-dragging');if(name==='drop'&&event.dataTransfer&&event.dataTransfer.files[0])setFile(event.dataTransfer.files[0]);});});
    root.querySelector('#nviPresets').addEventListener('click',function(event){var button=event.target.closest('button[data-preset]');if(button&&!state.busy)applyPreset(button.dataset.preset);});root.querySelector('#nviStyles').addEventListener('click',function(event){var button=event.target.closest('button[data-style]');if(!button||state.busy)return;state.style=button.dataset.style;root.querySelectorAll('#nviStyles button').forEach(function(item){item.classList.toggle('is-active',item===button);});markStale();});
    Object.values(controls).forEach(function(control){control.addEventListener('input',function(){updateLabels();markStale();});control.addEventListener('change',markStale);});
    root.querySelector('#nviViewTabs').addEventListener('click',function(event){var button=event.target.closest('button[data-view]');if(!button)return;stage.classList.remove('view-original','view-split','view-vector');stage.classList.add('view-'+button.dataset.view);root.querySelectorAll('#nviViewTabs button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviBgTools').addEventListener('click',function(event){var button=event.target.closest('button[data-bg]');if(!button)return;stage.dataset.bg=button.dataset.bg;root.querySelectorAll('#nviBgTools button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviDownload').addEventListener('click',function(){if(state.svg)download(safeName(state.file&&state.file.name)+'-nexora-vector.svg',state.svg);});root.querySelector('#nviCopy').addEventListener('click',function(){if(!state.svg)return;copyText(state.svg).then(function(){notify('Kode SVG disalin.','is-success');}).catch(function(){notify('Clipboard ditolak browser.','is-error');});});root.querySelector('#nviCodeToggle').addEventListener('click',function(){code.hidden=!code.hidden;if(!code.hidden)code.scrollIntoView({behavior:'smooth',block:'nearest'});});root.querySelector('#nviReset').addEventListener('click',clearFile);
    function paste(event){if(state.destroyed||state.busy||!event.clipboardData)return;var item=Array.from(event.clipboardData.items||[]).find(function(row){return row.type==='image/png'||row.type==='image/jpeg';});if(item){var file=item.getAsFile();if(file){event.preventDefault();setFile(new File([file],'clipboard-'+Date.now()+'.png',{type:file.type||'image/png'}));}}}
    document.addEventListener('paste',paste);body.__nxCleanup=function(){state.destroyed=true;state.cancelled=true;releaseFile();document.removeEventListener('paste',paste);clearTimeout(toast.__timer);};
    updateLabels();engineBadge.className='is-ready';engineBadge.innerHTML='<i class="fa-solid fa-cloud"></i> FREECONVERT READY';
  };
})();

/* Nexora Image Vectorizer HF11.1 — VTracer local WASM + adaptive tuning + SVG optimizer */
(function(){
  'use strict';

  var MAX_FILE_BYTES=12*1024*1024;
  var ACCEPTED_TYPES=new Set(['image/png','image/jpeg']);
  var VTRACER_LOCAL='/assets/vendor/vtracer/vtracer-loader.js?v=hf11.1';

  var PRESETS={
    logo:{label:'Logo',mode:'spline',detail:82,colorPrecision:7,filterSpeckle:7,cornerThreshold:58,maxColors:8,layerDifference:18,mosaic:true},
    illustration:{label:'Illustration',mode:'spline',detail:94,colorPrecision:8,filterSpeckle:2,cornerThreshold:60,maxColors:32,layerDifference:10,mosaic:true},
    photo:{label:'Photo',mode:'spline',detail:90,colorPrecision:8,filterSpeckle:3,cornerThreshold:78,maxColors:64,layerDifference:7,mosaic:false},
    bw:{label:'B&W',mode:'spline',detail:92,colorPrecision:8,filterSpeckle:2,cornerThreshold:55,maxColors:2,layerDifference:0,mosaic:true}
  };

  function node(tag,className,text){var item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;}
  function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0));}
  function formatBytes(value){var size=Number(value)||0;if(size<1024)return size+' B';if(size<1048576)return(size/1024).toFixed(size<10240?1:0)+' KB';return(size/1048576).toFixed(2)+' MB';}
  function safeName(value){return String(value||'vector').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'vector';}
  function copyText(value){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(value);var area=node('textarea');area.value=value;area.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();return Promise.resolve();}
  function downloadBlob(name,blob){var url=URL.createObjectURL(blob);var link=node('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},2500);}
  function deg2rad(deg){return Number(deg||0)/180*Math.PI;}
  function nextFrame(){return new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});}
  function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}

  function dynamicImport(url){return Function('u','return import(u)')(url);}
  function loadVTracer(){
    if(window.__nexoraVTracerPromise)return window.__nexoraVTracerPromise;

    window.__nexoraVTracerPromise=(async function(){
      var loader=await dynamicImport(VTRACER_LOCAL);
      if(!loader||typeof loader.initVTracer!=='function'){
        throw new Error('Loader VTracer lokal tidak valid.');
      }

      var mod=await loader.initVTracer();

      if(
        !mod ||
        typeof mod.ColorImageConverter!=='function' ||
        typeof mod.BinaryImageConverter!=='function'
      ){
        throw new Error('Binding VTracer lokal tidak lengkap.');
      }

      return mod;
    })().catch(function(error){
      window.__nexoraVTracerPromise=null;
      throw new Error(
        'VTracer WASM lokal gagal dimuat. '+
        (error&&error.message?error.message:String(error))
      );
    });

    return window.__nexoraVTracerPromise;
  }

  function deviceProfile(detail){
    var mobile=matchMedia('(max-width:720px)').matches;
    var memory=Number(navigator.deviceMemory)||4;
    var base;
    if(mobile&&memory<=3)base={maxPixels:1500000,maxSide:1800,label:'Mobile Lite'};
    else if(mobile&&memory<=5)base={maxPixels:2600000,maxSide:2300,label:'Mobile HQ'};
    else if(mobile)base={maxPixels:4200000,maxSide:3000,label:'Mobile Ultra'};
    else base={maxPixels:8500000,maxSide:4200,label:'Desktop HQ'};
    var factor=.72+.28*(clamp(detail,20,100)/100);
    return {maxPixels:Math.round(base.maxPixels*factor),maxSide:Math.round(base.maxSide*(.86+.14*factor)),label:base.label};
  }

  function traceDimensions(width,height,profile){
    var scale=Math.min(1,profile.maxSide/Math.max(width,height),Math.sqrt(profile.maxPixels/(width*height)));
    if(!Number.isFinite(scale)||scale<=0)scale=1;
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),scale:scale};
  }

  function quantizeCanvas(canvas,colorCount){
    var count=Math.round(clamp(colorCount,2,64));
    if(count>=64)return;
    var ctx=canvas.getContext('2d',{willReadFrequently:true});
    var image=ctx.getImageData(0,0,canvas.width,canvas.height);
    var data=image.data;
    var bins=new Map();
    var pixels=canvas.width*canvas.height;
    var stride=Math.max(1,Math.floor(Math.sqrt(pixels/70000)));
    for(var y=0;y<canvas.height;y+=stride){
      for(var x=0;x<canvas.width;x+=stride){
        var i=(y*canvas.width+x)*4;
        if(data[i+3]<16)continue;
        var key=((data[i]>>3)<<10)|((data[i+1]>>3)<<5)|(data[i+2]>>3);
        var row=bins.get(key);
        if(row){row[0]++;row[1]+=data[i];row[2]+=data[i+1];row[3]+=data[i+2];}
        else bins.set(key,[1,data[i],data[i+1],data[i+2]]);
      }
    }
    var palette=Array.from(bins.values()).sort(function(a,b){return b[0]-a[0];}).slice(0,count).map(function(row){return [Math.round(row[1]/row[0]),Math.round(row[2]/row[0]),Math.round(row[3]/row[0])];});
    if(!palette.length)return;
    var lut=new Uint8Array(4096);
    for(var key=0;key<4096;key++){
      var r=((key>>8)&15)*17,g=((key>>4)&15)*17,b=(key&15)*17,best=0,bestD=Infinity;
      for(var p=0;p<palette.length;p++){
        var pr=palette[p][0]-r,pg=palette[p][1]-g,pb=palette[p][2]-b,d=pr*pr+pg*pg+pb*pb;
        if(d<bestD){bestD=d;best=p;}
      }
      lut[key]=best;
    }
    for(var j=0;j<data.length;j+=4){
      if(data[j+3]<16)continue;
      var idx=((data[j]>>4)<<8)|((data[j+1]>>4)<<4)|(data[j+2]>>4);
      var color=palette[lut[idx]];
      data[j]=color[0];data[j+1]=color[1];data[j+2]=color[2];
    }
    ctx.putImageData(image,0,0);
  }


  function binarizeCanvas(canvas,adaptive){
    var ctx=canvas.getContext('2d',{willReadFrequently:true});
    var image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;
    var tile=adaptive?32:Math.max(canvas.width,canvas.height);
    for(var ty=0;ty<canvas.height;ty+=tile){
      for(var tx=0;tx<canvas.width;tx+=tile){
        var ex=Math.min(canvas.width,tx+tile),ey=Math.min(canvas.height,ty+tile),sum=0,count=0;
        for(var y=ty;y<ey;y+=2){for(var x=tx;x<ex;x+=2){var i=(y*canvas.width+x)*4;if(data[i+3]<16)continue;sum+=(data[i]*299+data[i+1]*587+data[i+2]*114)/1000;count++;}}
        var threshold=adaptive?clamp((sum/Math.max(1,count))*.88,52,220):128;
        for(var yy=ty;yy<ey;yy++){for(var xx=tx;xx<ex;xx++){var j=(yy*canvas.width+xx)*4;if(data[j+3]<16)continue;var lum=(data[j]*299+data[j+1]*587+data[j+2]*114)/1000;var v=lum<threshold?0:255;data[j]=data[j+1]=data[j+2]=v;}}
      }
    }
    ctx.putImageData(image,0,0);
  }

  function optimizeSvgText(source,level,originalWidth,originalHeight,traceWidth,traceHeight){
    var svg=String(source||'').trim();
    if(!/^<svg\b/i.test(svg))throw new Error('VTracer tidak menghasilkan SVG valid.');
    svg=svg.replace(/<\?xml[^>]*>\s*/gi,'').replace(/<!--[^]*?-->/g,'');
    if(Number(level)>=1)svg=svg.replace(/>\s+</g,'><').replace(/[\t\r\n]+/g,' ');
    if(Number(level)>=2)svg=svg.replace(/\s{2,}/g,' ').replace(/\s+\/>/g,'/>');
    var parser=new DOMParser().parseFromString(svg,'image/svg+xml');
    if(parser.querySelector('parsererror'))throw new Error('SVG hasil VTracer gagal diparsing.');
    var root=parser.documentElement;
    root.setAttribute('xmlns','http://www.w3.org/2000/svg');
    root.setAttribute('preserveAspectRatio','xMidYMid meet');
    if(!root.getAttribute('viewBox'))root.setAttribute('viewBox','0 0 '+traceWidth+' '+traceHeight);
    root.setAttribute('width',String(originalWidth));
    root.setAttribute('height',String(originalHeight));
    root.setAttribute('data-engine','Nexora VTracer Local');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Nexora + visioncortex VTracer (local WASM) -->\n'+new XMLSerializer().serializeToString(root);
  }

  function analyzeSvg(svg){
    var paths=(svg.match(/<path\b/gi)||[]).length;
    var colors=new Set();
    var re=/(?:fill|stroke)=["'](#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)["']/gi,match;
    while((match=re.exec(svg))&&colors.size<2048){if(match[1].toLowerCase()!=='none')colors.add(match[1].toLowerCase());}
    return {paths:paths,colors:colors.size};
  }

  async function fidelityScore(sourceUrl,svgBlob){
    var size=192;
    var a=document.createElement('canvas'),b=document.createElement('canvas');
    a.width=a.height=b.width=b.height=size;
    var ac=a.getContext('2d',{willReadFrequently:true}),bc=b.getContext('2d',{willReadFrequently:true});
    ac.fillStyle='#fff';bc.fillStyle='#fff';ac.fillRect(0,0,size,size);bc.fillRect(0,0,size,size);
    var original=new Image();original.decoding='async';
    var vector=new Image();vector.decoding='async';
    var vectorUrl=URL.createObjectURL(svgBlob);
    try{
      await Promise.all([
        new Promise(function(resolve,reject){original.onload=resolve;original.onerror=reject;original.src=sourceUrl;}),
        new Promise(function(resolve,reject){vector.onload=resolve;vector.onerror=reject;vector.src=vectorUrl;})
      ]);
      function fit(ctx,img){var scale=Math.min(size/img.naturalWidth,size/img.naturalHeight);var w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);}
      fit(ac,original);fit(bc,vector);
      var ad=ac.getImageData(0,0,size,size).data,bd=bc.getImageData(0,0,size,size).data;
      var err=0,edge=0,samples=0;
      for(var i=0;i<ad.length;i+=4){
        err+=(Math.abs(ad[i]-bd[i])+Math.abs(ad[i+1]-bd[i+1])+Math.abs(ad[i+2]-bd[i+2]))/(255*3);
        samples++;
      }
      var mae=err/Math.max(1,samples);
      var score=100*Math.pow(Math.max(0,1-mae),1.7);
      return Math.max(0,Math.min(100,score));
    }finally{URL.revokeObjectURL(vectorUrl);}
  }

  window.renderImageVectorizer=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML=`
      <main class="nvi" aria-label="Nexora Image Vectorizer">
        <section class="nvi-hero">
          <div class="nvi-hero-copy">
            <div class="nvi-kicker"><i class="fa-solid fa-bezier-curve"></i><span>LOCAL VECTOR ENGINE</span><b>VTRACER · WASM</b></div>
            <h2>Raster in.<br><em>Infinite scale out.</em></h2>
            <p>Ubah PNG atau JPG menjadi SVG langsung di perangkat. Tanpa API key, tanpa upload gambar, dan tanpa kuota konversi harian.</p>
            <div class="nvi-trust"><span><i class="fa-solid fa-mobile-screen"></i> ON-DEVICE</span><span><i class="fa-solid fa-infinity"></i> NO DAILY LIMIT</span><span><i class="fa-solid fa-lock"></i> PRIVATE</span></div>
          </div>
          <div class="nvi-orbit" aria-hidden="true"><div class="nvi-pixel-grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="nvi-vector-mark"><svg viewBox="0 0 120 120"><path d="M20 92C29 30 49 19 91 28C72 47 92 69 64 91C49 102 34 100 20 92Z"/><circle cx="91" cy="28" r="6"/><circle cx="20" cy="92" r="6"/><circle cx="64" cy="91" r="6"/></svg></div><span>PNG</span><b>SVG</b></div>
        </section>

        <section class="nvi-studio">
          <article class="nvi-panel nvi-controls-panel">
            <header class="nvi-panel-head"><div><span>01 · SOURCE & SETTINGS</span><h3>Image to Vector</h3></div><b id="nviEngine"><i class="fa-solid fa-circle-notch fa-spin"></i> LOADING WASM</b></header>
            <label class="nvi-drop" id="nviDrop" for="nviFile">
              <input id="nviFile" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg">
              <i class="fa-solid fa-image"></i><strong>Drop atau pilih gambar</strong><small>PNG / JPG · maksimal 12 MB · tidak diupload</small>
              <span><i class="fa-solid fa-folder-open"></i> Pilih gambar</span>
            </label>
            <div class="nvi-file" id="nviFileCard" hidden><img id="nviThumb" alt="Preview gambar"><div><span>RASTER READY</span><strong id="nviFileName"></strong><small id="nviFileMeta"></small></div><button id="nviRemove" type="button" aria-label="Hapus gambar"><i class="fa-solid fa-xmark"></i></button></div>

            <fieldset class="nvi-fieldset"><legend>Mode gambar</legend><div class="nvi-preset-grid" id="nviPresets">
              <button type="button" data-preset="logo"><i class="fa-solid fa-signature"></i><span><b>Logo</b><small>Warna ringkas</small></span></button>
              <button type="button" data-preset="illustration" class="is-active"><i class="fa-solid fa-palette"></i><span><b>Illustration</b><small>Anime & artwork</small></span></button>
              <button type="button" data-preset="photo"><i class="fa-solid fa-camera-retro"></i><span><b>Photo</b><small>Detail warna</small></span></button>
              <button type="button" data-preset="bw"><i class="fa-solid fa-circle-half-stroke"></i><span><b>B&W</b><small>Line art / scan</small></span></button>
            </div></fieldset>

            <fieldset class="nvi-fieldset"><legend>Vector profile</legend><div class="nvi-style-row" id="nviStyles"><button type="button" data-style="spline" class="is-active"><i class="fa-solid fa-bezier-curve"></i>Smooth</button><button type="button" data-style="polygon"><i class="fa-solid fa-draw-polygon"></i>Angular</button><button type="button" data-style="pixel"><i class="fa-solid fa-border-all"></i>Pixel-like</button></div></fieldset>

            <div class="nvi-sliders">
              <label><span><b>Detail</b><output id="nviDetailValue">94</output></span><input id="nviDetail" type="range" min="20" max="100" value="94"></label>
              <label><span><b>Color precision</b><output id="nviColorValue">8 / 8</output></span><input id="nviColor" type="range" min="1" max="8" value="8"></label>
              <label><span><b>Noise removal</b><output id="nviNoiseValue">2 px</output></span><input id="nviNoise" type="range" min="0" max="32" value="2"></label>
              <label><span><b>Corner</b><output id="nviCornerValue">Balanced</output></span><input id="nviCorner" type="range" min="0" max="180" value="60"></label>
            </div>

            <div class="nvi-select-row"><label><span>Target warna</span><select id="nviColors"><option value="4">4 colors</option><option value="8">8 colors</option><option value="16">16 colors</option><option value="32" selected>32 colors</option><option value="64">64 colors</option></select></label><label><span>Output</span><select id="nviQuality"><option value="2" selected>Adaptive HQ</option><option value="1">Balanced</option><option value="0">Raw paths</option></select></label></div>
            <div class="nvi-switches"><label><input id="nviMosaic" type="checkbox" checked><span><i class="fa-solid fa-puzzle-piece"></i><b>Cutout mosaic</b><small>Region rapat untuk artwork & logo.</small></span></label><label><input id="nviAdaptive" type="checkbox" checked><span><i class="fa-solid fa-wand-magic-sparkles"></i><b>Adaptive B&W</b><small>Optimasi threshold untuk line-art.</small></span></label></div>
            <div class="nvi-local-note"><i class="fa-solid fa-shield-halved"></i><p><b>Local vectorization.</b> VTracer WebAssembly berjalan di browser. File raster tidak dikirim ke Nexora atau layanan konversi eksternal.</p></div>
            <div class="nvi-run-row"><button id="nviRun" class="nvi-run" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Convert to SVG</span><b>→</b></button><button id="nviStop" class="nvi-stop" type="button" hidden><i class="fa-solid fa-stop"></i></button></div>
            <div class="nvi-progress" id="nviProgress" hidden><div><span id="nviProgressLabel">Menyiapkan VTracer</span><b id="nviProgressValue">0%</b></div><div><i id="nviProgressBar"></i></div><small>Semua tahap konversi berjalan lokal. Kecepatan bergantung pada resolusi gambar dan performa perangkat.</small></div>
          </article>

          <article class="nvi-panel nvi-preview-panel">
            <header class="nvi-panel-head"><div><span>02 · A/B VECTOR LAB</span><h3>Original vs Vector</h3></div><b id="nviStatus" class="is-local"><i class="fa-solid fa-shield-halved"></i> LOCAL ONLY</b></header>
            <div class="nvi-view-tabs" id="nviViewTabs"><button type="button" data-view="original">Original</button><button type="button" data-view="split" class="is-active">Split</button><button type="button" data-view="vector">Vector</button></div>
            <div class="nvi-stage is-empty view-split" id="nviStage">
              <div class="nvi-empty" id="nviEmpty"><i class="fa-solid fa-bezier-curve"></i><strong>Vector canvas menunggu</strong><span>Pilih gambar, atur preset, lalu VTracer memprosesnya langsung di perangkat.</span><div><b>01</b> Load <i></i><b>02</b> Trace <i></i><b>03</b> Export</div></div>
              <figure class="nvi-original" id="nviOriginal" hidden><figcaption><span>ORIGINAL</span><small>Raster source</small></figcaption><div><img id="nviOriginalImage" alt="Gambar asli"></div></figure>
              <figure class="nvi-vector" id="nviVector" hidden><figcaption><span>VECTOR</span><small id="nviVectorLabel">SVG result</small></figcaption><div id="nviVectorHost"></div></figure>
            </div>
            <div class="nvi-bg-tools" id="nviBgTools" hidden><span>CANVAS</span><button type="button" data-bg="checker" class="is-active" aria-label="Checkerboard"><i class="fa-solid fa-table-cells-large"></i></button><button type="button" data-bg="light" aria-label="Latar terang"><i class="fa-regular fa-sun"></i></button><button type="button" data-bg="dark" aria-label="Latar gelap"><i class="fa-regular fa-moon"></i></button><b id="nviProfile"></b></div>
            <div class="nvi-stats" id="nviStats" hidden></div>
            <div class="nvi-result-actions" id="nviActions" hidden><button id="nviDownload" type="button" class="is-primary"><i class="fa-solid fa-download"></i><span>Download SVG</span></button><button id="nviCopy" type="button"><i class="fa-regular fa-copy"></i><span>Copy SVG code</span></button><button id="nviCodeToggle" type="button"><i class="fa-solid fa-code"></i><span>View code</span></button><button id="nviReset" type="button"><i class="fa-solid fa-rotate-left"></i><span>Reset</span></button></div>
            <div class="nvi-code" id="nviCode" hidden><header><span>SVG SOURCE</span><b id="nviCodeSize"></b></header><pre id="nviCodeText" tabindex="0"></pre></div>
            <div class="nvi-engine-foot"><i class="fa-solid fa-microchip"></i><div><b>VTracer WASM · Adaptive HQ</b><span>Preset tuning + palette quantization + path precision + post-SVG optimizer.</span></div><strong>NO API QUOTA</strong></div>
          </article>
        </section>
        <div class="nvi-toast" id="nviToast" role="status" aria-live="polite"></div>
        <canvas id="nviTraceCanvas" width="1" height="1" aria-hidden="true" style="position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none"></canvas>
        <svg id="nviTraceSvg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none"></svg>
      </main>`;

    var root=body.querySelector('.nvi');
    var fileInput=root.querySelector('#nviFile'),drop=root.querySelector('#nviDrop'),fileCard=root.querySelector('#nviFileCard'),thumb=root.querySelector('#nviThumb'),fileName=root.querySelector('#nviFileName'),fileMeta=root.querySelector('#nviFileMeta');
    var original=root.querySelector('#nviOriginal'),originalImage=root.querySelector('#nviOriginalImage'),vector=root.querySelector('#nviVector'),vectorHost=root.querySelector('#nviVectorHost'),vectorLabel=root.querySelector('#nviVectorLabel'),empty=root.querySelector('#nviEmpty'),stage=root.querySelector('#nviStage');
    var runButton=root.querySelector('#nviRun'),stopButton=root.querySelector('#nviStop'),engineBadge=root.querySelector('#nviEngine'),statusBadge=root.querySelector('#nviStatus'),progressBox=root.querySelector('#nviProgress'),progressBar=root.querySelector('#nviProgressBar'),progressValue=root.querySelector('#nviProgressValue'),progressLabel=root.querySelector('#nviProgressLabel');
    var bgTools=root.querySelector('#nviBgTools'),stats=root.querySelector('#nviStats'),actions=root.querySelector('#nviActions'),code=root.querySelector('#nviCode'),codeText=root.querySelector('#nviCodeText'),toast=root.querySelector('#nviToast'),traceCanvas=root.querySelector('#nviTraceCanvas'),traceSvg=root.querySelector('#nviTraceSvg');
    var controls={detail:root.querySelector('#nviDetail'),color:root.querySelector('#nviColor'),noise:root.querySelector('#nviNoise'),corner:root.querySelector('#nviCorner'),colors:root.querySelector('#nviColors'),quality:root.querySelector('#nviQuality'),mosaic:root.querySelector('#nviMosaic'),adaptive:root.querySelector('#nviAdaptive')};
    var state={file:null,objectUrl:'',previewUrl:'',svg:'',svgBlob:null,width:0,height:0,traceWidth:0,traceHeight:0,preset:'illustration',style:'spline',busy:false,cancelled:false,destroyed:false,converter:null,progress:0,profile:null,processMs:0};

    function notify(message,type){toast.textContent=message;toast.className='nvi-toast is-show '+(type||'');clearTimeout(toast.__timer);toast.__timer=setTimeout(function(){toast.className='nvi-toast';},4200);}
    function validFile(file){return !!file&&file.size>0&&file.size<=MAX_FILE_BYTES&&(ACCEPTED_TYPES.has(file.type)||/\.(png|jpe?g)$/i.test(file.name||''));}
    function releasePreview(){if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl='';}}
    function releaseFile(){releasePreview();if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl='';}}
    function setBusy(value){state.busy=value;runButton.disabled=value||!state.file;stopButton.hidden=!value;fileInput.disabled=value;root.querySelectorAll('#nviPresets button,#nviStyles button,.nvi-sliders input,.nvi-select-row select,.nvi-switches input').forEach(function(item){item.disabled=value;});}
    function setProgress(value,label){state.progress=Math.max(state.progress,Math.min(100,Number(value)||0));progressBox.hidden=false;progressBar.style.width=state.progress+'%';progressValue.textContent=Math.round(state.progress)+'%';if(label)progressLabel.textContent=label;}
    function updateLabels(){root.querySelector('#nviDetailValue').textContent=controls.detail.value;root.querySelector('#nviColorValue').textContent=controls.color.value+' / 8';root.querySelector('#nviNoiseValue').textContent=controls.noise.value+' px';var c=Number(controls.corner.value);root.querySelector('#nviCornerValue').textContent=c<45?'Sharp':c>105?'Smooth':'Balanced';}
    function markStale(){if(!state.svg)return;statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-sliders"></i> SETTINGS CHANGED';runButton.querySelector('span').textContent='Convert ulang';}

    function applyPreset(name){var preset=PRESETS[name]||PRESETS.illustration;state.preset=name;state.style=preset.mode;controls.detail.value=preset.detail;controls.color.value=preset.colorPrecision;controls.noise.value=preset.filterSpeckle;controls.corner.value=preset.cornerThreshold;controls.colors.value=String(preset.maxColors);controls.mosaic.checked=preset.mosaic!==false;controls.adaptive.checked=name==='bw';root.querySelectorAll('#nviPresets button').forEach(function(button){button.classList.toggle('is-active',button.dataset.preset===name);});root.querySelectorAll('#nviStyles button').forEach(function(button){button.classList.toggle('is-active',button.dataset.style===state.style);});updateLabels();markStale();}

    function buildParams(precisionPass){
      var detail=Number(controls.detail.value),colorPrecision=Number(controls.color.value),noise=Number(controls.noise.value),corner=Number(controls.corner.value),quality=Number(controls.quality.value);
      var length=3.5+(100-detail)/100*4.4;
      var layerBase=PRESETS[state.preset].layerDifference;
      var layer=Math.max(state.preset==='photo'?3:1,Math.round(layerBase+(8-colorPrecision)*3));
      if(precisionPass){length=Math.max(3.5,length-.65);layer=Math.max(1,Math.round(layer*.68));noise=Math.max(0,noise-1);}
      var pathPrecision=quality===0?8:(quality===1?5:4);
      return {
        canvas_id:traceCanvas.id,
        svg_id:traceSvg.id,
        mode:state.style,
        clustering_mode:state.preset==='bw'?'binary':'color',
        hierarchical:controls.mosaic.checked?'cutout':'stacked',
        corner_threshold:deg2rad(corner),
        length_threshold:clamp(length,3.5,10),
        max_iterations:10,
        splice_threshold:deg2rad(state.preset==='photo'?38:45),
        filter_speckle:Math.round(noise*noise),
        color_precision:Math.round(clamp(8-colorPrecision,0,7)),
        layer_difference:Math.round(clamp(layer,0,255)),
        path_precision:pathPrecision
      };
    }

    async function prepareRaster(){
      setProgress(8,'Decode gambar lokal');
      var image=new Image();image.decoding='async';
      await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(new Error('Gambar tidak dapat didecode browser.'));};image.src=state.objectUrl;});
      state.width=image.naturalWidth;state.height=image.naturalHeight;
      state.profile=deviceProfile(Number(controls.detail.value));
      var dims=traceDimensions(state.width,state.height,state.profile);state.traceWidth=dims.width;state.traceHeight=dims.height;
      traceCanvas.width=dims.width;traceCanvas.height=dims.height;
      var ctx=traceCanvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,dims.width,dims.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,dims.width,dims.height);
      if(state.preset==='bw'){
        setProgress(18,controls.adaptive.checked?'Adaptive B&W threshold':'B&W threshold');
        binarizeCanvas(traceCanvas,controls.adaptive.checked);
      }else{
        setProgress(18,'Adaptive palette '+controls.colors.value+' warna');
        quantizeCanvas(traceCanvas,Number(controls.colors.value));
      }
      return image;
    }

    async function traceOnce(mod,params,startProgress,endProgress,label){
      while(traceSvg.firstChild)traceSvg.removeChild(traceSvg.firstChild);
      var Converter=params.clustering_mode==='binary'?mod.BinaryImageConverter:mod.ColorImageConverter;
      var converter=Converter.new_with_string(JSON.stringify(params));state.converter=converter;
      try{
        converter.init();
        var done=false;
        while(!done){
          if(state.cancelled||state.destroyed)throw new Error('Proses dihentikan.');
          var slice=performance.now();
          do{done=converter.tick();}while(!done&&performance.now()-slice<22);
          var p=clamp(converter.progress(),0,100);
          setProgress(startProgress+(endProgress-startProgress)*(p/100),label+' · '+Math.round(p)+'%');
          if(!done)await wait(1);
        }
        var raw=new XMLSerializer().serializeToString(traceSvg);
        if(!raw||raw.indexOf('<path')===-1)throw new Error('VTracer selesai tetapi tidak menghasilkan path vector.');
        return optimizeSvgText(raw,Number(controls.quality.value),state.width,state.height,state.traceWidth,state.traceHeight);
      }finally{
        try{converter.free();}catch(_){}
        if(state.converter===converter)state.converter=null;
      }
    }

    async function chooseAdaptiveResult(mod){
      var base=await traceOnce(mod,buildParams(false),25,74,'Tracing VTracer');
      if(Number(controls.quality.value)!==2||state.preset==='bw'||state.traceWidth*state.traceHeight>1800000)return base;
      if(state.cancelled)return base;
      setProgress(75,'Adaptive HQ · precision pass');
      var precise=await traceOnce(mod,buildParams(true),75,94,'Precision pass');
      var baseBlob=new Blob([base],{type:'image/svg+xml;charset=utf-8'}),preciseBlob=new Blob([precise],{type:'image/svg+xml;charset=utf-8'});
      var scores=await Promise.all([fidelityScore(state.objectUrl,baseBlob),fidelityScore(state.objectUrl,preciseBlob)]).catch(function(){return [0,0];});
      var baseUtility=scores[0]-Math.max(0,baseBlob.size-preciseBlob.size*.8)/1048576*.08;
      var preciseUtility=scores[1]-Math.max(0,preciseBlob.size-baseBlob.size*1.8)/1048576*.08;
      return preciseUtility>=baseUtility?precise:base;
    }

    function setFile(file){
      if(!validFile(file)){notify(file&&file.size>MAX_FILE_BYTES?'File melebihi 12 MB.':'Gunakan file PNG atau JPG yang valid.','is-error');return;}
      releaseFile();state.file=file;state.svg='';state.svgBlob=null;state.width=0;state.height=0;state.objectUrl=URL.createObjectURL(file);thumb.src=state.objectUrl;originalImage.src=state.objectUrl;fileName.textContent=file.name;fileMeta.textContent=formatBytes(file.size)+' · membaca dimensi…';fileCard.hidden=false;drop.classList.add('has-file');empty.hidden=true;original.hidden=false;vector.hidden=true;stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;codeText.textContent='';runButton.disabled=false;runButton.querySelector('span').textContent='Convert to SVG';statusBadge.className='is-ready';statusBadge.innerHTML='<i class="fa-solid fa-microchip"></i> READY';
      var image=new Image();image.onload=function(){state.width=image.naturalWidth;state.height=image.naturalHeight;fileMeta.textContent=formatBytes(file.size)+' · '+state.width+' × '+state.height+' px';if(state.width*state.height>12000000)notify('Gambar besar akan diturunkan resolusinya khusus untuk tracing agar HP tetap stabil.','is-warning');};image.onerror=function(){clearFile();notify('Gambar tidak dapat dibuka.','is-error');};image.src=state.objectUrl;
    }

    function clearFile(){if(state.converter){try{state.converter.free();}catch(_){}}state.converter=null;state.cancelled=true;releaseFile();state.file=null;state.svg='';state.svgBlob=null;state.width=state.height=0;fileInput.value='';thumb.removeAttribute('src');originalImage.removeAttribute('src');fileCard.hidden=true;drop.classList.remove('has-file');empty.hidden=false;original.hidden=true;vector.hidden=true;stage.className='nvi-stage is-empty view-split';stats.hidden=true;actions.hidden=true;bgTools.hidden=true;code.hidden=true;codeText.textContent='';progressBox.hidden=true;runButton.disabled=true;runButton.querySelector('span').textContent='Convert to SVG';setBusy(false);statusBadge.className='is-local';statusBadge.innerHTML='<i class="fa-solid fa-shield-halved"></i> LOCAL ONLY';}

    function failRun(message){setBusy(false);progressBox.hidden=true;var hasPrevious=Boolean(state.svg);if(hasPrevious){statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-clock-rotate-left"></i> OLD RESULT';notify('Konversi ulang gagal; hasil sebelumnya tetap aman. '+message,'is-warning');}else{vector.hidden=true;stats.hidden=true;actions.hidden=true;bgTools.hidden=true;statusBadge.className='is-error';statusBadge.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> VECTOR FAILED';notify(message||'Konversi lokal gagal.','is-error');}}

    async function run(){
      if(!state.file||state.busy)return;
      state.cancelled=false;state.progress=0;setBusy(true);setProgress(3,'Menyiapkan VTracer WASM');statusBadge.className='is-working';statusBadge.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> LOCAL TRACE';var started=performance.now();
      try{
        var mod=await loadVTracer();if(state.cancelled)return setBusy(false);
        await prepareRaster();if(state.cancelled)return setBusy(false);
        await nextFrame();
        var svg=await chooseAdaptiveResult(mod);if(state.cancelled)return setBusy(false);
        state.processMs=performance.now()-started;
        finish(svg);
      }catch(error){if(!state.cancelled)failRun(error&&error.message?error.message:String(error));else setBusy(false);}
    }

    function finish(svg){
      state.svg=String(svg||'');state.svgBlob=new Blob([state.svg],{type:'image/svg+xml;charset=utf-8'});releasePreview();state.previewUrl=URL.createObjectURL(state.svgBlob);
      vectorHost.replaceChildren();var image=new Image();image.alt='Vector preview';image.decoding='async';image.style.cssText='display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain';image.src=state.previewUrl;vectorHost.appendChild(image);
      var analysis=analyzeSvg(state.svg),svgBytes=state.svgBlob.size,ratio=state.file?Math.round((1-svgBytes/state.file.size)*100):0;
      setProgress(100,'SVG selesai');setBusy(false);setTimeout(function(){progressBox.hidden=true;},500);vector.hidden=false;empty.hidden=true;bgTools.hidden=false;actions.hidden=false;stats.hidden=false;stage.classList.remove('is-empty','view-original','view-split');stage.classList.add('view-vector');root.querySelectorAll('#nviViewTabs button').forEach(function(button){button.classList.toggle('is-active',button.dataset.view==='vector');});vectorLabel.textContent=(state.width||'?')+' × '+(state.height||'?')+' · fit 100%';statusBadge.className='is-success';statusBadge.innerHTML='<i class="fa-solid fa-circle-check"></i> VECTOR READY';runButton.querySelector('span').textContent='Convert ulang';root.querySelector('#nviProfile').textContent=(state.profile?state.profile.label:'Local')+' · '+state.traceWidth+'×'+state.traceHeight+' · '+(state.processMs/1000).toFixed(1)+'s';
      var fidelity=metric('fa-solid fa-bullseye','Fidelity','…','local reconstruction');fidelity.id='nviFidelityMetric';
      stats.replaceChildren(metric('fa-solid fa-bezier-curve','Paths',analysis.paths.toLocaleString('id-ID'),'curve & shape'),metric('fa-solid fa-palette','Colors',(analysis.colors||0).toLocaleString('id-ID'),'vector palette'),fidelity,metric('fa-solid fa-file-code','SVG size',formatBytes(svgBytes),ratio>0?ratio+'% lebih kecil':'vector output'));
      root.querySelector('#nviCodeSize').textContent=formatBytes(svgBytes);codeText.textContent='';
      fidelityScore(state.objectUrl,state.svgBlob).then(function(score){if(state.svg&&fidelity.isConnected){fidelity.querySelector('strong').textContent=score.toFixed(1)+'%';fidelity.querySelector('small').textContent=score>=94?'excellent':score>=88?'high':'tune detail/colors';}}).catch(function(){if(fidelity.isConnected)fidelity.querySelector('strong').textContent='N/A';});
      requestAnimationFrame(function(){if(matchMedia('(max-width:720px)').matches)root.querySelector('.nvi-preview-panel').scrollIntoView({behavior:'smooth',block:'start'});});notify('SVG VTracer selesai. Tidak ada kuota API yang terpakai.','is-success');
    }

    function metric(icon,label,value,sub){var item=node('article');item.innerHTML='<i class="'+icon+'"></i>';var copy=node('div');copy.append(node('span','',label),node('strong','',value),node('small','',sub||''));item.appendChild(copy);return item;}

    fileInput.addEventListener('change',function(){if(fileInput.files&&fileInput.files[0])setFile(fileInput.files[0]);});
    root.querySelector('#nviRemove').addEventListener('click',clearFile);
    runButton.addEventListener('click',run);
    stopButton.addEventListener('click',function(){if(!state.busy)return;state.cancelled=true;if(state.converter){try{state.converter.free();}catch(_){}state.converter=null;}setBusy(false);progressBox.hidden=true;statusBadge.className='is-warning';statusBadge.innerHTML='<i class="fa-solid fa-stop"></i> STOPPED';notify('Proses VTracer dihentikan.','is-warning');});
    ['dragenter','dragover'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.add('is-dragging');});});
    ['dragleave','drop'].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.remove('is-dragging');if(name==='drop'&&event.dataTransfer&&event.dataTransfer.files[0])setFile(event.dataTransfer.files[0]);});});
    root.querySelector('#nviPresets').addEventListener('click',function(event){var button=event.target.closest('button[data-preset]');if(button&&!state.busy)applyPreset(button.dataset.preset);});
    root.querySelector('#nviStyles').addEventListener('click',function(event){var button=event.target.closest('button[data-style]');if(!button||state.busy)return;state.style=button.dataset.style;root.querySelectorAll('#nviStyles button').forEach(function(item){item.classList.toggle('is-active',item===button);});markStale();});
    Object.values(controls).forEach(function(control){control.addEventListener('input',function(){updateLabels();markStale();});control.addEventListener('change',markStale);});
    root.querySelector('#nviViewTabs').addEventListener('click',function(event){var button=event.target.closest('button[data-view]');if(!button)return;stage.classList.remove('view-original','view-split','view-vector');stage.classList.add('view-'+button.dataset.view);root.querySelectorAll('#nviViewTabs button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviBgTools').addEventListener('click',function(event){var button=event.target.closest('button[data-bg]');if(!button)return;stage.dataset.bg=button.dataset.bg;root.querySelectorAll('#nviBgTools button').forEach(function(item){item.classList.toggle('is-active',item===button);});});
    root.querySelector('#nviDownload').addEventListener('click',function(){if(state.svgBlob)downloadBlob(safeName(state.file&&state.file.name)+'-nexora-vtracer.svg',state.svgBlob);});
    root.querySelector('#nviCopy').addEventListener('click',function(){if(!state.svg)return;copyText(state.svg).then(function(){notify('Kode SVG disalin.','is-success');}).catch(function(){notify('Clipboard ditolak browser.','is-error');});});
    root.querySelector('#nviCodeToggle').addEventListener('click',function(){code.hidden=!code.hidden;if(!code.hidden){if(!codeText.textContent&&state.svg)codeText.textContent=state.svg;code.scrollIntoView({behavior:'smooth',block:'nearest'});}});
    root.querySelector('#nviReset').addEventListener('click',clearFile);
    function paste(event){if(state.destroyed||state.busy||!event.clipboardData)return;var item=Array.from(event.clipboardData.items||[]).find(function(row){return row.type==='image/png'||row.type==='image/jpeg';});if(item){var file=item.getAsFile();if(file){event.preventDefault();setFile(new File([file],'clipboard-'+Date.now()+'.png',{type:file.type||'image/png'}));}}}
    document.addEventListener('paste',paste);
    body.__nxCleanup=function(){state.destroyed=true;state.cancelled=true;if(state.converter){try{state.converter.free();}catch(_){}}state.converter=null;releaseFile();document.removeEventListener('paste',paste);clearTimeout(toast.__timer);};

    updateLabels();
    loadVTracer().then(function(){if(state.destroyed)return;engineBadge.className='is-ready';engineBadge.innerHTML='<i class="fa-solid fa-microchip"></i> VTRACER READY';}).catch(function(error){if(state.destroyed)return;engineBadge.className='is-error';engineBadge.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> WASM ERROR';notify(error.message,'is-error');});
  };
})();

/* Nexora Smart Cutout — mobile-first local object segmentation. */
(function(){
  'use strict';

  var MAX_FILE_BYTES=20*1024*1024;
  var MAX_POINTS=8;
  var ACCEPTED=new Set(['image/jpeg','image/png','image/webp']);
  var MEDIAPIPE_URL='/assets/vendor/mediapipe/vision_bundle.mjs?v=0.10.22-nexora1';
  var MEDIAPIPE_WASM_ROOT='/assets/vendor/mediapipe/wasm';
  var MEDIAPIPE_MODEL='/assets/models/mediapipe/magic_touch.tflite';
  var Core=window.NexoraSmartCutoutCore;

  function formatBytes(value){var bytes=Number(value)||0;if(bytes<1024)return bytes+' B';if(bytes<1048576)return(bytes/1024).toFixed(1)+' KB';return(bytes/1048576).toFixed(bytes<10485760?1:0)+' MB';}
  function canvasBlob(canvas,type){return new Promise(function(resolve,reject){canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error('CANVAS_FAILED'));},type||'image/png');});}
  function imageBitmap(file){
    if(window.createImageBitmap)return createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return createImageBitmap(file);});
    return new Promise(function(resolve,reject){var url=URL.createObjectURL(file);var image=new Image();image.onload=function(){URL.revokeObjectURL(url);resolve(image);};image.onerror=function(){URL.revokeObjectURL(url);reject(new Error('IMAGE_DECODE'));};image.src=url;});
  }
  function friendly(code){
    if(code==='OUT_OF_MEMORY')return'Perangkat ini kehabisan memori saat memproses gambar.';
    if(code==='EMPTY_MASK')return'Objek tidak berhasil terdeteksi. Coba pilih titik lain.';
    if(code==='MODEL_FAILED')return'Model AI gagal dimuat. Periksa koneksi pertama kali lalu coba lagi.';
    if(code==='MODEL_DOWNLOAD_FAILED')return'File model AI gagal diunduh. Periksa koneksi lalu coba lagi.';
    if(code==='WASM_FAILED')return'Runtime AI lokal gagal dimulai. Update Chrome atau coba perangkat lain.';
    if(code==='CACHE_FAILED')return'Cache model tidak tersedia. Kosongkan ruang browser lalu coba lagi.';
    if(code==='IMAGE_DECODE')return'Gambar tidak dapat dibaca.';
    if(code==='UNSUPPORTED')return'Browser ini belum mendukung fitur AI yang diperlukan.';
    if(code==='CANVAS_FAILED')return'Gambar hasil tidak dapat dibuat pada perangkat ini.';
    return'Proses segmentasi gagal. Coba pilih titik lain.';
  }

  window.renderNexoraSmartCutout=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML=`
      <main class="nsc" aria-label="Nexora Smart Cutout">
        <section class="nsc-intro">
          <div class="nsc-kicker"><i class="fa-solid fa-wand-magic-sparkles"></i><span>LOCAL AI · MAGIC TOUCH</span></div>
          <h2>Nexora Smart Cutout</h2>
          <p>Tap any object to cut it out.</p>
          <div class="nsc-privacy"><i class="fa-solid fa-shield-halved"></i><span>Gambar tetap di perangkat. Tidak diupload ke server.</span></div>
        </section>

        <section class="nsc-card nsc-source">
          <header><div><span>01</span><h3>Upload Image</h3></div><b id="nscModelBadge">MODEL ON DEMAND</b></header>
          <label class="nsc-upload" id="nscUpload" for="nscFile">
            <input id="nscFile" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">
            <i class="fa-solid fa-image"></i><strong>Select an image</strong><small>JPG, PNG, WebP · maksimal 20 MB</small><span><i class="fa-solid fa-folder-open"></i> Upload Image</span>
          </label>
          <div class="nsc-file" id="nscFileInfo" hidden><div><b id="nscFileName"></b><small id="nscFileMeta"></small></div><button id="nscChange" type="button"><i class="fa-solid fa-rotate"></i> Ganti</button></div>
        </section>

        <section class="nsc-card nsc-editor" id="nscEditor" hidden>
          <header><div><span>02</span><h3>Tap an object</h3></div><b id="nscStatus" aria-live="polite">Preparing image...</b></header>
          <div class="nsc-stage-wrap">
            <div class="nsc-stage" id="nscStage" aria-label="Area pemilihan objek" role="application">
              <div class="nsc-frame" id="nscFrame">
                <img id="nscImage" alt="Gambar yang akan dipotong" draggable="false">
                <canvas id="nscMask" aria-label="Mask Preview"></canvas>
                <div class="nsc-points" id="nscPoints" aria-hidden="true"></div>
              </div>
              <div class="nsc-stage-empty" id="nscStageEmpty"><i class="fa-solid fa-microchip"></i><span>Preparing image...</span></div>
            </div>
            <div class="nsc-zoom" aria-label="Kontrol zoom">
              <button id="nscZoomOut" type="button" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button>
              <output id="nscZoomValue">100%</output>
              <button id="nscZoomIn" type="button" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button>
              <button id="nscZoomReset" type="button" aria-label="Reset zoom"><i class="fa-solid fa-expand"></i></button>
            </div>
          </div>

          <div class="nsc-mode" role="group" aria-label="Refine mask">
            <button type="button" data-mode="positive" class="is-active"><i class="fa-solid fa-plus"></i><span><b>Select +</b><small>Tambah objek</small></span></button>
            <button type="button" data-mode="negative"><i class="fa-solid fa-minus"></i><span><b>Remove −</b><small>Buang area</small></span></button>
          </div>
          <p class="nsc-hint" id="nscHint"><i class="fa-regular fa-hand-pointer"></i> Tap objek untuk membuat mask. Cubit untuk zoom, geser saat diperbesar.</p>
          <div class="nsc-history"><button id="nscUndo" type="button" disabled><i class="fa-solid fa-rotate-left"></i> Undo</button><button id="nscReset" type="button" disabled><i class="fa-solid fa-trash-can"></i> Reset</button></div>

          <div class="nsc-options">
            <fieldset><legend>Edge</legend><div><button type="button" data-edge="soft" class="is-active">Soft</button><button type="button" data-edge="sharp">Sharp</button></div></fieldset>
            <label class="nsc-toggle"><input id="nscCrop" type="checkbox" checked><span><i></i><b>Crop to Object</b><small>Padding 3%</small></span></label>
          </div>
          <button class="nsc-extract" id="nscExtract" type="button" disabled><i class="fa-solid fa-scissors"></i><span>Extract Object</span></button>
        </section>

        <section class="nsc-card nsc-result" id="nscResult" hidden>
          <header><div><span>03</span><h3>Result</h3></div><b>TRANSPARENT PNG</b></header>
          <div class="nsc-result-preview"><img id="nscResultImage" alt="Hasil PNG transparan"></div>
          <p id="nscResultMeta"></p>
          <div class="nsc-downloads"><button id="nscDownload" type="button" class="is-primary"><i class="fa-solid fa-download"></i> Download PNG</button><button id="nscDownloadMask" type="button"><i class="fa-solid fa-circle-half-stroke"></i> Mask PNG</button></div>
        </section>
        <div class="nsc-toast" id="nscToast" role="alert" aria-live="assertive"></div>
      </main>`;

    var root=body.querySelector('.nsc');
    var ui={
      file:root.querySelector('#nscFile'),upload:root.querySelector('#nscUpload'),fileInfo:root.querySelector('#nscFileInfo'),fileName:root.querySelector('#nscFileName'),fileMeta:root.querySelector('#nscFileMeta'),change:root.querySelector('#nscChange'),
      editor:root.querySelector('#nscEditor'),status:root.querySelector('#nscStatus'),modelBadge:root.querySelector('#nscModelBadge'),stage:root.querySelector('#nscStage'),frame:root.querySelector('#nscFrame'),image:root.querySelector('#nscImage'),mask:root.querySelector('#nscMask'),points:root.querySelector('#nscPoints'),stageEmpty:root.querySelector('#nscStageEmpty'),hint:root.querySelector('#nscHint'),
      undo:root.querySelector('#nscUndo'),reset:root.querySelector('#nscReset'),extract:root.querySelector('#nscExtract'),crop:root.querySelector('#nscCrop'),zoomOut:root.querySelector('#nscZoomOut'),zoomIn:root.querySelector('#nscZoomIn'),zoomReset:root.querySelector('#nscZoomReset'),zoomValue:root.querySelector('#nscZoomValue'),
      result:root.querySelector('#nscResult'),resultImage:root.querySelector('#nscResultImage'),resultMeta:root.querySelector('#nscResultMeta'),download:root.querySelector('#nscDownload'),downloadMask:root.querySelector('#nscDownloadMask'),toast:root.querySelector('#nscToast')
    };
    var state={file:null,sourceUrl:'',bitmap:null,width:0,height:0,inferenceCanvas:null,segmenter:null,runtimePromise:null,modelReady:false,backend:'',points:[],pointMasks:[],mask:null,maskWidth:0,maskHeight:0,score:0,mode:'positive',edge:'soft',zoom:1,panX:0,panY:0,request:0,busy:false,resultBlob:null,resultUrl:'',maskBlob:null,destroyed:false,activePointers:new Map(),gesture:null,moved:false};

    function toast(message,tone){ui.toast.textContent=message;ui.toast.className='nsc-toast is-show '+(tone||'');clearTimeout(ui.toast.__timer);ui.toast.__timer=setTimeout(function(){ui.toast.className='nsc-toast';},3600);}
    function status(message,busy){ui.status.textContent=message;ui.status.classList.toggle('is-busy',!!busy);state.busy=!!busy;syncControls();}
    function syncControls(){var hasPoints=state.points.length>0;ui.undo.disabled=!hasPoints||state.busy;ui.reset.disabled=!hasPoints||state.busy;ui.extract.disabled=!state.mask||state.busy;ui.stage.classList.toggle('is-ready',state.modelReady&&!state.busy);}
    function revoke(key){if(state[key]){URL.revokeObjectURL(state[key]);state[key]='';}}
    function releaseResult(){revoke('resultUrl');state.resultBlob=null;state.maskBlob=null;ui.result.hidden=true;ui.resultImage.removeAttribute('src');}
    function releaseInference(){if(state.inferenceCanvas){state.inferenceCanvas.width=1;state.inferenceCanvas.height=1;state.inferenceCanvas=null;}}
    function closeModel(){if(state.segmenter&&typeof state.segmenter.close==='function')try{state.segmenter.close();}catch(_error){}state.segmenter=null;state.runtimePromise=null;state.modelReady=false;}
    function releaseImage(){
      revoke('sourceUrl');releaseResult();releaseInference();
      if(state.bitmap&&typeof state.bitmap.close==='function')try{state.bitmap.close();}catch(_error){}
      state.bitmap=null;state.file=null;state.width=0;state.height=0;state.points=[];state.pointMasks=[];state.mask=null;state.maskWidth=0;state.maskHeight=0;state.score=0;clearMask();resetTransform();
    }
    function cleanup(){state.destroyed=true;window.removeEventListener('resize',layoutFrame);releaseImage();closeModel();state.activePointers.clear();}
    body.__nxCleanup=cleanup;

    function clearMask(){var context=ui.mask.getContext('2d');context.clearRect(0,0,ui.mask.width||1,ui.mask.height||1);ui.points.innerHTML='';syncControls();}
    function layoutFrame(){
      if(!state.width||!state.height||ui.editor.hidden)return;
      var maxWidth=Math.max(1,ui.stage.clientWidth||ui.stage.parentElement.clientWidth||320);var maxHeight=Math.max(230,Math.min(window.innerHeight*.58,620));var scale=Math.min(maxWidth/state.width,maxHeight/state.height);
      ui.frame.style.width=Math.max(1,Math.round(state.width*scale))+'px';ui.frame.style.height=Math.max(1,Math.round(state.height*scale))+'px';clampPan();setTransform();
    }
    function setTransform(){ui.frame.style.transform='translate3d('+state.panX+'px,'+state.panY+'px,0) scale('+state.zoom+')';ui.zoomValue.textContent=Math.round(state.zoom*100)+'%';}
    function clampPan(){var maxX=Math.max(0,(ui.stage.clientWidth*(state.zoom-1))/2);var maxY=Math.max(0,(ui.stage.clientHeight*(state.zoom-1))/2);state.panX=Core.clamp(state.panX,-maxX,maxX);state.panY=Core.clamp(state.panY,-maxY,maxY);}
    function resetTransform(){state.zoom=1;state.panX=0;state.panY=0;setTransform();}
    function zoomTo(value){state.zoom=Core.clamp(value,1,4);if(state.zoom===1){state.panX=0;state.panY=0;}clampPan();setTransform();}

    function drawPoints(){
      ui.points.innerHTML='';
      state.points.forEach(function(point,index){var mark=document.createElement('i');mark.className=point.label?'is-positive':'is-negative';mark.style.left=(point.x*100)+'%';mark.style.top=(point.y*100)+'%';mark.textContent=point.label?'+':'−';mark.title=(point.label?'Select point ':'Remove point ')+(index+1);ui.points.appendChild(mark);});
    }
    function drawMask(){
      if(!state.mask)return clearMask();
      ui.mask.width=state.maskWidth;ui.mask.height=state.maskHeight;
      var context=ui.mask.getContext('2d');var image=context.createImageData(state.maskWidth,state.maskHeight);var pixels=image.data;
      for(var i=0;i<state.mask.length;i++)if(state.mask[i]){var offset=i*4;pixels[offset]=168;pixels[offset+1]=85;pixels[offset+2]=247;pixels[offset+3]=112;}
      context.putImageData(image,0,0);drawPoints();
    }
    function nextFrame(){return new Promise(function(resolve){requestAnimationFrame(function(){resolve();});});}
    function loadModel(){
      if(state.modelReady&&state.segmenter)return Promise.resolve(state.segmenter);
      if(state.runtimePromise)return state.runtimePromise;
      if(!window.WebAssembly||!window.Promise)return Promise.reject(new Error('UNSUPPORTED'));
      status('Loading AI model...',true);ui.modelBadge.textContent='LOADING · 6.2 MB';
      state.runtimePromise=import(MEDIAPIPE_URL).then(function(vision){
        return vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT).then(function(fileset){
          return vision.InteractiveSegmenter.createFromOptions(fileset,{baseOptions:{modelAssetPath:MEDIAPIPE_MODEL,delegate:'CPU'},outputConfidenceMasks:true,outputCategoryMask:false});
        });
      }).then(function(segmenter){
        state.segmenter=segmenter;state.modelReady=true;state.backend='wasm';ui.modelBadge.textContent='LOCAL WASM · READY';ui.modelBadge.className='is-ready';return segmenter;
      }).catch(function(error){state.runtimePromise=null;state.modelReady=false;throw new Error(/memory|allocation/i.test(String(error&&error.message))?'OUT_OF_MEMORY':'MODEL_FAILED');});
      return state.runtimePromise;
    }
    function pointMask(point){
      if(!state.segmenter||!state.inferenceCanvas)throw new Error('MODEL_FAILED');
      var result=state.segmenter.segment(state.inferenceCanvas,{keypoint:{x:point.x,y:point.y}});
      try{
        var masks=result&&result.confidenceMasks;if(!masks||!masks.length)throw new Error('EMPTY_MASK');
        var foreground=masks[masks.length-1];var values=foreground.getAsFloat32Array();
        return{data:new Float32Array(values),width:foreground.width,height:foreground.height,quality:result.qualityScores&&result.qualityScores.length?Math.max.apply(Math,result.qualityScores):0};
      }finally{if(result&&typeof result.close==='function')result.close();}
    }
    async function decodeSelection(){
      var requestId=++state.request;releaseResult();
      if(!state.points.length){state.mask=null;clearMask();status('Ready — tap an object',false);return;}
      status('Selecting object...',true);
      try{
        await nextFrame();var positive=null,negative=null,width=0,height=0,quality=0;
        for(var p=0;p<state.points.length;p++){
          if(requestId!==state.request||state.destroyed)return;
          var point=state.points[p];var candidate=state.pointMasks[p]||(state.pointMasks[p]=pointMask(point));width=candidate.width;height=candidate.height;quality=Math.max(quality,candidate.quality||0);
          var target=point.label?(positive||(positive=new Float32Array(candidate.data.length))):(negative||(negative=new Float32Array(candidate.data.length)));
          for(var i=0;i<candidate.data.length;i++)if(candidate.data[i]>target[i])target[i]=candidate.data[i];
          if(p+1<state.points.length)await nextFrame();
        }
        if(requestId!==state.request||state.destroyed)return;
        if(!positive)throw new Error('EMPTY_MASK');var output=new Uint8Array(positive.length);var filled=0;
        for(var m=0;m<positive.length;m++){var confidence=Math.max(0,positive[m]-(negative?negative[m]:0));if(confidence>=.35){output[m]=Math.round(Math.min(1,confidence)*255);filled++;}}
        if(!filled)throw new Error('EMPTY_MASK');state.mask=output;state.maskWidth=width;state.maskHeight=height;state.score=quality;drawMask();releaseResult();status(quality?'Mask ready · '+Math.round(quality*100)+'% confidence':'Mask ready',false);
      }catch(error){if(requestId!==state.request)return;status('Ready — coba titik lain',false);toast(friendly(error&&error.message),'is-error');}
    }

    function prepareInference(bitmap,width,height){
      var memory=Number(navigator.deviceMemory)||4;var maxSide=memory<=3?512:640;var fit=Core.fitSize(width,height,maxSide);
      var canvas=document.createElement('canvas');canvas.width=fit.width;canvas.height=fit.height;var context=canvas.getContext('2d',{alpha:false,willReadFrequently:true});if(!context)throw new Error('CANVAS_FAILED');
      context.drawImage(bitmap,0,0,fit.width,fit.height);return canvas;
    }
    async function acceptFile(file){
      if(!file)return;
      if(!file.size||file.size>MAX_FILE_BYTES||(!ACCEPTED.has(file.type)&&!/\.(?:jpe?g|png|webp)$/i.test(file.name))){toast('Pilih JPG, PNG, atau WebP yang valid (maksimal 20 MB).','is-error');ui.file.value='';return;}
      releaseImage();state.request++;state.file=file;ui.editor.hidden=false;ui.upload.hidden=true;ui.fileInfo.hidden=false;ui.fileName.textContent=file.name;ui.fileMeta.textContent=formatBytes(file.size);ui.modelBadge.textContent='MODEL ON DEMAND';ui.modelBadge.className='';ui.stageEmpty.hidden=false;ui.stageEmpty.querySelector('span').textContent='Preparing image...';status('Preparing image...',true);
      try{
        state.sourceUrl=URL.createObjectURL(file);ui.image.src=state.sourceUrl;
        state.bitmap=await imageBitmap(file);state.width=state.bitmap.width||state.bitmap.naturalWidth;state.height=state.bitmap.height||state.bitmap.naturalHeight;
        if(!state.width||!state.height)throw new Error('IMAGE_DECODE');
        ui.fileMeta.textContent=formatBytes(file.size)+' · '+state.width+'×'+state.height;
        ui.frame.style.aspectRatio=state.width+' / '+state.height;layoutFrame();state.inferenceCanvas=prepareInference(state.bitmap,state.width,state.height);
        ui.stageEmpty.querySelector('span').textContent='Loading AI model...';await loadModel();status('Analyzing image...',true);await nextFrame();
        if(state.destroyed)return;ui.stageEmpty.hidden=true;status('Ready — tap an object',false);ui.hint.innerHTML='<i class="fa-regular fa-hand-pointer"></i> Tap objek untuk memilih. Gunakan Remove − bila mask mengambil area berlebih.';syncControls();
      }catch(error){status('Model unavailable',false);toast(friendly(error&&error.message),'is-error');ui.stageEmpty.hidden=false;ui.stageEmpty.querySelector('span').textContent=friendly(error&&error.message);}
    }

    function addPoint(clientX,clientY){
      if(!state.modelReady||state.busy)return;if(state.points.length>=MAX_POINTS){toast('Maksimal 8 titik refine agar memori HP tetap aman.','is-error');return;}var point=Core.pointFromRect(clientX,clientY,ui.frame.getBoundingClientRect());if(!point)return;
      state.points.push({x:point.x,y:point.y,label:state.mode==='negative'?0:1});drawPoints();decodeSelection();
    }
    function pointerDown(event){
      if(!state.modelReady)return;ui.stage.setPointerCapture&&ui.stage.setPointerCapture(event.pointerId);state.activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});state.moved=false;
      if(state.activePointers.size===2){var values=Array.from(state.activePointers.values());var dx=values[0].x-values[1].x,dy=values[0].y-values[1].y;state.gesture={distance:Math.hypot(dx,dy),zoom:state.zoom,panX:state.panX,panY:state.panY,midX:(values[0].x+values[1].x)/2,midY:(values[0].y+values[1].y)/2};}
    }
    function pointerMove(event){
      var pointer=state.activePointers.get(event.pointerId);if(!pointer)return;var previousX=pointer.x,previousY=pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;
      if(Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)>7)state.moved=true;
      if(state.activePointers.size>=2&&state.gesture){var values=Array.from(state.activePointers.values()).slice(0,2);var dx=values[0].x-values[1].x,dy=values[0].y-values[1].y;var distance=Math.max(1,Math.hypot(dx,dy));var midX=(values[0].x+values[1].x)/2,midY=(values[0].y+values[1].y)/2;state.zoom=Core.clamp(state.gesture.zoom*(distance/state.gesture.distance),1,4);state.panX=state.gesture.panX+(midX-state.gesture.midX);state.panY=state.gesture.panY+(midY-state.gesture.midY);clampPan();setTransform();event.preventDefault();}
      else if(state.zoom>1&&state.moved){state.panX+=pointer.x-previousX;state.panY+=pointer.y-previousY;clampPan();setTransform();event.preventDefault();}
    }
    function pointerUp(event){
      var pointer=state.activePointers.get(event.pointerId);var wasMulti=state.activePointers.size>1||Boolean(state.gesture);state.activePointers.delete(event.pointerId);if(state.activePointers.size<2)state.gesture=null;
      if(pointer&&!state.moved&&!wasMulti)addPoint(event.clientX,event.clientY);
    }

    function createMaskCanvas(whiteOnBlack){
      var canvas=document.createElement('canvas');canvas.width=state.maskWidth;canvas.height=state.maskHeight;var context=canvas.getContext('2d');var image=context.createImageData(canvas.width,canvas.height);
      for(var i=0;i<state.mask.length;i++){var offset=i*4;if(whiteOnBlack){var value=state.mask[i]?255:0;image.data[offset]=value;image.data[offset+1]=value;image.data[offset+2]=value;image.data[offset+3]=255;}else{image.data[offset]=255;image.data[offset+1]=255;image.data[offset+2]=255;image.data[offset+3]=state.mask[i];}}
      context.putImageData(image,0,0);return canvas;
    }
    async function buildOutput(maskOnly){
      if(!state.mask||!state.bitmap)throw new Error('EMPTY_MASK');var memory=Number(navigator.deviceMemory)||4;var maxPixels=memory<=3?12000000:32000000;var fitted=Core.outputSize(state.width,state.height,maxPixels);
      var box=Core.boundingBox(state.mask,state.maskWidth,state.maskHeight);if(!box)throw new Error('EMPTY_MASK');var crop=Core.cropPlan(box,state.maskWidth,state.maskHeight,fitted.width,fitted.height,ui.crop.checked,.03);
      var canvas=document.createElement('canvas');canvas.width=crop.width;canvas.height=crop.height;var context=canvas.getContext('2d');if(!context)throw new Error('CANVAS_FAILED');
      var maskCanvas=createMaskCanvas(maskOnly);
      if(maskOnly){context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=false;context.drawImage(maskCanvas,crop.x/fitted.width*state.maskWidth,crop.y/fitted.height*state.maskHeight,crop.width/fitted.width*state.maskWidth,crop.height/fitted.height*state.maskHeight,0,0,canvas.width,canvas.height);}
      else{
        var sourceScale=state.width/fitted.width;context.drawImage(state.bitmap,crop.x*sourceScale,crop.y*sourceScale,crop.width*sourceScale,crop.height*sourceScale,0,0,canvas.width,canvas.height);
        context.save();context.globalCompositeOperation='destination-in';context.imageSmoothingEnabled=state.edge==='soft';if(state.edge==='soft')context.filter='blur(1px)';context.drawImage(maskCanvas,crop.x/fitted.width*state.maskWidth,crop.y/fitted.height*state.maskHeight,crop.width/fitted.width*state.maskWidth,crop.height/fitted.height*state.maskHeight,0,0,canvas.width,canvas.height);context.restore();
      }
      var blob=await canvasBlob(canvas,'image/png');var meta={width:canvas.width,height:canvas.height,downscaled:fitted.downscaled};canvas.width=1;canvas.height=1;maskCanvas.width=1;maskCanvas.height=1;return{blob:blob,meta:meta};
    }
    async function extract(){
      status('Creating PNG...',true);ui.extract.disabled=true;
      try{var output=await buildOutput(false);releaseResult();state.resultBlob=output.blob;state.resultUrl=URL.createObjectURL(output.blob);ui.resultImage.src=state.resultUrl;ui.resultMeta.textContent=output.meta.width+'×'+output.meta.height+' · '+formatBytes(output.blob.size)+(output.meta.downscaled?' · disesuaikan untuk memori perangkat':' · resolusi sumber dipertahankan');ui.result.hidden=false;status('PNG ready',false);ui.result.scrollIntoView({behavior:'smooth',block:'nearest'});}
      catch(error){status('Ready — coba lagi',false);toast(friendly(error&&error.message),'is-error');}
    }
    function download(blob,suffix){if(!blob)return;var link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=Core.safeBaseName(state.file&&state.file.name)+'-'+suffix+'.png';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(link.href);},1800);}

    ui.file.addEventListener('change',function(){acceptFile(ui.file.files&&ui.file.files[0]);});
    ui.change.addEventListener('click',function(){ui.file.click();});
    root.querySelectorAll('[data-mode]').forEach(function(button){button.addEventListener('click',function(){state.mode=button.dataset.mode;root.querySelectorAll('[data-mode]').forEach(function(item){item.classList.toggle('is-active',item===button);});});});
    root.querySelectorAll('[data-edge]').forEach(function(button){button.addEventListener('click',function(){state.edge=button.dataset.edge;root.querySelectorAll('[data-edge]').forEach(function(item){item.classList.toggle('is-active',item===button);});releaseResult();});});
    ui.undo.addEventListener('click',function(){state.points.pop();state.pointMasks.pop();drawPoints();decodeSelection();});
    ui.reset.addEventListener('click',function(){state.points=[];state.pointMasks=[];state.mask=null;clearMask();releaseResult();decodeSelection();});
    ui.extract.addEventListener('click',extract);
    ui.download.addEventListener('click',function(){download(state.resultBlob,'cutout');});
    ui.downloadMask.addEventListener('click',async function(){try{status('Creating mask PNG...',true);var output=await buildOutput(true);state.maskBlob=output.blob;download(output.blob,'mask');status('PNG ready',false);}catch(error){status('PNG ready',false);toast(friendly(error&&error.message),'is-error');}});
    ui.crop.addEventListener('change',releaseResult);ui.zoomIn.addEventListener('click',function(){zoomTo(state.zoom+.25);});ui.zoomOut.addEventListener('click',function(){zoomTo(state.zoom-.25);});ui.zoomReset.addEventListener('click',resetTransform);
    ui.stage.addEventListener('pointerdown',pointerDown);ui.stage.addEventListener('pointermove',pointerMove);ui.stage.addEventListener('pointerup',pointerUp);ui.stage.addEventListener('pointercancel',pointerUp);ui.stage.addEventListener('contextmenu',function(event){event.preventDefault();});
    window.addEventListener('resize',layoutFrame,{passive:true});
  };
})();

/* Nexora Image Vectorizer HF9.1 — local VTracer worker */
(function(){
  'use strict';

  var ENGINE_VERSION='1.0.0-alpha.3';
  var CACHE_VERSION='6.3.13-hf9.1';
  var VENDOR_BASE='/assets/vendor/vtracer';

  function loadBytes(path){
    var request=new XMLHttpRequest();
    var separator=String(path).indexOf('?')===-1?'?':'&';
    request.open('GET',String(path)+separator+'v='+CACHE_VERSION,false);
    request.responseType='arraybuffer';
    request.send(null);
    if(!request.response||!((request.status>=200&&request.status<300)||request.status===0))throw new Error('VTRACER_WASM_LOAD_FAILED');
    return new Uint8Array(request.response);
  }

  self.exports=Object.create(null);
  self.__dirname=VENDOR_BASE;
  self.require=function(name){
    if(name==='fs')return {readFileSync:loadBytes};
    throw new Error('VTRACER_MODULE_NOT_ALLOWED');
  };

  try{
    importScripts(VENDOR_BASE+'/vtracer_wasm.js?v='+CACHE_VERSION);
  }catch(error){
    self.postMessage({type:'fatal',code:'VTRACER_BOOT_FAILED',message:error&&error.message||'Mesin VTracer gagal dimuat.'});
    return;
  }

  var engine=self.exports;
  try{delete self.require;delete self.__dirname;}catch(_error){}

  function progress(requestId,value,label){self.postMessage({type:'progress',requestId:requestId,value:value,label:label});}
  function number(value,fallback,min,max){var parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):fallback;}
  function normalizedOptions(input){
    var source=input&&typeof input==='object'?input:{};
    var preset=['bw','poster','photo'].indexOf(source.preset)>=0?source.preset:'poster';
    var mode=['pixel','polygon','spline'].indexOf(source.mode)>=0?source.mode:'spline';
    var clustering=['color-cluster','bw','watershed'].indexOf(source.clustering)>=0?source.clustering:(preset==='bw'?'bw':'color-cluster');
    return {
      preset:preset,
      clustering:clustering,
      hierarchical:source.hierarchical==='stacked'?'stacked':'cutout',
      mode:mode,
      filterSpeckle:Math.round(number(source.filterSpeckle,4,0,64)),
      colorPrecision:Math.round(number(source.colorPrecision,7,1,8)),
      layerDifference:Math.round(number(source.layerDifference,preset==='photo'?48:16,0,255)),
      cornerThreshold:Math.round(number(source.cornerThreshold,preset==='photo'?180:60,0,180)),
      lengthThreshold:number(source.lengthThreshold,4,3.5,10),
      maxIterations:10,
      spliceThreshold:45,
      simplify:number(source.simplify,1.2,0,4),
      pathPrecision:Math.round(number(source.pathPrecision,2,0,6)),
      maxColors:Math.round(number(source.maxColors,preset==='photo'?32:12,2,64)),
      optimize:source.optimize===0?0:(source.optimize===1?1:2),
      binaryThreshold:Math.round(number(source.binaryThreshold,128,0,255)),
      adaptive:source.adaptive!==false,
      watershedDetail:Math.round(number(source.watershedDetail,160,0,255))
    };
  }

  async function decodeForWorker(bytes,mime,maxPixels,maxSide,requestId){
    if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas==='undefined')return null;
    progress(requestId,14,'Mendekode gambar di worker');
    var bitmap=await createImageBitmap(new Blob([bytes],{type:mime||'image/png'}));
    try{
      var width=bitmap.width;var height=bitmap.height;
      var scale=Math.min(1,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
      var outputWidth=Math.max(1,Math.round(width*scale));var outputHeight=Math.max(1,Math.round(height*scale));
      progress(requestId,28,scale<1?'Mengoptimalkan resolusi untuk perangkat':'Menyiapkan pixel warna');
      var canvas=new OffscreenCanvas(outputWidth,outputHeight);var context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
      if(!context)throw new Error('OFFSCREEN_CONTEXT_UNAVAILABLE');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,outputWidth,outputHeight);
      var image=context.getImageData(0,0,outputWidth,outputHeight);
      return {pixels:new Uint8Array(image.data.buffer,image.data.byteOffset,image.data.byteLength),width:outputWidth,height:outputHeight,sourceWidth:width,sourceHeight:height,downscaled:scale<0.999};
    }finally{if(bitmap&&typeof bitmap.close==='function')bitmap.close();}
  }

  async function vectorize(message){
    var requestId=String(message.requestId||'');
    var started=performance.now();
    var bytes=new Uint8Array(message.buffer);
    if(!bytes.length||bytes.length>12*1024*1024)throw Object.assign(new Error('File maksimal 12 MB.'),{code:'VECTOR_FILE_TOO_LARGE'});
    var maxPixels=Math.round(number(message.maxPixels,2800000,500000,6000000));
    var maxSide=Math.round(number(message.maxSide,2400,900,4096));
    var options=normalizedOptions(message.options);
    var decoded=await decodeForWorker(bytes,message.mime,maxPixels,maxSide,requestId);
    progress(requestId,48,'VTracer memetakan warna dan bentuk');
    var svg=decoded?engine.vectorize_rgba(decoded.pixels,decoded.width,decoded.height,options):engine.vectorize_bytes(bytes,options);
    if(typeof svg!=='string'||svg.length<40||!/<svg[\s>]/i.test(svg))throw Object.assign(new Error('VTracer tidak menghasilkan SVG valid.'),{code:'VECTOR_OUTPUT_INVALID'});
    progress(requestId,96,'Mengoptimalkan struktur SVG');
    var pathCount=(svg.match(/<path\b/gi)||[]).length;
    var colorTokens=new Set();
    for(var match of svg.matchAll(/(?:fill|stroke)=["'](#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)["']/gi))colorTokens.add(match[1].toLowerCase());
    return {
      type:'result',requestId:requestId,svg:svg,
      engineVersion:ENGINE_VERSION,durationMs:Math.round(performance.now()-started),
      width:decoded&&decoded.width||null,height:decoded&&decoded.height||null,
      sourceWidth:decoded&&decoded.sourceWidth||message.width||null,sourceHeight:decoded&&decoded.sourceHeight||message.height||null,
      downscaled:Boolean(decoded&&decoded.downscaled),pathCount:pathCount,colorCount:colorTokens.size,
      bytes:new TextEncoder().encode(svg).byteLength,options:options
    };
  }

  self.onmessage=function(event){
    var message=event.data||{};
    if(message.type!=='vectorize')return;
    vectorize(message).then(function(result){self.postMessage(result);}).catch(function(error){
      self.postMessage({type:'error',requestId:String(message.requestId||''),code:error&&error.code||'VECTORIZE_FAILED',message:error&&error.message||'Vectorization gagal.'});
    });
  };

  self.postMessage({type:'ready',engineVersion:ENGINE_VERSION,worker:true});
})();

/* Nexora Smart Cutout worker — local SlimSAM inference through Transformers.js. */
(function(){
  'use strict';

  var LIBRARY_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0';
  var MODEL_ID='Xenova/slimsam-77-uniform';
  var runtime=null,model=null,processor=null,imageInput=null,imageProcessed=null,imageEmbeddings=null;
  var backend='';

  function post(type,data,transfer){self.postMessage(Object.assign({type:type},data||{}),transfer||[]);}
  function dispose(value,seen){
    if(!value)return;seen=seen||new Set();if((typeof value==='object'||typeof value==='function')&&seen.has(value))return;
    if(typeof value==='object'||typeof value==='function')seen.add(value);
    try{if(typeof value.dispose==='function'){value.dispose();return;}}catch(_error){}
    if(Array.isArray(value))value.forEach(function(item){dispose(item,seen);});
    else if(Object.prototype.toString.call(value)==='[object Object]')Object.keys(value).forEach(function(key){dispose(value[key],seen);});
  }
  function releaseImage(){
    dispose(imageEmbeddings);dispose(imageProcessed);dispose(imageInput);
    imageEmbeddings=null;imageProcessed=null;imageInput=null;
  }
  async function releaseAll(){
    releaseImage();
    try{if(model&&typeof model.dispose==='function')await model.dispose();}catch(_error){}
    model=null;processor=null;backend='';
  }
  function progressCallback(event){
    if(!event)return;
    var payload={status:String(event.status||''),file:String(event.file||'')};
    if(Number.isFinite(event.loaded))payload.loaded=event.loaded;
    if(Number.isFinite(event.total)&&event.total>0)payload.total=event.total;
    if(Number.isFinite(event.progress))payload.progress=event.progress;
    post('progress',payload);
  }
  async function loadRuntime(){
    if(runtime)return runtime;
    runtime=await import(LIBRARY_URL);
    runtime.env.allowLocalModels=false;
    runtime.env.allowRemoteModels=true;
    runtime.env.useBrowserCache=true;
    runtime.env.useWasmCache=true;
    runtime.env.cacheKey='nexora-smart-cutout-v1';
    return runtime;
  }
  async function tryModel(device,dtype){
    var api=await loadRuntime();
    var candidate=await api.SamModel.from_pretrained(MODEL_ID,{device:device,dtype:dtype,progress_callback:progressCallback});
    model=candidate;
    var candidateProcessor=await api.AutoProcessor.from_pretrained(MODEL_ID,{progress_callback:progressCallback});
    processor=candidateProcessor;backend=device;
  }
  async function init(preferWebGpu){
    if(model){post('ready',{backend:backend,modelId:MODEL_ID,cached:true});return;}
    post('status',{message:'Loading AI model...'});
    var webGpuError=null;
    if(preferWebGpu&&self.navigator&&navigator.gpu){
      try{await tryModel('webgpu','fp16');}
      catch(error){webGpuError=error;await releaseAll();}
    }
    if(!model){
      post('status',{message:webGpuError?'WebGPU tidak cocok, menyiapkan fallback WASM...':'Menyiapkan fallback WASM...'});
      await tryModel('wasm','q8');
    }
    post('ready',{backend:backend,modelId:MODEL_ID,cached:false});
  }
  async function encode(url,requestId){
    if(!model||!processor)throw new Error('MODEL_NOT_READY');
    releaseImage();
    post('status',{message:'Analyzing image...',requestId:requestId});
    imageInput=await runtime.RawImage.fromURL(url);
    imageProcessed=await processor(imageInput);
    imageEmbeddings=await model.get_image_embeddings(imageProcessed);
    var width=imageInput.width,height=imageInput.height;
    if(imageProcessed.pixel_values){dispose(imageProcessed.pixel_values);delete imageProcessed.pixel_values;}
    dispose(imageInput);imageInput=null;
    post('encoded',{requestId:requestId,width:width,height:height});
  }
  async function decode(points,requestId){
    if(!imageEmbeddings||!imageProcessed)throw new Error('IMAGE_NOT_ENCODED');
    if(!Array.isArray(points)||!points.length){post('mask-cleared',{requestId:requestId});return;}
    post('status',{message:'Selecting object...',requestId:requestId});
    var reshaped=imageProcessed.reshaped_input_sizes[0];
    var pointValues=[];var labelValues=[];
    points.forEach(function(point){pointValues.push(Number(point.x)*reshaped[1],Number(point.y)*reshaped[0]);labelValues.push(BigInt(point.label===0?0:1));});
    var inputPoints=new runtime.Tensor('float32',pointValues,[1,1,points.length,2]);
    var inputLabels=new runtime.Tensor('int64',labelValues,[1,1,points.length]);
    var outputs=null,masks=null,rawMask=null;
    try{
      outputs=await model(Object.assign({},imageEmbeddings,{input_points:inputPoints,input_labels:inputLabels}));
      masks=await processor.post_process_masks(outputs.pred_masks,imageProcessed.original_sizes,imageProcessed.reshaped_input_sizes);
      rawMask=runtime.RawImage.fromTensor(masks[0][0]);
      var scores=Array.from(outputs.iou_scores.data||[]);
      var best=0;for(var i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
      var count=Math.max(1,scores.length);var binary=new Uint8Array(rawMask.width*rawMask.height);var filled=0;
      for(var pixel=0;pixel<binary.length;pixel++)if(rawMask.data[count*pixel+best]){binary[pixel]=255;filled++;}
      if(!filled)throw new Error('EMPTY_MASK');
      post('mask',{requestId:requestId,width:rawMask.width,height:rawMask.height,score:Number(scores[best]||0),data:binary.buffer},[binary.buffer]);
    }finally{
      dispose(inputPoints);dispose(inputLabels);dispose(rawMask);
      if(masks&&masks[0])dispose(masks[0]);
      if(outputs){dispose(outputs.pred_masks);dispose(outputs.iou_scores);}
    }
  }
  function friendlyCode(error){
    var message=String(error&&error.message||error||'');
    if(/out of memory|memory|allocation|bad_alloc/i.test(message))return'OUT_OF_MEMORY';
    if(/EMPTY_MASK/.test(message))return'EMPTY_MASK';
    if(/webgpu|wasm|onnx|model|fetch|network/i.test(message))return'MODEL_FAILED';
    return'INFERENCE_FAILED';
  }

  self.onmessage=async function(event){
    var message=event.data||{};
    try{
      if(message.type==='init')await init(message.preferWebGpu!==false);
      else if(message.type==='encode')await encode(message.url,message.requestId);
      else if(message.type==='decode')await decode(message.points,message.requestId);
      else if(message.type==='reset-image'){releaseImage();post('reset-complete');}
      else if(message.type==='dispose'){await releaseAll();close();}
    }catch(error){post('error',{requestId:message.requestId||0,code:friendlyCode(error)});}
  };
})();

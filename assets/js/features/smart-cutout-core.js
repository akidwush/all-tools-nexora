/* Nexora Smart Cutout — pure geometry and export helpers. */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NexoraSmartCutoutCore=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';

  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

  function fitSize(width,height,maxSide){
    width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);maxSide=Math.max(1,Number(maxSide)||1024);
    var scale=Math.min(1,maxSide/Math.max(width,height));
    return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),scale:scale};
  }

  function outputSize(width,height,maxPixels){
    width=Math.max(1,Math.round(Number(width)||1));height=Math.max(1,Math.round(Number(height)||1));
    maxPixels=Math.max(1,Number(maxPixels)||width*height);
    var scale=Math.min(1,Math.sqrt(maxPixels/(width*height)));
    return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),scale:scale,downscaled:scale<.999};
  }

  function pointFromRect(clientX,clientY,rect){
    if(!rect||rect.width<=0||rect.height<=0)return null;
    return{x:clamp((clientX-rect.left)/rect.width,0,1),y:clamp((clientY-rect.top)/rect.height,0,1)};
  }

  function bestMaskIndex(scores){
    if(!scores||!scores.length)return 0;
    var index=0;
    for(var i=1;i<scores.length;i++)if(Number(scores[i])>Number(scores[index]))index=i;
    return index;
  }

  function boundingBox(mask,width,height){
    if(!mask||!mask.length||width<=0||height<=0)return null;
    var minX=width,minY=height,maxX=-1,maxY=-1;
    for(var y=0;y<height;y++)for(var x=0;x<width;x++)if(mask[y*width+x]){
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
    }
    return maxX<minX?null:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
  }

  function cropPlan(maskBox,maskWidth,maskHeight,outputWidth,outputHeight,crop,paddingRatio){
    if(!crop||!maskBox)return{x:0,y:0,width:outputWidth,height:outputHeight};
    paddingRatio=clamp(Number(paddingRatio)||0,.0,.2);
    var padX=Math.max(2,Math.round(maskBox.width*paddingRatio));
    var padY=Math.max(2,Math.round(maskBox.height*paddingRatio));
    var x0=clamp(maskBox.x-padX,0,maskWidth);
    var y0=clamp(maskBox.y-padY,0,maskHeight);
    var x1=clamp(maskBox.x+maskBox.width+padX,0,maskWidth);
    var y1=clamp(maskBox.y+maskBox.height+padY,0,maskHeight);
    var scaleX=outputWidth/maskWidth,scaleY=outputHeight/maskHeight;
    var x=Math.floor(x0*scaleX),y=Math.floor(y0*scaleY);
    var right=Math.ceil(x1*scaleX),bottom=Math.ceil(y1*scaleY);
    return{x:x,y:y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
  }

  function safeBaseName(name){
    return String(name||'nexora').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'nexora';
  }

  return{clamp:clamp,fitSize:fitSize,outputSize:outputSize,pointFromRect:pointFromRect,bestMaskIndex:bestMaskIndex,boundingBox:boundingBox,cropPlan:cropPlan,safeBaseName:safeBaseName};
});

(function(){
  "use strict";
  if(window.__NEXORA_RUNTIME_OBSERVER__) return;

  var startedAt=Date.now();
  var errors=[];
  var warnings=[];
  var resources=[];
  var longTasks=[];
  var MAX_ITEMS=80;

  function clean(value,max){
    var text="";
    try{text=typeof value==="string"?value:JSON.stringify(value);}catch(_){text=String(value);}
    return text.replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max||600);
  }
  function push(list,item){list.push(item);if(list.length>MAX_ITEMS)list.splice(0,list.length-MAX_ITEMS);}
  function selectorFor(node){
    if(!node||node===window||node===document) return "document";
    if(node.id) return "#"+node.id;
    var name=String(node.tagName||"node").toLowerCase();
    var cls=String(node.className||"").trim().split(/\s+/).filter(Boolean).slice(0,2).join(".");
    return cls?name+"."+cls:name;
  }
  function recordError(kind,message,details){
    push(errors,Object.assign({kind:kind,message:clean(message,700),at:new Date().toISOString()},details||{}));
  }
  function recordWarning(kind,message,details){
    push(warnings,Object.assign({kind:kind,message:clean(message,500),at:new Date().toISOString()},details||{}));
  }

  window.addEventListener("error",function(event){
    var target=event.target;
    if(target&&target!==window){
      var url=target.src||target.href||"";
      recordError("resource","Resource gagal dimuat",{url:clean(url,900),element:selectorFor(target)});
      return;
    }
    recordError("javascript",event.message||"JavaScript error",{
      source:clean(event.filename||"",900),line:event.lineno||null,column:event.colno||null,
      stack:clean(event.error&&event.error.stack||"",1800)
    });
  },true);
  window.addEventListener("unhandledrejection",function(event){
    var reason=event.reason;
    recordError("unhandled-rejection",reason&&reason.message?reason.message:reason,{stack:clean(reason&&reason.stack||"",1800)});
  });
  document.addEventListener("nexora:tool-error",function(event){
    var detail=event.detail||{};
    recordError("tool",detail.reason||"Tool gagal dibuka",{toolId:clean(detail.toolId,80),module:clean(detail.module,100)});
  });

  var originalError=console.error;
  var originalWarn=console.warn;
  console.error=function(){
    try{recordError("console-error",Array.prototype.map.call(arguments,function(item){return clean(item,500);}).join(" "));}catch(_){}
    return originalError.apply(console,arguments);
  };
  console.warn=function(){
    try{recordWarning("console-warning",Array.prototype.map.call(arguments,function(item){return clean(item,400);}).join(" "));}catch(_){}
    return originalWarn.apply(console,arguments);
  };

  if(typeof PerformanceObserver==="function"){
    try{
      var longTaskObserver=new PerformanceObserver(function(list){
        list.getEntries().forEach(function(entry){
          if(entry.duration>=180) push(longTasks,{name:entry.name||"longtask",duration:Math.round(entry.duration),startTime:Math.round(entry.startTime)});
        });
      });
      longTaskObserver.observe({entryTypes:["longtask"]});
    }catch(_){}
  }

  function performanceResources(){
    try{
      return performance.getEntriesByType("resource").slice(-160).map(function(entry){
        return {name:clean(entry.name,900),type:entry.initiatorType||"other",duration:Math.round(entry.duration),transferSize:Number(entry.transferSize||0)};
      });
    }catch(_){return [];}
  }
  function inspectDocument(){
    var doc=document;
    var body=doc.body;
    var docEl=doc.documentElement;
    var brokenImages=Array.prototype.filter.call(doc.images||[],function(image){return image.complete&&image.naturalWidth===0;}).map(function(image){return clean(image.currentSrc||image.src,900);});
    var duplicateIds=[];
    var seen={};
    Array.prototype.forEach.call(doc.querySelectorAll("[id]"),function(node){var id=node.id;if(seen[id]) duplicateIds.push(id);else seen[id]=true;});
    var missingAlt=Array.prototype.filter.call(doc.querySelectorAll("img"),function(image){return !image.hasAttribute("alt");}).length;
    var unlabeledControls=Array.prototype.filter.call(doc.querySelectorAll("input,select,textarea"),function(control){
      if(control.type==="hidden") return false;
      return !control.getAttribute("aria-label")&&!control.getAttribute("aria-labelledby")&&!control.closest("label")&&!(control.id&&doc.querySelector('label[for="'+String(control.id).replace(/["\\]/g,"\\$&")+'"]'));
    }).length;
    var overflow=Math.max(body?body.scrollWidth:0,docEl?docEl.scrollWidth:0)-Math.max(window.innerWidth,docEl?docEl.clientWidth:0);
    return {
      title:clean(doc.title,200),
      readyState:doc.readyState,
      bodyTextLength:body?String(body.innerText||"").trim().length:0,
      brokenImages:brokenImages,
      duplicateIds:Array.from(new Set(duplicateIds)).slice(0,30),
      missingAlt:missingAlt,
      unlabeledControls:unlabeledControls,
      horizontalOverflowPx:Math.max(0,Math.round(overflow)),
      documentHeight:Math.max(body?body.scrollHeight:0,docEl?docEl.scrollHeight:0),
      viewport:{width:window.innerWidth,height:window.innerHeight,devicePixelRatio:window.devicePixelRatio||1}
    };
  }
  function waitForModules(timeoutMs){
    var started=Date.now();
    return new Promise(function(resolve){
      (function poll(){
        if(window.NexoraModules&&window.NexoraModules.manifest) return resolve(window.NexoraModules);
        if(Date.now()-started>timeoutMs) return resolve(null);
        setTimeout(poll,80);
      })();
    });
  }
  async function runModules(){
    var manager=await waitForModules(7000);
    if(!manager) return {available:false,results:[],message:"NexoraModules tidak tersedia."};
    var names=Object.keys(manager.manifest.modules||{});
    var results=[];
    for(var i=0;i<names.length;i++){
      var name=names[i];
      var start=performance.now();
      try{
        await manager.ensure(name);
        results.push({module:name,ok:true,durationMs:Math.round(performance.now()-start)});
      }catch(error){
        results.push({module:name,ok:false,durationMs:Math.round(performance.now()-start),error:clean(error&&error.message||error,500)});
      }
    }
    return {available:true,results:results,passed:results.filter(function(item){return item.ok;}).length,failed:results.filter(function(item){return !item.ok;}).length};
  }
  function snapshot(extra){
    resources=performanceResources();
    var inspection=inspectDocument();
    return {
      version:"6.2.0",
      url:location.href,
      path:location.pathname,
      startedAt:new Date(startedAt).toISOString(),
      capturedAt:new Date().toISOString(),
      durationMs:Date.now()-startedAt,
      errors:errors.slice(),warnings:warnings.slice(),resources:resources,longTasks:longTasks.slice(),inspection:inspection,
      extra:extra||null
    };
  }
  function reset(){errors.length=0;warnings.length=0;resources.length=0;longTasks.length=0;startedAt=Date.now();}

  window.__NEXORA_RUNTIME_OBSERVER__={snapshot:snapshot,reset:reset,runModules:runModules,inspectDocument:inspectDocument};
  window.dispatchEvent(new CustomEvent("nexora:runtime-observer-ready"));
})();

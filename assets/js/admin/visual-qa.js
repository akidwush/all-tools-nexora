(function(){
  "use strict";
  var $=function(selector,root){return (root||document).querySelector(selector);};
  var state={baseline:null,runs:[],capture:null,running:false};
  var viewports={mobile:{width:390,height:844,label:"Mobile 390×844"},tablet:{width:768,height:1024,label:"Tablet 768×1024"},desktop:{width:1440,height:900,label:"Desktop 1440×900"}};

  function escapeHtml(value){return String(value==null?"":value).replace(/[&<>'"]/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char];});}
  function readCookie(name){var item=document.cookie.split(";").map(function(v){return v.trim();}).find(function(v){return v.indexOf(name+"=")===0;});return item?decodeURIComponent(item.slice(name.length+1)):"";}
  function csrfHeaders(){return {"Content-Type":"application/json","X-CSRF-Token":readCookie("nx_admin_csrf")};}
  function formatDate(value){if(!value)return "-";var date=new Date(value);if(Number.isNaN(date.getTime()))return "-";return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(date);}
  function toast(message,type){var stack=$("#toastStack");if(!stack)return;var el=document.createElement("div");el.className="toast "+(type||"success");el.textContent=message;stack.appendChild(el);setTimeout(function(){el.remove();},3800);}
  async function api(url,options){var response=await fetch(url,Object.assign({cache:"no-store",credentials:"same-origin"},options||{}));var data=await response.json().catch(function(){return {};});if(response.status===401){location.replace("/admin/login");throw new Error("Sesi berakhir.");}if(!response.ok||data.ok===false)throw new Error(data.message||data.error||"Permintaan gagal.");return data;}
  function target(){return {route:$("#visualRoute").value,viewport:$("#visualViewport").value};}
  function setBusy(busy,label){state.running=busy;var button=$("#runVisualTest");button.disabled=busy;button.innerHTML=busy?'<i class="fa-solid fa-spinner fa-spin"></i> '+escapeHtml(label||"Menjalankan..."):'<i class="fa-solid fa-play"></i> Jalankan Validasi';$("#setVisualBaseline").disabled=busy||!state.capture;}
  function setProgress(percent,text){var bar=$("#visualProgressBar");bar.style.width=Math.max(0,Math.min(100,percent))+"%";$("#visualProgressText").textContent=text||"";}

  function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  function waitForFrame(frame,timeoutMs){
    return new Promise(function(resolve,reject){
      var settled=false;
      var timer=setTimeout(function(){if(!settled){settled=true;reject(new Error("Halaman uji melewati batas waktu."));}},timeoutMs||18000);
      frame.onload=function(){if(settled)return;settled=true;clearTimeout(timer);resolve();};
      frame.onerror=function(){if(settled)return;settled=true;clearTimeout(timer);reject(new Error("Halaman uji gagal dimuat."));};
    });
  }
  async function waitForObserver(win,timeoutMs){
    var started=Date.now();
    while(Date.now()-started<(timeoutMs||8000)){
      try{if(win.__NEXORA_RUNTIME_OBSERVER__)return win.__NEXORA_RUNTIME_OBSERVER__;}catch(_){}
      await wait(100);
    }
    return null;
  }
  function bytesToBase64(bytes){var binary="";var chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
  function base64ToBytes(value){var binary=atob(value||"");var bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
  async function blobToDataUrl(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=reject;reader.readAsDataURL(blob);});}
  async function urlToDataUrl(url,base){
    try{
      var absolute=new URL(url,base);
      if(!/^https?:$/.test(absolute.protocol))return "";
      var response=await fetch(absolute.href,{credentials:absolute.origin===location.origin?"same-origin":"omit",mode:"cors",cache:"force-cache"});
      if(!response.ok) return "";
      var blob=await response.blob();
      if(!/^image\//i.test(blob.type)||blob.size>2_000_000)return "";
      return await blobToDataUrl(blob);
    }catch(_){return "";}
  }
  function stylesheetText(doc){
    var output=[];
    Array.prototype.forEach.call(doc.styleSheets||[],function(sheet){
      try{
        var rules=sheet.cssRules||[];
        for(var i=0;i<rules.length;i++)output.push(rules[i].cssText);
      }catch(_){}
    });
    return output.join("\n");
  }
  function sanitizeCanvasCss(value,removeAllUrls){
    return String(value||"")
      .replace(/@font-face\s*\{[^}]*\}/gi,"")
      .replace(/(?:-webkit-)?image-set\([^;{}]*\)/gi,"none")
      .replace(/url\(\s*(['"]?)([^)]*?)\1\s*\)/gi,function(match,quote,target){
        var source=String(target||"").trim();
        if(!removeAllUrls&&/^data:/i.test(source))return match;
        return "none";
      });
  }
  async function prepareClone(doc,width,height,strict){
    var clone=doc.documentElement.cloneNode(true);
    clone.setAttribute("xmlns","http://www.w3.org/1999/xhtml");
    var removable="script,noscript,iframe,video,audio,source,object,embed,link[rel=stylesheet],link[rel=preload],meta[http-equiv],base"+(strict?",img,picture,svg,canvas":"");
    Array.prototype.forEach.call(clone.querySelectorAll(removable),function(node){node.remove();});
    Array.prototype.forEach.call(clone.querySelectorAll("[data-nx-visual-ignore],.toast-stack,.modal-backdrop[hidden],#nxModuleToast"),function(node){node.remove();});
    Array.prototype.forEach.call(clone.querySelectorAll("style"),function(node){node.textContent=sanitizeCanvasCss(node.textContent,Boolean(strict));});
    Array.prototype.forEach.call(clone.querySelectorAll("[style]"),function(node){node.setAttribute("style",sanitizeCanvasCss(node.getAttribute("style"),Boolean(strict)));});
    if(strict){
      Array.prototype.forEach.call(clone.querySelectorAll("[src],[srcset],[href]"),function(node){
        if(node.hasAttribute("src"))node.removeAttribute("src");
        if(node.hasAttribute("srcset"))node.removeAttribute("srcset");
        if(node.hasAttribute("href")&&/^(?:image|use)$/i.test(node.tagName))node.removeAttribute("href");
      });
    }
    var originals=Array.prototype.slice.call(doc.images||[]);
    var copies=Array.prototype.slice.call(clone.querySelectorAll("img"));
    for(var i=0;i<Math.min(originals.length,copies.length);i++){
      var source=originals[i].currentSrc||originals[i].src||"";
      var data=source?await urlToDataUrl(source,doc.baseURI):"";
      if(data)copies[i].setAttribute("src",data);
      else if(/^data:image\//i.test(source))copies[i].setAttribute("src",source);
      else{
        copies[i].removeAttribute("src");copies[i].removeAttribute("srcset");
        copies[i].setAttribute("style",(copies[i].getAttribute("style")||"")+";background:#21152d;min-width:20px;min-height:20px;");
      }
    }
    var head=clone.querySelector("head")||clone.insertBefore(document.createElement("head"),clone.firstChild);
    var style=doc.createElement("style");
    style.textContent=sanitizeCanvasCss(stylesheetText(doc),Boolean(strict))+"\nhtml,body{margin:0!important;width:"+width+"px!important;min-width:"+width+"px!important;height:"+height+"px!important;max-height:"+height+"px!important;overflow:hidden!important;}*{animation:none!important;transition:none!important;caret-color:transparent!important;}";
    head.appendChild(style);
    return clone;
  }
  async function renderFrameCanvas(frame,width,height,strict){
    var doc=frame.contentDocument;
    var clone=await prepareClone(doc,width,height,strict);
    var serialized=new XMLSerializer().serializeToString(clone);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><foreignObject width="100%" height="100%">'+serialized+'</foreignObject></svg>';
    var svgBlob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
    var objectUrl=URL.createObjectURL(svgBlob);
    try{
      var image=new Image();
      image.decoding="async";
      image.crossOrigin="anonymous";
      await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(new Error("Renderer screenshot browser gagal."));};image.src=objectUrl;});
      var canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      var context=canvas.getContext("2d",{alpha:false});context.fillStyle="#09040f";context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
      return canvas;
    }finally{URL.revokeObjectURL(objectUrl);}
  }
  function canvasToBlob(canvas){
    return new Promise(function(resolve,reject){
      try{canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error("Screenshot tidak dapat dikompresi."));},"image/jpeg",0.82);}
      catch(error){reject(error);}
    });
  }
  async function captureFrame(frame,width,height){
    var win=frame.contentWindow;
    win.scrollTo(0,0);
    await wait(120);
    var canvas=null;var safeFallback=false;var blob=null;
    try{
      canvas=await renderFrameCanvas(frame,width,height,false);
      blob=await canvasToBlob(canvas);
    }catch(error){
      safeFallback=true;
      canvas=await renderFrameCanvas(frame,width,height,true);
      blob=await canvasToBlob(canvas);
    }
    var digest=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
    var hash=Array.prototype.map.call(new Uint8Array(digest),function(byte){return byte.toString(16).padStart(2,"0");}).join("");
    var mini=document.createElement("canvas");mini.width=32;mini.height=32;var miniContext=mini.getContext("2d",{willReadFrequently:true});miniContext.drawImage(canvas,0,0,32,32);
    var pixels=miniContext.getImageData(0,0,32,32).data;var luminance=new Uint8Array(1024);
    for(var p=0,j=0;p<pixels.length;p+=4,j++)luminance[j]=Math.round((pixels[p]*0.299)+(pixels[p+1]*0.587)+(pixels[p+2]*0.114));
    var thumb=document.createElement("canvas");var ratio=Math.min(1,480/width);thumb.width=Math.max(1,Math.round(width*ratio));thumb.height=Math.max(1,Math.round(height*ratio));thumb.getContext("2d").drawImage(canvas,0,0,thumb.width,thumb.height);
    return {dataUrl:URL.createObjectURL(blob),downloadBlob:blob,thumbnailDataUrl:thumb.toDataURL("image/jpeg",0.66),fingerprint:bytesToBase64(luminance),hash:hash,width:width,height:height,safeFallback:safeFallback};
  }
  function compareFingerprints(current,baseline){
    if(!current||!baseline)return null;
    try{var left=base64ToBytes(current),right=base64ToBytes(baseline);if(left.length!==right.length||!left.length)return null;var total=0;for(var i=0;i<left.length;i++)total+=Math.abs(left[i]-right[i]);return Number(((total/(left.length*255))*100).toFixed(2));}catch(_){return null;}
  }
  function classify(report,difference,threshold){
    var runtimeErrors=(report.errors||[]).filter(function(item){return item.kind!=="resource";}).length;
    var resourceErrors=(report.errors||[]).filter(function(item){return item.kind==="resource";}).length;
    var moduleFailures=report.extra&&report.extra.modules?Number(report.extra.modules.failed||0):0;
    var overflow=Number(report.inspection&&report.inspection.horizontalOverflowPx||0);
    if(runtimeErrors||moduleFailures)return "fail";
    if(resourceErrors>2)return "fail";
    if(difference!=null&&difference>threshold*1.75)return "fail";
    if(resourceErrors||overflow>4||(difference!=null&&difference>threshold)||(report.warnings||[]).length)return "warning";
    return "pass";
  }
  function statusText(status){return {pass:"LULUS",warning:"PERINGATAN",fail:"GAGAL",error:"ERROR"}[status]||status;}
  function renderResult(capture){
    var report=capture.report;var inspection=report.inspection||{};var errors=report.errors||[];var modules=report.extra&&report.extra.modules;var metrics=[
      ["Status",statusText(capture.status)],
      ["Runtime error",errors.filter(function(item){return item.kind!=="resource";}).length],
      ["Resource error",errors.filter(function(item){return item.kind==="resource";}).length],
      ["Modul",modules&&modules.available?(modules.passed+" lulus / "+modules.failed+" gagal"):"Tidak diuji"],
      ["Visual diff",capture.differencePercent==null?"Belum ada baseline":capture.differencePercent+"%"],
      ["Overflow",(inspection.horizontalOverflowPx||0)+" px"]
    ];
    $("#visualMetrics").innerHTML=metrics.map(function(item){return '<div><span>'+escapeHtml(item[0])+'</span><b>'+escapeHtml(item[1])+'</b></div>';}).join("");
    var preview=$("#visualScreenshot");if(preview.src&&preview.src.indexOf("blob:")===0)URL.revokeObjectURL(preview.src);preview.src=capture.screenshot.dataUrl;preview.hidden=false;
    $("#visualResultBadge").className="visual-result-badge "+capture.status;$("#visualResultBadge").textContent=statusText(capture.status);
    var issues=[];
    errors.slice(0,10).forEach(function(item){issues.push({tone:"error",title:item.kind,message:item.message+(item.url?" · "+item.url:"")});});
    if(inspection.brokenImages&&inspection.brokenImages.length)issues.push({tone:"error",title:"Broken image",message:inspection.brokenImages.join(", ")});
    if(inspection.horizontalOverflowPx>4)issues.push({tone:"warning",title:"Horizontal overflow",message:inspection.horizontalOverflowPx+" px melebihi viewport."});
    if(inspection.duplicateIds&&inspection.duplicateIds.length)issues.push({tone:"warning",title:"Duplicate ID",message:inspection.duplicateIds.join(", ")});
    if(modules&&modules.failed)modules.results.filter(function(item){return !item.ok;}).forEach(function(item){issues.push({tone:"error",title:"Module "+item.module,message:item.error||"Gagal dimuat"});});
    $("#visualIssues").innerHTML=issues.length?issues.map(function(item){return '<div class="visual-issue '+item.tone+'"><b>'+escapeHtml(item.title)+'</b><span>'+escapeHtml(item.message)+'</span></div>';}).join(""):'<div class="visual-empty"><i class="fa-solid fa-circle-check"></i><b>Tidak ditemukan masalah fatal</b><span>Runtime, resource, layout, dan modul yang diuji terlihat normal.</span></div>';
    $("#downloadVisualScreenshot").disabled=false;$("#setVisualBaseline").disabled=false;
  }
  function renderHistory(){
    var baseline=state.baseline;
    $("#visualBaselineInfo").innerHTML=baseline?'<div class="baseline-preview">'+(baseline.thumbnail_data_url?'<img src="'+baseline.thumbnail_data_url+'" alt="Baseline visual">':'<span><i class="fa-solid fa-image"></i></span>')+'<div><b>Baseline aktif</b><small>'+escapeHtml(baseline.route)+' · '+escapeHtml(baseline.viewport)+' · toleransi '+escapeHtml(baseline.threshold_percent)+'%</small><em>Diperbarui '+escapeHtml(formatDate(baseline.updated_at))+'</em></div></div>':'<div class="visual-empty compact"><i class="fa-regular fa-image"></i><b>Baseline belum dibuat</b><span>Jalankan validasi lalu simpan screenshot sebagai baseline.</span></div>';
    $("#visualHistory").innerHTML=state.runs.length?state.runs.map(function(item){return '<div class="visual-history-item"><span class="visual-dot '+escapeHtml(item.status)+'"></span><div><b>'+escapeHtml(statusText(item.status))+' · '+escapeHtml(item.route)+'</b><small>'+escapeHtml(item.viewport)+' · diff '+(item.difference_percent==null?"-":escapeHtml(item.difference_percent)+"%")+' · '+escapeHtml(item.runtime_errors)+' runtime error</small></div><time>'+escapeHtml(formatDate(item.created_at))+'</time></div>';}).join(""):'<div class="visual-empty compact"><i class="fa-solid fa-clock-rotate-left"></i><b>Belum ada riwayat</b><span>Hasil validasi berikutnya akan tersimpan di sini.</span></div>';
  }
  async function loadHistory(){
    var current=target();
    try{var result=await api("/api/admin/visual?route="+encodeURIComponent(current.route)+"&viewport="+encodeURIComponent(current.viewport)+"&limit=12");state.baseline=result.baseline||null;state.runs=result.runs||[];renderHistory();}
    catch(error){state.baseline=null;state.runs=[];renderHistory();toast(error.message,"error");}
  }
  async function saveRun(capture){
    var report=capture.report;var errors=report.errors||[];
    return api("/api/admin/visual",{method:"POST",headers:csrfHeaders(),body:JSON.stringify({
      action:"save_run",route:capture.route,viewport:capture.viewport,status:capture.status,
      runtimeErrors:errors.filter(function(item){return item.kind!=="resource";}).length,
      resourceErrors:errors.filter(function(item){return item.kind==="resource";}).length,
      consoleErrors:errors.filter(function(item){return item.kind==="console-error";}).length,
      warnings:(report.warnings||[]).length,differencePercent:capture.differencePercent,
      screenshotHash:capture.screenshot.hash,durationMs:capture.durationMs,report:report
    })});
  }
  async function runTest(){
    if(state.running)return;
    var current=target();var viewport=viewports[current.viewport];var started=performance.now();
    setBusy(true,"Menyiapkan iframe...");setProgress(8,"Memuat "+current.route+" pada "+viewport.label);
    var frame=$("#visualTestFrame");frame.style.width=viewport.width+"px";frame.style.height=viewport.height+"px";frame.setAttribute("width",viewport.width);frame.setAttribute("height",viewport.height);
    try{
      var loadPromise=waitForFrame(frame,22000);
      var join=current.route.indexOf("?")>=0?"&":"?";
      frame.src=current.route+join+"__nexora_visual_test=1&v="+Date.now();
      await loadPromise;setProgress(30,"Menunggu JavaScript dan resource stabil...");await wait(1800);
      var observer=await waitForObserver(frame.contentWindow,9000);
      if(!observer)throw new Error("Runtime observer tidak aktif pada halaman uji.");
      var modules=null;
      if(current.route==="/"&&$("#visualRunModules").checked){setBusy(true,"Menguji modul...");setProgress(48,"Memuat seluruh modul lazy-load...");modules=await observer.runModules();await wait(450);}
      setBusy(true,"Mengambil screenshot...");setProgress(70,"Merender screenshot viewport...");
      var screenshot=await captureFrame(frame,viewport.width,viewport.height);
      var report=observer.snapshot({modules:modules,userAgent:navigator.userAgent,viewportName:current.viewport});
      var difference=state.baseline?compareFingerprints(screenshot.fingerprint,state.baseline.fingerprint):null;
      var threshold=state.baseline?Number(state.baseline.threshold_percent||8):8;
      var status=classify(report,difference,threshold);
      var capture={route:current.route,viewport:current.viewport,status:status,report:report,screenshot:screenshot,differencePercent:difference,durationMs:Math.round(performance.now()-started)};
      state.capture=capture;renderResult(capture);setProgress(90,"Menyimpan hasil validasi...");
      await saveRun(capture);await loadHistory();setProgress(100,"Validasi selesai dalam "+capture.durationMs+" ms.");toast("Visual QA selesai: "+statusText(status),status==="pass"?"success":"error");
    }catch(error){
      console.error("[Visual QA]",error);setProgress(100,"Validasi gagal: "+error.message);$("#visualResultBadge").className="visual-result-badge error";$("#visualResultBadge").textContent="ERROR";$("#visualIssues").innerHTML='<div class="visual-issue error"><b>Visual QA gagal</b><span>'+escapeHtml(error.message)+'</span></div>';toast(error.message,"error");
    }finally{setBusy(false);}
  }
  async function setBaseline(){
    if(!state.capture)return;
    var capture=state.capture;var threshold=Number($("#visualThreshold").value||8);
    var button=$("#setVisualBaseline");button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    try{
      await api("/api/admin/visual",{method:"POST",headers:csrfHeaders(),body:JSON.stringify({action:"set_baseline",route:capture.route,viewport:capture.viewport,width:capture.screenshot.width,height:capture.screenshot.height,fingerprint:capture.screenshot.fingerprint,screenshotHash:capture.screenshot.hash,thumbnailDataUrl:capture.screenshot.thumbnailDataUrl,thresholdPercent:threshold})});
      toast("Baseline visual berhasil disimpan.");await loadHistory();
    }catch(error){toast(error.message,"error");}
    finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-camera-retro"></i> Jadikan Baseline';}
  }
  function downloadScreenshot(){
    if(!state.capture)return;var link=document.createElement("a");link.href=state.capture.screenshot.dataUrl;link.download="nexora-visual-"+state.capture.viewport+"-"+state.capture.route.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")+".jpg";document.body.appendChild(link);link.click();link.remove();
  }
  function bind(){
    $("#runVisualTest").addEventListener("click",runTest);$("#setVisualBaseline").addEventListener("click",setBaseline);$("#downloadVisualScreenshot").addEventListener("click",downloadScreenshot);
    $("#visualRoute").addEventListener("change",function(){state.capture=null;$("#setVisualBaseline").disabled=true;loadHistory();});
    $("#visualViewport").addEventListener("change",function(){state.capture=null;$("#setVisualBaseline").disabled=true;loadHistory();});
    document.addEventListener("nexora:visual-section-open",loadHistory);
  }
  function boot(){if(!$("#visualQaPanel"))return;bind();renderHistory();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();

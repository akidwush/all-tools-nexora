/* Get Code v4 loader target — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 0: nxGetCodeV2RoomScript ===== */
(function(){
  "use strict";

  var API_ENDPOINT="https://api.resellergaming.my.id/tools/getcode?url=";
  var LIVE_AUDIT_ENDPOINT="/api/audit";
  var SITEGRABBER_ENDPOINT="/api/sitegrabber";
  var SITEGRABBER_POLL_MS=3000;
  var LIVE_AUDIT_CHUNK_SIZE=12;
  var LIVE_AUDIT_MAX_ITEMS=120;
  var SOURCE_APP_ORIGIN="https://kaze-extract.netlify.app/";
  var FORCE_HOSTED_SOURCE=false;
  var FAST_ROUTE_KEY="nexora_get_html_fast_route";
  var FAST_REQUEST_LIMIT=12000;
  var NEXORA_NATIVE_FETCH=window.fetch.bind(window);
  var HISTORY_KEY="nexora_get_html_v2_history";
  var STATS_KEY="nexora_get_html_v2_stats";
  var MAX_HISTORY=24;
  var DEFAULT_CODE="// Hasil ekstraksi HTML akan tampil di sini...";

  var overlay=null;
  var stage=null;
  var closeTimer=0;
  var toastTimer=0;
  var sessionTimer=0;
  var processTextTimer=0;
  var processMessageIndex=0;
  var processRatio=0;
  var sessionStart=Date.now();
  var activeController=null;
  var liveAuditController=null;
  var liveAuditRunning=false;
  var currentHtml="";
  var currentUrl="";
  var currentReport=null;
  var currentDevice="desktop";
  var previewVisible=false;
  var hostedSourceReady=false;
  var lastFastRoute="Multi Server";
  var historyItems=[];
  var stats={total:0,success:0,fail:0};
  var siteGrabberPollTimer=0;
  var siteGrabberJobId="";
  var siteGrabberReport=null;
  var elementCache={};
  var PROCESS_MESSAGES=[
    "Establishing secure connection...",
    "Menghubungkan jaringan server Nexora...",
    "Membuka jalur ekstraksi tercepat...",
    "Menguji respons dari beberapa wilayah...",
    "Memvalidasi source HTML...",
    "Menolak halaman error dan respons kosong...",
    "Menyusun source dan metadata...",
    "Menyiapkan hasil ekstraksi..."
  ];

  function byId(id){
    if(elementCache[id] && document.documentElement.contains(elementCache[id])) return elementCache[id];
    elementCache[id]=document.getElementById(id);
    return elementCache[id];
  }

  function handleHostedSourceLoad(){
    var frame=byId("nxgcHostedSourceFrame");
    if(!frame || frame.dataset.sourceStarted!=="1") return;
    hostedSourceReady=true;
    var loader=byId("nxgcHostedLoader");
    if(loader) loader.classList.add("hidden");
    setTopStatus("ready","Source server ready");
  }

  function activateHostedSourceMode(){
    var source=byId("nxgcHostedSource");
    var frame=byId("nxgcHostedSourceFrame");
    var loader=byId("nxgcHostedLoader");
    if(!stage || !source || !frame) return;
    stage.classList.add("nxgc-hosted-active");
    source.classList.add("active");
    if(loader && !hostedSourceReady) loader.classList.remove("hidden");
    if(frame.dataset.sourceStarted!=="1"){
      frame.dataset.sourceStarted="1";
      frame.src=SOURCE_APP_ORIGIN;
    }
  }

  function warmFastExtractor(){
    [
      "https://api.resellergaming.my.id",
      "https://test.cors.workers.dev",
      "https://cors-anyway.huskymobile.com",
      "https://api.allorigins.win",
      "https://api.microlink.io",
      "https://r.jina.ai",
      "https://eu.r.jina.ai",
      "https://proxy.corsfix.com"
    ].forEach(function(origin){
      if(document.querySelector('link[data-nxgc-warm="'+origin+'"]')) return;
      var preconnect=document.createElement("link");
      preconnect.rel="preconnect";
      preconnect.href=origin;
      preconnect.crossOrigin="anonymous";
      preconnect.dataset.nxgcWarm=origin;
      document.head.appendChild(preconnect);
    });
  }

  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(character){
      return {
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
      }[character];
    });
  }

  function safeStorageRead(key,fallback){
    try{
      var raw=localStorage.getItem(key);
      if(!raw) return fallback;
      var parsed=JSON.parse(raw);
      return parsed==null?fallback:parsed;
    }catch(error){
      return fallback;
    }
  }

  function safeStorageWrite(key,value){
    try{
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    }catch(error){
      return false;
    }
  }

  function formatBytes(bytes){
    var size=Number(bytes)||0;
    if(size>=1024*1024) return (size/(1024*1024)).toFixed(2)+" MB";
    if(size>=1024) return (size/1024).toFixed(1)+" KB";
    return size+" B";
  }

  function formatDate(timestamp){
    try{
      return new Date(timestamp).toLocaleString("id-ID",{
        day:"2-digit",
        month:"short",
        hour:"2-digit",
        minute:"2-digit"
      });
    }catch(error){
      return "";
    }
  }

  function fileNameFromUrl(url){
    var host="source";
    try{
      host=new URL(url).hostname.replace(/^www\./i,"").replace(/[^a-z0-9.-]+/gi,"-")||"source";
    }catch(error){}
    var now=new Date();
    var stamp=[
      now.getFullYear(),
      String(now.getMonth()+1).padStart(2,"0"),
      String(now.getDate()).padStart(2,"0"),
      "-",
      String(now.getHours()).padStart(2,"0"),
      String(now.getMinutes()).padStart(2,"0")
    ].join("");
    return host+"-"+stamp+".html";
  }

  function normalizeUrl(rawValue){
    var value=String(rawValue||"").trim();
    if(!value) throw new Error("Masukkan URL website terlebih dahulu.");
    if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value="https://"+value;
    var parsed;
    try{
      parsed=new URL(value);
    }catch(error){
      throw new Error("Format URL tidak valid.");
    }
    if(parsed.protocol!=="https:" && parsed.protocol!=="http:"){
      throw new Error("URL harus menggunakan protokol HTTP atau HTTPS.");
    }
    if(!parsed.hostname) throw new Error("Nama domain pada URL tidak ditemukan.");
    parsed.hash="";
    return parsed.href;
  }

  function showToast(message,type){
    var toast=byId("nxgcToast");
    if(!toast) return;
    clearTimeout(toastTimer);
    toast.className="nxgc-toast "+(type==="fail"?"fail":"success");
    toast.innerHTML='<i class="fas '+(type==="fail"?"fa-circle-exclamation":"fa-circle-check")+'"></i><span>'+escapeHtml(message)+'</span>';
    requestAnimationFrame(function(){toast.classList.add("show");});
    toastTimer=setTimeout(function(){toast.classList.remove("show");},2600);
  }

  function setTopStatus(state,title){
    var status=byId("nxGetCodeTopStatus");
    if(!status) return;
    status.title=title||"Nexora Extractor";
    if(state==="loading"){
      status.style.color="#c084fc";
      status.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
    }else if(state==="error"){
      status.style.color="#fb7185";
      status.innerHTML='<i class="fas fa-triangle-exclamation"></i>';
    }else{
      status.style.color="#4ade80";
      status.innerHTML='<i class="fas fa-circle-check"></i>';
    }
  }

  function updateProcessRatio(value){
    processRatio=Math.max(0,Math.min(100,Math.round(Number(value)||0)));
    var loaderRatio=byId("nxgcLoaderRatio");
    var brandRatio=byId("nxgcBrandRatio");
    var resultRatio=byId("nxgcRatioChip");
    if(loaderRatio) loaderRatio.textContent=processRatio+"%";
    if(brandRatio) brandRatio.textContent="RATIO "+processRatio+"%";
    if(resultRatio){
      resultRatio.innerHTML='<i class="fas fa-gauge-high"></i> RATIO '+processRatio+'%';
    }
  }

  function rotateProcessText(immediateMessage){
    var text=byId("nxgcLoaderText");
    if(!text) return;
    var nextMessage=immediateMessage || PROCESS_MESSAGES[processMessageIndex%PROCESS_MESSAGES.length];
    text.classList.add("swap");
    setTimeout(function(){
      text.textContent=nextMessage;
      text.classList.remove("swap");
    },145);
  }

  function startProcessRotation(firstMessage){
    clearInterval(processTextTimer);
    processMessageIndex=0;
    processRatio=8;
    updateProcessRatio(processRatio);
    rotateProcessText(firstMessage || PROCESS_MESSAGES[0]);
    processTextTimer=setInterval(function(){
      processMessageIndex=(processMessageIndex+1)%PROCESS_MESSAGES.length;
      rotateProcessText(PROCESS_MESSAGES[processMessageIndex]);
      if(processRatio<92){
        processRatio=Math.min(92,processRatio+(processMessageIndex%2===0?8:6));
        updateProcessRatio(processRatio);
      }
    },320);
  }

  function finishProcessRotation(success){
    clearInterval(processTextTimer);
    processTextTimer=0;
    if(success){
      updateProcessRatio(100);
      rotateProcessText("Extraction completed · ratio 100%");
    }else{
      updateProcessRatio(0);
      rotateProcessText("Extraction failed · periksa koneksi");
    }
  }

  function setLoading(loading,message){
    var loader=byId("nxgcLoader");
    var button=byId("nxgcExtractButton");
    if(loader){
      loader.classList.toggle("show",!!loading);
      var text=byId("nxgcLoaderText");
      if(text) text.textContent=message||"Menghubungkan ke mesin ekstraksi...";
    }
    if(button){
      button.disabled=!!loading;
      button.innerHTML=loading
        ?'<i class="fas fa-spinner fa-spin"></i><span>Mengekstrak...</span>'
        :'<i class="fas fa-code"></i><span>Extract HTML</span>';
    }
    if(loading){
      setTopStatus("loading","Extraction in progress");
    }else{
      var resultStatus=byId("nxgcStatusChip");
      if(!resultStatus || !resultStatus.classList.contains("fail")){
        setTopStatus("ready","Extractor ready");
      }
    }
  }

  function updateStats(){
    var total=byId("nxgcStatTotal");
    var success=byId("nxgcStatSuccess");
    var fail=byId("nxgcStatFail");
    var session=byId("nxgcStatSession");
    if(total) total.textContent=String(Number(stats.total)||0);
    if(success) success.textContent=String(Number(stats.success)||0);
    if(fail) fail.textContent=String(Number(stats.fail)||0);
    if(session){
      var elapsed=Math.max(0,Math.floor((Date.now()-sessionStart)/60000));
      session.textContent=elapsed+"m";
    }
  }

  function saveStats(){
    safeStorageWrite(STATS_KEY,stats);
    updateStats();
  }

  function incrementStats(type){
    stats.total=(Number(stats.total)||0)+1;
    if(type==="success") stats.success=(Number(stats.success)||0)+1;
    else stats.fail=(Number(stats.fail)||0)+1;
    saveStats();
  }

  function renderHistory(){
    var list=byId("nxgcHistoryList");
    var count=byId("nxgcHistoryCount");
    if(count) count.textContent=String(historyItems.length);
    if(!list) return;
    if(!historyItems.length){
      list.innerHTML='<div class="nxgc-history-empty"><i class="fas fa-clock-rotate-left"></i>&nbsp; Belum ada riwayat ekstraksi.</div>';
      return;
    }
    list.innerHTML=historyItems.map(function(item){
      var success=item.status==="success";
      var meta=[
        success?"BERHASIL":"GAGAL",
        formatDate(item.time),
        item.size?formatBytes(item.size):"",
        item.lines?item.lines+" baris":""
      ].filter(Boolean).join(" · ");
      return ''+
        '<article class="nxgc-history-item '+(success?"success":"fail")+'" data-history-id="'+escapeHtml(item.id)+'">'+
          '<div class="nxgc-history-item-icon"><i class="fas '+(success?"fa-code":"fa-triangle-exclamation")+'"></i></div>'+
          '<div class="nxgc-history-copy">'+
            '<div class="nxgc-history-url" title="'+escapeHtml(item.url)+'">'+escapeHtml(item.url)+'</div>'+
            '<div class="nxgc-history-meta">'+escapeHtml(meta)+'</div>'+
          '</div>'+
          '<div class="nxgc-history-actions">'+
            '<button type="button" data-nxgc-retry="'+escapeHtml(item.id)+'" title="Ekstrak ulang"><i class="fas fa-rotate-right"></i></button>'+
            '<button type="button" data-nxgc-remove="'+escapeHtml(item.id)+'" title="Hapus riwayat"><i class="fas fa-trash"></i></button>'+
          '</div>'+
        '</article>';
    }).join("");
  }

  function saveHistory(){
    safeStorageWrite(HISTORY_KEY,historyItems);
    renderHistory();
  }

  function addHistory(url,status,size,lines,message){
    historyItems.unshift({
      id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),
      url:url,
      status:status,
      size:Number(size)||0,
      lines:Number(lines)||0,
      message:String(message||""),
      time:Date.now()
    });
    if(historyItems.length>MAX_HISTORY) historyItems=historyItems.slice(0,MAX_HISTORY);
    saveHistory();
  }

  function setResultMeta(status,size,lines){
    var statusChip=byId("nxgcStatusChip");
    var ratioChip=byId("nxgcRatioChip");
    var sizeChip=byId("nxgcSizeChip");
    var linesChip=byId("nxgcLinesChip");
    if(statusChip){
      statusChip.className="nxgc-chip "+(status==="success"?"success":status==="error"?"fail":"");
      statusChip.innerHTML='<i class="fas '+(status==="success"?"fa-check":status==="error"?"fa-xmark":"fa-minus")+'"></i> '+(status==="success"?"SUCCESS":status==="error"?"FAILED":"IDLE");
    }
    if(ratioChip){
      ratioChip.className="nxgc-chip "+(status==="success"?"success":status==="error"?"fail":"");
      ratioChip.innerHTML='<i class="fas fa-gauge-high"></i> RATIO '+(status==="success"?"100%":status==="error"?"0%":"--");
    }
    if(sizeChip) sizeChip.innerHTML='<i class="fas fa-database"></i> '+(size?formatBytes(size):"0 B");
    if(linesChip) linesChip.innerHTML='<i class="fas fa-align-left"></i> '+(lines?lines+" LINES":"0 LINES");
  }

  function setLatency(milliseconds,state){
    var latencyChip=byId("nxgcLatencyChip");
    if(!latencyChip) return;
    latencyChip.className="nxgc-chip "+(state==="success"?"success":state==="error"?"fail":"");
    latencyChip.innerHTML='<i class="fas fa-bolt"></i> '+(
      Number.isFinite(milliseconds)
        ?Math.max(1,Math.round(milliseconds))+" MS"
        :"-- MS"
    );
  }

  function setCodeOutput(code,status){
    var output=byId("nxgcCodeOutput");
    var result=byId("nxgcResult");
    var codeInfo=byId("nxgcCodeInfo");
    var copy=byId("nxgcCopyButton");
    var download=byId("nxgcDownloadButton");
    var preview=byId("nxgcPreviewButton");
    if(output) output.textContent=code||DEFAULT_CODE;
    if(result) result.classList.add("show");
    if(codeInfo){
      codeInfo.innerHTML='<span class="nxgc-code-dots"><i></i><i></i><i></i></span><span>'+(status==="success"?"SOURCE.HTML":"EXTRACTION.LOG")+'</span>';
    }
    var enabled=status==="success" && !!code;
    if(copy) copy.disabled=!enabled;
    if(download) download.disabled=!enabled;
    if(preview) preview.disabled=!enabled;
  }

  function clearPreviewFrame(){
    var frame=byId("nxgcPreviewFrame");
    var empty=byId("nxgcPreviewEmpty");
    var deviceFrame=byId("nxgcDeviceFrame");
    if(frame){
      frame.srcdoc="";
      frame.style.display="none";
    }
    if(deviceFrame) deviceFrame.style.display="none";
    if(empty) empty.style.display="flex";
  }

  function clearResult(silent){
    currentHtml="";
    currentUrl="";
    clearSourceReport();
    clearInterval(processTextTimer);
    processTextTimer=0;
    processRatio=0;
    var result=byId("nxgcResult");
    var preview=byId("nxgcPreview");
    var output=byId("nxgcCodeOutput");
    var copy=byId("nxgcCopyButton");
    var download=byId("nxgcDownloadButton");
    var previewButton=byId("nxgcPreviewButton");
    if(result) result.classList.remove("show");
    if(preview) preview.classList.remove("show");
    previewVisible=false;
    if(output) output.textContent=DEFAULT_CODE;
    if(copy) copy.disabled=true;
    if(download) download.disabled=true;
    if(previewButton){
      previewButton.disabled=true;
      previewButton.classList.remove("active");
      previewButton.innerHTML='<i class="fas fa-display"></i><span>Preview</span>';
    }
    setResultMeta("idle",0,0);
    setLatency(NaN,"idle");
    var brandRatio=byId("nxgcBrandRatio");
    var loaderRatio=byId("nxgcLoaderRatio");
    if(brandRatio) brandRatio.textContent="RATIO --";
    if(loaderRatio) loaderRatio.textContent="0%";
    updateFastRouteBadge("12 SERVERS READY","");
    clearPreviewFrame();
    if(!silent) showToast("Hasil ekstraksi dibersihkan.","success");
  }

  function extractHtmlFromPayload(payload){
    if(payload==null) return "";
    if(typeof payload==="string"){
      var trimmed=payload.trim();
      if(!trimmed) return "";
      if(trimmed.charAt(0)==="{" || trimmed.charAt(0)==="["){
        try{
          var parsed=JSON.parse(trimmed);
          var parsedResult=extractHtmlFromPayload(parsed);
          if(parsedResult) return parsedResult;
        }catch(error){}
      }
      return payload;
    }
    if(typeof payload!=="object") return "";
    var candidates=[
      payload.result && payload.result.html,
      payload.result && payload.result.source,
      payload.result && payload.result.code,
      typeof payload.result==="string"?payload.result:"",
      payload.data && payload.data.html,
      payload.data && payload.data.source,
      payload.data && payload.data.code,
      typeof payload.data==="string"?payload.data:"",
      payload.html,
      payload.source,
      payload.code,
      payload.content
    ];
    for(var i=0;i<candidates.length;i++){
      if(typeof candidates[i]==="string" && candidates[i].trim()) return candidates[i];
    }
    return "";
  }

  function extractErrorMessage(payload,fallback){
    if(payload && typeof payload==="object"){
      return String(
        payload.message ||
        payload.error ||
        (payload.result && payload.result.message) ||
        fallback ||
        "Server tidak mengembalikan source HTML."
      );
    }
    return String(fallback||"Server tidak mengembalikan source HTML.");
  }

  async function readApiResponse(response){
    var rawText=await response.text();
    var data=rawText;
    try{
      data=JSON.parse(rawText);
    }catch(error){}
    if(!response.ok){
      throw new Error(extractErrorMessage(data,"HTTP "+response.status));
    }
    return data;
  }

  function updateFastRouteBadge(label,state){
    var badge=byId("nxgcServerPill");
    if(!badge) return;
    badge.classList.remove("success","error");
    if(state) badge.classList.add(state);
    badge.innerHTML='<i class="fas fa-circle"></i> '+String(label||"Multi Server");
  }

  function fastBridgeHeaders(){
    return {
      "Accept":"application/json,text/plain,*/*",
      "x-cors-headers":JSON.stringify({
        "Origin":SOURCE_APP_ORIGIN.replace(/\/$/,""),
        "Referer":SOURCE_APP_ORIGIN
      })
    };
  }

  function htmlBridgeHeaders(){
    return {
      "Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      "x-cors-headers":JSON.stringify({
        "Origin":SOURCE_APP_ORIGIN.replace(/\/$/,""),
        "Referer":SOURCE_APP_ORIGIN
      })
    };
  }

  function jinaReaderHeaders(){
    return {
      "Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      "X-Return-Format":"html",
      "X-Engine":"direct",
      "X-No-Cache":"true",
      "X-Timeout":"8"
    };
  }

  function encodeForCloudflareBridge(url){
    return encodeURIComponent(encodeURIComponent(url));
  }

  function getFastRoutes(apiUrl,targetUrl){
    var routes=[
      {
        id:"source-direct",
        label:"SOURCE DIRECT",
        kind:"json",
        delay:0,
        url:apiUrl,
        headers:{"Accept":"application/json,text/plain,*/*"}
      },
      {
        id:"target-direct",
        label:"TARGET DIRECT",
        kind:"html",
        delay:0,
        url:targetUrl,
        headers:{"Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"}
      },
      {
        id:"microlink-html",
        label:"HTML RENDER",
        kind:"html",
        delay:40,
        url:"https://api.microlink.io/?url="+encodeURIComponent(targetUrl)+"&data.html.selector=html&data.html.attr=html&meta=false&embed=html",
        headers:{"Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"}
      },
      {
        id:"jina-global",
        label:"GLOBAL READER",
        kind:"html",
        delay:90,
        url:"https://r.jina.ai/"+targetUrl,
        headers:jinaReaderHeaders()
      },
      {
        id:"source-edge-sin",
        label:"SOURCE EDGE ASIA",
        kind:"json",
        delay:130,
        url:"https://cors-anyway.huskymobile.com/?"+encodeForCloudflareBridge(apiUrl),
        headers:fastBridgeHeaders()
      },
      {
        id:"target-edge-sin",
        label:"TARGET EDGE ASIA",
        kind:"html",
        delay:170,
        url:"https://cors-anyway.huskymobile.com/?"+encodeForCloudflareBridge(targetUrl),
        headers:htmlBridgeHeaders()
      },
      {
        id:"source-edge-cf",
        label:"SOURCE BRIDGE",
        kind:"json",
        delay:220,
        url:"https://test.cors.workers.dev/?"+encodeForCloudflareBridge(apiUrl),
        headers:fastBridgeHeaders()
      },
      {
        id:"target-edge-cf",
        label:"TARGET BRIDGE",
        kind:"html",
        delay:260,
        url:"https://test.cors.workers.dev/?"+encodeForCloudflareBridge(targetUrl),
        headers:htmlBridgeHeaders()
      },
      {
        id:"target-allorigins",
        label:"RAW HTML BACKUP",
        kind:"html",
        delay:340,
        url:"https://api.allorigins.win/raw?url="+encodeURIComponent(targetUrl),
        headers:{"Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"}
      },
      {
        id:"source-allorigins",
        label:"SOURCE RAW BACKUP",
        kind:"json",
        delay:380,
        url:"https://api.allorigins.win/raw?url="+encodeURIComponent(apiUrl),
        headers:{"Accept":"application/json,text/plain,*/*"}
      },
      {
        id:"target-corsfix",
        label:"TARGET RESCUE",
        kind:"html",
        delay:460,
        url:"https://proxy.corsfix.com/?"+encodeURIComponent(targetUrl),
        headers:{"Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"}
      },
      {
        id:"jina-eu",
        label:"EU READER BACKUP",
        kind:"html",
        delay:2400,
        url:"https://eu.r.jina.ai/"+targetUrl,
        headers:jinaReaderHeaders()
      }
    ];

    var preferred="";
    try{preferred=sessionStorage.getItem(FAST_ROUTE_KEY)||"";}catch(error){}
    if(preferred){
      routes.forEach(function(route){
        if(route.id===preferred) route.delay=0;
      });
    }
    return routes;
  }

  function waitFastRoute(delay,signal){
    if(!delay) return Promise.resolve();
    return new Promise(function(resolve,reject){
      var timer=setTimeout(resolve,delay);
      if(signal){
        signal.addEventListener("abort",function(){
          clearTimeout(timer);
          reject(new Error("Request dibatalkan."));
        },{once:true});
      }
    });
  }

  function isRejectedServerPage(rawText){
    var text=String(rawText||"").toLowerCase();
    if(!text) return true;
    return (
      text.indexOf("cloudflare-cors-anywhere")!==-1 ||
      text.indexOf("<title>just a moment")!==-1 ||
      text.indexOf("attention required! | cloudflare")!==-1 ||
      text.indexOf("<h1>site unavailable</h1>")!==-1 ||
      text.indexOf("origin dns error")!==-1 ||
      text.indexOf("error code: 1027")!==-1 ||
      text.indexOf("<title>502 bad gateway")!==-1 ||
      text.indexOf("<title>503 service unavailable")!==-1 ||
      text.indexOf("not found - request id:")!==-1
    );
  }

  function looksLikeHtml(rawText){
    var text=String(rawText||"").trim();
    if(text.length<12) return false;
    return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<(?:script|style|main|div|section|article|header|footer|nav|form|svg)[\s>]/i.test(text);
  }

  function normalizeHtmlDocument(rawText){
    var html=String(rawText||"").trim();
    if(/<html[\s>]/i.test(html)) return html;
    if(/<head[\s>]|<body[\s>]/i.test(html)){
      return "<!DOCTYPE html>\n<html>\n"+html+"\n</html>";
    }
    return "<!DOCTYPE html>\n<html>\n<head><meta charset=\"UTF-8\"></head>\n<body>\n"+html+"\n</body>\n</html>";
  }

  function normalizeFastPayload(rawText,route){
    var text=String(rawText||"").trim();
    if(!text) throw new Error("Server mengirim respons kosong.");
    if(isRejectedServerPage(text)){
      throw new Error("Server mengirim halaman error.");
    }

    if(route && route.kind==="html"){
      if(!looksLikeHtml(text)){
        throw new Error("Respons tidak berisi dokumen HTML.");
      }
      return {
        status:true,
        result:{html:normalizeHtmlDocument(text)},
        engine:route.label
      };
    }

    var payload;
    try{
      payload=JSON.parse(text);
    }catch(error){
      throw new Error("Respons server bukan JSON ekstraksi.");
    }

    if(payload && typeof payload==="object" && typeof payload.contents==="string"){
      try{payload=JSON.parse(payload.contents);}catch(error){}
    }

    var hasStatus=payload && typeof payload==="object" &&
      Object.prototype.hasOwnProperty.call(payload,"status");
    var extractedHtml=extractHtmlFromPayload(payload);
    var hasResult=Boolean(extractedHtml);
    var hasMessage=payload && typeof payload==="object" &&
      Boolean(payload.message || payload.error);

    if(!hasStatus && !hasResult && !hasMessage){
      throw new Error("Format respons mesin tidak dikenali.");
    }
    if(!hasResult && payload && (payload.status===false || payload.status==="false")){
      throw new Error(extractErrorMessage(payload,"Server sumber gagal mengekstrak HTML."));
    }
    if(hasResult && !looksLikeHtml(extractedHtml)){
      throw new Error("Hasil server bukan source HTML valid.");
    }
    if(hasResult){
      payload.status=true;
      if(!payload.result || typeof payload.result!=="object"){
        payload.result={html:extractedHtml};
      }else if(!payload.result.html){
        payload.result.html=extractedHtml;
      }
    }
    return payload;
  }

  async function runFastRoute(route,signal){
    await waitFastRoute(route.delay,signal);
    if(signal && signal.aborted) throw new Error("Request dibatalkan.");

    rotateProcessText("Fast lane · "+route.label);
    var response=await NEXORA_NATIVE_FETCH(route.url,{
      method:"GET",
      mode:"cors",
      cache:"no-store",
      credentials:"omit",
      redirect:"follow",
      headers:route.headers,
      signal:signal
    });
    var rawText=await response.text();
    if(!response.ok){
      throw new Error(route.label+" HTTP "+response.status);
    }
    return normalizeFastPayload(rawText,route);
  }

  function fetchNexoraSourcePayload(apiUrl,targetUrl){
    var routes=getFastRoutes(apiUrl,targetUrl);
    var controller=typeof AbortController!=="undefined"
      ?new AbortController()
      :null;
    var signal=controller?controller.signal:undefined;
    var pending=routes.length;
    var failures=[];
    var settled=false;
    activeController=controller;

    updateFastRouteBadge("RACING "+routes.length+" SERVERS","");

    return new Promise(function(resolve,reject){
      var timeout=setTimeout(function(){
        if(settled) return;
        settled=true;
        if(controller) controller.abort();
        updateFastRouteBadge("TIMEOUT","error");
        reject(new Error("Mesin ekstraksi melewati batas "+Math.round(FAST_REQUEST_LIMIT/1000)+" detik."));
      },FAST_REQUEST_LIMIT);

      routes.forEach(function(route){
        runFastRoute(route,signal).then(function(payload){
          if(settled) return;
          settled=true;
          clearTimeout(timeout);
          lastFastRoute=route.label;
          try{sessionStorage.setItem(FAST_ROUTE_KEY,route.id);}catch(error){}
          updateFastRouteBadge(route.label,"success");
          if(controller) controller.abort();
          resolve(payload);
        }).catch(function(error){
          failures.push(route.label+": "+String(error && error.message?error.message:error));
          pending-=1;
          if(!settled && pending===0){
            settled=true;
            clearTimeout(timeout);
            updateFastRouteBadge("SERVER FAILED","error");
            reject(new Error(
              failures.length
                ?"Semua "+routes.length+" server gagal. "+failures.slice(0,3).join(" | ")
                :"Semua jalur ekstraksi gagal."
            ));
          }
        });
      });
    });
  }

  async function executeExtraction(urlOverride){
    var input=byId("nxgcTargetUrl");
    var raw=String(urlOverride || (input?input.value:"")).trim();

    if(!raw){
      showToast("Masukkan URL target dengan awalan https://","fail");
      if(input) input.focus();
      return;
    }

    if(!raw.startsWith("https://")){
      showToast("Sama seperti HTML sumber: hanya URL HTTPS yang dapat diekstrak.","fail");
      if(input) input.focus();
      return;
    }

    try{
      new URL(raw);
    }catch(error){
      showToast("Format URL target tidak valid.","fail");
      if(input) input.focus();
      return;
    }

    if(input) input.value=raw;
    currentUrl=raw;
    currentHtml="";
    clearSourceReport();

    setLoading(true,"Membuka 12 jalur ekstraksi Nexora...");
    startProcessRotation("Establishing secure connection...");
    var requestStarted=typeof performance!=="undefined" && performance.now
      ?performance.now()
      :Date.now();

    var result=byId("nxgcResult");
    var preview=byId("nxgcPreview");
    if(result) result.classList.remove("show");
    if(preview) preview.classList.remove("show");
    previewVisible=false;

    try{
      var api=API_ENDPOINT+encodeURIComponent(raw);
      var data=await fetchNexoraSourcePayload(api,raw);
      var requestFinished=typeof performance!=="undefined" && performance.now
        ?performance.now()
        :Date.now();
      setLatency(requestFinished-requestStarted,"success");

      if(data && (data.status===true || data.status==="true")){
        var html=data.result && data.result.html ? data.result.html : "";

        if(!html && data.result && typeof data.result==="object"){
          html=JSON.stringify(data.result,null,2);
        }

        if(!html && data.data){
          html=typeof data.data==="string"
            ?data.data
            :JSON.stringify(data.data,null,2);
        }

        if(!html){
          html="// No code extracted.";
        }

        currentHtml=html;
        try{
          renderSourceReport(analyzeExtractedSource(html,raw));
        }catch(reportError){
          clearSourceReport();
          console.warn("[getcode-report]",reportError && reportError.message?reportError.message:reportError);
        }

        var size=new Blob([html],{type:"text/html"}).size;
        var lines=html.split("\n").length;

        setCodeOutput(html,"success");
        setResultMeta("success",size,lines);
        finishProcessRotation(true);
        incrementStats("success");
        addHistory(raw,"success",size,lines,"");
        setTopStatus("ready","Extraction completed");
        showToast("HTML berhasil diekstrak: "+lines+" baris.","success");

        var output=byId("nxgcCodeOutput");
        if(output) output.scrollTop=0;
      }else{
        var message=data && data.message
          ?String(data.message)
          :"Failed to extract code from resource";
        var failureCode="// ERROR: "+message+"\n// URL: "+raw;

        setCodeOutput(failureCode,"error");
        setResultMeta("error",0,0);
        finishProcessRotation(false);
        incrementStats("fail");
        addHistory(raw,"fail",0,0,message);
        setTopStatus("error",message);
        showToast(message,"fail");
      }
    }catch(error){
      var message=String(error && error.message?error.message:error);
      var errorCode="// Connection failed.\n// Detail: "+message+"\n// Check network or try another URL.";
      var requestFailedAt=typeof performance!=="undefined" && performance.now
        ?performance.now()
        :Date.now();

      setCodeOutput(errorCode,"error");
      setResultMeta("error",0,0);
      setLatency(requestFailedAt-requestStarted,"error");
      finishProcessRotation(false);
      incrementStats("fail");
      addHistory(raw,"fail",0,0,message);
      setTopStatus("error",message);
      showToast("Koneksi ekstraksi gagal: "+message,"fail");
    }finally{
      activeController=null;
      setLoading(false);
    }
  }

  function copyText(text){
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve,reject){
      try{
        var area=document.createElement("textarea");
        area.value=text;
        area.setAttribute("readonly","");
        area.style.position="fixed";
        area.style.opacity="0";
        area.style.pointerEvents="none";
        document.body.appendChild(area);
        area.select();
        var success=document.execCommand("copy");
        area.remove();
        if(success) resolve();
        else reject(new Error("Copy tidak didukung browser."));
      }catch(error){
        reject(error);
      }
    });
  }

  function copyCurrentHtml(){
    if(!currentHtml){
      showToast("Belum ada HTML untuk disalin.","fail");
      return;
    }
    copyText(currentHtml).then(function(){
      var button=byId("nxgcCopyButton");
      if(button){
        var original=button.innerHTML;
        button.innerHTML='<i class="fas fa-check"></i><span>Tersalin</span>';
        setTimeout(function(){button.innerHTML=original;},1300);
      }
      showToast("Source HTML berhasil disalin.","success");
    }).catch(function(error){
      showToast(error.message||"Gagal menyalin source.","fail");
    });
  }

  function downloadCurrentHtml(){
    if(!currentHtml){
      showToast("Belum ada HTML untuk diunduh.","fail");
      return;
    }
    try{
      var blob=new Blob([currentHtml],{type:"text/html;charset=utf-8"});
      var objectUrl=URL.createObjectURL(blob);
      var anchor=document.createElement("a");
      anchor.href=objectUrl;
      anchor.download=fileNameFromUrl(currentUrl);
      anchor.dataset.historyRecorded="1";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function(){URL.revokeObjectURL(objectUrl);},5000);
      if(typeof window.recordDownload==="function"){
        try{
          window.recordDownload("Get Code HTML","HTML","",anchor.download,currentUrl);
        }catch(error){}
      }
      showToast("File HTML mulai diunduh.","success");
    }catch(error){
      showToast("Download gagal: "+error.message,"fail");
    }
  }


  function reportScope(rawValue,resolvedUrl,baseUrl){
    var raw=String(rawValue||"").trim();
    if(!raw) return "unknown";
    if(raw.indexOf("${")!==-1 || raw.indexOf("{{")!==-1) return "dynamic";
    if(/^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(raw)) return "special";
    try{
      return new URL(resolvedUrl).origin===new URL(baseUrl).origin?"internal":"external";
    }catch(error){
      return "unresolved";
    }
  }

  function normalizeReportUrl(rawValue,baseUrl){
    var raw=String(rawValue||"").trim().replace(/^['"`]|['"`]$/g,"");
    if(!raw) return {raw:"",url:"",scope:"unknown"};
    if(raw.indexOf("${")!==-1 || raw.indexOf("{{")!==-1){
      return {raw:raw,url:raw,scope:"dynamic"};
    }
    if(/^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(raw)){
      return {raw:raw,url:raw,scope:"special"};
    }
    try{
      var resolved=new URL(raw,baseUrl).href;
      return {raw:raw,url:resolved,scope:reportScope(raw,resolved,baseUrl)};
    }catch(error){
      return {raw:raw,url:raw,scope:"unresolved"};
    }
  }

  function dedupeReportItems(items){
    var seen=new Set();
    return items.filter(function(item){
      var key=[item.kind,item.method||"",item.url,item.source||""].join("|");
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function analyzeExtractedSource(html,baseUrl){
    var source=String(html||"");
    var assets=[];
    var endpoints=[];
    var parsed=new DOMParser().parseFromString(source,"text/html");

    function pushAsset(kind,value,sourceName){
      var normalized=normalizeReportUrl(value,baseUrl);
      if(!normalized.raw) return;
      assets.push({kind:kind,url:normalized.url,raw:normalized.raw,scope:normalized.scope,source:sourceName||"html"});
    }

    function pushEndpoint(kind,method,value,sourceName){
      var normalized=normalizeReportUrl(value,baseUrl);
      if(!normalized.raw) return;
      endpoints.push({kind:kind,method:String(method||"GET").toUpperCase(),url:normalized.url,raw:normalized.raw,scope:normalized.scope,source:sourceName||"script"});
    }

    parsed.querySelectorAll("script[src]").forEach(function(node){pushAsset(node.type==="module"?"module-script":"script",node.getAttribute("src"),"script[src]");});
    parsed.querySelectorAll("link[href]").forEach(function(node){
      var rel=String(node.getAttribute("rel")||"link").toLowerCase().split(/\s+/)[0]||"link";
      pushAsset(rel,node.getAttribute("href"),"link[rel="+rel+"]");
    });
    [
      ["img[src]","image","src"],["input[type=image][src]","image","src"],
      ["source[src]","media-source","src"],["video[src]","video","src"],
      ["video[poster]","poster","poster"],["audio[src]","audio","src"],
      ["iframe[src]","iframe","src"],["embed[src]","embed","src"],
      ["object[data]","object","data"]
    ].forEach(function(definition){
      parsed.querySelectorAll(definition[0]).forEach(function(node){pushAsset(definition[1],node.getAttribute(definition[2]),definition[0]);});
    });
    parsed.querySelectorAll("img[srcset],source[srcset]").forEach(function(node){
      String(node.getAttribute("srcset")||"").split(",").forEach(function(candidate){
        pushAsset("responsive-image",candidate.trim().split(/\s+/)[0],node.tagName.toLowerCase()+"[srcset]");
      });
    });

    var cssText=Array.from(parsed.querySelectorAll("style")).map(function(node){return node.textContent||"";}).join("\n")+"\n"+
      Array.from(parsed.querySelectorAll("[style]")).map(function(node){return node.getAttribute("style")||"";}).join("\n");
    var cssUrlPattern=/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
    var cssMatch;
    while((cssMatch=cssUrlPattern.exec(cssText))) pushAsset("css-url",cssMatch[2],"css url()");
    var importPattern=/@import\s+(?:url\()?\s*(['"])([^'"]+)\1/gi;
    while((cssMatch=importPattern.exec(cssText))) pushAsset("css-import",cssMatch[2],"css @import");

    parsed.querySelectorAll("form[action]").forEach(function(node){pushEndpoint("form",node.getAttribute("method")||"GET",node.getAttribute("action"),"form[action]");});
    parsed.querySelectorAll("[data-endpoint],[data-api]").forEach(function(node){
      pushEndpoint("data-attribute",node.getAttribute("data-method")||"GET",node.getAttribute("data-endpoint")||node.getAttribute("data-api"),"data-endpoint");
    });

    var scriptText=Array.from(parsed.querySelectorAll("script:not([src])")).map(function(node){return node.textContent||"";}).join("\n");
    var patterns=[
      {kind:"fetch",method:"GET",regex:/\bfetch\s*\(\s*(['"`])([^'"`]+)\1/g},
      {kind:"axios",method:"REQUEST",regex:/\baxios\s*\(\s*(['"`])([^'"`]+)\1/g},
      {kind:"axios",methodFrom:1,regex:/\baxios\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\2/gi,valueFrom:3},
      {kind:"xhr",methodFrom:2,regex:/\.open\s*\(\s*(['"`])([A-Z]+)\1\s*,\s*(['"`])([^'"`]+)\3/gi,valueFrom:4},
      {kind:"websocket",method:"CONNECT",regex:/\bnew\s+WebSocket\s*\(\s*(['"`])([^'"`]+)\1/g},
      {kind:"eventsource",method:"SUBSCRIBE",regex:/\bnew\s+EventSource\s*\(\s*(['"`])([^'"`]+)\1/g},
      {kind:"beacon",method:"POST",regex:/\bsendBeacon\s*\(\s*(['"`])([^'"`]+)\1/g}
    ];
    patterns.forEach(function(definition){
      var match;
      while((match=definition.regex.exec(scriptText))){
        var value=match[definition.valueFrom||2];
        var method=definition.methodFrom?match[definition.methodFrom]:definition.method;
        pushEndpoint(definition.kind,method,value,"inline-script");
      }
    });

    assets=dedupeReportItems(assets);
    endpoints=dedupeReportItems(endpoints);
    var externalAssets=assets.filter(function(item){return item.scope==="external";}).length;
    var dynamicEndpoints=endpoints.filter(function(item){return item.scope==="dynamic" || item.scope==="unresolved";}).length;
    return {
      version:1,
      generatedAt:new Date().toISOString(),
      target:baseUrl,
      summary:{
        assets:assets.length,
        externalAssets:externalAssets,
        endpoints:endpoints.length,
        dynamicEndpoints:dynamicEndpoints
      },
      assets:assets,
      endpoints:endpoints
    };
  }

  function reportScopeClass(scope){
    return ["internal","external","dynamic"].includes(scope)?scope:"";
  }

  function auditStateClass(state){
    return ["ok","warning","auth","missing","timeout","blocked","error","skipped"].includes(state)?state:"";
  }

  function auditStateLabel(audit){
    if(!audit) return "NOT TESTED";
    if(audit.httpStatus) return String(audit.httpStatus)+" "+String(audit.state||"").toUpperCase();
    return String(audit.state||"unknown").toUpperCase();
  }

  function auditMetaHtml(audit){
    if(!audit) return "";
    var chips=[];
    if(Number.isFinite(Number(audit.latencyMs))) chips.push('<span class="nxgc-audit-chip">'+escapeHtml(audit.latencyMs+' ms')+'</span>');
    if(audit.contentType) chips.push('<span class="nxgc-audit-chip" title="'+escapeHtml(audit.contentType)+'">'+escapeHtml(String(audit.contentType).split(";")[0])+'</span>');
    if(audit.redirects && audit.redirects.length) chips.push('<span class="nxgc-audit-chip warn">'+audit.redirects.length+' redirect</span>');
    if(audit.cors && audit.cors.relevant) chips.push('<span class="nxgc-audit-chip '+(audit.cors.allowed?'good':'bad')+'">CORS '+(audit.cors.allowed?'OK':'RISK')+'</span>');
    if(audit.mime && audit.mime.matches===false) chips.push('<span class="nxgc-audit-chip bad">MIME mismatch</span>');
    if(audit.methodUsed) chips.push('<span class="nxgc-audit-chip">Probe '+escapeHtml(audit.methodUsed)+'</span>');
    return chips.join("");
  }

  function renderReportRows(items,isEndpoint){
    if(!items.length) return '<div class="nxgc-report-empty">Tidak ada '+(isEndpoint?"dynamic endpoint":"asset")+' yang terdeteksi pada source HTML.</div>';
    var visible=items.slice(0,150);
    var rows=visible.map(function(item){
      var badge=isEndpoint?(item.method+" · "+item.kind):item.kind;
      var audit=item.audit||null;
      return '<div class="nxgc-report-row '+(audit?'has-audit':'')+'">'+
        '<span class="nxgc-report-badge" title="'+escapeHtml(badge)+'">'+escapeHtml(badge)+'</span>'+
        '<span class="nxgc-report-row-copy">'+
          '<span class="nxgc-report-row-top"><span class="nxgc-report-url" title="'+escapeHtml(item.url)+'">'+escapeHtml(item.url)+'</span><span class="nxgc-audit-state '+auditStateClass(audit&&audit.state)+'">'+escapeHtml(auditStateLabel(audit))+'</span></span>'+
          '<span class="nxgc-report-meta"><span class="nxgc-report-scope '+reportScopeClass(item.scope)+'">'+escapeHtml(item.scope)+'</span><span>'+escapeHtml(item.source||"")+'</span>'+auditMetaHtml(audit)+'</span>'+
          (audit&&audit.message?'<span class="nxgc-audit-message" title="'+escapeHtml(audit.message)+'">'+escapeHtml(audit.message)+'</span>':'')+
        '</span>'+
      '</div>';
    }).join("");
    if(items.length>visible.length) rows+='<div class="nxgc-report-empty">'+(items.length-visible.length)+' item tambahan tersedia di file JSON.</div>';
    return rows;
  }

  function scoreWeight(state){
    if(state==="ok") return 1;
    if(state==="warning") return .7;
    if(state==="auth") return .4;
    return 0;
  }

  function summarizeLiveItems(items){
    var audited=items.filter(function(item){return item.audit;});
    var scorable=audited.filter(function(item){return item.audit.state!=="skipped";});
    return {
      total:audited.length,
      reachable:audited.filter(function(item){return item.audit.reachable;}).length,
      issues:audited.filter(function(item){return item.audit.state!=="ok";}).length,
      score:scorable.length?Math.round(scorable.reduce(function(total,item){return total+scoreWeight(item.audit.state);},0)/scorable.length*100):null,
      corsRisk:audited.filter(function(item){return (item.audit.issues||[]).includes("CORS_RISK");}).length,
      mimeMismatch:audited.filter(function(item){return (item.audit.issues||[]).includes("MIME_MISMATCH");}).length
    };
  }

  function buildLiveAuditSummary(report,startedAt){
    var asset=summarizeLiveItems(report.assets||[]);
    var endpoint=summarizeLiveItems(report.endpoints||[]);
    return {
      version:1,
      generatedAt:new Date().toISOString(),
      durationMs:Date.now()-startedAt,
      assets:asset,
      endpoints:endpoint,
      total:asset.total+endpoint.total,
      reachable:asset.reachable+endpoint.reachable,
      issues:asset.issues+endpoint.issues,
      corsRisk:asset.corsRisk+endpoint.corsRisk,
      mimeMismatch:asset.mimeMismatch+endpoint.mimeMismatch
    };
  }

  function setAuditScore(id,value){
    var element=byId(id);
    if(element) element.textContent=value==null?"—":value+"%";
  }

  function updateLiveAuditSummary(summary){
    setAuditScore("nxgcAssetScore",summary&&summary.assets?summary.assets.score:null);
    setAuditScore("nxgcApiScore",summary&&summary.endpoints?summary.endpoints.score:null);
    var reachable=byId("nxgcAuditReachable");
    var issues=byId("nxgcAuditIssues");
    if(reachable) reachable.textContent=summary?String(summary.reachable):"0";
    if(issues) issues.textContent=summary?String(summary.issues):"0";
  }

  function setLiveAuditUi(state,message,completed,total){
    var button=byId("nxgcRunAudit");
    var status=byId("nxgcAuditStatus");
    var progress=byId("nxgcAuditProgressBar");
    var counter=byId("nxgcAuditProgressText");
    var ratio=total?Math.max(0,Math.min(100,Math.round(completed/total*100))):0;
    if(status) status.textContent=message||"Belum dijalankan.";
    if(progress) progress.style.width=ratio+"%";
    if(counter) counter.textContent=completed+" / "+total;
    if(button){
      button.disabled=state==="running" || !currentReport;
      button.classList.toggle("running",state==="running");
      button.innerHTML=state==="running"
        ?'<i class="fas fa-spinner fa-spin"></i> Auditing '+ratio+'%'
        :'<i class="fas fa-satellite-dish"></i> '+(state==="done"?"Audit Ulang":"Run Live Audit");
    }
  }

  function auditCandidates(report){
    var items=[];
    (report.assets||[]).forEach(function(item,index){
      item.auditId="asset-"+index;
      if(/^https?:\/\//i.test(item.url) && ["internal","external"].includes(item.scope)){
        items.push({id:item.auditId,type:"asset",kind:item.kind,method:"HEAD",url:item.url,scope:item.scope,source:item.source});
      }
    });
    (report.endpoints||[]).forEach(function(item,index){
      item.auditId="endpoint-"+index;
      if(/^https?:\/\//i.test(item.url) && ["internal","external"].includes(item.scope)){
        items.push({id:item.auditId,type:"endpoint",kind:item.kind,method:item.method||"GET",url:item.url,scope:item.scope,source:item.source});
      }
    });
    return items;
  }

  function mergeAuditResults(results){
    if(!currentReport) return;
    var lookup=new Map((results||[]).map(function(result){return [result.id,result];}));
    [currentReport.assets,currentReport.endpoints].forEach(function(items){
      (items||[]).forEach(function(item){
        if(lookup.has(item.auditId)) item.audit=lookup.get(item.auditId);
      });
    });
    byId("nxgcAssetReportList").innerHTML=renderReportRows(currentReport.assets,false);
    byId("nxgcEndpointReportList").innerHTML=renderReportRows(currentReport.endpoints,true);
  }

  function auditFailureResult(item,error){
    return {
      id:item.id,type:item.type,kind:item.kind,method:item.method,requestedUrl:item.url,
      state:"error",reachable:false,httpStatus:null,statusText:null,methodUsed:null,latencyMs:null,
      finalUrl:null,redirects:[],contentType:null,contentLength:null,cors:null,mime:null,
      issues:["AUDIT_REQUEST_FAILED"],errorCode:"AUDIT_REQUEST_FAILED",
      message:error&&error.message?error.message:"Batch audit gagal."
    };
  }

  async function runLiveAudit(){
    if(!currentReport || liveAuditRunning) return;
    var allCandidates=auditCandidates(currentReport);
    var candidates=allCandidates.slice(0,LIVE_AUDIT_MAX_ITEMS);
    var auditTruncated=allCandidates.length>candidates.length;
    if(!candidates.length){
      showToast("Tidak ada URL HTTP publik yang dapat diaudit.","fail");
      return;
    }
    if(liveAuditController){try{liveAuditController.abort();}catch(error){}}
    liveAuditController=new AbortController();
    liveAuditRunning=true;
    var startedAt=Date.now();
    currentReport.liveAudit=null;
    currentReport.assets.forEach(function(item){delete item.audit;});
    currentReport.endpoints.forEach(function(item){delete item.audit;});
    updateLiveAuditSummary(null);
    setLiveAuditUi("running","Menghubungi asset dan endpoint secara aman...",0,candidates.length);
    var completed=0;
    try{
      for(var offset=0;offset<candidates.length;offset+=LIVE_AUDIT_CHUNK_SIZE){
        var chunk=candidates.slice(offset,offset+LIVE_AUDIT_CHUNK_SIZE);
        var response=await NEXORA_NATIVE_FETCH(LIVE_AUDIT_ENDPOINT,{
          method:"POST",
          headers:{"Content-Type":"application/json","Accept":"application/json"},
          body:JSON.stringify({target:currentUrl,items:chunk}),
          signal:liveAuditController.signal,
          credentials:"same-origin"
        });
        var payload=null;
        try{payload=await response.json();}catch(error){}
        if(!response.ok || !payload || !payload.ok){
          throw new Error(payload&&payload.message?payload.message:"Live audit HTTP "+response.status);
        }
        mergeAuditResults(payload.audit.results||[]);
        completed+=chunk.length;
        var interim=buildLiveAuditSummary(currentReport,startedAt);
        updateLiveAuditSummary(interim);
        setLiveAuditUi("running","Menguji status, redirect, CORS, dan MIME...",completed,candidates.length);
      }
      currentReport.liveAudit=buildLiveAuditSummary(currentReport,startedAt);
      currentReport.liveAudit.truncated=auditTruncated;
      currentReport.liveAudit.available=allCandidates.length;
      updateLiveAuditSummary(currentReport.liveAudit);
      setLiveAuditUi("done","Audit selesai dalam "+currentReport.liveAudit.durationMs+" ms"+(auditTruncated?" · dibatasi "+candidates.length+" dari "+allCandidates.length+" URL.":"."),candidates.length,candidates.length);
      showToast("Live audit selesai: "+currentReport.liveAudit.reachable+" resource terjangkau.","success");
    }catch(error){
      if(error&&error.name==="AbortError"){
        setLiveAuditUi("idle","Audit dibatalkan.",completed,candidates.length);
      }else{
        var remaining=candidates.slice(completed).map(function(item){return auditFailureResult(item,error);});
        mergeAuditResults(remaining);
        currentReport.liveAudit=buildLiveAuditSummary(currentReport,startedAt);
        currentReport.liveAudit.truncated=auditTruncated;
        currentReport.liveAudit.available=allCandidates.length;
        updateLiveAuditSummary(currentReport.liveAudit);
        setLiveAuditUi("error",error&&error.message?error.message:"Live audit gagal.",completed,candidates.length);
        showToast(error&&error.message?error.message:"Live audit gagal.","fail");
      }
    }finally{
      liveAuditRunning=false;
      liveAuditController=null;
    }
  }

  function renderSourceReport(report){
    var section=byId("nxgcReport");
    if(!section || !report) return;
    currentReport=report;
    auditCandidates(report);
    byId("nxgcReportAssets").textContent=String(report.summary.assets);
    byId("nxgcReportExternal").textContent=String(report.summary.externalAssets);
    byId("nxgcReportEndpoints").textContent=String(report.summary.endpoints);
    byId("nxgcReportDynamic").textContent=String(report.summary.dynamicEndpoints);
    byId("nxgcAssetReportCount").textContent=report.assets.length+" ITEM";
    byId("nxgcEndpointReportCount").textContent=report.endpoints.length+" ITEM";
    byId("nxgcAssetReportList").innerHTML=renderReportRows(report.assets,false);
    byId("nxgcEndpointReportList").innerHTML=renderReportRows(report.endpoints,true);
    byId("nxgcCopyReport").disabled=false;
    byId("nxgcDownloadReport").disabled=false;
    updateLiveAuditSummary(null);
    var availableCount=auditCandidates(report).length;
    var candidateCount=Math.min(availableCount,LIVE_AUDIT_MAX_ITEMS);
    setLiveAuditUi("idle",candidateCount+" URL siap diuji tanpa mengirim data form"+(availableCount>candidateCount?" · "+(availableCount-candidateCount)+" item disimpan hanya di static report.":"."),0,candidateCount);
    var auditButton=byId("nxgcRunAudit");
    if(auditButton) auditButton.disabled=candidateCount===0;
    section.classList.add("show");
  }

  function clearSourceReport(){
    if(liveAuditController){try{liveAuditController.abort();}catch(error){}}
    liveAuditController=null;
    liveAuditRunning=false;
    currentReport=null;
    var section=byId("nxgcReport");
    if(section) section.classList.remove("show");
    ["nxgcCopyReport","nxgcDownloadReport","nxgcRunAudit"].forEach(function(id){var button=byId(id);if(button) button.disabled=true;});
    updateLiveAuditSummary(null);
    setLiveAuditUi("idle","Belum dijalankan.",0,0);
  }

  function sourceReportJson(){
    return currentReport?JSON.stringify(currentReport,null,2):"";
  }

  function copySourceReport(){
    var json=sourceReportJson();
    if(!json){showToast("Laporan belum tersedia.","fail");return;}
    copyText(json).then(function(){showToast("Laporan asset dan endpoint disalin.","success");}).catch(function(error){showToast(error.message||"Laporan gagal disalin.","fail");});
  }

  function downloadSourceReport(){
    var json=sourceReportJson();
    if(!json){showToast("Laporan belum tersedia.","fail");return;}
    var blob=new Blob([json],{type:"application/json;charset=utf-8"});
    var objectUrl=URL.createObjectURL(blob);
    var anchor=document.createElement("a");
    var base=fileNameFromUrl(currentUrl).replace(/\.html$/i,"");
    anchor.href=objectUrl;
    anchor.download=base+"-live-audit-report.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function(){URL.revokeObjectURL(objectUrl);},3000);
    showToast("Laporan JSON mulai diunduh.","success");
  }

  function escapeAttribute(value){
    return String(value||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
  }

  function preparePreviewHtml(html,baseUrl){
    var source=String(html||"");
    var baseTag='<base href="'+escapeAttribute(baseUrl)+'">';
    if(/<base[\s>]/i.test(source)) return source;
    if(/<head[\s>]/i.test(source)){
      return source.replace(/<head([^>]*)>/i,function(match,attributes){
        return "<head"+attributes+">"+baseTag;
      });
    }
    if(/<html[\s>]/i.test(source)){
      return source.replace(/<html([^>]*)>/i,function(match,attributes){
        return "<html"+attributes+"><head>"+baseTag+"</head>";
      });
    }
    return "<!doctype html><html><head>"+baseTag+"</head><body>"+source+"</body></html>";
  }

  function renderPreview(){
    if(!currentHtml) return;
    var frame=byId("nxgcPreviewFrame");
    var empty=byId("nxgcPreviewEmpty");
    var deviceFrame=byId("nxgcDeviceFrame");
    if(!frame || !deviceFrame) return;
    if(empty) empty.style.display="none";
    deviceFrame.style.display="block";
    frame.style.display="block";
    frame.srcdoc=preparePreviewHtml(currentHtml,currentUrl);
  }

  function togglePreview(){
    if(!currentHtml){
      showToast("Ekstrak HTML terlebih dahulu.","fail");
      return;
    }
    previewVisible=!previewVisible;
    var section=byId("nxgcPreview");
    var button=byId("nxgcPreviewButton");
    if(section) section.classList.toggle("show",previewVisible);
    if(button){
      button.classList.toggle("active",previewVisible);
      button.innerHTML=previewVisible
        ?'<i class="fas fa-eye-slash"></i><span>Tutup Preview</span>'
        :'<i class="fas fa-display"></i><span>Preview</span>';
    }
    if(previewVisible){
      renderPreview();
      setTimeout(function(){
        if(section) section.scrollIntoView({behavior:"smooth",block:"start"});
      },80);
    }
  }

  function setDevice(device){
    currentDevice=["desktop","tablet","mobile"].indexOf(device)>=0?device:"desktop";
    var frame=byId("nxgcDeviceFrame");
    if(frame) frame.className="nxgc-device-frame "+currentDevice;
    var buttons=overlay?overlay.querySelectorAll("[data-nxgc-device]"):[];
    Array.prototype.forEach.call(buttons,function(button){
      button.classList.toggle("active",button.getAttribute("data-nxgc-device")===currentDevice);
    });
  }


  function siteGrabberSetState(state,message){
    var card=byId("nxgcSgxStatus");
    var label=byId("nxgcSgxStatusText");
    if(card){
      card.classList.remove("ready","busy","error","done");
      if(state) card.classList.add(state);
    }
    if(label) label.textContent=message||"Belum diperiksa";
  }

  function siteGrabberSetProgress(percent,message,progress){
    var safe=Math.max(0,Math.min(100,Number(percent)||0));
    var bar=byId("nxgcSgxProgressBar");
    var ratio=byId("nxgcSgxProgressText");
    var detail=byId("nxgcSgxProgressDetail");
    if(bar) bar.style.width=safe+"%";
    if(ratio) ratio.textContent=Math.round(safe)+"%";
    if(detail){
      var p=progress||{};
      var parts=[];
      if(Number.isFinite(Number(p.pagesCompleted))) parts.push("Page "+Number(p.pagesCompleted)+"/"+Number(p.pagesDiscovered||p.pagesCompleted||0));
      if(Number.isFinite(Number(p.assetsCompleted))) parts.push("Asset "+Number(p.assetsCompleted)+"/"+Number(p.assetsDiscovered||p.assetsCompleted||0));
      if(Number(p.assetsFailed)>0) parts.push("Failed "+Number(p.assetsFailed));
      detail.textContent=parts.length?parts.join(" · "):(message||"Menunggu worker...");
    }
  }

  function siteGrabberToggleResult(ready){
    var result=byId("nxgcSgxResult");
    if(result) result.classList.toggle("show",Boolean(ready));
    ["nxgcSgxDownload","nxgcSgxReport","nxgcSgxReportZip"].forEach(function(id){
      var button=byId(id); if(button) button.disabled=!ready;
    });
  }

  function siteGrabberStopPolling(){
    clearTimeout(siteGrabberPollTimer);
    siteGrabberPollTimer=0;
  }

  async function siteGrabberJson(action,init){
    var requestInit=Object.assign({cache:"no-store",headers:{Accept:"application/json"},nexoraTimeoutMs:24000},init||{});
    requestInit.headers=Object.assign({Accept:"application/json"},requestInit.headers||{});
    var response=await (window.NexoraFetch||window.fetch)(SITEGRABBER_ENDPOINT+"?action="+encodeURIComponent(action),requestInit);
    var data=await response.json().catch(function(){return {};});
    if(!response.ok){
      var error=new Error(data.message||data.error||("HTTP "+response.status));
      error.status=response.status;
      error.payload=data;
      throw error;
    }
    return data;
  }

  async function refreshSiteGrabberHealth(){
    siteGrabberSetState("busy","Memeriksa SiteGrabber X...");
    try{
      var payload=await siteGrabberJson("health",{method:"GET",nexoraTimeoutMs:10000});
      var upstream=payload&&payload.upstream||{};
      var services=upstream.services||{};
      var worker=String(services.worker||"").toLowerCase();
      if(payload.configured===false){
        siteGrabberSetState("error","API key belum dikonfigurasi");
        return false;
      }
      if(upstream.success===true || upstream.status==="ready"){
        siteGrabberSetState("ready",worker?"Ready · worker "+worker:"SiteGrabber X ready");
        return true;
      }
      siteGrabberSetState("error","SiteGrabber X degraded");
      return false;
    }catch(error){
      siteGrabberSetState("error",String(error&&error.message||"SiteGrabber X offline"));
      return false;
    }
  }

  function renderSiteGrabberResult(data){
    var result=data&&data.result||{};
    var domain=byId("nxgcSgxDomain");
    var pages=byId("nxgcSgxPages");
    var assets=byId("nxgcSgxAssets");
    var failed=byId("nxgcSgxFailed");
    var bytes=byId("nxgcSgxBytes");
    if(domain) domain.textContent=String(result.domain||"—");
    if(pages) pages.textContent=String(Number(result.pages)||0);
    if(assets) assets.textContent=String(Number(result.assets)||0);
    if(failed) failed.textContent=String(Number(result.failedAssets)||0);
    if(bytes) bytes.textContent=formatBytes(Number(result.bytes)||0);
    siteGrabberToggleResult(true);
  }

  async function pollSiteGrabberJob(){
    if(!siteGrabberJobId) return;
    siteGrabberStopPolling();
    try{
      var response=await (window.NexoraFetch||window.fetch)(SITEGRABBER_ENDPOINT+"?action=job&id="+encodeURIComponent(siteGrabberJobId),{cache:"no-store",headers:{Accept:"application/json"},nexoraTimeoutMs:24000});
      var payload=await response.json().catch(function(){return {};});
      if(!response.ok) throw new Error(payload.message||payload.error||("HTTP "+response.status));
      var data=payload.data||{};
      var state=String(data.state||data.progress&&data.progress.status||"queued").toLowerCase();
      var progress=data.progress||{};
      var percent=Number(progress.percent)||0;
      siteGrabberSetProgress(percent,progress.message||state,progress);
      if(state==="completed"){
        siteGrabberSetState("done","Capture selesai · ZIP siap");
        siteGrabberSetProgress(100,"Capture selesai",progress);
        renderSiteGrabberResult(data);
        return;
      }
      if(["failed","cancelled","expired"].indexOf(state)>=0){
        siteGrabberSetState("error",String(data.error||progress.message||("Job "+state)));
        return;
      }
      siteGrabberSetState("busy",String(progress.message||("Job "+state)));
      siteGrabberPollTimer=setTimeout(pollSiteGrabberJob,SITEGRABBER_POLL_MS);
    }catch(error){
      siteGrabberSetState("error",String(error&&error.message||"Gagal membaca status job"));
    }
  }

  async function startSiteGrabberCapture(){
    var input=byId("nxgcTargetUrl");
    var mode=byId("nxgcSgxMode");
    var consent=byId("nxgcSgxConsent");
    var button=byId("nxgcSgxStart");
    var raw=String(input&&input.value||"").trim();
    if(!raw){showToast("Masukkan URL target terlebih dahulu.","fail");if(input)input.focus();return;}
    try{raw=normalizeUrl(raw);}catch(error){showToast(error.message||"URL tidak valid.","fail");return;}
    if(!consent || !consent.checked){showToast("Centang konfirmasi izin capture terlebih dahulu.","fail");return;}
    siteGrabberStopPolling();
    siteGrabberJobId="";
    siteGrabberReport=null;
    siteGrabberToggleResult(false);
    siteGrabberSetProgress(0,"Mengirim job ke SiteGrabber X...",{});
    siteGrabberSetState("busy","Mengirim capture job...");
    if(button){button.disabled=true;button.classList.add("loading");}
    try{
      var response=await (window.NexoraFetch||window.fetch)(SITEGRABBER_ENDPOINT+"?action=capture",{
        method:"POST",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({url:raw,mode:mode?mode.value:"single-page",consent:true}),
        nexoraTimeoutMs:26000
      });
      var payload=await response.json().catch(function(){return {};});
      if(!response.ok) throw new Error(payload.message||payload.error||("HTTP "+response.status));
      siteGrabberJobId=String(payload.job&&payload.job.id||"");
      if(!siteGrabberJobId) throw new Error("SiteGrabber tidak mengembalikan Job ID.");
      var idNode=byId("nxgcSgxJobId"); if(idNode) idNode.textContent=siteGrabberJobId;
      siteGrabberSetState("busy","Job queued · menunggu worker");
      showToast("SiteGrabber X job berhasil dibuat.","success");
      pollSiteGrabberJob();
    }catch(error){
      siteGrabberSetState("error",String(error&&error.message||"Capture SiteGrabber gagal"));
      showToast("SiteGrabber X: "+String(error&&error.message||"capture gagal"),"fail");
    }finally{
      if(button){button.disabled=false;button.classList.remove("loading");}
    }
  }

  function downloadSiteGrabber(kind){
    if(!siteGrabberJobId){showToast("Belum ada capture SiteGrabber yang selesai.","fail");return;}
    var action=kind==="report"?"report-download":"download";
    var anchor=document.createElement("a");
    anchor.href=SITEGRABBER_ENDPOINT+"?action="+action+"&id="+encodeURIComponent(siteGrabberJobId);
    anchor.rel="noopener";
    anchor.click();
  }

  async function copySiteGrabberReport(){
    if(!siteGrabberJobId){showToast("Belum ada report SiteGrabber.","fail");return;}
    try{
      if(!siteGrabberReport){
        var response=await (window.NexoraFetch||window.fetch)(SITEGRABBER_ENDPOINT+"?action=report&id="+encodeURIComponent(siteGrabberJobId),{cache:"no-store",headers:{Accept:"application/json"},nexoraTimeoutMs:24000});
        var payload=await response.json().catch(function(){return {};});
        if(!response.ok) throw new Error(payload.message||payload.error||("HTTP "+response.status));
        siteGrabberReport=payload.data||{};
      }
      await copyText(JSON.stringify(siteGrabberReport,null,2));
      showToast("Report SiteGrabber disalin.","success");
    }catch(error){showToast("Report gagal: "+String(error&&error.message||error),"fail");}
  }

  function handleHistoryClick(event){
    var retry=event.target.closest("[data-nxgc-retry]");
    if(retry){
      var retryItem=historyItems.find(function(item){return item.id===retry.getAttribute("data-nxgc-retry");});
      if(retryItem){
        var input=byId("nxgcTargetUrl");
        if(input) input.value=retryItem.url;
        executeExtraction(retryItem.url);
        if(stage) stage.scrollTo({top:0,behavior:"smooth"});
      }
      return;
    }
    var remove=event.target.closest("[data-nxgc-remove]");
    if(remove){
      var id=remove.getAttribute("data-nxgc-remove");
      historyItems=historyItems.filter(function(item){return item.id!==id;});
      saveHistory();
      showToast("Riwayat dihapus.","success");
    }
  }

  function wireEvents(){
    byId("nxGetCodeBack").addEventListener("click",closeGetCodeRoom);
    var hostedFrame=byId("nxgcHostedSourceFrame");
    if(hostedFrame) hostedFrame.addEventListener("load",handleHostedSourceLoad);
    byId("nxgcExtractButton").addEventListener("click",function(){executeExtraction();});
    byId("nxgcTargetUrl").addEventListener("keydown",function(event){
      if(event.key==="Enter"){
        event.preventDefault();
        executeExtraction();
      }
    });
    byId("nxgcCopyButton").addEventListener("click",copyCurrentHtml);
    byId("nxgcDownloadButton").addEventListener("click",downloadCurrentHtml);
    byId("nxgcPreviewButton").addEventListener("click",togglePreview);
    byId("nxgcClearButton").addEventListener("click",function(){clearResult(false);});
    byId("nxgcToolbarCopy").addEventListener("click",copyCurrentHtml);
    byId("nxgcToolbarClear").addEventListener("click",function(){clearResult(false);});
    byId("nxgcCopyReport").addEventListener("click",copySourceReport);
    byId("nxgcDownloadReport").addEventListener("click",downloadSourceReport);
    byId("nxgcRunAudit").addEventListener("click",runLiveAudit);
    byId("nxgcSgxRefresh").addEventListener("click",refreshSiteGrabberHealth);
    byId("nxgcSgxStart").addEventListener("click",startSiteGrabberCapture);
    byId("nxgcSgxDownload").addEventListener("click",function(){downloadSiteGrabber("capture");});
    byId("nxgcSgxReport").addEventListener("click",copySiteGrabberReport);
    byId("nxgcSgxReportZip").addEventListener("click",function(){downloadSiteGrabber("report");});
    byId("nxgcRefreshPreview").addEventListener("click",function(){
      if(currentHtml){
        renderPreview();
        showToast("Preview diperbarui.","success");
      }
    });
    byId("nxgcHistoryList").addEventListener("click",handleHistoryClick);
    byId("nxgcClearHistory").addEventListener("click",function(){
      if(!historyItems.length) return;
      historyItems=[];
      saveHistory();
      showToast("Semua riwayat dibersihkan.","success");
    });
    overlay.querySelectorAll("[data-nxgc-device]").forEach(function(button){
      button.addEventListener("click",function(){
        setDevice(button.getAttribute("data-nxgc-device"));
      });
    });
  }

  function buildRoom(){
    if(overlay) return;
    elementCache={};
    overlay=document.createElement("section");
    overlay.id="nxGetCodeOverlay";
    overlay.setAttribute("aria-hidden","true");
    overlay.innerHTML=''+
      '<header id="nxGetCodeTopBar">'+
        '<button id="nxGetCodeBack" type="button" aria-label="Kembali ke All Tools Nexora"><i class="fas fa-arrow-left"></i></button>'+
        '<div id="nxGetCodeTopTitle"><b>GET CODE HTML</b><span>All Tools Nexora · Source Extraction Workspace</span></div>'+
        '<div id="nxGetCodeTopStatus" title="Extractor ready"><i class="fas fa-circle-check"></i></div>'+
      '</header>'+
      '<main id="nxGetCodeStage">'+
        '<section class="nxgc-hosted-source" id="nxgcHostedSource">'+
          '<div class="nxgc-hosted-loader" id="nxgcHostedLoader">'+
            '<div class="nxgc-hosted-loader-card">'+
              '<span class="nxgc-hosted-loader-spin"></span>'+
              '<b>NEXORA EXTRACT</b>'+
              '<span>Memuat server sumber HTTPS...</span>'+
            '</div>'+
          '</div>'+
          '<iframe id="nxgcHostedSourceFrame" title="Nexora Extract Source Workspace" src="about:blank" loading="eager" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" allow="clipboard-read; clipboard-write; fullscreen; autoplay"></iframe>'+
        '</section>'+
        '<div class="nxgc-wrap">'+
          '<section class="nxgc-panel">'+
            '<div class="nxgc-brand-block">'+
              '<span class="nxgc-brand-mark"><i class="fas fa-code"></i></span>'+
              '<span class="nxgc-brand-copy"><b>NEXORA EXTRACT</b><span>Secure Web Intelligence · Multi-Server Extraction</span></span>'+
              '<span class="nxgc-brand-side">'+
                '<span class="nxgc-server-pill" id="nxgcServerPill"><i class="fas fa-circle"></i> 12 Servers Ready</span>'+
                '<span class="nxgc-brand-ratio" id="nxgcBrandRatio">RATIO --</span>'+
              '</span>'+
            '</div>'+
            '<div class="nxgc-input-row">'+
              '<label class="nxgc-input-shell" for="nxgcTargetUrl">'+
                '<i class="fas fa-link"></i>'+
                '<input id="nxgcTargetUrl" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://website.com/target-page">'+
                '<span class="nxgc-protocol">HTTP/S</span>'+
              '</label>'+
              '<button class="nxgc-primary" id="nxgcExtractButton" type="button"><i class="fas fa-code"></i><span>Extract HTML</span></button>'+
            '</div>'+
            '<div class="nxgc-stats">'+
              '<div class="nxgc-stat"><span class="nxgc-stat-icon"><i class="fas fa-layer-group"></i></span><span class="nxgc-stat-copy"><span>Total Request</span><b id="nxgcStatTotal">0</b></span></div>'+
              '<div class="nxgc-stat"><span class="nxgc-stat-icon"><i class="fas fa-check"></i></span><span class="nxgc-stat-copy"><span>Success</span><b id="nxgcStatSuccess">0</b></span></div>'+
              '<div class="nxgc-stat"><span class="nxgc-stat-icon"><i class="fas fa-xmark"></i></span><span class="nxgc-stat-copy"><span>Failed</span><b id="nxgcStatFail">0</b></span></div>'+
              '<div class="nxgc-stat"><span class="nxgc-stat-icon"><i class="fas fa-clock"></i></span><span class="nxgc-stat-copy"><span>Session</span><b id="nxgcStatSession">0m</b></span></div>'+
            '</div>'+
            '<div class="nxgc-loader" id="nxgcLoader">'+
              '<span class="nxgc-spinner"></span>'+
              '<span class="nxgc-loader-copy"><b>Nexora Extract Processing</b><span id="nxgcLoaderText">Establishing secure connection...</span></span>'+
              '<span class="nxgc-loader-ratio" id="nxgcLoaderRatio">0%</span>'+
            '</div>'+
            '<section class="nxgc-result" id="nxgcResult">'+
              '<div class="nxgc-result-head">'+
                '<div class="nxgc-result-title"><i class="fas fa-file-code"></i><span>Extraction Result</span></div>'+
                '<div class="nxgc-chips">'+
                  '<span class="nxgc-chip" id="nxgcRatioChip"><i class="fas fa-gauge-high"></i> RATIO --</span>'+
                  '<span class="nxgc-chip" id="nxgcLatencyChip"><i class="fas fa-bolt"></i> -- MS</span>'+
                  '<span class="nxgc-chip" id="nxgcStatusChip"><i class="fas fa-minus"></i> IDLE</span>'+
                  '<span class="nxgc-chip" id="nxgcSizeChip"><i class="fas fa-database"></i> 0 B</span>'+
                  '<span class="nxgc-chip" id="nxgcLinesChip"><i class="fas fa-align-left"></i> 0 LINES</span>'+
                '</div>'+
              '</div>'+
              '<div class="nxgc-code-shell">'+
                '<div class="nxgc-code-toolbar">'+
                  '<div class="nxgc-code-info" id="nxgcCodeInfo"><span class="nxgc-code-dots"><i></i><i></i><i></i></span><span>SOURCE.HTML</span></div>'+
                  '<div class="nxgc-toolbar-actions">'+
                    '<button class="nxgc-icon-btn" id="nxgcToolbarCopy" type="button" title="Copy source"><i class="fas fa-copy"></i><span>Copy</span></button>'+
                    '<button class="nxgc-icon-btn" id="nxgcToolbarClear" type="button" title="Clear result"><i class="fas fa-trash"></i><span>Clear</span></button>'+
                  '</div>'+
                '</div>'+
                '<pre id="nxgcCodeOutput">'+DEFAULT_CODE+'</pre>'+
              '</div>'+
              '<div class="nxgc-result-actions">'+
                '<button class="nxgc-secondary" id="nxgcCopyButton" type="button" disabled><i class="fas fa-copy"></i><span>Copy HTML</span></button>'+
                '<button class="nxgc-secondary" id="nxgcDownloadButton" type="button" disabled><i class="fas fa-download"></i><span>Download HTML</span></button>'+
                '<button class="nxgc-secondary" id="nxgcPreviewButton" type="button" disabled><i class="fas fa-display"></i><span>Preview</span></button>'+
                '<button class="nxgc-secondary danger" id="nxgcClearButton" type="button"><i class="fas fa-broom"></i><span>Clear Result</span></button>'+
              '</div>'+
            '</section>'+
            '<section class="nxgc-report" id="nxgcReport">'+
              '<div class="nxgc-report-head">'+
                '<div class="nxgc-report-title"><i class="fas fa-satellite-dish"></i><span>Live Asset &amp; Endpoint Audit</span></div>'+ 
                '<div class="nxgc-report-actions"><button class="nxgc-audit-run" id="nxgcRunAudit" type="button" disabled><i class="fas fa-satellite-dish"></i> Run Live Audit</button><button id="nxgcCopyReport" type="button" disabled><i class="fas fa-copy"></i> Copy JSON</button><button id="nxgcDownloadReport" type="button" disabled><i class="fas fa-file-arrow-down"></i> Download JSON</button></div>'+ 
              '</div>'+ 
              '<div class="nxgc-report-summary">'+
                '<div class="nxgc-report-stat"><span>Total Asset</span><b id="nxgcReportAssets">0</b></div>'+ 
                '<div class="nxgc-report-stat"><span>External Asset</span><b id="nxgcReportExternal">0</b></div>'+ 
                '<div class="nxgc-report-stat"><span>Endpoint</span><b id="nxgcReportEndpoints">0</b></div>'+ 
                '<div class="nxgc-report-stat"><span>Dynamic/Unresolved</span><b id="nxgcReportDynamic">0</b></div>'+ 
              '</div>'+ 
              '<div class="nxgc-live-audit-control">'+
                '<div class="nxgc-live-audit-copy"><b>HTTP PROBE STATUS</b><span id="nxgcAuditStatus">Belum dijalankan.</span></div>'+ 
                '<div class="nxgc-live-audit-progress"><span id="nxgcAuditProgressBar"></span></div>'+ 
                '<span class="nxgc-live-audit-count" id="nxgcAuditProgressText">0 / 0</span>'+ 
              '</div>'+ 
              '<div class="nxgc-audit-score-grid">'+
                '<div class="nxgc-audit-score"><span>Asset Readiness</span><b id="nxgcAssetScore">—</b></div>'+ 
                '<div class="nxgc-audit-score"><span>API Readiness</span><b id="nxgcApiScore">—</b></div>'+ 
                '<div class="nxgc-audit-score"><span>Reachable</span><b id="nxgcAuditReachable">0</b></div>'+ 
                '<div class="nxgc-audit-score"><span>Issues</span><b id="nxgcAuditIssues">0</b></div>'+ 
              '</div>'+ 
              '<div class="nxgc-report-grid">'+
                '<section class="nxgc-report-column"><div class="nxgc-report-column-head"><span><i class="fas fa-boxes-stacked"></i> Assets</span><span id="nxgcAssetReportCount">0 ITEM</span></div><div class="nxgc-report-list" id="nxgcAssetReportList"></div></section>'+ 
                '<section class="nxgc-report-column"><div class="nxgc-report-column-head"><span><i class="fas fa-network-wired"></i> Dynamic Endpoints</span><span id="nxgcEndpointReportCount">0 ITEM</span></div><div class="nxgc-report-list" id="nxgcEndpointReportList"></div></section>'+ 
              '</div>'+ 
              '<p class="nxgc-report-note">Static report dibuat dari source. Live Audit memakai probe HEAD/OPTIONS/GET terbatas, memeriksa status HTTP, redirect, latency, MIME, dan risiko CORS tanpa mengirim data form.</p>'+ 
            '</section>'+
            '<section class="nxgc-sgx" id="nxgcSiteGrabber">'+
              '<div class="nxgc-sgx-head">'+
                '<div><span class="nxgc-sgx-kicker"><i class="fas fa-spider"></i> SITEGRABBER X API</span><b>Advanced Capture Engine</b><small>Clone halaman, website penuh, atau asset melalui API server-side. API key tidak pernah dikirim ke browser.</small></div>'+
                '<div class="nxgc-sgx-status" id="nxgcSgxStatus"><i class="fas fa-circle"></i><span id="nxgcSgxStatusText">Belum diperiksa</span><button type="button" id="nxgcSgxRefresh" title="Refresh status"><i class="fas fa-rotate-right"></i></button></div>'+
              '</div>'+
              '<div class="nxgc-sgx-controls">'+
                '<label><span>Capture Mode</span><select id="nxgcSgxMode"><option value="single-page">Single Page</option><option value="full-website">Full Website</option><option value="asset-collector">Asset Collector</option></select></label>'+
                '<label class="nxgc-sgx-consent"><input type="checkbox" id="nxgcSgxConsent"><span>Saya memiliki izin untuk menangkap target ini.</span></label>'+
                '<button class="nxgc-sgx-start" id="nxgcSgxStart" type="button"><i class="fas fa-spider"></i><span>Capture via SiteGrabber X</span></button>'+
              '</div>'+
              '<div class="nxgc-sgx-progress">'+
                '<div class="nxgc-sgx-progress-copy"><span id="nxgcSgxProgressDetail">Belum ada job.</span><b id="nxgcSgxProgressText">0%</b></div>'+
                '<div class="nxgc-sgx-progress-track"><span id="nxgcSgxProgressBar"></span></div>'+
                '<code id="nxgcSgxJobId">—</code>'+
              '</div>'+
              '<div class="nxgc-sgx-result" id="nxgcSgxResult">'+
                '<div class="nxgc-sgx-metrics"><div><span>Domain</span><b id="nxgcSgxDomain">—</b></div><div><span>Pages</span><b id="nxgcSgxPages">0</b></div><div><span>Assets</span><b id="nxgcSgxAssets">0</b></div><div><span>Failed</span><b id="nxgcSgxFailed">0</b></div><div><span>Size</span><b id="nxgcSgxBytes">0 B</b></div></div>'+
                '<div class="nxgc-sgx-actions"><button type="button" id="nxgcSgxDownload" disabled><i class="fas fa-file-zipper"></i> Download Clone ZIP</button><button type="button" id="nxgcSgxReport" disabled><i class="fas fa-copy"></i> Copy Report JSON</button><button type="button" id="nxgcSgxReportZip" disabled><i class="fas fa-box-archive"></i> Reports ZIP</button></div>'+
              '</div>'+
              '<p class="nxgc-sgx-note"><i class="fas fa-shield-halved"></i> API key disimpan hanya di Vercel Environment Variables. Capture tetap mengikuti robots/crawl guard, limit, dan validasi keamanan SiteGrabber-X.</p>'+
            '</section>'+
            '<section class="nxgc-preview" id="nxgcPreview">'+
              '<div class="nxgc-preview-head">'+
                '<div class="nxgc-preview-title"><i class="fas fa-display"></i><span>Live Preview</span></div>'+
                '<div class="nxgc-device-tools">'+
                  '<button class="nxgc-device-btn active" type="button" data-nxgc-device="desktop"><i class="fas fa-desktop"></i><span>Desktop</span></button>'+
                  '<button class="nxgc-device-btn" type="button" data-nxgc-device="tablet"><i class="fas fa-tablet-screen-button"></i><span>Tablet</span></button>'+
                  '<button class="nxgc-device-btn" type="button" data-nxgc-device="mobile"><i class="fas fa-mobile-screen-button"></i><span>Mobile</span></button>'+
                  '<button class="nxgc-device-btn" id="nxgcRefreshPreview" type="button"><i class="fas fa-rotate-right"></i><span>Refresh</span></button>'+
                '</div>'+
              '</div>'+
              '<div class="nxgc-preview-canvas">'+
                '<div class="nxgc-preview-empty" id="nxgcPreviewEmpty"><i class="fas fa-window-maximize"></i><b>Preview belum tersedia</b><span>Ekstrak URL, lalu tekan tombol Preview untuk merender source HTML.</span></div>'+
                '<div class="nxgc-device-frame desktop" id="nxgcDeviceFrame" style="display:none"><iframe id="nxgcPreviewFrame" title="HTML source preview" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe></div>'+
              '</div>'+
            '</section>'+
            '<section class="nxgc-history">'+
              '<div class="nxgc-history-head">'+
                '<div class="nxgc-history-title"><i class="fas fa-clock-rotate-left"></i><span>Extraction History</span><span class="nxgc-history-count" id="nxgcHistoryCount">0</span></div>'+
                '<button class="nxgc-icon-btn" id="nxgcClearHistory" type="button"><i class="fas fa-trash"></i><span>Bersihkan History</span></button>'+
              '</div>'+
              '<div class="nxgc-history-list" id="nxgcHistoryList"></div>'+
            '</section>'+
          '</section>'+
        '</div>'+
      '</main>'+
      '<div class="nxgc-toast success" id="nxgcToast" role="status" aria-live="polite"><i class="fas fa-circle-check"></i><span>Ready</span></div>';

    document.body.appendChild(overlay);
    stage=byId("nxGetCodeStage");
    historyItems=safeStorageRead(HISTORY_KEY,[]);
    if(!Array.isArray(historyItems)) historyItems=[];
    stats=safeStorageRead(STATS_KEY,{total:0,success:0,fail:0});
    if(!stats || typeof stats!=="object") stats={total:0,success:0,fail:0};
    wireEvents();
    setDevice("desktop");
    renderHistory();
    updateStats();
    clearResult(true);
    siteGrabberToggleResult(false);
    clearInterval(sessionTimer);
    sessionTimer=setInterval(updateStats,30000);
  }

  function openGetCodeRoom(){
    clearTimeout(closeTimer);
    buildRoom();
    if(FORCE_HOSTED_SOURCE) activateHostedSourceMode();
    overlay.style.display="grid";
    overlay.setAttribute("aria-hidden","false");
    document.body.classList.add("nx-getcode-open");
    document.body.style.overflow="hidden";
    if(stage) stage.scrollTop=0;
    refreshSiteGrabberHealth();
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){overlay.classList.add("on");});
    });
    setTimeout(function(){
      var input=byId("nxgcTargetUrl");
      if(input) try{input.focus({preventScroll:true});}catch(error){input.focus();}
    },220);
  }

  function closeGetCodeRoom(){
    if(!overlay) return;
    siteGrabberStopPolling();
    if(activeController){
      try{activeController.abort();}catch(error){}
      activeController=null;
    }
    if(liveAuditController){
      try{liveAuditController.abort();}catch(error){}
      liveAuditController=null;
      liveAuditRunning=false;
    }
    overlay.classList.remove("on");
    overlay.setAttribute("aria-hidden","true");
    document.body.classList.remove("nx-getcode-open");
    document.body.style.overflow="auto";
    clearTimeout(closeTimer);
    closeTimer=setTimeout(function(){
      if(overlay) overlay.style.display="none";
    },240);
  }

  function patchGetCodeCards(root){
    var host=root && root.querySelectorAll?root:document;
    host.querySelectorAll(".tools-card,.tool-card,.featured-card").forEach(function(card){
      var heading=card.querySelector("h4,h3,.tool-name");
      if(!heading || String(heading.textContent||"").trim().toLowerCase()!=="get code html") return;
      card.removeAttribute("onclick");
      card.removeAttribute("data-nexora-access-locked");
      card.dataset.nxGetCodeV2="1";
      card.setAttribute("role","button");
      card.setAttribute("tabindex","0");
      card.onclick=function(event){
        if(event){
          event.preventDefault();
          event.stopPropagation();
        }
        openGetCodeRoom();
        return false;
      };
      card.onkeydown=function(event){
        if(event.key==="Enter" || event.key===" "){
          event.preventDefault();
          event.stopPropagation();
          openGetCodeRoom();
        }
      };
    });
  }

  window.openGetcode=openGetCodeRoom;
  window.closeGetcode=closeGetCodeRoom;
  window.openGetCodeRoom=openGetCodeRoom;
  window.closeGetCodeRoom=closeGetCodeRoom;

  document.addEventListener("keydown",function(event){
    if(event.key==="Escape" && overlay && overlay.classList.contains("on")){
      event.preventDefault();
      closeGetCodeRoom();
    }
  });

  function initGetCodeV2(){
    warmFastExtractor();
    patchGetCodeCards(document);
    var scheduled=false;
    var observer=new MutationObserver(function(records){
      if(scheduled) return;
      var needsPatch=records.some(function(record){
        return record.addedNodes && record.addedNodes.length;
      });
      if(!needsPatch) return;
      scheduled=true;
      requestAnimationFrame(function(){
        scheduled=false;
        patchGetCodeCards(document);
      });
    });
    observer.observe(document.body,{childList:true,subtree:true});
    if(FORCE_HOSTED_SOURCE){
      buildRoom();
      activateHostedSourceMode();
    }
    setTimeout(function(){patchGetCodeCards(document);},350);
    setTimeout(function(){patchGetCodeCards(document);},1200);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initGetCodeV2,{once:true});
  }else{
    initGetCodeV2();
  }
})();

(function(){
  "use strict";
  if(window.NexoraStability) return;

  var registry=window.NexoraToolRegistry;
  var healthMap=Object.create(null);
  var lastAudit=null;
  var statusPromise=null;

  function clean(value,max){return String(value==null?"":value).replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max||500);}
  function toolIdFromCard(card){
    if(!card) return "";
    return clean(card.getAttribute("data-tool-id")||card.getAttribute("data-nx-room-tool")||"",80).toLowerCase();
  }
  function ensureNotice(){
    var node=document.getElementById("nxStabilityNotice");
    if(node) return node;
    node=document.createElement("div");
    node.id="nxStabilityNotice";
    node.setAttribute("role","status");
    node.setAttribute("aria-live","polite");
    node.innerHTML='<i class="fas fa-triangle-exclamation"></i><div><b></b><span></span></div><button type="button" aria-label="Tutup"><i class="fas fa-xmark"></i></button>';
    node.querySelector("button").addEventListener("click",function(){node.classList.remove("show");});
    document.body.appendChild(node);
    return node;
  }
  function notify(title,message,tone){
    var node=ensureNotice();
    node.dataset.tone=tone||"warning";
    node.querySelector("b").textContent=clean(title,100);
    node.querySelector("span").textContent=clean(message,360);
    node.classList.add("show");
    clearTimeout(node.__timer);
    node.__timer=setTimeout(function(){node.classList.remove("show");},5200);
  }
  function withTimeout(promise,timeoutMs,label){
    return new Promise(function(resolve,reject){
      var done=false;
      var timer=setTimeout(function(){if(done)return;done=true;reject(new Error((label||"Proses")+" melewati batas waktu."));},timeoutMs||12000);
      Promise.resolve(promise).then(function(value){if(done)return;done=true;clearTimeout(timer);resolve(value);},function(error){if(done)return;done=true;clearTimeout(timer);reject(error);});
    });
  }
  async function fetchJson(url,options){
    options=options||{};
    var controller=new AbortController();
    var timeout=Number(options.timeoutMs||12000);
    var timer=setTimeout(function(){controller.abort();},timeout);
    try{
      var response=await fetch(url,Object.assign({cache:"no-store",credentials:"same-origin",signal:controller.signal,headers:{Accept:"application/json"}},options,{signal:controller.signal}));
      var data=await response.json().catch(function(){return {};});
      if(!response.ok) throw new Error(data.message||data.error||("HTTP "+response.status));
      return data;
    }finally{clearTimeout(timer);}
  }
  function normalizedHealth(row){
    var raw=String(row&&row.status||"unknown").toLowerCase();
    if(raw==="operational") return "ready";
    if(raw==="degraded") return "degraded";
    if(raw==="offline") return "offline";
    return "unknown";
  }
  function cardStatus(id){
    var meta=registry&&registry.get(id);
    if(meta&&meta.restricted) return "restricted";
    return normalizedHealth(healthMap[id]);
  }
  function applyCardStatus(){
    Array.prototype.forEach.call(document.querySelectorAll("[data-tool-id]"),function(card){
      var id=toolIdFromCard(card); if(!id) return;
      var meta=registry&&registry.get(id);
      var status=cardStatus(id);
      card.dataset.nxToolMode=meta?meta.mode:"unknown";
      card.dataset.nxToolStatus=status;
      var badge=card.querySelector(".nx-card-readiness");
      // Status slots are rendered with the card. Do not append nodes after paint:
      // appending a badge here changes card geometry and can shift the scroll anchor.
      if(badge){
        var badgeText=registry?registry.statusLabel(status):status;
        if(badge.textContent!==badgeText) badge.textContent=badgeText;
        badge.setAttribute("aria-label","Status fitur: "+badgeText);
      }
      if(status==="offline") card.setAttribute("aria-disabled","true"); else card.removeAttribute("aria-disabled");
    });
  }
  async function loadHealth(force){
    if(statusPromise&&!force) return statusPromise;
    statusPromise=fetchJson("/api/tool-health?refresh="+(force?"force":"auto"),{timeoutMs:15000}).then(function(payload){
      healthMap=Object.create(null);
      (payload.data||[]).forEach(function(row){healthMap[String(row.toolId||"")]=row;});
      applyCardStatus();
      return payload;
    }).catch(function(error){
      console.warn("[Nexora stability] health belum tersedia",error&&error.message?error.message:error);
      applyCardStatus();
      return {ok:false,data:[]};
    });
    return statusPromise;
  }
  function consumeHealthPayload(payload){
    healthMap=Object.create(null);
    ((payload&&payload.data)||[]).forEach(function(row){healthMap[String(row.toolId||"")]=row;});
    applyCardStatus();
  }
  document.addEventListener("nexora:tool-health-loaded",function(event){consumeHealthPayload(event.detail||{});});
  document.addEventListener("nexora:tools-rendered",function(){applyCardStatus();});

  function handlerReady(meta,frameWindow){
    var scope=frameWindow||window;
    if(!meta||!meta.handler) return true;
    return typeof scope[meta.handler]==="function";
  }
  async function audit(options){
    options=options||{};
    var started=Date.now();
    if(!registry) throw new Error("Tool registry tidak tersedia.");
    await loadHealth(Boolean(options.refreshHealth));
    var results=[];
    var manager=window.NexoraModules||null;
    var items=registry.list();
    var moduleState=Object.create(null);
    var moduleNames=Array.from(new Set(items.map(function(item){return item.module;}).filter(Boolean)));
    if(options.loadModules!==false&&manager&&typeof manager.ensure==="function"){
      await Promise.all(moduleNames.map(async function(name){
        try{await withTimeout(manager.ensure(name),10000,"Modul "+name);moduleState[name]={ok:true};}
        catch(error){moduleState[name]={ok:false,error:clean(error&&error.message||error,240)};}
      }));
    }
    for(var i=0;i<items.length;i++){
      var meta=items[i];
      var issues=[];
      var status="ready";
      var moduleLoaded=false;
      if(meta.restricted){status="restricted";issues.push("Fitur memerlukan akses atau alur khusus.");}
      if(meta.module){
        if(!manager||typeof manager.ensure!=="function"){
          status="missing";issues.push("Module manager tidak tersedia.");
        }else if(options.loadModules!==false){
          moduleLoaded=Boolean(moduleState[meta.module]&&moduleState[meta.module].ok);
          if(!moduleLoaded){status="missing";issues.push(moduleState[meta.module]&&moduleState[meta.module].error||("Modul "+meta.module+" gagal dimuat."));}
        }
      }
      if(status!=="missing"&&!handlerReady(meta)){
        status="missing";issues.push("Handler "+meta.handler+" tidak ditemukan.");
      }
      var health=healthMap[meta.id]||null;
      var healthStatus=normalizedHealth(health);
      if(status==="ready"&&healthStatus==="offline"){status="offline";issues.push(health.lastError||"Dependensi tidak dapat dijangkau.");}
      else if(status==="ready"&&healthStatus==="degraded"){status="degraded";issues.push(health.lastError||"Dependensi merespons terbatas.");}
      var card=Array.prototype.find.call(document.querySelectorAll("[data-tool-id]"),function(node){return toolIdFromCard(node)===meta.id;});
      if(!card){if(status==="ready")status="missing";issues.push("Kartu tool tidak ditemukan di DOM.");}
      results.push({id:meta.id,name:meta.name,mode:meta.mode,module:meta.module,status:status,handler:meta.handler,moduleLoaded:moduleLoaded,healthStatus:healthStatus,httpStatus:health&&health.httpStatus!=null?health.httpStatus:null,latencyMs:health&&health.latencyMs!=null?health.latencyMs:null,issues:issues});
    }
    var counts={ready:0,degraded:0,offline:0,restricted:0,missing:0};
    results.forEach(function(item){counts[item.status]=(counts[item.status]||0)+1;});
    lastAudit={version:"6.3.8",startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),durationMs:Date.now()-started,counts:counts,total:results.length,results:results};
    try{localStorage.setItem("nexora-functional-audit-v62",JSON.stringify(lastAudit));}catch(_){ }
    window.dispatchEvent(new CustomEvent("nexora:functional-audit-complete",{detail:lastAudit}));
    return lastAudit;
  }

  document.addEventListener("click",function(event){
    var card=event.target&&event.target.closest?event.target.closest("[data-tool-id]"):null;
    var id=toolIdFromCard(card); if(!id) return;
    var meta=registry&&registry.get(id);
    var status=cardStatus(id);
    if(status==="offline"){
      event.preventDefault();event.stopPropagation();if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();
      notify((meta&&meta.name)||"Fitur sedang bermasalah","Dependensi fitur tidak dapat dijangkau. Coba lagi nanti atau cek status Health.","error");
    }
  },true);
  document.addEventListener("nexora:tool-error",function(event){
    var detail=event.detail||{};
    var meta=registry&&registry.get(detail.toolId);
    notify((meta&&meta.name)||"Fitur gagal dibuka",detail.reason||"Modul atau dependensi gagal dimuat.","error");
  });
  document.addEventListener("nexora:network-error",function(event){
    var detail=event.detail||{};
    if(detail.status&&detail.status<500)return;
    notify("Koneksi fitur terganggu",detail.reason==="TIMEOUT"?"Server terlalu lama merespons. Coba kembali beberapa saat lagi.":"API atau jaringan gagal dihubungi. Status fitur telah dicatat.","error");
  });
  document.addEventListener("nexora:module-loaded",function(){setTimeout(applyCardStatus,0);});
  document.addEventListener("DOMContentLoaded",function(){
    if(window.__NEXORA_TOOL_HEALTH_PAYLOAD__) consumeHealthPayload(window.__NEXORA_TOOL_HEALTH_PAYLOAD__);
    else applyCardStatus();
  });

  window.NexoraStability={version:"6.3.8",audit:audit,loadHealth:loadHealth,applyCardStatus:applyCardStatus,notify:notify,fetchJson:fetchJson,getLastAudit:function(){return lastAudit;},getHealth:function(id){return healthMap[id]||null;}};
  window.dispatchEvent(new CustomEvent("nexora:stability-ready"));
})();

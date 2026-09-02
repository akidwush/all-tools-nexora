(function(){
  "use strict";
  var state={result:null,running:false};
  var $=function(selector){return document.querySelector(selector);};
  function escapeHtml(value){return String(value==null?"":value).replace(/[&<>'"]/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char];});}
  function formatDate(value){if(!value)return "Belum dijalankan";var date=new Date(value);if(Number.isNaN(date.getTime()))return "-";return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(date);}
  function statusLabel(value){return ({ready:"Siap",degraded:"Terbatas",offline:"Gangguan",restricted:"Akses khusus",missing:"Tidak lengkap",unknown:"Belum dicek"})[value]||value;}
  function statusIcon(value){return ({ready:"fa-circle-check",degraded:"fa-gauge-high",offline:"fa-circle-xmark",restricted:"fa-lock",missing:"fa-triangle-exclamation"})[value]||"fa-circle-question";}
  function metric(icon,label,value,caption,tone){return '<article class="metric-card" style="--accent:'+tone[0]+';--accent-text:'+tone[1]+'"><span class="metric-icon"><i class="fa-solid '+icon+'"></i></span><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong><small>'+escapeHtml(caption)+'</small></article>';}
  function setProgress(show,text,percent){var wrap=$("#functionalProgress");if(!wrap)return;wrap.hidden=!show;var label=wrap.querySelector("span"),bar=wrap.querySelector("i");if(label)label.textContent=text||"";if(bar)bar.style.width=Math.max(2,Math.min(100,Number(percent)||0))+"%";}
  function render(){
    var result=state.result;
    var metrics=$("#functionalMetrics"),list=$("#functionalAuditList"),time=$("#functionalAuditTime");
    if(!metrics||!list)return;
    if(!result){metrics.innerHTML="";return;}
    var counts=result.counts||{};
    metrics.innerHTML=[
      metric("fa-list-check","Total diuji",result.total||0,"seluruh tool registry",["rgba(168,85,247,.13)","#c084fc"]),
      metric("fa-circle-check","Siap",counts.ready||0,"handler dan modul tersedia",["rgba(52,211,153,.11)","#6ee7b7"]),
      metric("fa-gauge-high","Terbatas",(counts.degraded||0)+(counts.restricted||0),"API atau akses khusus",["rgba(251,191,36,.10)","#fcd34d"]),
      metric("fa-triangle-exclamation","Perlu diperbaiki",(counts.offline||0)+(counts.missing||0),"gangguan atau file hilang",["rgba(251,113,133,.10)","#fda4af"])
    ].join("");
    if(time)time.textContent="Selesai: "+formatDate(result.completedAt);
    var filter=$("#functionalStatusFilter")?$("#functionalStatusFilter").value:"all";
    var rows=(result.results||[]).filter(function(item){return filter==="all"||item.status===filter;});
    list.innerHTML=rows.length?rows.map(function(item){
      var issue=(item.issues||[]).join(" · ")||"Struktur dan handler terdeteksi.";
      var details=[item.mode,item.module?"modul "+item.module:null,item.httpStatus!=null?"HTTP "+item.httpStatus:null,item.latencyMs!=null?item.latencyMs+" ms":null].filter(Boolean).join(" · ");
      return '<article class="functional-row status-'+escapeHtml(item.status)+'"><span class="functional-row-icon"><i class="fa-solid '+statusIcon(item.status)+'"></i></span><div><header><b>'+escapeHtml(item.name)+'</b><code>'+escapeHtml(item.id)+'</code></header><p>'+escapeHtml(issue)+'</p><small>'+escapeHtml(details||"local")+'</small></div><span class="functional-status">'+escapeHtml(statusLabel(item.status))+'</span></article>';
    }).join(""):'<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><b>Tidak ada hasil pada filter ini</b><span>Pilih status lain untuk melihat hasil audit.</span></div>';
  }
  function waitForStability(frame,timeoutMs){return new Promise(function(resolve,reject){var started=Date.now();(function poll(){try{if(frame.contentWindow&&frame.contentWindow.NexoraStability)return resolve(frame.contentWindow.NexoraStability);}catch(error){return reject(error);}if(Date.now()-started>timeoutMs)return reject(new Error("Halaman audit tidak siap dalam batas waktu."));setTimeout(poll,120);})();});}
  async function run(){
    if(state.running)return;
    var button=$("#runFunctionalAudit"),frame=$("#functionalAuditFrame");if(!button||!frame)return;
    state.running=true;button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Mengaudit...';
    setProgress(true,"Memuat halaman publik tanpa menjalankan aksi tool...",12);
    try{
      await new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(new Error("Halaman publik gagal dimuat."));},18000);frame.onload=function(){clearTimeout(timer);resolve();};frame.onerror=function(){clearTimeout(timer);reject(new Error("Iframe audit gagal dimuat."));};frame.src="/?nxFunctionalAudit="+Date.now();});
      setProgress(true,"Memeriksa registry dan memuat seluruh modul...",42);
      var stability=await waitForStability(frame,12000);
      var progressTimer=setInterval(function(){var bar=$("#functionalProgress i");if(bar){var current=parseFloat(bar.style.width)||42;bar.style.width=Math.min(88,current+3)+"%";}},350);
      try{state.result=await stability.audit({loadModules:true,refreshHealth:false});}finally{clearInterval(progressTimer);}
      try{localStorage.setItem("nexora-admin-functional-audit-healthfix1",JSON.stringify(state.result));}catch(_){ }
      setProgress(true,"Audit selesai. Menyusun laporan...",100);render();
      setTimeout(function(){setProgress(false,"",0);},650);
    }catch(error){
      setProgress(false,"",0);
      var list=$("#functionalAuditList");if(list)list.innerHTML='<div class="empty-state audit-error"><i class="fa-solid fa-triangle-exclamation"></i><b>Functional audit gagal</b><span>'+escapeHtml(error&&error.message||error)+'</span></div>';
    }finally{
      frame.removeAttribute("src");state.running=false;button.disabled=false;button.innerHTML='<i class="fa-solid fa-play"></i> Jalankan Audit';
    }
  }
  function restore(){try{var cached=JSON.parse(localStorage.getItem("nexora-admin-functional-audit-healthfix1")||"null");if(cached&&cached.version==="6.4.0-healthfix1"&&Array.isArray(cached.results)){state.result=cached;render();}}catch(_){ }}
  function bind(){var button=$("#runFunctionalAudit"),filter=$("#functionalStatusFilter");if(button)button.addEventListener("click",run);if(filter)filter.addEventListener("change",render);document.addEventListener("nexora:functional-section-open",function(){if(!state.result)restore();});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){restore();bind();});else{restore();bind();}
  window.NexoraAdminFunctionalAudit={run:run,render:render};
})();

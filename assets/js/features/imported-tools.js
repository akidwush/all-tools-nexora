/* Imported source applications — standalone canonical apps. Classic script; keep execution order. */

/* ===== nxImportedStandaloneApps ===== */
(function(){
  "use strict";

  var NX_SOURCE_APPS = {
    mltools:{title:"ML Tools Nexora",icon:"fa-solid fa-gamepad",engine:"ORIGINAL ML ENGINE",loading:"Memuat ML Tools",src:"/assets/apps/ml-tools/index.html?v=standalone-v1"},
    promptgenerate:{title:"Prompt Generator",icon:"fa-solid fa-wand-magic-sparkles",engine:"LOCAL SOURCE ENGINE",loading:"Memuat Prompt Generator",src:"/assets/apps/prompt-generator/index.html?v=standalone-v1"},
    fakeovo:{title:"Fake OVO",icon:"fa-solid fa-wallet",engine:"ORIGINAL CANVAS",loading:"Memuat Generator OVO",src:"/assets/apps/fake-ovo/index.html?v=standalone-v1"},
    quotegenerator:{title:"Quote Generator",icon:"fa-solid fa-quote-left",engine:"ORIGINAL CANVAS",loading:"Memuat Quote Generator",src:"/assets/apps/quote-generator/index.html?v=standalone-v1"},
    carifakta:{title:"CariFakta",icon:"fa-solid fa-magnifying-glass-chart",engine:"ORIGINAL GROQ API",loading:"Memuat CariFakta",src:"/assets/apps/cari-fakta/index.html?v=standalone-v1"}
  };

  function renderSource(body,toolId){
    var config=NX_SOURCE_APPS[toolId];
    if(!config) return;

    var fullPage=toolId==="mltools";
    body.classList.toggle("nx-mltools-full-body",fullPage);
    body.innerHTML=
      '<div class="nx-imported-source'+(fullPage?' nx-imported-source-full':'')+'" data-source-tool="'+toolId+'">'+
        (fullPage?'':'<div class="nx-imported-toolbar"><span class="nx-imported-toolbar-icon"><i class="'+config.icon+'"></i></span><div class="nx-imported-toolbar-copy"><b>'+config.title+'</b><span>Nexora Tool Engine</span></div><span class="nx-imported-engine">'+config.engine+'</span></div>')+
        '<div class="nx-imported-stage"><div class="nx-imported-loading"><div class="nx-imported-loader-box"><span class="nx-imported-spinner"></span><span>'+config.loading+'</span></div></div><iframe class="nx-imported-frame" title="'+config.title+'" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" allow="clipboard-write; fullscreen" referrerpolicy="no-referrer" loading="eager"></iframe></div>'+
      '</div>';

    var frame=body.querySelector(".nx-imported-frame");
    var loading=body.querySelector(".nx-imported-loading");
    if(!frame) return;
    frame.addEventListener("load",function(){if(loading) loading.classList.add("is-hidden");},{once:true});
    frame.addEventListener("error",function(){if(loading){loading.innerHTML='<div class="nx-imported-loader-box" style="color:#fb7185"><i class="fa-solid fa-triangle-exclamation"></i><span>Fitur gagal dimuat</span></div>'; }},{once:true});
    frame.src=config.src;
  }

  window.renderPromptGenerator=function(body){renderSource(body,"promptgenerate");};
  window.renderFakeOvo=function(body){renderSource(body,"fakeovo");};
  window.renderQuoteGenerator=function(body){renderSource(body,"quotegenerator");};
  window.renderCariFakta=function(body){renderSource(body,"carifakta");};
  window.renderMlTools=function(body){renderSource(body,"mltools");};
})();

/* ===== nxFourImportedToolsBackFix ===== */
(function(){
  "use strict";
  var importedTools = new Set(["promptgenerate","fakeovo","quotegenerator","carifakta","mltools"]);
  function activeImportedRoom(){
    var room=document.getElementById("nxUniversalRoom");
    if(!room||!room.classList.contains("is-open")) return null;
    var toolId=room.getAttribute("data-tool")||"";
    return importedTools.has(toolId)?room:null;
  }
  function closeImportedRoom(event){
    var room=activeImportedRoom(); if(!room) return false;
    if(event){event.preventDefault();event.stopPropagation();if(typeof event.stopImmediatePropagation==="function") event.stopImmediatePropagation();}
    room.classList.remove("is-visible","is-open"); room.style.display="none"; room.setAttribute("aria-hidden","true");
    var roomBody=document.getElementById("nxUniversalRoomBody"); if(roomBody) roomBody.innerHTML="";
    document.body.classList.remove("nx-universal-room-open"); document.body.style.overflow="auto";
    try{
      if(history.state&&importedTools.has(history.state.nxUniversalTool)) history.replaceState(null,"",location.href.split("#")[0]);
      else if(/^#tool-(promptgenerate|fakeovo|quotegenerator|carifakta|mltools)/.test(location.hash)) history.replaceState(null,"",location.href.split("#")[0]);
    }catch(error){}
    return true;
  }
  document.addEventListener("click",function(event){var button=event.target&&event.target.closest?event.target.closest("#nxUniversalRoomBack"):null;if(button&&activeImportedRoom()) closeImportedRoom(event);},true);
  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&activeImportedRoom()) closeImportedRoom(event);},true);
  window.closeImportedNexoraTool=closeImportedRoom;
})();

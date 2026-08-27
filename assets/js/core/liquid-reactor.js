/* Nexora HF22 — canonical Android navigation on every device. */
(function(){
  "use strict";
  if(window.__NEXORA_LIQUID_REACTOR__)return;

  var nav=document.getElementById("navTabs");
  var indicator=null;
  var frame=0;

  function raf(callback){
    return window.requestAnimationFrame?window.requestAnimationFrame(callback):setTimeout(callback,16);
  }

  function activeTab(){
    return nav&&nav.querySelector(".nav-tab.active");
  }

  function positionIndicator(){
    if(!indicator||!nav)return;
    var active=activeTab();
    if(!active)return;
    var navBox=nav.getBoundingClientRect();
    var tabBox=active.getBoundingClientRect();
    indicator.style.transform="translate3d("+Math.round(tabBox.left-navBox.left+nav.scrollLeft)+"px,0,0)";
    indicator.style.width=Math.round(tabBox.width)+"px";
    indicator.style.height=Math.round(tabBox.height)+"px";
  }

  function scheduleIndicator(){
    if(frame)return;
    frame=raf(function(){
      frame=0;
      positionIndicator();
    });
  }

  function setupNavigation(){
    if(!nav)return;
    nav.addEventListener("keydown",function(event){
      if(!/^Arrow(Left|Right)$/.test(event.key))return;
      var tabs=Array.prototype.slice.call(nav.querySelectorAll(".nav-tab"));
      var index=tabs.indexOf(document.activeElement);
      if(index<0)return;
      event.preventDefault();
      var next=(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });

    indicator=document.createElement("span");
    indicator.className="nx-mercury-indicator";
    indicator.setAttribute("aria-hidden","true");
    nav.prepend(indicator);
    positionIndicator();
    window.addEventListener("resize",scheduleIndicator,{passive:true});
    nav.addEventListener("scroll",scheduleIndicator,{passive:true});
    document.addEventListener("nexora:navigation-changed",scheduleIndicator);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(scheduleIndicator);
  }

  function updateCatalogMeta(event){
    var detail=event&&event.detail||{};
    var active=document.querySelector(".tab-content.active .section-title");
    if(!active)return;
    var meta=active.querySelector(".nx-catalog-meta");
    if(!meta){
      meta=document.createElement("span");
      meta.className="nx-catalog-meta";
      meta.innerHTML='<span>reactor catalog</span><b class="nx-catalog-count">0</b>';
      active.appendChild(meta);
    }
    var count=meta.querySelector(".nx-catalog-count");
    if(count)count.textContent=String(Number(detail.count)||0);
  }

  function setupCatalog(){
    document.addEventListener("nexora:tools-rendered",updateCatalogMeta);
    raf(function(){
      var initial=document.querySelectorAll(".tab-content.active .tools-card").length;
      document.dispatchEvent(new CustomEvent("nexora:tools-rendered",{detail:{count:initial,total:initial,tab:"all"}}));
    });
  }

  function init(){
    setupNavigation();
    setupCatalog();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();

  window.__NEXORA_CURSOR_REACTOR__={version:"2.0.0",enabled:false,reason:"unified-original-ui"};
  window.__NEXORA_LIQUID_REACTOR__={version:"2.0.0",unifiedOriginalUi:true};
})();

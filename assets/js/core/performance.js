/* Nexora v6.3 — public performance coordinator. */
(function(){
  "use strict";
  if(window.__NEXORA_PERFORMANCE__) return;

  var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var reduced=false;
  try{reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;}catch(_){ }
  var lowPower=Boolean((connection&&connection.saveData)||(navigator.deviceMemory&&navigator.deviceMemory<=4)||reduced||/Android/i.test(navigator.userAgent||"")&&window.innerWidth<=768);
  if(lowPower) document.documentElement.classList.add("nx-low-power");

  function schedule(task,options){
    options=options||{};
    if(typeof requestIdleCallback==="function") return requestIdleCallback(task,{timeout:Number(options.timeout||1800)});
    return setTimeout(task,Math.min(Number(options.timeout||700),700));
  }
  window.NexoraScheduleIdle=schedule;

  function removeSplash(){
    var splash=document.getElementById("splash");
    if(!splash)return;
    splash.style.pointerEvents="none";
    setTimeout(function(){if(splash&&splash.parentNode)splash.remove();},lowPower?420:1050);
  }

  function initHeroVideo(){
    var hero=document.querySelector("[data-nx-hero]");
    var video=hero&&hero.querySelector("video[data-src]");
    if(!hero||!video||lowPower||document.visibilityState==="hidden")return;
    var source=String(video.dataset.src||"");
    if(!source)return;
    video.src=source;
    video.addEventListener("canplay",function(){hero.classList.add("is-video-ready");video.play().catch(function(){});},{once:true});
    video.addEventListener("error",function(){video.removeAttribute("src");hero.classList.remove("is-video-ready");},{once:true});
    video.load();
    document.addEventListener("visibilitychange",function(){
      if(document.hidden)video.pause();
      else if(hero.classList.contains("is-video-ready"))video.play().catch(function(){});
    });
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",removeSplash,{once:true});
  else removeSplash();
  window.addEventListener("load",function(){schedule(initHeroVideo,{timeout:3200});},{once:true});

  window.__NEXORA_PERFORMANCE__={version:"6.3.0",lowPower:lowPower,schedule:schedule};
})();

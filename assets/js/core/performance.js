/* Nexora v6.3.12 — adaptive hero video without mobile scroll decode jank. */
(function(){
  "use strict";
  if(window.__NEXORA_PERFORMANCE__) return;

  var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var reduced=false;
  try{reduced=Boolean(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);}catch(_){ }

  var memory=Number(navigator.deviceMemory||0);
  var cores=Number(navigator.hardwareConcurrency||0);
  var effectiveType=String(connection&&connection.effectiveType||"").toLowerCase();
  var verySlowNetwork=/^(slow-2g|2g)$/.test(effectiveType);
  var mobileLike=false;
  try{
    mobileLike=Boolean(window.matchMedia&&window.matchMedia("(max-width: 900px), (pointer: coarse)").matches);
  }catch(_){mobileLike=window.innerWidth<=900;}

  var lowPower=Boolean(
    (connection&&connection.saveData) ||
    (memory>0&&memory<=3) ||
    (cores>0&&cores<=4) ||
    verySlowNetwork ||
    reduced
  );

  var heroMode=lowPower?"disabled":(mobileLike?"manual":"auto");
  document.documentElement.classList.add("nx-hero-video-"+heroMode);
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
    setTimeout(function(){if(splash&&splash.parentNode)splash.remove();},lowPower?360:760);
  }

  function initHeroVideo(){
    var hero=document.querySelector("[data-nx-hero]");
    var video=hero&&hero.querySelector("video[data-src]");
    var toggle=hero&&hero.querySelector("[data-nx-hero-toggle]");
    if(!hero||!video||heroMode==="disabled")return;

    var source=String(video.dataset.src||"");
    if(!source)return;

    var loaded=false;
    var ready=false;
    var visible=false;
    var manualPlaying=false;
    var scrollLocked=false;

    function updateToggle(){
      if(!toggle)return;
      var playing=!video.paused&&!video.ended;
      toggle.classList.toggle("is-playing",playing);
      toggle.setAttribute("aria-label",playing?"Jeda banner anime":"Putar banner anime");
      toggle.setAttribute("aria-pressed",playing?"true":"false");
      var icon=toggle.querySelector("i");
      if(icon)icon.className=playing?"fas fa-pause":"fas fa-play";
    }

    function ensureLoaded(){
      if(loaded)return;
      loaded=true;
      video.preload="metadata";
      video.src=source;
      video.load();
    }

    function pauseVideo(){
      if(!video.paused)video.pause();
      manualPlaying=false;
      updateToggle();
    }

    function canAutoPlay(){
      return heroMode==="auto"&&visible&&!document.hidden&&ready;
    }

    function syncPlayback(){
      if(canAutoPlay()){
        video.play().then(updateToggle).catch(updateToggle);
      }else if(heroMode==="auto"){
        pauseVideo();
      }else if(heroMode==="manual"&&(!visible||document.hidden||scrollLocked)){
        pauseVideo();
      }
    }

    video.addEventListener("loadeddata",function(){
      ready=true;
      hero.classList.add("is-video-ready");
      updateToggle();
      syncPlayback();
    },{once:true});

    video.addEventListener("play",updateToggle);
    video.addEventListener("pause",updateToggle);
    video.addEventListener("error",function(){
      pauseVideo();
      video.removeAttribute("src");
      video.load();
      hero.classList.remove("is-video-ready");
      hero.classList.add("is-video-error");
      if(toggle)toggle.hidden=true;
    },{once:true});

    if(toggle){
      toggle.hidden=false;
      toggle.addEventListener("click",function(){
        if(heroMode!=="manual")return;
        ensureLoaded();
        scrollLocked=false;
        if(!video.paused){
          pauseVideo();
          return;
        }
        manualPlaying=true;
        video.play().then(updateToggle).catch(function(){
          manualPlaying=false;
          updateToggle();
        });
      });
    }

    function onVisibility(entry){
      visible=Boolean(entry&&entry.isIntersecting&&entry.intersectionRatio>=0.35);
      if(visible)ensureLoaded();
      syncPlayback();
    }

    if("IntersectionObserver" in window){
      var observer=new IntersectionObserver(function(entries){onVisibility(entries[0]);},{threshold:[0,0.35,0.7]});
      observer.observe(hero);
    }else{
      visible=true;
      ensureLoaded();
      syncPlayback();
    }

    document.addEventListener("visibilitychange",syncPlayback);
    window.addEventListener("pagehide",pauseVideo);

    if(heroMode==="manual"){
      var scrollTicking=false;
      window.addEventListener("scroll",function(){
        if(scrollTicking)return;
        scrollTicking=true;
        requestAnimationFrame(function(){
          scrollTicking=false;
          if(window.scrollY>24){
            scrollLocked=true;
            if(manualPlaying||!video.paused)pauseVideo();
          }
        });
      },{passive:true});
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",removeSplash,{once:true});
  else removeSplash();

  window.addEventListener("load",function(){
    schedule(initHeroVideo,{timeout:2200});
  },{once:true});

  window.__NEXORA_PERFORMANCE__={
    version:"6.3.12",
    lowPower:lowPower,
    mobileLike:mobileLike,
    heroMode:heroMode,
    schedule:schedule
  };
})();

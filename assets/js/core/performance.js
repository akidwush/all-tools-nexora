/* Nexora v6.3.18 HF3 — adaptive, database-configurable hero video. */
(function(){
  "use strict";
  if(window.__NEXORA_PERFORMANCE__) return;

  var DEFAULT_HERO_VIDEO_URL="https://files.catbox.moe/4ijdle.mp4";
  var LEGACY_HERO_SETTINGS_CACHE_KEY="nexora_hero_settings_v1";
  var HERO_SETTINGS_TIMEOUT_MS=1800;

  function safeHeroUrl(value,fallback){
    var text=String(value||"").trim();
    if(!text)return fallback;
    try{
      var parsed=new URL(text,location.href);
      if(parsed.username||parsed.password)return fallback;
      if(parsed.protocol==="https:"||parsed.origin===location.origin)return parsed.href;
    }catch(_){ }
    return fallback;
  }

  function normalizeHeroConfig(value,fallback){
    var source=value&&typeof value==="object"?value:{};
    return {
      enabled:source.enabled!==false,
      url:safeHeroUrl(source.url,fallback||DEFAULT_HERO_VIDEO_URL)
    };
  }

  // Do not allow a stale local setting to hide the hero. Older builds cached
  // disabled flags and obsolete URLs, then used them whenever the API timed out.
  try{localStorage.removeItem(LEGACY_HERO_SETTINGS_CACHE_KEY);}catch(_){ }

  async function loadHeroConfig(fallback){
    var fallbackConfig=normalizeHeroConfig(null,fallback);
    var controller=typeof AbortController==="function"?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},HERO_SETTINGS_TIMEOUT_MS):null;
    try{
      var response=await fetch("/api/database?resource=settings",{
        method:"GET",cache:"no-store",credentials:"same-origin",
        headers:{Accept:"application/json"},signal:controller?controller.signal:undefined
      });
      if(!response.ok)return fallbackConfig;
      var payload=await response.json();
      var rows=Array.isArray(payload&&payload.data)?payload.data:[];
      var site=rows.find(function(item){return item&&item.key==="site";});
      var config=normalizeHeroConfig(site&&site.value&&site.value.heroVideo,fallback);
      return config;
    }catch(_){
      return fallbackConfig;
    }finally{
      if(timer)clearTimeout(timer);
    }
  }

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

  // The hero is a primary visual, not an optional mobile enhancement. Keep the
  // same muted inline video eligible for autoplay on every device.
  var heroMode="auto";
  document.documentElement.classList.add("nx-hero-video-"+heroMode);
  if(lowPower) document.documentElement.classList.add("nx-low-power");

  var heroElement=document.querySelector("[data-nx-hero]");
  var heroVideo=heroElement&&heroElement.querySelector("video[data-src]");
  var initialHeroUrl=heroVideo&&heroVideo.dataset.src||DEFAULT_HERO_VIDEO_URL;
  var heroConfigPromise=loadHeroConfig(initialHeroUrl);

  function schedule(task,options){
    options=options||{};
    if(typeof requestIdleCallback==="function") return requestIdleCallback(task,{timeout:Number(options.timeout||1800)});
    return setTimeout(task,Math.min(Number(options.timeout||700),700));
  }
  window.NexoraScheduleIdle=schedule;

  async function initHeroVideo(){
    var hero=heroElement||document.querySelector("[data-nx-hero]");
    var video=heroVideo||(hero&&hero.querySelector("video[data-src]"));
    if(!hero||!video)return;
    var loaded=false;
    var ready=false;
    var autoplayBlocked=false;
    var heroVisible=true;
    var interactionRetryArmed=false;
    var interactionRetryUsed=false;

    video.autoplay=true;
    video.muted=true;
    video.defaultMuted=true;
    video.loop=true;
    video.playsInline=true;
    video.controls=false;
    video.removeAttribute("controls");

    function isSameSource(candidate){
      if(!candidate)return false;
      try{return new URL(video.currentSrc||video.src,location.href).href===new URL(candidate,location.href).href;}catch(_){return false;}
    }

    // The static source starts decoding immediately, before optional settings
    // return. This keeps the primary desktop visual independent of API timing.
    var source=String(video.dataset.src||video.getAttribute("src")||DEFAULT_HERO_VIDEO_URL);

    function ensureLoaded(){
      if(loaded)return;
      loaded=true;
      video.preload="metadata";
      // Never reload an already attached source: reloading resets currentTime
      // and can leave a desktop video frozen after a cache/config response.
      if(!isSameSource(source)){
        video.src=source;
        video.load();
      }
    }

    function armInteractionRetry(){
      if(interactionRetryArmed||interactionRetryUsed)return;
      interactionRetryArmed=true;
      var events=["pointerdown","touchstart","keydown"];
      function cleanup(){
        interactionRetryArmed=false;
        events.forEach(function(type){document.removeEventListener(type,retry);});
      }
      function retry(){
        cleanup();
        interactionRetryUsed=true;
        if(document.hidden)return;
        Promise.resolve(video.play()).then(function(){autoplayBlocked=false;}).catch(function(){ });
      }
      events.forEach(function(type){document.addEventListener(type,retry,{once:true,passive:true});});
    }

    function ensurePlayback(){
      if(!ready||document.hidden||autoplayBlocked||(mobileLike&&!heroVisible))return;
      Promise.resolve(video.play()).then(function(){autoplayBlocked=false;}).catch(function(){
        autoplayBlocked=true;
        armInteractionRetry();
      });
    }

    function suspendPlayback(){
      if(mobileLike&&!video.paused)video.pause();
    }

    function markReady(){
      ready=true;
      hero.classList.add("is-video-ready");
      ensurePlayback();
    }
    video.addEventListener("loadeddata",markReady,{once:true});
    video.addEventListener("canplay",markReady,{once:true});

    video.addEventListener("error",function(){
      hero.classList.remove("is-video-ready");
      hero.classList.add("is-video-error");
    },{once:true});

    function onVisibility(entry){
      heroVisible=Boolean(entry&&entry.isIntersecting);
      if(heroVisible){ensureLoaded();ensurePlayback();}
      else suspendPlayback();
    }

    // Start immediately so desktop playback never waits for remote settings.
    ensureLoaded();
    if(video.readyState>=2)markReady();

    var heroConfig=await heroConfigPromise;
    if(!heroConfig.enabled){
      document.documentElement.classList.remove("nx-hero-video-auto");
      document.documentElement.classList.add("nx-hero-video-disabled");
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }
    video.dataset.src=heroConfig.url;
    source=String(heroConfig.url||source);
    if(!isSameSource(source)){
      loaded=false;
      ready=false;
      ensureLoaded();
    }else{
      ensurePlayback();
    }

    // Load once so the identity frame remains available. On phones the same
    // element is paused outside the viewport, releasing decoder/compositor
    // pressure without reloading or resetting the video.
    if("IntersectionObserver" in window){
      var observer=new IntersectionObserver(function(entries){onVisibility(entries[0]);},{threshold:[0,0.01,0.35]});
      observer.observe(hero);
    }else{
      ensureLoaded();
    }

    document.addEventListener("visibilitychange",function(){
      if(document.hidden)suspendPlayback();
      else if(!autoplayBlocked)ensurePlayback();
    });

  }


  window.addEventListener("load",function(){
    schedule(initHeroVideo,{timeout:2200});
  },{once:true});

  window.__NEXORA_PERFORMANCE__={
    version:"6.3.18",
    lowPower:lowPower,
    mobileLike:mobileLike,
    heroMode:heroMode,
    heroSettings:heroConfigPromise,
    schedule:schedule
  };
})();

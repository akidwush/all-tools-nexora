/* Nexora v6.4.0 lazy module loader */
(function(){
  'use strict';

  var config=window.NexoraConfig;
  if(!config||!config.tools||!config.modules)throw new Error("NexoraConfig harus dimuat sebelum lazy-loader.js.");

  var modules=config.modules;
  var toolModules=Object.create(null);
  var labels=Object.create(null);
  var moduleDisplayNames=Object.create(null);
  var categories=["downloader","maker","tools","vault","external"];

  function addLabel(label,toolId){
    var normalized=String(label||"").trim().toLowerCase();
    if(normalized)labels[normalized]=toolId;
  }

  categories.forEach(function(category){
    var items=Array.isArray(config.tools[category])?config.tools[category]:[];
    items.forEach(function(item){
      var toolId=String(item.id||"").trim().toLowerCase();
      var runtime=item.runtime||{};
      if(!toolId)return;
      addLabel(toolId,toolId);
      addLabel(item.name,toolId);
      (Array.isArray(item.aliases)?item.aliases:[]).forEach(function(alias){addLabel(alias,toolId);});
      if(runtime.module){
        toolModules[toolId]=runtime.module;
        if(!moduleDisplayNames[runtime.module])moduleDisplayNames[runtime.module]=item.name||toolId;
      }
    });
  });

  var modulePromises = new Map();
  var assetPromises = new Map();
  var ASSET_VERSION = config.version;
  var ASSET_PATCH = 'branding1';
  var ASSET_PATCHES = [
    [/supabase-client\.js(?:$|\?)/, "comic-translate1"],
    [/world-classics\/reader\.js(?:$|\?)/, "classics-translation2"],
    [/nexray-splus(?:-hooks)?\.(?:js|css)(?:$|\?)/, "nexray-splus-v2-integrated"],
    [/(?:assets\/(?:vendor\/nexora|js\/features\/nexora)\/|nexora-generators\.css(?:$|\?))/, 'nexora'],
    [/prompt-generator\.(?:js|css)(?:$|\?)/, 'prompt-responsive2'],
    [/novel-cover(?:-generator|-puter|-director)?\.(?:js|css)(?:$|\?)/, 'novel-cover-v43'],
    [/puter-image\.(?:js|css)(?:$|\?)/, 'puter-image-hf28'],
    [/(?:puter-runtime|puter-video)\.(?:js|css)(?:$|\?)/, 'puter-video-hf47'],
    [/genmail\.(?:js|css)(?:$|\?)/, 'genmail-v1'],
    [/aio-downloader\.(?:js|css)(?:$|\?)/, 'aio-downloader-hf31'],
    [/danbooru-search\.(?:js|css)(?:$|\?)/, 'danbooru-search-hf35'],
    [/anime-to-real\.(?:js|css)(?:$|\?)/, 'anime-to-real-hf37'],
    [/ai-song\.(?:js|css)(?:$|\?)/, 'ai-song-v1'],
    [/elevenlabs-studio\.(?:js|css)(?:$|\?)/, 'elevenlabs-studio-v1'],
    [/hd4-enhancer\.(?:js|css)(?:$|\?)/, 'hd4-enhancer-v2'],
    [/smart-cutout(?:-core)?\.(?:js|css)(?:$|\?)/, 'smart-cutout-v3'],
    [/placeholder-studio\.(?:js|css)(?:$|\?)/, 'placeholder-studio-v3'],
    [/document-ai\.(?:js|css)(?:$|\?)/, 'document-responsive2'],
    [/text-to-pdf\.(?:js|css)(?:$|\?)/, 'auto-pdf-v2'],
    [/crypto-market\.(?:js|css)(?:$|\?)/, 'crypto-mtf'],
    [/comic-reader\.(?:js|css)(?:$|\?)/, 'comic-reader'],
    [/multi-ai(?:-layout)?\.(?:js|css)(?:$|\?)/, 'multi-ai-spatial-v2'],
    [/svg-alight\.(?:js|css)(?:$|\?)/, 'svg-alight'],
    [/alight-premium\.(?:js|css)(?:$|\?)/, 'alight-premium-hf30'],
    [/(?:tiktok|download-pack|source-features)\.js(?:$|\?)/, 'download']
  ];
  var baseShowTool = typeof window.showTool === 'function' ? window.showTool : null;
  var activeCard = null;

  function absolute(url){ return new URL(url, document.baseURI).href; }
  function versioned(url){
    var separator = String(url).indexOf('?')===-1 ? '?' : '&';
    var match=ASSET_PATCHES.find(function(entry){return entry[0].test(String(url));});
    var version=ASSET_VERSION+'-'+(match?match[1]:ASSET_PATCH);
    return String(url)+separator+'v='+encodeURIComponent(version);
  }

  function loadStyle(url){
    var requestUrl = versioned(url);
    var href = absolute(requestUrl);
    if(assetPromises.has(href)) return assetPromises.get(href);
    var existing = Array.prototype.find.call(document.styleSheets || [], function(sheet){ return sheet.href === href; });
    if(existing){ var done = Promise.resolve(); assetPromises.set(href,done); return done; }
    var promise = new Promise(function(resolve,reject){
      var link=document.createElement('link');
      link.rel='stylesheet'; link.href=requestUrl; link.dataset.nxLazyAsset='style';
      link.onload=function(){resolve();};
      link.onerror=function(){reject(new Error('Gagal memuat stylesheet '+requestUrl));};
      document.head.appendChild(link);
    });
    assetPromises.set(href,promise);
    return promise;
  }

  function loadScript(url){
    var requestUrl = versioned(url);
    var src = absolute(requestUrl);
    if(assetPromises.has(src)) return assetPromises.get(src);
    var existing = Array.prototype.find.call(document.scripts || [], function(item){ return item.src === src; });
    if(existing && existing.dataset.nxLoaded === '1'){
      var ready=Promise.resolve(); assetPromises.set(src,ready); return ready;
    }
    var promise = new Promise(function(resolve,reject){
      var script=document.createElement('script');
      script.src=requestUrl; script.async=false; script.dataset.nxLazyAsset='script';
      script.onload=function(){script.dataset.nxLoaded='1';resolve();};
      script.onerror=function(){reject(new Error('Gagal memuat modul '+requestUrl));};
      document.body.appendChild(script);
    });
    assetPromises.set(src,promise);
    return promise;
  }

  function ensureToast(){
    var toast=document.getElementById('nxModuleToast');
    if(toast) return toast;
    toast=document.createElement('div'); toast.id='nxModuleToast'; toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite');
    toast.innerHTML='<i class="fas fa-circle-notch fa-spin"></i><span>Memuat fitur…</span>';
    document.body.appendChild(toast); return toast;
  }

  function setStatus(message,type){
    var toast=ensureToast();
    toast.className='show '+(type||'loading');
    toast.querySelector('i').className = type==='error' ? 'fas fa-triangle-exclamation' : (type==='success' ? 'fas fa-check' : 'fas fa-circle-notch fa-spin');
    toast.querySelector('span').textContent=message;
    clearTimeout(toast.__nxTimer);
    if(type && type!=='loading') toast.__nxTimer=setTimeout(function(){toast.className='';},2200);
  }

  function setCardBusy(card,busy){
    if(!card) return;
    card.classList.toggle('is-module-loading',!!busy);
    if(busy) card.setAttribute('aria-busy','true'); else card.removeAttribute('aria-busy');
  }

  function ensureModule(name){
    if(!modules[name]) return Promise.resolve();
    if(modulePromises.has(name)) return modulePromises.get(name);
    var spec=modules[name];
    var promise=(async function(){
      setStatus('Memuat '+(moduleDisplayNames[name] || ('modul '+name.replace(/-/g,' ')))+'…','loading');
      await Promise.all(spec.css.map(loadStyle));
      for(var i=0;i<spec.js.length;i++) await loadScript(spec.js[i]);
      if(["puter-image","puter-video","ai-song"].indexOf(name)!==-1){
        await loadStyle("assets/css/features/nexray-splus.css");
        await loadScript("assets/js/features/nexray-splus-hooks.js");
      }
      setStatus('Fitur siap digunakan.','success');
      document.dispatchEvent(new CustomEvent('nexora:module-loaded',{detail:{name:name}}));
    })().catch(function(error){ modulePromises.delete(name); setStatus(error.message||'Modul gagal dimuat.','error'); throw error; });
    modulePromises.set(name,promise);
    return promise;
  }

  function toolIdFromCard(card){
    if(!card) return '';
    var explicit=card.getAttribute('data-tool-id')||card.getAttribute('data-nx-room-tool');
    if(explicit) return explicit;
    var heading=card.querySelector('h4,h3,.tool-name');
    var label=heading ? String(heading.textContent||'').trim().toLowerCase() : '';
    return labels[label]||'';
  }

  function invokeSpecial(toolId,event){
    var openers={
      getcode:'openGetCodeRoom',tiktok:'openTiktokRoom',unbanwa:'openNexoraUnban',vdeploy:'openDeploy'
    };
    var name=openers[toolId];
    if(name && typeof window[name]==='function') return window[name](event||null);
    return null;
  }

  async function openLazyTool(toolId,event,card){
    var moduleName=toolModules[toolId];
    if(!moduleName) return false;
    if(window.NexoraAccount && typeof window.NexoraAccount.canAccess==='function' && !window.NexoraAccount.canAccess(toolId)) return false;
    setCardBusy(card,true); activeCard=card||null;
    try{
      await ensureModule(moduleName);
      var special=invokeSpecial(toolId,event);
      if(special!==null){
        if(toolId==='tiktok'){
          try{
            var targetHash='#tool-'+encodeURIComponent(toolId);
            if(location.hash===targetHash) history.replaceState({nxLazyTool:toolId},'',location.href);
            else history.pushState({nxLazyTool:toolId},'',location.href.split('#')[0]+targetHash);
          }catch(_routeError){}
        }
        return special;
      }
      /* Selalu kembali ke dispatcher yang ditangkap sebelum lazy-loader.
         Memanggil window.showTool di sini dapat membuat rekursi bila modul stabilitas
         atau script lain membungkus dispatcher setelah halaman siap. */
      if(typeof baseShowTool==='function') return baseShowTool.call(window,toolId);
      throw new Error('Pembuka fitur tidak tersedia: '+toolId);
    }catch(error){
      console.error('[Nexora lazy module]',toolId,error);
      document.dispatchEvent(new CustomEvent('nexora:tool-error',{detail:{toolId:toolId,module:moduleName,reason:error&&error.message?error.message:'module_failed'}}));
      return false;
    }finally{
      setCardBusy(card,false); activeCard=null;
    }
  }

  function lazyShowTool(toolId){
    if(toolModules[toolId]) return openLazyTool(toolId,null,activeCard);
    if(typeof baseShowTool==='function') return baseShowTool.apply(window,arguments);
  }
  window.showTool=lazyShowTool;

  function routeToolId(){
    var match=String(location.hash||'').match(/^#tool-([^/?#]+)$/);
    if(!match)return '';
    try{return decodeURIComponent(match[1]).trim().toLowerCase();}catch(_){return '';}
  }

  var restoringRoute=false;
  async function restoreRoute(){
    var toolId=routeToolId();
    if(!toolId||restoringRoute)return false;
    var registry=window.NexoraToolRegistry;
    var known=Boolean(toolModules[toolId])||Boolean(registry&&typeof registry.get==='function'&&registry.get(toolId))||Boolean(window.NexoraToolCatalog&&window.NexoraToolCatalog.has(toolId));
    if(!known)return false;
    restoringRoute=true;
    try{
      var routeCard=Array.prototype.find.call(document.querySelectorAll('[data-tool-id]'),function(card){return String(card.getAttribute('data-tool-id')||'').toLowerCase()===toolId;})||null;
      if(toolModules[toolId]) await openLazyTool(toolId,null,routeCard);
      else if(typeof baseShowTool==='function') baseShowTool.call(window,toolId);
      return true;
    }finally{restoringRoute=false;}
  }

  function intercept(event){
    var card=event.target && event.target.closest ? event.target.closest('.tools-card,.tool-card,.featured-card,[data-tool-id]') : null;
    var toolId=toolIdFromCard(card);
    if(!toolId || !toolModules[toolId]) return;
    event.preventDefault(); event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
    openLazyTool(toolId,event,card);
  }
  document.addEventListener('click',intercept,true);
  document.addEventListener('keydown',function(event){
    if(event.key!=='Enter' && event.key!==' ') return;
    var card=event.target && event.target.closest ? event.target.closest('.tools-card,.tool-card,.featured-card,[data-tool-id]') : null;
    if(!card) return;
    var toolId=toolIdFromCard(card);
    if(!toolId || !toolModules[toolId]) return;
    event.preventDefault(); event.stopPropagation();
    openLazyTool(toolId,event,card);
  },true);

  window.addEventListener('popstate',function(){
    var toolId=routeToolId();
    if(toolId) setTimeout(restoreRoute,0);
    else if(typeof window.closeTiktokRoom==='function') window.closeTiktokRoom(false);
  });
  window.addEventListener('pageshow',function(event){
    if(event.persisted) setTimeout(restoreRoute,0);
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(restoreRoute,0);},{once:true});
  else setTimeout(restoreRoute,0);

  window.NexoraModules={
    ensure:ensureModule,
    open:openLazyTool,
    isLoaded:function(name){return modulePromises.has(name);},
    manifest:{modules:modules,tools:toolModules}
  };
})();

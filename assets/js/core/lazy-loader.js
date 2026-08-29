/* Nexora v6.4.0 lazy module loader */
(function(){
  'use strict';

  var modules = {
    'get-code': {css:['assets/css/features/get-code.css'],js:['assets/js/features/get-code.js']},
    'tiktok': {css:['assets/css/features/tiktok.css'],js:['assets/js/features/tiktok.js']},
    'tiktok-quote': {css:['assets/css/features/tiktok-quote.css'],js:['assets/js/features/tiktok-quote.js']},
    'virus-scan': {css:['assets/css/features/virus-scan.css'],js:['assets/js/features/virus-scan.js']},
    'crypto-market': {css:['assets/css/features/crypto-market.css'],js:['assets/js/features/crypto-market.js']},
    'web-intelligence': {css:['assets/css/features/web-intelligence.css'],js:['assets/js/features/web-intelligence.js']},
    'ip-intelligence': {css:['assets/css/features/ip-intelligence.css'],js:['assets/js/features/ip-intelligence.js']},
    'bmkg-open-data': {css:['assets/css/features/bmkg-open-data.css'],js:['assets/js/features/bmkg-open-data.js']},
    'space-explorer': {css:['assets/css/features/space-explorer.css'],js:['assets/js/features/space-explorer.js']},
    'ocr-intelligence': {css:['assets/css/features/ocr-intelligence.css'],js:['assets/js/features/ocr-intelligence.js']},
    'document-ai': {css:['assets/css/features/document-ai.css'],js:['assets/js/features/document-ai.js']},
    'text-to-pdf': {css:['assets/css/features/text-to-pdf.css'],js:['assets/js/features/text-to-pdf.js']},
    'prompt-generator': {css:['assets/css/features/prompt-generator.css'],js:['assets/js/features/prompt-generator.js']},
    'puter-image': {css:['assets/css/features/puter-image.css'],js:['assets/js/features/puter-image.js']},
    'puter-video': {css:['assets/css/features/puter-video.css'],js:['assets/js/features/puter-runtime.js','assets/js/features/puter-video.js']},
    'genmail': {css:['assets/css/features/genmail.css'],js:['assets/js/features/genmail.js']},
    'aio-downloader': {css:['assets/css/features/aio-downloader.css'],js:['assets/js/features/aio-downloader.js']},
    'danbooru-search': {css:['assets/css/features/danbooru-search.css'],js:['assets/js/features/danbooru-search.js']},
    'anime-to-real': {css:['assets/css/features/anime-to-real.css'],js:['assets/js/features/anime-to-real.js']},
    'ai-song': {css:['assets/css/features/ai-song.css'],js:['assets/js/features/ai-song.js']},
    'hd4-enhancer': {css:['assets/css/features/hd4-enhancer.css'],js:['assets/js/features/hd4-enhancer.js']},
    'image-vectorizer': {css:['assets/css/features/image-vectorizer.css'],js:['assets/js/features/image-vectorizer.js']},
    'svg-alight': {css:['assets/css/features/svg-alight.css'],js:['assets/js/features/svg-alight.js']},
    'alight-premium': {css:['assets/css/features/alight-premium.css'],js:['assets/js/features/alight-premium.js']},
    'comic-reader': {css:['assets/css/features/comic-reader.css'],js:['assets/js/features/comic-reader.js']},
    'source-features': {css:['assets/css/features/source-tools.css'],js:['assets/js/features/source-features.js']},
    'imported-tools': {css:['assets/css/features/imported-tools.css'],js:['assets/js/features/imported-tools.js']},
    'generator-pack': {css:[],js:['assets/js/features/generator-pack.js']},
    'download-pack': {css:['assets/css/features/source-tools.css'],js:['assets/js/features/source-features.js','assets/js/features/download-pack.js']},
    'unban-whatsapp': {css:[],js:['assets/js/features/unban-whatsapp.js']},
    'deploy-center': {css:['assets/css/features/deploy-center.css'],js:['assets/js/features/deploy-center.js']},
    'web-encryption': {css:['assets/css/features/web-encryption.css'],js:['assets/js/features/web-encryption.js']},
    'nexora-text-2d': {css:['assets/css/features/nexora-generators.css'],js:['assets/vendor/nexora/text-2d-presets.js','assets/vendor/nexora/text-style-data.js','assets/vendor/nexora/text-2d-engine.js','assets/js/features/nexora/nexora-runtime.js']},
    'nexora-text-3d': {css:['assets/css/features/nexora-generators.css'],js:['assets/vendor/nexora/3d-engine.js','assets/js/features/nexora/nexora-runtime.js']},
    'nexora-text-fx-animation': {css:['assets/css/features/nexora-generators.css'],js:['assets/vendor/nexora/text-fx-animation-engine.js','assets/js/features/nexora/nexora-runtime.js']},
    'nexora-text-vector': {css:['assets/css/features/nexora-generators.css'],js:['assets/js/features/nexora/nexora-runtime.js']},
    'nexora-trimpath': {css:['assets/css/features/nexora-generators.css'],js:['assets/vendor/nexora/trimpath-font-metrics.js','assets/vendor/nexora/trimpath-letters.js','assets/vendor/nexora/trimpath-engine.js','assets/js/features/nexora/nexora-runtime.js']},
    'nexora-logo-animate': {css:['assets/css/features/nexora-generators.css'],js:['assets/js/features/nexora/logo-engine.js','assets/js/features/nexora/nexora-runtime.js']}
  };

  var toolModules = {
    getcode:'get-code',tiktok:'tiktok',ttquote:'tiktok-quote',virusscan:'virus-scan',cryptomarket:'crypto-market',webintel:'web-intelligence',ipintel:'ip-intelligence',bmkg:'bmkg-open-data',spaceexplorer:'space-explorer',ocrintel:'ocr-intelligence',documentai:'document-ai',autopdf:'text-to-pdf',svgalight:'svg-alight',alightpremium:'alight-premium',imagevectorizer:'image-vectorizer',comicreader:'comic-reader',
    sertifikat:'source-features',fakedev:'source-features',
    promptgenerate:'prompt-generator',aiimage:'puter-image',aivideo:'puter-video',genmail:'genmail',aiodownloader:'aio-downloader',danbooru:'danbooru-search',animetoreal:'anime-to-real',aisong:'ai-song',enhancer:'hd4-enhancer',fakeovo:'imported-tools',quotegenerator:'imported-tools',carifakta:'imported-tools',mltools:'imported-tools',
    iqc:'generator-pack',winquotes:'generator-pack',nokiamsg:'generator-pack',
    terabox:'download-pack',fakebankjago:'download-pack',
    unbanwa:'unban-whatsapp',vdeploy:'deploy-center',webencryption:'web-encryption',
    text2d:'nexora-text-2d',text3d:'nexora-text-3d',textfxanimation:'nexora-text-fx-animation',textvector:'nexora-text-vector',trimpath:'nexora-trimpath',logoanimate:'nexora-logo-animate'
  };

  var labels = {
    'get code html':'getcode','tiktok':'tiktok','quote tiktok nexora':'ttquote','virus scan':'virusscan','crypto market scanner':'cryptomarket','nexora web intelligence':'webintel','ip & asn intelligence':'ipintel','ip asn intelligence':'ipintel','bmkg indonesia':'bmkg','bmkg':'bmkg','space explorer':'spaceexplorer','nexora ocr intelligence':'ocrintel','ocr intelligence':'ocrintel','nexora document ai':'documentai','document ai':'documentai','nexora auto pdf':'autopdf','auto pdf':'autopdf','text to pdf':'autopdf','teks ke pdf':'autopdf','svg → alight xml':'svgalight','svg alight xml':'svgalight','anime vector atelier':'svgalight','alight motion premium 1 tahun':'alightpremium','alight premium':'alightpremium','nexora image vectorizer':'imagevectorizer','image vectorizer':'imagevectorizer','baca komik full':'comicreader',
    'sertifikat custom':'sertifikat','fakedev':'fakedev','prompt generator':'promptgenerate','nexora ai image':'aiimage','ai image':'aiimage','nexora ai video generator':'aivideo','ai video generator':'aivideo','text to video':'aivideo','image to video':'aivideo','genmail':'genmail','advanced temp mail':'genmail','temp mail nexora':'genmail','all in one downloader':'aiodownloader','aio downloader':'aiodownloader','universal downloader':'aiodownloader','danbooru search':'danbooru','danbooru':'danbooru','anime art search':'danbooru','anime to real':'animetoreal','anime realistic':'animetoreal','nexora ai song generator':'aisong','ai song generator':'aisong','song generator':'aisong','nexora image hd enhancer v4':'enhancer','image hd enhancer v4':'enhancer','image enhancer':'enhancer','image upscaler':'enhancer','fake ovo':'fakeovo',
    'quote generator':'quotegenerator','carifakta':'carifakta','ml tools':'mltools','iqc generator':'iqc',
    'windows quotes':'winquotes','nokia message':'nokiamsg','terabox downloader':'terabox','fake bank jago':'fakebankjago',
    'spotify downloader':'spotify','unban whatsapp':'unbanwa',
    'deploy & update web':'vdeploy','deploy website':'vdeploy','web encryption':'webencryption',
    '2d text animate / text fx':'text2d','2d text animate':'text2d','3d text animate':'text3d','text fx animation':'textfxanimation','text to vector':'textvector','trimpath generator':'trimpath','logo animate':'logoanimate'
  };

  var modulePromises = new Map();
  var assetPromises = new Map();
  var moduleDisplayNames = {'puter-video':'Nexora AI Video Generator'};
  var ASSET_VERSION = '6.4.0';
  var ASSET_PATCH = 'branding1';
  var ASSET_PATCHES = [
    [/(?:assets\/(?:vendor\/nexora|js\/features\/nexora)\/|nexora-generators\.css(?:$|\?))/, 'nexora'],
    [/prompt-generator\.(?:js|css)(?:$|\?)/, 'prompt-android-branding1'],
    [/puter-image\.(?:js|css)(?:$|\?)/, 'puter-image-hf28'],
    [/(?:puter-runtime|puter-video)\.(?:js|css)(?:$|\?)/, 'puter-video-hf47'],
    [/genmail\.(?:js|css)(?:$|\?)/, 'genmail-v1'],
    [/aio-downloader\.(?:js|css)(?:$|\?)/, 'aio-downloader-hf31'],
    [/danbooru-search\.(?:js|css)(?:$|\?)/, 'danbooru-search-hf35'],
    [/anime-to-real\.(?:js|css)(?:$|\?)/, 'anime-to-real-hf37'],
    [/ai-song\.(?:js|css)(?:$|\?)/, 'ai-song-v1'],
    [/hd4-enhancer\.(?:js|css)(?:$|\?)/, 'hd4-enhancer-v2'],
    [/document-ai\.(?:js|css)(?:$|\?)/, 'document-android-branding1'],
    [/text-to-pdf\.(?:js|css)(?:$|\?)/, 'auto-pdf-v1'],
    [/crypto-market\.(?:js|css)(?:$|\?)/, 'crypto-mtf'],
    [/comic-reader\.(?:js|css)(?:$|\?)/, 'comic-reader'],
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

/* Nexora v6.3.11 stable lazy module loader */
(function(){
  'use strict';

  var modules = {
    'get-code': {css:['assets/css/features/get-code.css'],js:['assets/js/features/get-code.js']},
    'tiktok': {css:['assets/css/features/tiktok.css'],js:['assets/js/features/tiktok.js']},
    'tiktok-quote': {css:['assets/css/features/tiktok-quote.css'],js:['assets/js/features/tiktok-quote.js']},
    'virus-scan': {css:['assets/css/features/virus-scan.css'],js:['assets/js/features/virus-scan.js']},
    'comic-reader': {css:['assets/css/features/comic-reader.css'],js:['assets/js/features/comic-reader.js']},
    'source-features': {css:['assets/css/features/source-tools.css'],js:['assets/js/features/source-features.js']},
    'imported-tools': {css:['assets/css/features/imported-tools.css'],js:['assets/js/features/imported-tools.js']},
    'generator-pack': {css:[],js:['assets/js/features/generator-pack.js']},
    'download-pack': {css:['assets/css/features/source-tools.css'],js:['assets/js/features/source-features.js','assets/js/features/download-pack.js']},
    'unban-whatsapp': {css:[],js:['assets/js/features/unban-whatsapp.js']},
    'nexus-ai': {css:['assets/css/features/nexus-ai.css'],js:['assets/js/features/nexus-ai.js']},
    'pix-vault': {css:['assets/css/features/pix-vault.css'],js:['assets/js/features/pix-vault.js']},
    'deploy-center': {css:['assets/css/features/deploy-center.css'],js:['assets/js/features/deploy-center.js']},
    'web-encryption': {css:['assets/css/features/web-encryption.css'],js:['assets/js/features/web-encryption.js']}
  };

  var toolModules = {
    getcode:'get-code',tiktok:'tiktok',ttquote:'tiktok-quote',virusscan:'virus-scan',comicreader:'comic-reader',
    sertifikat:'source-features',fakedev:'source-features',
    promptgenerate:'imported-tools',fakeovo:'imported-tools',quotegenerator:'imported-tools',carifakta:'imported-tools',mltools:'imported-tools',
    iqc:'generator-pack',winquotes:'generator-pack',nokiamsg:'generator-pack',
    terabox:'download-pack',fakebankjago:'download-pack',spotify:'download-pack',
    unbanwa:'unban-whatsapp',zxvai:'nexus-ai',fotolink:'pix-vault',vdeploy:'deploy-center',webencryption:'web-encryption'
  };

  var labels = {
    'get code html':'getcode','tiktok':'tiktok','quote tiktok nexus':'ttquote','virus scan':'virusscan','baca komik full':'comicreader',
    'sertifikat tolol':'sertifikat','fakedev':'fakedev','prompt generator':'promptgenerate','fake ovo':'fakeovo',
    'quote generator':'quotegenerator','carifakta':'carifakta','ml tools':'mltools','iqc generator':'iqc',
    'windows quotes':'winquotes','nokia message':'nokiamsg','terabox downloader':'terabox','fake bank jago':'fakebankjago',
    'spotify downloader':'spotify','unban whatsapp':'unbanwa','zxvai':'zxvai','nexus ai':'zxvai','foto to link':'fotolink',
    'deploy & update web':'vdeploy','deploy website':'vdeploy','web encryption':'webencryption'
  };

  var modulePromises = new Map();
  var assetPromises = new Map();
  /* Vercel serves /assets with a one-hour browser cache.  A module can
     therefore otherwise keep the previous CSS/JS after a successful deploy. */
  var ASSET_VERSION = '6.3.11';
  var baseShowTool = typeof window.showTool === 'function' ? window.showTool : null;
  var activeCard = null;

  function absolute(url){ return new URL(url, document.baseURI).href; }
  function versioned(url){
    var separator = String(url).indexOf('?')===-1 ? '?' : '&';
    return String(url)+separator+'v='+encodeURIComponent(ASSET_VERSION);
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
      setStatus('Memuat modul '+name.replace(/-/g,' ')+'…','loading');
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
      getcode:'openGetCodeRoom',tiktok:'openTiktokRoom',unbanwa:'openNexusUnban',zxvai:'openNexusAI',fotolink:'openPix',vdeploy:'openDeploy'
    };
    var name=openers[toolId];
    if(name && typeof window[name]==='function') return window[name](event||null);
    return null;
  }

  async function openLazyTool(toolId,event,card){
    var moduleName=toolModules[toolId];
    if(!moduleName) return false;
    setCardBusy(card,true); activeCard=card||null;
    try{
      await ensureModule(moduleName);
      var special=invokeSpecial(toolId,event);
      if(special!==null) return special;
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

  window.NexoraModules={
    ensure:ensureModule,
    open:openLazyTool,
    isLoaded:function(name){return modulePromises.has(name);},
    manifest:{modules:modules,tools:toolModules}
  };
})();

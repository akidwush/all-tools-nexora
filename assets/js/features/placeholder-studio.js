/* Nexora Placeholder Studio — lightweight public placeholder URL builder. */
(function(){
  'use strict';

  var CLASSIC_BASE='https://placeholderimage.co/';
  var PROMPT_BASE='https://placeholdr.dev/';
  var CLASSIC_FORMATS=Object.freeze(['png','jpg','webp','svg','avif','gif']);
  var CLASSIC_FONTS=Object.freeze(['lato','lora','montserrat','noto-sans','open-sans','oswald','playfair-display','poppins','pt-sans','raleway','roboto','source-sans-pro']);
  var PLACEHOLDER_STYLES=Object.freeze(['photographic','artistic','anime','oil-painting','3d-render','cartoon']);
  var DIMENSION_PRESETS=Object.freeze([
    Object.freeze({id:'square',label:'Square',width:1080,height:1080}),
    Object.freeze({id:'landscape',label:'Landscape',width:1280,height:720}),
    Object.freeze({id:'portrait',label:'Portrait',width:1080,height:1350}),
    Object.freeze({id:'story',label:'Story',width:1080,height:1920}),
    Object.freeze({id:'og',label:'OG Image',width:1200,height:630})
  ]);

  function integer(value){
    var number=Number(value);
    return Number.isInteger(number)?number:NaN;
  }

  function dimensions(mode,width,height){
    var min=mode==='prompt'?128:10;
    var max=mode==='prompt'?2048:4000;
    var parsedWidth=integer(width);
    var parsedHeight=integer(height);
    if(!Number.isFinite(parsedWidth)||!Number.isFinite(parsedHeight)||parsedWidth<min||parsedWidth>max||parsedHeight<min||parsedHeight>max)throw new Error('INVALID_DIMENSIONS');
    return{width:parsedWidth,height:parsedHeight,min:min,max:max};
  }

  function normalizeHex(value){
    var match=String(value||'').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(!match)return'';
    var hex=match[1].toLowerCase();
    if(hex.length===3)hex=hex.split('').map(function(char){return char+char;}).join('');
    return'#'+hex;
  }

  function includes(list,value){return list.indexOf(String(value||'').toLowerCase())!==-1;}

  function buildClassicUrl(options){
    var size=dimensions('classic',options.width,options.height);
    var background=normalizeHex(options.background);
    var textColor=normalizeHex(options.textColor);
    var format=String(options.format||'png').toLowerCase();
    var font=String(options.font||'lato').toLowerCase();
    var retina=integer(options.retina||1);
    if(!background||!textColor)throw new Error('INVALID_HEX');
    if(!includes(CLASSIC_FORMATS,format))throw new Error('INVALID_FORMAT');
    if(!includes(CLASSIC_FONTS,font))throw new Error('INVALID_FONT');
    if([1,2,3].indexOf(retina)===-1)throw new Error('INVALID_RETINA');
    var suffix=retina===1?'':'@'+retina+'x';
    var path=size.width+'x'+size.height+suffix+'/'+background.slice(1)+'/'+textColor.slice(1)+'/'+format;
    var query=new URLSearchParams();
    var label=String(options.text==null?'':options.text).trim();
    if(label)query.set('text',label);
    query.set('font',font);
    return CLASSIC_BASE+path+'?'+query.toString();
  }

  function buildPromptUrl(options){
    var size=dimensions('prompt',options.width,options.height);
    var prompt=String(options.prompt||'').trim();
    var style=String(options.style||'photographic').toLowerCase();
    var seed=integer(options.seed||1);
    if(!prompt)throw new Error('EMPTY_PROMPT');
    if(!includes(PLACEHOLDER_STYLES,style))throw new Error('INVALID_STYLE');
    if(seed<1||seed>3)throw new Error('INVALID_SEED');
    return PROMPT_BASE+size.width+'x'+size.height+'/'+encodeURIComponent(prompt)+'?style='+encodeURIComponent(style)+'&seed='+seed;
  }

  var api=Object.freeze({
    CLASSIC_FORMATS:CLASSIC_FORMATS,
    CLASSIC_FONTS:CLASSIC_FONTS,
    PLACEHOLDER_STYLES:PLACEHOLDER_STYLES,
    DIMENSION_PRESETS:DIMENSION_PRESETS,
    normalizeHex:normalizeHex,
    dimensions:dimensions,
    buildClassicUrl:buildClassicUrl,
    buildPromptUrl:buildPromptUrl
  });
  window.PLACEHOLDER_STYLES=PLACEHOLDER_STYLES;
  window.NexoraPlaceholderStudio=api;

  function friendly(code){
    if(code==='INVALID_DIMENSIONS')return'Ukuran gambar tidak valid.';
    if(code==='INVALID_HEX')return'Warna harus menggunakan HEX yang valid.';
    if(code==='EMPTY_PROMPT')return'Masukkan prompt terlebih dahulu.';
    if(code==='INVALID_SEED')return'Seed harus berupa angka dari 1 sampai 3.';
    return'Gambar gagal dibuat.';
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});
  }

  function optionList(values,labels,selected){
    return values.map(function(value){return'<option value="'+escapeHtml(value)+'"'+(value===selected?' selected':'')+'>'+escapeHtml(labels&&labels[value]?labels[value]:value)+'</option>';}).join('');
  }

  window.renderNexoraPlaceholderStudio=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    var formatLabels={png:'PNG',jpg:'JPEG',webp:'WebP',svg:'SVG',avif:'AVIF',gif:'GIF'};
    var styleLabels={photographic:'Photographic',artistic:'Artistic',anime:'Anime','oil-painting':'Oil Painting','3d-render':'3D Render',cartoon:'Cartoon'};
    var fontLabels={lato:'Lato',lora:'Lora',montserrat:'Montserrat','noto-sans':'Noto Sans','open-sans':'Open Sans',oswald:'Oswald','playfair-display':'Playfair Display',poppins:'Poppins','pt-sans':'PT Sans',raleway:'Raleway',roboto:'Roboto','source-sans-pro':'Source Sans Pro'};
    var presetHtml=DIMENSION_PRESETS.map(function(item){return'<button type="button" data-preset="'+item.id+'" data-width="'+item.width+'" data-height="'+item.height+'"><b>'+item.label+'</b><small>'+item.width+' × '+item.height+'</small></button>';}).join('');

    body.innerHTML=`
      <main class="nps" aria-label="Nexora Placeholder Studio">
        <section class="nps-intro">
          <div class="nps-kicker"><i class="fa-regular fa-image"></i><span>DIRECT URL · NO API KEY</span></div>
          <h2>Nexora Placeholder Studio</h2>
          <p>Buat placeholder siap pakai tanpa upload dan tanpa penyimpanan.</p>
        </section>

        <div class="nps-tabs" role="tablist" aria-label="Mode placeholder">
          <button id="npsClassicTab" type="button" role="tab" aria-selected="true" aria-controls="npsClassicPanel" data-mode="classic" class="is-active"><i class="fa-solid fa-shapes"></i> Classic</button>
          <button id="npsPromptTab" type="button" role="tab" aria-selected="false" aria-controls="npsPromptPanel" data-mode="prompt"><i class="fa-solid fa-wand-magic-sparkles"></i> Prompt</button>
        </div>

        <section class="nps-card nps-presets" aria-labelledby="npsPresetTitle">
          <header><div><span>01</span><h3 id="npsPresetTitle">Dimension Presets</h3></div><b id="npsLimit">10–4000 PX</b></header>
          <div class="nps-preset-grid">${presetHtml}<button type="button" data-preset="custom"><b>Custom</b><small>Ukuran manual</small></button></div>
        </section>

        <section class="nps-card nps-panel" id="npsClassicPanel" role="tabpanel" aria-labelledby="npsClassicTab">
          <header><div><span>02</span><h3>Classic Placeholder</h3></div><b>PLACEHOLDERIMAGE.CO</b></header>
          <div class="nps-form">
            <div class="nps-grid nps-grid-2">
              <label class="nps-field">Width <input id="npsClassicWidth" type="number" inputmode="numeric" min="10" max="4000" step="1" value="600"></label>
              <label class="nps-field">Height <input id="npsClassicHeight" type="number" inputmode="numeric" min="10" max="4000" step="1" value="400"></label>
            </div>
            <label class="nps-field">Text <input id="npsClassicText" type="text" maxlength="160" value="Nexora" autocomplete="off"></label>
            <div class="nps-grid nps-grid-2">
              <label class="nps-field">Background <span class="nps-color"><input id="npsBackgroundPicker" type="color" value="#1c1c1e" aria-label="Pilih background"><input id="npsBackground" type="text" inputmode="text" value="#1c1c1e" maxlength="7" spellcheck="false" autocomplete="off"></span></label>
              <label class="nps-field">Text Color <span class="nps-color"><input id="npsTextColorPicker" type="color" value="#ffffff" aria-label="Pilih warna teks"><input id="npsTextColor" type="text" inputmode="text" value="#ffffff" maxlength="7" spellcheck="false" autocomplete="off"></span></label>
            </div>
            <div class="nps-grid nps-grid-options">
              <label class="nps-field">Format <select id="npsFormat">${optionList(CLASSIC_FORMATS,formatLabels,'png')}</select></label>
              <label class="nps-field">Font <select id="npsFont">${optionList(CLASSIC_FONTS,fontLabels,'lato')}</select></label>
              <label class="nps-field">Retina <select id="npsRetina"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></select></label>
            </div>
            <button class="nps-generate" id="npsClassicGenerate" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate</span></button>
          </div>
        </section>

        <section class="nps-card nps-panel" id="npsPromptPanel" role="tabpanel" aria-labelledby="npsPromptTab" hidden>
          <header><div><span>02</span><h3>Prompt Placeholder</h3></div><b>PLACEHOLDR.DEV</b></header>
          <div class="nps-form">
            <label class="nps-field">Prompt <textarea id="npsPrompt" rows="3" maxlength="240" placeholder="Contoh: cyberpunk city at night">cyberpunk city</textarea></label>
            <div class="nps-grid nps-grid-2">
              <label class="nps-field">Width <input id="npsPromptWidth" type="number" inputmode="numeric" min="128" max="2048" step="1" value="1024"></label>
              <label class="nps-field">Height <input id="npsPromptHeight" type="number" inputmode="numeric" min="128" max="2048" step="1" value="768"></label>
            </div>
            <div class="nps-grid nps-grid-prompt-options">
              <label class="nps-field">Style <select id="npsStyle">${optionList(PLACEHOLDER_STYLES,styleLabels,'anime')}</select></label>
              <label class="nps-field">Seed <span class="nps-seed"><input id="npsSeed" type="number" inputmode="numeric" min="1" max="3" step="1" value="1"><button id="npsRandomSeed" type="button" aria-label="Random seed" title="Random Seed"><i class="fa-solid fa-shuffle"></i></button></span></label>
            </div>
            <p class="nps-provider-note"><i class="fa-solid fa-circle-info"></i> Prompt baru dapat menampilkan preview sementara saat provider menyiapkan hasil akhirnya.</p>
            <button class="nps-generate" id="npsPromptGenerate" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate</span></button>
          </div>
        </section>

        <section class="nps-card nps-result" id="npsResult" hidden>
          <header><div><span>03</span><h3>Preview</h3></div><b id="npsResultMode">CLASSIC</b></header>
          <div class="nps-preview" id="npsPreview">
            <div class="nps-loading" id="npsLoading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Creating placeholder...</span></div>
            <img id="npsResultImage" alt="Placeholder hasil Nexora" loading="lazy" decoding="async" hidden>
          </div>
          <p class="nps-error" id="npsError" role="alert" hidden></p>
          <label class="nps-url-label" for="npsResultUrl">Image URL</label>
          <div class="nps-url"><input id="npsResultUrl" type="url" readonly aria-label="Image URL hasil"><button id="npsInlineCopy" type="button" aria-label="Copy Image URL"><i class="fa-regular fa-copy"></i></button></div>
          <div class="nps-actions">
            <button id="npsDownload" class="is-primary" type="button"><i class="fa-solid fa-download"></i> Download Image</button>
            <button id="npsCopy" type="button"><i class="fa-regular fa-copy"></i> Copy Image URL</button>
            <button id="npsRefresh" type="button" hidden><i class="fa-solid fa-rotate"></i> Refresh Preview</button>
          </div>
        </section>
        <div class="nps-toast" id="npsToast" role="status" aria-live="polite"></div>
      </main>`;

    var root=body.querySelector('.nps');
    var ui={
      tabs:Array.from(root.querySelectorAll('[data-mode]')),classicPanel:root.querySelector('#npsClassicPanel'),promptPanel:root.querySelector('#npsPromptPanel'),limit:root.querySelector('#npsLimit'),presets:Array.from(root.querySelectorAll('[data-preset]')),
      classicWidth:root.querySelector('#npsClassicWidth'),classicHeight:root.querySelector('#npsClassicHeight'),classicText:root.querySelector('#npsClassicText'),background:root.querySelector('#npsBackground'),backgroundPicker:root.querySelector('#npsBackgroundPicker'),textColor:root.querySelector('#npsTextColor'),textColorPicker:root.querySelector('#npsTextColorPicker'),format:root.querySelector('#npsFormat'),font:root.querySelector('#npsFont'),retina:root.querySelector('#npsRetina'),classicGenerate:root.querySelector('#npsClassicGenerate'),
      prompt:root.querySelector('#npsPrompt'),promptWidth:root.querySelector('#npsPromptWidth'),promptHeight:root.querySelector('#npsPromptHeight'),style:root.querySelector('#npsStyle'),seed:root.querySelector('#npsSeed'),randomSeed:root.querySelector('#npsRandomSeed'),promptGenerate:root.querySelector('#npsPromptGenerate'),
      result:root.querySelector('#npsResult'),resultMode:root.querySelector('#npsResultMode'),preview:root.querySelector('#npsPreview'),loading:root.querySelector('#npsLoading'),image:root.querySelector('#npsResultImage'),error:root.querySelector('#npsError'),url:root.querySelector('#npsResultUrl'),inlineCopy:root.querySelector('#npsInlineCopy'),download:root.querySelector('#npsDownload'),copy:root.querySelector('#npsCopy'),refresh:root.querySelector('#npsRefresh'),toast:root.querySelector('#npsToast')
    };
    var state={mode:'classic',resultUrl:'',resultMode:'',request:0,destroyed:false,downloadBusy:false};

    function toast(message,tone){
      ui.toast.textContent=message;
      ui.toast.className='nps-toast is-show '+(tone||'');
      clearTimeout(ui.toast.__timer);
      ui.toast.__timer=setTimeout(function(){ui.toast.className='nps-toast';},3000);
    }

    function modeInputs(){return state.mode==='prompt'?{width:ui.promptWidth,height:ui.promptHeight}:{width:ui.classicWidth,height:ui.classicHeight};}

    function syncPreset(){
      var fields=modeInputs();var width=integer(fields.width.value);var height=integer(fields.height.value);var found=false;
      ui.presets.forEach(function(button){var active=false;if(button.dataset.preset==='custom')active=!DIMENSION_PRESETS.some(function(item){return item.width===width&&item.height===height;});else active=Number(button.dataset.width)===width&&Number(button.dataset.height)===height;button.classList.toggle('is-active',active);if(active)found=true;});
      if(!found){var custom=ui.presets.find(function(button){return button.dataset.preset==='custom';});if(custom)custom.classList.add('is-active');}
    }

    function clearResult(){
      state.request++;state.resultUrl='';state.resultMode='';ui.result.hidden=true;ui.image.hidden=true;ui.image.removeAttribute('src');ui.error.hidden=true;ui.url.value='';
    }

    function setMode(mode){
      if(mode!==state.mode)clearResult();
      state.mode=mode;
      ui.tabs.forEach(function(tab){var active=tab.dataset.mode===mode;tab.classList.toggle('is-active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
      ui.classicPanel.hidden=mode!=='classic';ui.promptPanel.hidden=mode!=='prompt';ui.limit.textContent=mode==='prompt'?'128–2048 PX':'10–4000 PX';syncPreset();
    }

    function setLoading(loading){
      ui.preview.classList.toggle('is-loading',loading);ui.loading.hidden=!loading;ui.classicGenerate.disabled=loading;ui.promptGenerate.disabled=loading;ui.download.disabled=loading;ui.refresh.disabled=loading;
    }

    function showError(message){
      setLoading(false);ui.image.hidden=true;ui.error.textContent=message;ui.error.hidden=false;toast(message,'is-error');
    }

    function showResult(url,mode){
      var request=++state.request;state.resultUrl=url;state.resultMode=mode;ui.result.hidden=false;ui.resultMode.textContent=mode==='prompt'?'PROMPT':'CLASSIC';ui.url.value=url;ui.error.hidden=true;ui.image.hidden=true;ui.refresh.hidden=mode!=='prompt';setLoading(true);
      ui.image.onload=function(){if(state.destroyed||request!==state.request)return;setLoading(false);ui.image.hidden=false;ui.error.hidden=true;};
      ui.image.onerror=function(){if(state.destroyed||request!==state.request)return;showError('Provider placeholder sedang tidak tersedia.');};
      ui.image.src=url;
      ui.result.scrollIntoView({block:'nearest'});
    }

    function classicOptions(){return{width:ui.classicWidth.value,height:ui.classicHeight.value,background:ui.background.value,textColor:ui.textColor.value,text:ui.classicText.value,format:ui.format.value,font:ui.font.value,retina:ui.retina.value};}
    function promptOptions(){return{width:ui.promptWidth.value,height:ui.promptHeight.value,prompt:ui.prompt.value,style:ui.style.value,seed:ui.seed.value};}

    function generate(mode){
      try{var url=mode==='prompt'?buildPromptUrl(promptOptions()):buildClassicUrl(classicOptions());showResult(url,mode);}
      catch(error){toast(friendly(error&&error.message),'is-error');if(error&&error.message==='INVALID_HEX'){ui.background.setAttribute('aria-invalid',String(!normalizeHex(ui.background.value)));ui.textColor.setAttribute('aria-invalid',String(!normalizeHex(ui.textColor.value)));}}
    }

    function syncColor(textInput,picker){
      var normalized=normalizeHex(textInput.value);
      textInput.setAttribute('aria-invalid',String(!normalized));
      if(normalized){picker.value=normalized;textInput.value=normalized;}
    }

    function copyText(value){
      if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(value);
      var area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(area);area.select();var copied=document.execCommand('copy');area.remove();return copied?Promise.resolve():Promise.reject(new Error('COPY_FAILED'));
    }

    function copyUrl(){
      if(!state.resultUrl)return;
      copyText(state.resultUrl).then(function(){toast('URL copied','is-success');}).catch(function(){toast('URL tidak dapat disalin.','is-error');});
    }

    function extensionFromBlob(blob){
      var types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/avif':'avif','image/gif':'gif'};
      return types[String(blob&&blob.type||'').toLowerCase()]||(state.resultMode==='classic'?ui.format.value:'png');
    }

    function saveBlob(blob){
      var objectUrl=URL.createObjectURL(blob);var link=document.createElement('a');link.href=objectUrl;link.download='nexora-'+(state.resultMode==='prompt'?'prompt-':'')+'placeholder.'+extensionFromBlob(blob);document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(objectUrl);},1600);
    }

    function openDirect(){
      var link=document.createElement('a');link.href=state.resultUrl;link.target='_blank';link.rel='noopener noreferrer';document.body.appendChild(link);link.click();link.remove();
    }

    async function download(){
      if(!state.resultUrl||state.downloadBusy)return;
      state.downloadBusy=true;ui.download.disabled=true;ui.download.classList.add('is-busy');
      try{
        var response=await fetch(state.resultUrl,{mode:'cors',credentials:'omit',cache:'no-store'});
        if(!response.ok)throw new Error('DOWNLOAD_FAILED');
        var blob=await response.blob();
        if(!blob.size||String(blob.type||'').indexOf('image/')!==0)throw new Error('DOWNLOAD_FAILED');
        if(state.resultMode==='prompt'&&String(blob.type||'').toLowerCase()==='image/svg+xml'){toast('Hasil akhir masih diproses. Tunggu beberapa detik lalu Refresh Preview.');return;}
        saveBlob(blob);toast('Download dimulai','is-success');
      }catch(_error){openDirect();toast('Download langsung tidak didukung provider. Gambar dibuka di tab baru.');}
      finally{state.downloadBusy=false;ui.download.disabled=false;ui.download.classList.remove('is-busy');}
    }

    function refreshPreview(){
      if(!state.resultUrl)return;
      var request=++state.request;ui.image.hidden=true;ui.error.hidden=true;setLoading(true);ui.image.onload=function(){if(state.destroyed||request!==state.request)return;setLoading(false);ui.image.hidden=false;};ui.image.onerror=function(){if(state.destroyed||request!==state.request)return;showError('Provider placeholder sedang tidak tersedia.');};ui.image.removeAttribute('src');requestAnimationFrame(function(){if(!state.destroyed&&request===state.request)ui.image.src=state.resultUrl;});
    }

    ui.tabs.forEach(function(tab){tab.addEventListener('click',function(){setMode(tab.dataset.mode);});});
    ui.presets.forEach(function(button){button.addEventListener('click',function(){var fields=modeInputs();if(button.dataset.preset==='custom'){fields.width.focus();return;}fields.width.value=button.dataset.width;fields.height.value=button.dataset.height;syncPreset();});});
    [ui.classicWidth,ui.classicHeight,ui.promptWidth,ui.promptHeight].forEach(function(input){input.addEventListener('input',syncPreset);});
    ui.backgroundPicker.addEventListener('input',function(){ui.background.value=ui.backgroundPicker.value;ui.background.setAttribute('aria-invalid','false');});
    ui.textColorPicker.addEventListener('input',function(){ui.textColor.value=ui.textColorPicker.value;ui.textColor.setAttribute('aria-invalid','false');});
    ui.background.addEventListener('change',function(){syncColor(ui.background,ui.backgroundPicker);});
    ui.textColor.addEventListener('change',function(){syncColor(ui.textColor,ui.textColorPicker);});
    ui.randomSeed.addEventListener('click',function(){ui.seed.value=String(1+Math.floor(Math.random()*3));});
    ui.classicGenerate.addEventListener('click',function(){generate('classic');});
    ui.promptGenerate.addEventListener('click',function(){generate('prompt');});
    ui.copy.addEventListener('click',copyUrl);ui.inlineCopy.addEventListener('click',copyUrl);ui.download.addEventListener('click',download);ui.refresh.addEventListener('click',refreshPreview);
    body.__nxCleanup=function(){state.destroyed=true;state.request++;clearTimeout(ui.toast.__timer);ui.image.onload=null;ui.image.onerror=null;ui.image.removeAttribute('src');};
    setMode('classic');
  };
})();

/* Nexora SVG -> Alight Motion XML HF10.3 — four real conversion modes */
(function(){
  'use strict';
  var MAX_BYTES=2*1024*1024;
  var MODES={
    lossless:{label:'LOSSLESS',title:'Lossless / 100% Akurat',sub:'Node 0% · z-order asli · native stroke',maxShapes:5000,minAreaPercent:0,precision:8,nodeReduction:0,groupByColor:false,removeStrokes:false,validateBounds:true},
    accurate:{label:'ACCURATE · -35%',title:'Accurate Grouped',sub:'Node -35% · grouping warna presisi',maxShapes:5000,minAreaPercent:0,precision:5,nodeReduction:35,groupByColor:true,removeStrokes:true,validateBounds:false},
    balanced:{label:'BALANCED · -50%',title:'Balanced Grouped',sub:'Node -50% · detail dan ukuran seimbang',maxShapes:2500,minAreaPercent:0.0002,precision:4,nodeReduction:50,groupByColor:true,removeStrokes:true,validateBounds:false},
    lightweight:{label:'LIGHT · -65%',title:'Lightweight Grouped',sub:'Node -65% · prioritas file ringan',maxShapes:1000,minAreaPercent:0.001,precision:3,nodeReduction:65,groupByColor:true,removeStrokes:true,validateBounds:false}
  };
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
  function safeName(v){return String(v||'nexora-alight').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'nexora-alight';}
  function bytes(n){n=Number(n)||0;return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';}
  function download(name,content){var blob=new Blob([content],{type:'application/xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1200);}
  async function copyText(v){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(v);var t=el('textarea');t.value=v;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}
  function countSvg(svg){return{shapes:(svg.match(/<(?:path|rect|circle|ellipse|line|polygon|polyline)\b/gi)||[]).length,paths:(svg.match(/<path\b/gi)||[]).length,gradients:(svg.match(/<(?:linearGradient|radialGradient)\b/gi)||[]).length};}
  function metric(icon,label,value,sub){var item=el('article','nsa-stat');item.innerHTML='<i class="'+icon+'"></i>';var c=el('div');c.append(el('span','',label),el('strong','',value),el('small','',sub||''));item.append(c);return item;}

  window.renderSvgAlight=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
    <main class="nsa nsa-v103">\
      <section class="nsa-hero">\
        <div class="nsa-gridfx" aria-hidden="true"></div>\
        <div class="nsa-copy">\
          <div class="nsa-kicker"><i class="fa-solid fa-wand-magic-sparkles"></i><span>ANIME VECTOR ATELIER</span><b>HF10.3</b></div>\
          <h2>SVG masuk.<br><em>Alight Motion keluar.</em></h2>\
          <p>Empat mode konversi nyata dari engine SVG→XML Nexora. Secret API key tetap server-side.</p>\
          <div class="nsa-badges"><span><i class="fa-solid fa-gem"></i> LOSSLESS</span><span><i class="fa-solid fa-layer-group"></i> Z-ORDER</span><span><i class="fa-solid fa-key"></i> SERVER KEY</span></div>\
        </div>\
        <div class="nsa-muse" aria-label="Nexora anime atelier visual">\
          <div class="nsa-muse-orbit"></div><div class="nsa-muse-hair"></div><div class="nsa-muse-face"><i></i><i></i><b></b></div><div class="nsa-muse-body"></div>\
          <span class="nsa-spark s1">✦</span><span class="nsa-spark s2">✧</span>\
          <div class="nsa-muse-tag"><span>NEXORA MUSE</span><b>YUME // XML</b></div>\
        </div>\
      </section>\
      <section class="nsa-grid">\
        <article class="nsa-card nsa-input">\
          <header><div><span>01 · SOURCE</span><h3>Masukkan SVG</h3></div><b id="nsaStatus" class="checking"><i class="fa-solid fa-circle-notch fa-spin"></i> CHECK</b></header>\
          <label class="nsa-drop" id="nsaDrop" for="nsaFile"><input id="nsaFile" type="file" accept="image/svg+xml,.svg"><div class="nsa-drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div><div><strong>Pilih atau jatuhkan SVG</strong><small>Maksimal 2 MB · path, gradient, opacity, stroke</small></div><span>Pilih SVG</span></label>\
          <div class="nsa-file" id="nsaFileCard" hidden><div class="nsa-thumb" id="nsaThumb"><div class="nsa-thumb-fallback">SVG</div></div><div><b id="nsaFileName"></b><span id="nsaFileMeta"></span></div><button id="nsaRemove" type="button" aria-label="Hapus file"><i class="fa-solid fa-xmark"></i></button></div>\
          <div class="nsa-mode-head"><div><span>02 · QUALITY MODE</span><h4>Pilih strategi konversi</h4></div><b id="nsaModeBadge">LOSSLESS</b></div>\
          <div class="nsa-modes" id="nsaModes">\
            <button class="active" type="button" data-quality="lossless"><i class="fa-solid fa-gem"></i><span><b>Lossless / 100% Akurat</b><small>Node 0% · z-order asli · native stroke</small></span><em>✓</em></button>\
            <button type="button" data-quality="accurate"><i class="fa-solid fa-bullseye"></i><span><b>Accurate Grouped</b><small>Node -35% · grouping warna presisi</small></span><em>✓</em></button>\
            <button type="button" data-quality="balanced"><i class="fa-solid fa-scale-balanced"></i><span><b>Balanced Grouped</b><small>Node -50% · detail dan ukuran seimbang</small></span><em>✓</em></button>\
            <button type="button" data-quality="lightweight"><i class="fa-solid fa-bolt"></i><span><b>Lightweight Grouped</b><small>Node -65% · prioritas file ringan</small></span><em>✓</em></button>\
          </div>\
          <details class="nsa-advanced">\
            <summary><span>Pengaturan lanjutan</span><small id="nsaAdvancedSummary">Dikunci profil Lossless</small></summary>\
            <div class="nsa-advanced-grid">\
              <label><span>Maks shape</span><input id="nsaMaxShapes" type="number" min="1" max="5000" value="5000"></label>\
              <label><span>Min area (%)</span><input id="nsaMinArea" type="number" min="0" max="5" step="0.0001" value="0"></label>\
              <label><span>Kurangi node (%)</span><input id="nsaNodeReduction" type="number" min="0" max="80" step="1" value="0"></label>\
              <label><span>Presisi</span><select id="nsaPrecision"><option>3</option><option>4</option><option>5</option><option>6</option><option selected>8</option></select></label>\
            </div><p id="nsaLosslessNote">Lossless mengunci node 0%, detail 0%, precision 8, grouping OFF, stroke native ON, dan bbox validation ON.</p>\
          </details>\
          <button class="nsa-run" id="nsaRun" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Konversi ke Alight XML</span><b>→</b></button>\
          <div class="nsa-progress" id="nsaProgress" hidden><span id="nsaProgressLabel">Menghubungkan engine…</span><i><b id="nsaProgressBar"></b></i></div>\
        </article>\
        <article class="nsa-card nsa-output">\
          <header><div><span>03 · OUTPUT</span><h3>Alight Motion XML</h3></div><b id="nsaReady" class="idle">WAITING</b></header>\
          <div class="nsa-empty" id="nsaEmpty"><i class="fa-solid fa-file-code"></i><strong>XML akan muncul di sini</strong><span>Pilih SVG dan salah satu dari empat mode.</span></div>\
          <div class="nsa-stats" id="nsaStats" hidden></div><div class="nsa-warnings" id="nsaWarnings" hidden></div><pre id="nsaCode" hidden tabindex="0"></pre>\
          <div class="nsa-actions" id="nsaActions" hidden><button id="nsaCopy"><i class="fa-regular fa-copy"></i> Copy XML</button><button id="nsaDownload"><i class="fa-solid fa-download"></i> Download XML</button></div>\
        </article>\
      </section><div class="nsa-toast" id="nsaToast" role="status"></div>\
    </main>';

    var root=body.querySelector('.nsa'),file=root.querySelector('#nsaFile'),drop=root.querySelector('#nsaDrop'),card=root.querySelector('#nsaFileCard'),thumb=root.querySelector('#nsaThumb'),name=root.querySelector('#nsaFileName'),meta=root.querySelector('#nsaFileMeta'),run=root.querySelector('#nsaRun'),status=root.querySelector('#nsaStatus'),ready=root.querySelector('#nsaReady'),progress=root.querySelector('#nsaProgress'),progressLabel=root.querySelector('#nsaProgressLabel'),progressBar=root.querySelector('#nsaProgressBar'),empty=root.querySelector('#nsaEmpty'),code=root.querySelector('#nsaCode'),actions=root.querySelector('#nsaActions'),toast=root.querySelector('#nsaToast'),modes=root.querySelector('#nsaModes'),modeBadge=root.querySelector('#nsaModeBadge'),stats=root.querySelector('#nsaStats'),warnings=root.querySelector('#nsaWarnings');
    var controls={maxShapes:root.querySelector('#nsaMaxShapes'),minArea:root.querySelector('#nsaMinArea'),nodeReduction:root.querySelector('#nsaNodeReduction'),precision:root.querySelector('#nsaPrecision')};
    var state={file:null,svg:'',xml:'',url:null,busy:false,destroyed:false,quality:'lossless'};

    function note(msg,tone){toast.textContent=msg;toast.className='nsa-toast show '+(tone||'');clearTimeout(toast._t);toast._t=setTimeout(function(){toast.className='nsa-toast';},3200);}
    function clean(){if(state.url){URL.revokeObjectURL(state.url);state.url=null;}}
    function setBusy(v){state.busy=v;run.disabled=v||!state.file;file.disabled=v;progress.hidden=!v;modes.querySelectorAll('button').forEach(function(btn){btn.disabled=v;});Object.keys(controls).forEach(function(key){controls[key].disabled=v||state.quality==='lossless';});}
    function applyMode(q){if(state.busy)return;var p=MODES[q]||MODES.lossless;state.quality=q;controls.maxShapes.value=p.maxShapes;controls.minArea.value=p.minAreaPercent;controls.nodeReduction.value=p.nodeReduction;controls.precision.value=p.precision;var locked=q==='lossless';Object.keys(controls).forEach(function(key){controls[key].disabled=locked;});modeBadge.textContent=p.label;root.querySelector('#nsaAdvancedSummary').textContent=locked?'Dikunci profil Lossless':'Node -'+p.nodeReduction+'% · dapat dituning';root.querySelector('#nsaLosslessNote').hidden=!locked;modes.querySelectorAll('button[data-quality]').forEach(function(btn){var active=btn.dataset.quality===q;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false');});}
    function setFile(f){if(!f||f.size<=0||f.size>MAX_BYTES||(!/\.svg$/i.test(f.name)&&f.type!=='image/svg+xml')){note(f&&f.size>MAX_BYTES?'SVG melebihi 2 MB.':'Pilih file SVG yang valid.','err');return;}var r=new FileReader();r.onload=function(){var text=String(r.result||'');if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)){note('Isi file bukan SVG valid.','err');return;}state.file=f;state.svg=text;state.xml='';clean();state.url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));var img=el('img');img.src=state.url;img.alt='Preview SVG '+f.name;img.onerror=function(){thumb.replaceChildren(el('div','nsa-thumb-fallback','SVG'));};thumb.replaceChildren(img);var info=countSvg(text);name.textContent=f.name;meta.textContent=bytes(f.size)+' · '+info.shapes+' shape · '+info.paths+' path · '+info.gradients+' gradient';card.hidden=false;drop.classList.add('has-file');run.disabled=false;ready.className='idle';ready.textContent='READY';code.hidden=true;actions.hidden=true;stats.hidden=true;warnings.hidden=true;empty.hidden=false;};r.onerror=function(){note('File gagal dibaca. Pilih ulang SVG.','err');};r.readAsText(f);}
    function clearFile(){clean();state.file=null;state.svg='';state.xml='';file.value='';card.hidden=true;drop.classList.remove('has-file');run.disabled=true;code.hidden=true;actions.hidden=true;stats.hidden=true;warnings.hidden=true;empty.hidden=false;ready.className='idle';ready.textContent='WAITING';}
    async function health(){try{var r=await fetch('/api/svg-alight',{cache:'no-store'}),d=await r.json();status.className=d.configured?'ok':'warn';status.innerHTML=d.configured?'<i class="fa-solid fa-circle-check"></i> ONLINE':'<i class="fa-solid fa-triangle-exclamation"></i> KEY?';}catch(_){status.className='warn';status.textContent='OFFLINE';}}
    function currentOptions(){var p=MODES[state.quality]||MODES.lossless;return{quality:state.quality,maxShapes:Number(controls.maxShapes.value),minAreaPercent:Number(controls.minArea.value),precision:Number(controls.precision.value),nodeReduction:Number(controls.nodeReduction.value),groupByColor:p.groupByColor,removeStrokes:p.removeStrokes,validateBounds:p.validateBounds,title:safeName(state.file&&state.file.name)};}
    async function convert(){if(!state.file||state.busy)return;setBusy(true);ready.className='idle';ready.textContent='WORKING';progressBar.style.width='14%';progressLabel.textContent='Mengirim SVG ke engine…';try{var opts=currentOptions();var res=await fetch('/api/svg-alight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({svg:state.svg,options:opts})});progressBar.style.width='72%';progressLabel.textContent='Menyusun '+MODES[state.quality].title+'…';var text=await res.text(),data={};try{data=text?JSON.parse(text):{};}catch(_){}if(!res.ok||!data.ok)throw new Error(data.message||data.error||('HTTP '+res.status));state.xml=String(data.xml||'');if(!state.xml)throw new Error('XML kosong.');progressBar.style.width='100%';progressLabel.textContent='Selesai';code.textContent=state.xml;code.hidden=false;actions.hidden=false;empty.hidden=true;ready.className='ok';ready.textContent='XML READY';var s=data.stats||data.meta||{},before=Number(s.nodesBefore||0),after=Number(s.nodesAfter||0);stats.replaceChildren(metric('fa-solid fa-shapes','Shapes / groups',s.colorGroups||s.outputShapes||s.shapes||'—',state.quality==='lossless'?'source order':'grouped'),metric('fa-solid fa-diagram-project','Nodes',before||after?(before+' → '+after):'—',state.quality==='lossless'?'0% reduction':'target -'+opts.nodeReduction+'%'),metric('fa-solid fa-file-code','XML',bytes(new TextEncoder().encode(state.xml).byteLength),'Alight output'),metric('fa-solid fa-wand-magic-sparkles','Mode',MODES[state.quality].label,'engine profile'));stats.hidden=false;var warningRows=Array.isArray(data.warnings)?data.warnings:[];warnings.hidden=!warningRows.length;warnings.textContent=warningRows.length?warningRows.map(function(w){return '⚠ '+w;}).join('\n'):'';note(MODES[state.quality].title+' selesai.','ok');}catch(e){ready.className='err';ready.textContent='FAILED';note(e&&e.message?e.message:'Konversi gagal.','err');}finally{setTimeout(function(){setBusy(false);progressBar.style.width='0%';},350);}}
    file.addEventListener('change',function(){if(file.files&&file.files[0])setFile(file.files[0]);});
    ['dragenter','dragover'].forEach(function(x){drop.addEventListener(x,function(e){e.preventDefault();drop.classList.add('drag');});});
    ['dragleave','drop'].forEach(function(x){drop.addEventListener(x,function(e){e.preventDefault();drop.classList.remove('drag');if(x==='drop'&&e.dataTransfer&&e.dataTransfer.files[0])setFile(e.dataTransfer.files[0]);});});
    modes.addEventListener('click',function(e){var btn=e.target.closest('button[data-quality]');if(btn)applyMode(btn.dataset.quality);});
    root.querySelector('#nsaRemove').addEventListener('click',clearFile);run.addEventListener('click',convert);
    root.querySelector('#nsaCopy').addEventListener('click',function(){if(!state.xml)return;copyText(state.xml).then(function(){note('XML disalin.','ok');}).catch(function(){note('Clipboard ditolak browser.','err');});});
    root.querySelector('#nsaDownload').addEventListener('click',function(){if(state.xml)download(safeName(state.file&&state.file.name)+'-alight.xml',state.xml);});
    applyMode('lossless');health();body.__nxCleanup=function(){state.destroyed=true;clean();clearTimeout(toast._t);};
  };
})();
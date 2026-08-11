/* Nexora SVG -> Alight Motion XML — Anime Atelier */
(function(){
  'use strict';
  var MAX_BYTES=2*1024*1024;
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
  function safeName(v){return String(v||'nexora-alight').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'nexora-alight';}
  function bytes(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';}
  function download(name,content){var blob=new Blob([content],{type:'application/xml;charset=utf-8'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1200);}
  async function copyText(v){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(v);var t=el('textarea');t.value=v;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();}

  window.renderSvgAlight=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
    <main class="nsa">\
      <section class="nsa-hero">\
        <div class="nsa-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>\
        <div class="nsa-copy">\
          <div class="nsa-kicker"><i class="fa-solid fa-wand-sparkles"></i><span>ANIME VECTOR ATELIER</span><b>API v1</b></div>\
          <h2>SVG masuk.<br><em>Alight Motion keluar.</em></h2>\
          <p>Konversi SVG menjadi XML Alight Motion melalui engine milikmu sendiri. Secret API key tetap di server Nexora.</p>\
          <div class="nsa-badges"><span><i class="fa-solid fa-gem"></i> LOSSLESS</span><span><i class="fa-solid fa-layer-group"></i> Z-ORDER</span><span><i class="fa-solid fa-key"></i> SERVER KEY</span></div>\
        </div>\
        <div class="nsa-muse" aria-label="Nexora anime muse">\
          <div class="nsa-halo"></div><div class="nsa-petal p1">✦</div><div class="nsa-petal p2">✧</div>\
          <svg viewBox="0 0 260 300" role="img" aria-label="Anime-style Nexora muse"><defs><linearGradient id="nsaHair" x1="0" x2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#36234f"/></linearGradient><linearGradient id="nsaGlow" x1="0" x2="1"><stop stop-color="#67e8f9"/><stop offset="1" stop-color="#f0abfc"/></linearGradient></defs><path d="M58 257c10-69 34-99 72-99s63 31 73 99" fill="#111827" stroke="url(#nsaGlow)" stroke-width="4"/><path d="M58 122c0-58 31-91 76-91 54 0 82 39 75 104-5 47-18 77-43 94H91c-30-20-38-58-33-107Z" fill="url(#nsaHair)"/><ellipse cx="132" cy="125" rx="55" ry="67" fill="#ffe8df"/><path d="M80 101c9-57 92-77 121-17-38-10-72-2-109 34Z" fill="url(#nsaHair)"/><path d="M89 111c-10 30-5 68 14 89-32-17-43-83-15-119Z" fill="url(#nsaHair)"/><path d="M179 102c17 33 11 77-10 101 31-16 46-74 19-119Z" fill="url(#nsaHair)"/><ellipse cx="111" cy="132" rx="9" ry="12" fill="#23203d"/><ellipse cx="158" cy="132" rx="9" ry="12" fill="#23203d"/><circle cx="114" cy="128" r="3" fill="#7dd3fc"/><circle cx="161" cy="128" r="3" fill="#f0abfc"/><path d="M120 161c10 7 20 7 30 0" fill="none" stroke="#d9778b" stroke-width="3" stroke-linecap="round"/><path d="M101 197c20 19 44 19 64 0l8 57H91Z" fill="#182033" stroke="url(#nsaGlow)" stroke-width="3"/><path d="M124 199l9 15 10-15" fill="none" stroke="#f0abfc" stroke-width="3"/><circle cx="133" cy="221" r="5" fill="#67e8f9"/></svg>\
          <div class="nsa-muse-tag"><span>NEXORA MUSE</span><b>YUME // XML</b></div>\
        </div>\
      </section>\
      <section class="nsa-grid">\
        <article class="nsa-card nsa-input">\
          <header><div><span>01 · SOURCE</span><h3>Masukkan SVG</h3></div><b id="nsaStatus" class="checking"><i class="fa-solid fa-circle-notch fa-spin"></i> CHECK</b></header>\
          <label class="nsa-drop" id="nsaDrop" for="nsaFile"><input id="nsaFile" type="file" accept="image/svg+xml,.svg"><i class="fa-solid fa-cloud-arrow-up"></i><strong>Pilih atau jatuhkan SVG</strong><small>Maksimal 2 MB · path, gradient, opacity, stroke</small><span>Pilih SVG</span></label>\
          <div class="nsa-file" id="nsaFileCard" hidden><div class="nsa-thumb" id="nsaThumb"></div><div><b id="nsaFileName"></b><span id="nsaFileMeta"></span></div><button id="nsaRemove" type="button"><i class="fa-solid fa-xmark"></i></button></div>\
          <div class="nsa-mode"><span>QUALITY MODE</span><button class="active" type="button"><i class="fa-solid fa-crown"></i><b>Lossless</b><small>Shape + z-order + native stroke</small></button></div>\
          <button class="nsa-run" id="nsaRun" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Konversi ke Alight XML</span><b>→</b></button>\
          <div class="nsa-progress" id="nsaProgress" hidden><span id="nsaProgressLabel">Menghubungkan engine…</span><i><b id="nsaProgressBar"></b></i></div>\
        </article>\
        <article class="nsa-card nsa-output">\
          <header><div><span>02 · OUTPUT</span><h3>Alight Motion XML</h3></div><b id="nsaReady" class="idle">WAITING</b></header>\
          <div class="nsa-empty" id="nsaEmpty"><i class="fa-solid fa-file-code"></i><strong>XML akan muncul di sini</strong><span>Anime atelier siap menerima SVG pertamamu.</span></div>\
          <pre id="nsaCode" hidden tabindex="0"></pre>\
          <div class="nsa-actions" id="nsaActions" hidden><button id="nsaCopy"><i class="fa-regular fa-copy"></i> Copy XML</button><button id="nsaDownload"><i class="fa-solid fa-download"></i> Download XML</button></div>\
        </article>\
      </section>\
      <div class="nsa-toast" id="nsaToast" role="status"></div>\
    </main>';
    var root=body.querySelector('.nsa'),file=root.querySelector('#nsaFile'),drop=root.querySelector('#nsaDrop'),card=root.querySelector('#nsaFileCard'),thumb=root.querySelector('#nsaThumb'),name=root.querySelector('#nsaFileName'),meta=root.querySelector('#nsaFileMeta'),run=root.querySelector('#nsaRun'),status=root.querySelector('#nsaStatus'),ready=root.querySelector('#nsaReady'),progress=root.querySelector('#nsaProgress'),progressLabel=root.querySelector('#nsaProgressLabel'),progressBar=root.querySelector('#nsaProgressBar'),empty=root.querySelector('#nsaEmpty'),code=root.querySelector('#nsaCode'),actions=root.querySelector('#nsaActions'),toast=root.querySelector('#nsaToast');
    var state={file:null,svg:'',xml:'',url:null,busy:false,destroyed:false};
    function note(msg,tone){toast.textContent=msg;toast.className='nsa-toast show '+(tone||'');clearTimeout(toast._t);toast._t=setTimeout(function(){toast.className='nsa-toast';},3000);}
    function clean(){if(state.url){URL.revokeObjectURL(state.url);state.url=null;}}
    function setBusy(v){state.busy=v;run.disabled=v||!state.file;file.disabled=v;progress.hidden=!v;}
    function setFile(f){if(!f||f.size<=0||f.size>MAX_BYTES||(!/\.svg$/i.test(f.name)&&f.type!=='image/svg+xml')){note(f&&f.size>MAX_BYTES?'SVG melebihi 2 MB.':'Pilih file SVG yang valid.','err');return;}var r=new FileReader();r.onload=function(){var text=String(r.result||'');if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)){note('Isi file bukan SVG valid.','err');return;}state.file=f;state.svg=text;clean();state.url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));var img=el('img');img.src=state.url;img.alt='SVG preview';thumb.replaceChildren(img);name.textContent=f.name;meta.textContent=bytes(f.size)+' · SVG ready';card.hidden=false;drop.classList.add('has-file');run.disabled=false;ready.className='idle';ready.textContent='READY';};r.onerror=function(){note('File gagal dibaca.','err');};r.readAsText(f);}
    function clearFile(){clean();state.file=null;state.svg='';state.xml='';file.value='';card.hidden=true;drop.classList.remove('has-file');run.disabled=true;code.hidden=true;actions.hidden=true;empty.hidden=false;}
    async function health(){try{var r=await fetch('/api/svg-alight',{cache:'no-store'}),d=await r.json();status.className=d.configured?'ok':'warn';status.innerHTML=d.configured?'<i class="fa-solid fa-circle-check"></i> ONLINE':'<i class="fa-solid fa-triangle-exclamation"></i> KEY?';}catch(_){status.className='warn';status.textContent='OFFLINE';}}
    async function convert(){if(!state.file||state.busy)return;setBusy(true);progressBar.style.width='18%';progressLabel.textContent='Mengirim SVG ke engine…';try{var res=await fetch('/api/svg-alight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({svg:state.svg,options:{quality:'lossless'}})});progressBar.style.width='72%';progressLabel.textContent='Menyusun Alight Motion XML…';var data=await res.json();if(!res.ok||!data.ok)throw new Error(data.message||'Konversi gagal.');state.xml=String(data.xml||'');if(!state.xml)throw new Error('XML kosong.');progressBar.style.width='100%';progressLabel.textContent='Selesai';code.textContent=state.xml;code.hidden=false;actions.hidden=false;empty.hidden=true;ready.className='ok';ready.textContent='XML READY';note('XML Alight Motion berhasil dibuat.','ok');}catch(e){ready.className='err';ready.textContent='FAILED';note(e.message||'Konversi gagal.','err');}finally{setTimeout(function(){setBusy(false);progressBar.style.width='0%';},350);}}
    file.addEventListener('change',function(){if(file.files&&file.files[0])setFile(file.files[0]);});
    ['dragenter','dragover'].forEach(function(x){drop.addEventListener(x,function(e){e.preventDefault();drop.classList.add('drag');});});['dragleave','drop'].forEach(function(x){drop.addEventListener(x,function(e){e.preventDefault();drop.classList.remove('drag');if(x==='drop'&&e.dataTransfer&&e.dataTransfer.files[0])setFile(e.dataTransfer.files[0]);});});
    root.querySelector('#nsaRemove').addEventListener('click',clearFile);run.addEventListener('click',convert);root.querySelector('#nsaCopy').addEventListener('click',function(){copyText(state.xml).then(function(){note('XML disalin.','ok');});});root.querySelector('#nsaDownload').addEventListener('click',function(){if(state.xml)download(safeName(state.file&&state.file.name)+'.xml',state.xml);});
    body.__nxCleanup=function(){state.destroyed=true;clean();clearTimeout(toast._t);};health();
  };
})();

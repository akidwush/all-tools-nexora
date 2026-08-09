/* Nexora OCR Intelligence HF8 */
(function(){
  'use strict';

  var MAX_BYTES=1048576;
  var ACCEPTED=/\.(?:jpe?g|png|gif|bmp|tiff?|pdf)$/i;

  function create(tag,className,text){
    var node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }
  function formatBytes(value){
    var size=Number(value)||0;
    if(size<1024)return size+' B';
    if(size<1048576)return (size/1024).toFixed(size<10240?1:0)+' KB';
    return (size/1048576).toFixed(2)+' MB';
  }
  function formatNumber(value){return new Intl.NumberFormat('id-ID').format(Number(value)||0);}
  function safeName(value){return String(value||'dokumen').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'dokumen';}
  function download(name,content,type){
    var blob=content instanceof Blob?content:new Blob([content],{type:type||'text/plain;charset=utf-8'});
    var url=URL.createObjectURL(blob);var link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }
  async function copyText(value){
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value);return;}
    var area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
  }
  function fileToDataUrl(file){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result||''));};reader.onerror=function(){reject(new Error('File tidak dapat dibaca.'));};reader.readAsDataURL(file);});}

  window.renderOcrIntelligence=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <main class="noi" aria-label="Nexora OCR Intelligence">\
        <section class="noi-hero">\
          <div class="noi-hero-copy">\
            <div class="noi-kicker"><i class="fa-solid fa-eye"></i><span>DOCUMENT VISION ENGINE</span><b>HF8</b></div>\
            <h2>Turn pixels into<br><em>usable knowledge.</em></h2>\
            <p>Ekstrak teks dari foto, screenshot, scan, dan PDF. Cari isi dokumen, lihat statistik, lalu unduh teks atau searchable PDF.</p>\
            <div class="noi-signal-row"><span><i class="fa-solid fa-shield-halved"></i> KEY SERVER-SIDE</span><span><i class="fa-solid fa-file-arrow-up"></i> MAKS. 1 MB</span><span><i class="fa-solid fa-file-pdf"></i> PDF 3 HALAMAN</span></div>\
          </div>\
          <div class="noi-vision" aria-hidden="true"><div class="noi-document"><i class="fa-solid fa-file-lines"></i><span></span><span></span><span></span></div><div class="noi-scan-beam"></div><i class="noi-node noi-n1"></i><i class="noi-node noi-n2"></i><i class="noi-node noi-n3"></i></div>\
        </section>\
        <section class="noi-workspace" id="noiWorkspace">\
          <article class="noi-card noi-input-card">\
            <header class="noi-card-head"><div><span>01 · INPUT</span><h3>Masukkan dokumen</h3></div><b id="noiProvider" class="is-checking"><i class="fa-solid fa-circle-notch fa-spin"></i> CHECKING</b></header>\
            <label class="noi-dropzone" id="noiDropzone" for="noiFile">\
              <input id="noiFile" type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/tiff,application/pdf,.jpg,.jpeg,.png,.gif,.bmp,.tif,.tiff,.pdf">\
              <span class="noi-upload-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>\
              <strong>Tarik atau pilih dokumen</strong>\
              <small>JPG, PNG, GIF, BMP, TIFF, PDF · maksimal 1 MB</small>\
              <div><span><i class="fa-solid fa-folder-open"></i> Pilih file</span><button id="noiCamera" type="button"><i class="fa-solid fa-camera"></i> Kamera</button></div>\
            </label>\
            <div class="noi-file-preview" id="noiPreview" hidden><div class="noi-preview-media" id="noiPreviewMedia"></div><div class="noi-preview-copy"><span>DOCUMENT READY</span><strong id="noiFileName"></strong><small id="noiFileMeta"></small></div><button id="noiRemove" type="button" aria-label="Hapus file"><i class="fa-solid fa-xmark"></i></button></div>\
            <div class="noi-controls">\
              <label><span>Bahasa dokumen</span><select id="noiLanguage"><option value="auto">Auto detect</option><option value="eng">English</option><option value="spa">Spanish</option><option value="fre">French</option><option value="ger">German</option><option value="dut">Dutch</option><option value="por">Portuguese</option><option value="ita">Italian</option><option value="jpn">Japanese</option><option value="kor">Korean</option><option value="chs">Chinese Simplified</option><option value="cht">Chinese Traditional</option><option value="rus">Russian</option><option value="ara">Arabic</option><option value="tha">Thai</option><option value="tur">Turkish</option><option value="vnm">Vietnamese</option></select></label>\
              <label><span>OCR Engine</span><select id="noiEngine"><option value="2">Engine 2 · balanced</option><option value="3">Engine 3 · handwriting</option><option value="1">Engine 1 · fastest</option></select></label>\
            </div>\
            <div class="noi-options">\
              <label><input id="noiSearchable" type="checkbox" checked><span><i class="fa-solid fa-file-circle-check"></i><b>Searchable PDF</b><small>PDF dengan text layer tersembunyi</small></span></label>\
              <label><input id="noiTable" type="checkbox"><span><i class="fa-solid fa-table-cells"></i><b>Table mode</b><small>Invoice, struk, dan tabel</small></span></label>\
            </div>\
            <div class="noi-engine-note" id="noiEngineNote"><i class="fa-solid fa-circle-info"></i><span>Engine 2 mendukung auto-language dan searchable PDF.</span></div>\
            <button class="noi-scan-button" id="noiScan" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Ekstrak & analisis</span><b>→</b></button>\
            <div class="noi-progress" id="noiProgress" hidden><div><i class="fa-solid fa-eye fa-beat"></i><span><b id="noiProgressTitle">Membaca dokumen</b><small id="noiProgressText">Mengirim file secara aman…</small></span></div><div class="noi-progress-track"><i id="noiProgressBar"></i></div></div>\
          </article>\
          <aside class="noi-card noi-insight-card">\
            <header class="noi-card-head"><div><span>02 · INTELLIGENCE</span><h3>Apa yang kamu dapat</h3></div></header>\
            <div class="noi-feature-list">\
              <article><i class="fa-solid fa-font"></i><div><strong>Clean text extraction</strong><span>Hasil per halaman, siap copy atau TXT.</span></div><b>01</b></article>\
              <article><i class="fa-solid fa-language"></i><div><strong>Language signal</strong><span>Deteksi lokal berbasis aksara dan pola kata.</span></div><b>02</b></article>\
              <article><i class="fa-solid fa-chart-simple"></i><div><strong>Document statistics</strong><span>Kata, karakter, kalimat, baris, dan durasi baca.</span></div><b>03</b></article>\
              <article><i class="fa-solid fa-magnifying-glass"></i><div><strong>Instant document search</strong><span>Sorot kata tanpa mengunggah ulang file.</span></div><b>04</b></article>\
              <article><i class="fa-solid fa-file-pdf"></i><div><strong>Searchable PDF</strong><span>Text layer OCR.Space; free tier ber-watermark.</span></div><b>05</b></article>\
            </div>\
            <div class="noi-privacy"><i class="fa-solid fa-user-shield"></i><div><strong>Privacy first</strong><span>Nexora tidak menyimpan file atau hasil OCR ke database. Riwayat perangkat hanya metadata.</span></div></div>\
            <div class="noi-history"><div class="noi-mini-head"><span>RECENT ON THIS DEVICE</span><button id="noiClearHistory" type="button">Hapus</button></div><div id="noiHistoryList"></div></div>\
          </aside>\
        </section>\
        <section class="noi-result" id="noiResult" hidden>\
          <header class="noi-result-head"><div><span>03 · OCR RESULT</span><h3 id="noiResultTitle">Dokumen berhasil dibaca</h3><p id="noiResultMeta"></p></div><div class="noi-result-actions"><button id="noiCopy" type="button"><i class="fa-regular fa-copy"></i><span>Copy</span></button><button id="noiTxt" type="button"><i class="fa-solid fa-file-arrow-down"></i><span>TXT</span></button><button id="noiJson" type="button"><i class="fa-solid fa-code"></i><span>JSON</span></button><a id="noiPdf" target="_blank" rel="noopener noreferrer" hidden><i class="fa-solid fa-file-pdf"></i><span>Searchable PDF</span></a></div></header>\
          <div class="noi-metrics" id="noiMetrics"></div>\
          <div class="noi-keywords" id="noiKeywords" hidden><span>KEYWORDS</span><div></div></div>\
          <div class="noi-reader">\
            <div class="noi-reader-toolbar"><div class="noi-pages" id="noiPages"></div><label><i class="fa-solid fa-magnifying-glass"></i><input id="noiSearch" type="search" placeholder="Cari di dokumen…" autocomplete="off"><span id="noiSearchCount">0 hasil</span></label></div>\
            <pre id="noiText" tabindex="0"></pre>\
          </div>\
          <footer class="noi-result-foot"><span><i class="fa-solid fa-circle-info"></i> Searchable PDF free tier memuat watermark OCR.Space. Unduh segera karena tautan dikelola provider.</span><button id="noiNew" type="button"><i class="fa-solid fa-plus"></i> Dokumen baru</button></footer>\
        </section>\
        <div class="noi-toast" id="noiToast" role="status" aria-live="polite"></div>\
      </main>';

    var root=body.querySelector('.noi');
    var fileInput=root.querySelector('#noiFile');var dropzone=root.querySelector('#noiDropzone');var camera=root.querySelector('#noiCamera');var preview=root.querySelector('#noiPreview');var previewMedia=root.querySelector('#noiPreviewMedia');var fileName=root.querySelector('#noiFileName');var fileMeta=root.querySelector('#noiFileMeta');var remove=root.querySelector('#noiRemove');
    var language=root.querySelector('#noiLanguage');var engine=root.querySelector('#noiEngine');var searchable=root.querySelector('#noiSearchable');var table=root.querySelector('#noiTable');var engineNote=root.querySelector('#noiEngineNote');var scan=root.querySelector('#noiScan');var provider=root.querySelector('#noiProvider');var progress=root.querySelector('#noiProgress');var progressTitle=root.querySelector('#noiProgressTitle');var progressText=root.querySelector('#noiProgressText');var progressBar=root.querySelector('#noiProgressBar');
    var result=root.querySelector('#noiResult');var resultTitle=root.querySelector('#noiResultTitle');var resultMeta=root.querySelector('#noiResultMeta');var metrics=root.querySelector('#noiMetrics');var keywords=root.querySelector('#noiKeywords');var pages=root.querySelector('#noiPages');var textView=root.querySelector('#noiText');var search=root.querySelector('#noiSearch');var searchCount=root.querySelector('#noiSearchCount');var pdf=root.querySelector('#noiPdf');var toast=root.querySelector('#noiToast');var historyList=root.querySelector('#noiHistoryList');
    var state={file:null,previewUrl:null,controller:null,result:null,page:-1,progressTimer:null,destroyed:false};

    function notify(message,tone){toast.textContent=message;toast.className='noi-toast is-show '+(tone||'');clearTimeout(toast.__timer);toast.__timer=setTimeout(function(){toast.className='noi-toast';},3000);}
    function releasePreview(){if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl=null;}}
    function validFile(file){return file&&file.size>0&&file.size<=MAX_BYTES&&(ACCEPTED.test(file.name)||/^(?:image\/(?:jpeg|png|gif|bmp|tiff)|application\/pdf)$/i.test(file.type));}
    function setFile(file){
      if(!validFile(file)){notify(file&&file.size>MAX_BYTES?'File melebihi 1 MB. Kompres dahulu lalu coba lagi.':'Format tidak didukung. Gunakan JPG, PNG, GIF, BMP, TIFF, atau PDF.','is-error');return;}
      releasePreview();state.file=file;preview.hidden=false;dropzone.classList.add('has-file');scan.disabled=false;fileName.textContent=file.name;fileMeta.textContent=formatBytes(file.size)+' · '+(file.type||file.name.split('.').pop().toUpperCase());previewMedia.replaceChildren();
      if(/^image\//.test(file.type)){var image=create('img');state.previewUrl=URL.createObjectURL(file);image.src=state.previewUrl;image.alt='Preview '+file.name;previewMedia.appendChild(image);}else{var icon=create('i','fa-solid fa-file-pdf');previewMedia.appendChild(icon);}
    }
    function clearFile(){releasePreview();state.file=null;fileInput.value='';preview.hidden=true;dropzone.classList.remove('has-file');scan.disabled=true;previewMedia.replaceChildren();}
    function syncEngine(){
      var isThree=engine.value==='3';if(isThree&&searchable.checked)searchable.checked=false;searchable.disabled=isThree;
      engineNote.className='noi-engine-note '+(isThree?'is-warning':'');engineNote.querySelector('span').textContent=isThree?'Engine 3 unggul untuk handwriting/tabel, tetapi provider belum mendukung searchable PDF.':'Engine '+engine.value+(engine.value==='1'?' paling cepat untuk scan bersih.':' mendukung auto-language dan searchable PDF.');
      if(engine.value==='1'&&language.value==='auto')language.value='eng';
    }
    function setBusy(busy){scan.disabled=busy||!state.file;fileInput.disabled=busy;engine.disabled=busy;language.disabled=busy;searchable.disabled=busy||engine.value==='3';table.disabled=busy;progress.hidden=!busy;if(!busy){clearInterval(state.progressTimer);state.progressTimer=null;progressBar.style.width='0%';}}
    function startProgress(){var stages=[['Mengamankan upload','File dikirim langsung melalui proxy Nexora.'],['Membaca struktur','OCR Engine memetakan huruf dan baris.'],['Menganalisis teks','Menghitung bahasa dan statistik dokumen.'],['Menyiapkan hasil','Menyusun output dan searchable PDF.']];var step=0;progressBar.style.width='12%';progressTitle.textContent=stages[0][0];progressText.textContent=stages[0][1];state.progressTimer=setInterval(function(){step=Math.min(stages.length-1,step+1);progressTitle.textContent=stages[step][0];progressText.textContent=stages[step][1];progressBar.style.width=(20+step*23)+'%';},1700);}
    function selectedText(){if(!state.result)return '';if(state.page<0)return state.result.text||'';return state.result.pages[state.page]&&state.result.pages[state.page].text||'';}
    function renderSearch(){
      var source=selectedText();var query=search.value.trim();textView.replaceChildren();if(!query){textView.textContent=source;searchCount.textContent='0 hasil';return;}
      var lower=source.toLocaleLowerCase('und');var needle=query.toLocaleLowerCase('und');var cursor=0;var count=0;var drawn=0;var index=-1;
      while(needle&&(index=lower.indexOf(needle,cursor))>=0){count+=1;if(drawn<200){textView.appendChild(document.createTextNode(source.slice(cursor,index)));textView.appendChild(create('mark','',source.slice(index,index+query.length)));drawn+=1;}cursor=index+query.length;}
      textView.appendChild(document.createTextNode(source.slice(cursor)));
      searchCount.textContent=count+(count===1?' hasil':' hasil');
    }
    function metric(icon,label,value){var card=create('article');card.innerHTML='<i class="'+icon+'"></i>';var copy=create('div');copy.append(create('small','',label),create('strong','',value));card.appendChild(copy);return card;}
    function renderPages(){pages.replaceChildren();var all=create('button','is-active','Semua');all.type='button';all.addEventListener('click',function(){state.page=-1;pages.querySelectorAll('button').forEach(function(item){item.classList.remove('is-active');});all.classList.add('is-active');renderSearch();});pages.appendChild(all);(state.result.pages||[]).forEach(function(page,index){var button=create('button','', 'Halaman '+page.page);button.type='button';button.addEventListener('click',function(){state.page=index;pages.querySelectorAll('button').forEach(function(item){item.classList.remove('is-active');});button.classList.add('is-active');renderSearch();});pages.appendChild(button);});}
    function saveHistory(data){try{var key='nexora-ocr-history-v1';var rows=JSON.parse(localStorage.getItem(key)||'[]');rows.unshift({name:data.file.name,size:data.file.size,words:data.stats.words,pages:data.stats.pages,language:data.language.label,at:data.processedAt});localStorage.setItem(key,JSON.stringify(rows.slice(0,5)));}catch(_error){}renderHistory();}
    function renderHistory(){historyList.replaceChildren();var rows=[];try{rows=JSON.parse(localStorage.getItem('nexora-ocr-history-v1')||'[]');}catch(_error){}if(!Array.isArray(rows)||!rows.length){historyList.appendChild(create('div','noi-history-empty','Belum ada dokumen yang diproses.'));return;}rows.slice(0,5).forEach(function(row){var item=create('article');item.innerHTML='<i class="fa-regular fa-file-lines"></i>';var copy=create('div');copy.append(create('strong','',row.name||'Dokumen'),create('span','',(row.words||0)+' kata · '+(row.pages||1)+' halaman · '+(row.language||'—')));item.appendChild(copy);historyList.appendChild(item);});}
    function renderResult(data){
      state.result=data;state.page=-1;result.hidden=false;resultTitle.textContent=data.file.name;resultMeta.textContent=formatBytes(data.file.size)+' · '+data.stats.pages+' halaman · '+(data.processingTimeMs?data.processingTimeMs+' ms provider':'selesai diproses');metrics.replaceChildren(metric('fa-solid fa-language','Bahasa (estimasi)',data.language.label),metric('fa-solid fa-font','Kata',formatNumber(data.stats.words)),metric('fa-solid fa-align-left','Karakter',formatNumber(data.stats.characters)),metric('fa-regular fa-clock','Waktu baca',data.stats.readingTimeMinutes+' menit'));
      var keywordRows=Array.isArray(data.stats.topKeywords)?data.stats.topKeywords:[];keywords.hidden=!keywordRows.length;var keywordBox=keywords.querySelector('div');keywordBox.replaceChildren();keywordRows.forEach(function(item){var button=create('button','',item.word+' · '+item.count);button.type='button';button.addEventListener('click',function(){search.value=item.word;renderSearch();});keywordBox.appendChild(button);});
      pdf.hidden=!(data.searchablePdf&&data.searchablePdf.available&&data.searchablePdf.url);if(!pdf.hidden)pdf.href=data.searchablePdf.url;else pdf.removeAttribute('href');search.value='';renderPages();renderSearch();saveHistory(data);requestAnimationFrame(function(){result.scrollIntoView({behavior:'smooth',block:'start'});});
    }
    async function run(){
      if(!state.file)return;setBusy(true);startProgress();if(state.controller)state.controller.abort();var controller=new AbortController();state.controller=controller;
      try{
        var fileData=await fileToDataUrl(state.file);var response=await window.NexoraFetch('/api/ocr-intelligence',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,nexoraTimeoutMs:55000,nexoraRetries:0,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({fileData:fileData,fileName:state.file.name,mimeType:state.file.type,language:language.value,engine:Number(engine.value),searchablePdf:searchable.checked,hideTextLayer:true,tableMode:table.checked,scale:true})});var payload=await response.json().catch(function(){return {};});if(!response.ok||!payload.ok)throw new Error(payload.message||'OCR belum dapat diselesaikan.');progressBar.style.width='100%';renderResult(payload);notify('Dokumen berhasil dibaca.','is-success');
      }catch(error){if(error&&error.name==='AbortError')return;notify(error&&error.message?error.message:'OCR gagal. Coba kembali.','is-error');}
      finally{if(state.controller===controller){state.controller=null;setBusy(false);}}
    }
    async function health(){try{var response=await window.NexoraFetch('/api/ocr-intelligence?health=1',{method:'GET',cache:'no-store',credentials:'same-origin',nexoraTimeoutMs:8000,nexoraRetries:0});var data=await response.json();provider.className=data.configured?'is-ready':'is-warning';provider.innerHTML=data.configured?'<i class="fa-solid fa-circle-check"></i> API READY':'<i class="fa-solid fa-key"></i> KEY REQUIRED';if(!data.configured)notify('Tambahkan API key OCR.Space di environment Vercel agar fitur dapat digunakan.','is-error');}catch(_error){provider.className='is-error';provider.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> API OFFLINE';}}

    fileInput.addEventListener('change',function(){if(fileInput.files&&fileInput.files[0])setFile(fileInput.files[0]);});
    camera.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();fileInput.accept='image/*';fileInput.setAttribute('capture','environment');fileInput.click();setTimeout(function(){fileInput.accept='image/jpeg,image/png,image/gif,image/bmp,image/tiff,application/pdf,.jpg,.jpeg,.png,.gif,.bmp,.tif,.tiff,.pdf';fileInput.removeAttribute('capture');},1000);});
    ['dragenter','dragover'].forEach(function(name){dropzone.addEventListener(name,function(event){event.preventDefault();dropzone.classList.add('is-dragging');});});['dragleave','drop'].forEach(function(name){dropzone.addEventListener(name,function(event){event.preventDefault();dropzone.classList.remove('is-dragging');if(name==='drop'&&event.dataTransfer&&event.dataTransfer.files[0])setFile(event.dataTransfer.files[0]);});});
    remove.addEventListener('click',clearFile);engine.addEventListener('change',syncEngine);scan.addEventListener('click',run);search.addEventListener('input',renderSearch);
    root.querySelector('#noiCopy').addEventListener('click',async function(){if(!state.result)return;try{await copyText(state.result.text||'');notify('Teks disalin.','is-success');}catch(_error){notify('Browser menolak akses clipboard.','is-error');}});
    root.querySelector('#noiTxt').addEventListener('click',function(){if(!state.result)return;download(safeName(state.result.file.name.replace(/\.[^.]+$/,''))+'-ocr.txt',state.result.text||'','text/plain;charset=utf-8');});
    root.querySelector('#noiJson').addEventListener('click',function(){if(!state.result)return;download(safeName(state.result.file.name.replace(/\.[^.]+$/,''))+'-ocr.json',JSON.stringify(state.result,null,2),'application/json;charset=utf-8');});
    root.querySelector('#noiNew').addEventListener('click',function(){result.hidden=true;state.result=null;state.page=-1;clearFile();root.querySelector('#noiWorkspace').scrollIntoView({behavior:'smooth',block:'start'});});
    root.querySelector('#noiClearHistory').addEventListener('click',function(){try{localStorage.removeItem('nexora-ocr-history-v1');}catch(_error){}renderHistory();});
    body.__nxCleanup=function(){state.destroyed=true;if(state.controller)state.controller.abort();clearInterval(state.progressTimer);releasePreview();clearTimeout(toast.__timer);};
    syncEngine();renderHistory();health();
  };
})();

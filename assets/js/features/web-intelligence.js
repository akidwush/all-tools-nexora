/* Nexora Web Intelligence v1 — HF5 */
(function(){
  'use strict';

  var CATEGORIES=['seo','security','performance','accessibility','bestPractices'];
  var CATEGORY_META={
    seo:{label:'SEO',icon:'fa-solid fa-magnifying-glass-chart',color:'#38bdf8'},
    security:{label:'Security',icon:'fa-solid fa-shield-halved',color:'#34d399'},
    performance:{label:'Performance',icon:'fa-solid fa-gauge-high',color:'#fbbf24'},
    accessibility:{label:'Accessibility',icon:'fa-solid fa-universal-access',color:'#c084fc'},
    bestPractices:{label:'Best Practices',icon:'fa-solid fa-layer-group',color:'#fb7185'}
  };

  function node(tag,className,text){var el=document.createElement(tag);if(className)el.className=className;if(text!==undefined&&text!==null)el.textContent=String(text);return el;}
  function icon(name){return node('i',name);}
  function finite(value){return typeof value==='number'&&Number.isFinite(value);}
  function number(value){return finite(value)?new Intl.NumberFormat('id-ID').format(value):'—';}
  function bytes(value){if(!finite(value))return '—';if(value<1024)return value+' B';if(value<1048576)return (value/1024).toFixed(1)+' KB';return (value/1048576).toFixed(2)+' MB';}
  function dateTime(value){var date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});}
  function scoreTone(value){return value>=90?'excellent':value>=75?'good':value>=50?'warning':'danger';}
  function statusIcon(status){return status==='pass'?'fa-solid fa-circle-check':status==='warn'?'fa-solid fa-triangle-exclamation':'fa-solid fa-circle-xmark';}
  function categoryMeta(id){return CATEGORY_META[id]||{label:id,icon:'fa-solid fa-circle',color:'#94a3b8'};}

  window.renderWebIntelligence=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <section class="nwi" aria-label="Nexora Web Intelligence">\
        <div class="nwi-ambient" aria-hidden="true"><span></span><span></span><span></span></div>\
        <section class="nwi-launch" id="nwiLaunch">\
          <div class="nwi-launch-copy">\
            <div class="nwi-kicker"><i class="fa-solid fa-satellite-dish"></i><span>NEXORA INTELLIGENCE ENGINE</span><b>HF5</b></div>\
            <h2>Turn any URL into <em>actionable intelligence.</em></h2>\
            <p>Bedah struktur website, keamanan, SEO, performa, aksesibilitas, teknologi, tracker, dan peluang optimasi—dengan bukti yang dapat diperiksa.</p>\
          </div>\
          <form class="nwi-scan-box" id="nwiScanForm">\
            <label class="nwi-url-field"><i class="fa-solid fa-globe"></i><input id="nwiUrl" type="text" inputmode="url" autocomplete="url" spellcheck="false" placeholder="example.com atau https://website.com" required><button type="submit" aria-label="Mulai scan"><span>SCAN WEBSITE</span><i class="fa-solid fa-arrow-right"></i></button></label>\
            <div class="nwi-mode-row">\
              <label class="nwi-mode is-active"><input type="radio" name="nwiMode" value="standard" checked><span><i class="fa-solid fa-bolt"></i><b>Standard Scan</b><small>Audit server-side cepat</small></span></label>\
              <label class="nwi-mode"><input type="radio" name="nwiMode" value="deep"><span><i class="fa-solid fa-atom"></i><b>Deep Intelligence</b><small>+ Lighthouse & reputation</small></span></label>\
            </div>\
            <div class="nwi-safe-note"><i class="fa-solid fa-lock"></i><span>Scan read-only. Private IP, localhost, unsafe port, dan DNS rebinding otomatis diblokir.</span></div>\
          </form>\
          <div class="nwi-capabilities">\
            <article><i class="fa-solid fa-shield-virus"></i><strong>Security Matrix</strong><span>CSP, HSTS, cookies, TLS, mixed content</span></article>\
            <article><i class="fa-solid fa-chart-simple"></i><strong>Evidence Scoring</strong><span>5 dimensi, 40+ pemeriksaan nyata</span></article>\
            <article><i class="fa-solid fa-fingerprint"></i><strong>Stack Fingerprint</strong><span>Framework, hosting, CDN, tracker</span></article>\
            <article><i class="fa-solid fa-file-export"></i><strong>Action Report</strong><span>Prioritas fix + ekspor JSON/HTML</span></article>\
          </div>\
          <section class="nwi-recent" id="nwiRecent" hidden><div class="nwi-section-title"><span>RECENT INTELLIGENCE</span><small>Tersimpan lokal di perangkat</small></div><div id="nwiRecentList"></div></section>\
        </section>\
        <section class="nwi-scanning" id="nwiScanning" hidden aria-live="polite">\
          <div class="nwi-scan-visual"><div class="nwi-orbit"><span></span><span></span><span></span><i class="fa-solid fa-globe"></i></div><div class="nwi-scan-beam"></div></div>\
          <div class="nwi-scan-copy"><div class="nwi-kicker"><i class="fa-solid fa-wave-square"></i><span>LIVE ANALYSIS</span></div><h3 id="nwiScanHost">Membaca target…</h3><p id="nwiScanStage">Memvalidasi URL publik dan resolusi DNS.</p><div class="nwi-stage-track"><span id="nwiStageBar"></span></div><small id="nwiScanHint">Scanner tidak mengubah apa pun pada website target.</small><button id="nwiCancel" type="button"><i class="fa-solid fa-xmark"></i> Batalkan</button></div>\
        </section>\
        <section class="nwi-error" id="nwiError" hidden><div><i class="fa-solid fa-satellite-dish"></i></div><h3>Intelligence scan terputus</h3><p></p><button type="button"><i class="fa-solid fa-arrow-rotate-right"></i> Kembali ke scanner</button></section>\
        <section class="nwi-report" id="nwiReport" hidden>\
          <header class="nwi-report-bar"><button id="nwiNewScan" type="button"><i class="fa-solid fa-chevron-left"></i><span>New Scan</span></button><div class="nwi-target"><span class="nwi-live-dot"></span><div><strong id="nwiReportHost">—</strong><small id="nwiReportUrl">—</small></div></div><div class="nwi-report-actions"><button id="nwiCopy" type="button" title="Salin ringkasan"><i class="fa-regular fa-copy"></i></button><button id="nwiExportJson" type="button" title="Download JSON"><i class="fa-solid fa-code"></i></button><button id="nwiExportHtml" type="button" title="Download laporan HTML"><i class="fa-solid fa-file-arrow-down"></i></button></div></header>\
          <section class="nwi-verdict">\
            <div class="nwi-score-ring" id="nwiScoreRing"><div><strong id="nwiOverallScore">0</strong><span>/100</span></div></div>\
            <div class="nwi-verdict-copy"><div class="nwi-grade-line"><span id="nwiGrade">—</span><b id="nwiVerdictLabel">Analyzed</b></div><h2 id="nwiPageTitle">Website Intelligence Report</h2><p id="nwiVerdictText"></p><div class="nwi-verdict-meta" id="nwiVerdictMeta"></div></div>\
            <div class="nwi-radar-wrap"><canvas id="nwiRadar" width="280" height="220" aria-label="Radar skor website"></canvas></div>\
          </section>\
          <div class="nwi-score-grid" id="nwiScoreGrid"></div>\
          <nav class="nwi-tabs" id="nwiTabs" aria-label="Bagian laporan">\
            <button class="is-active" data-tab="overview" type="button"><i class="fa-solid fa-table-cells-large"></i><span>Overview</span></button>\
            <button data-tab="findings" type="button"><i class="fa-solid fa-list-check"></i><span>Findings</span></button>\
            <button data-tab="seo" type="button"><i class="fa-solid fa-magnifying-glass-chart"></i><span>SEO</span></button>\
            <button data-tab="security" type="button"><i class="fa-solid fa-shield-halved"></i><span>Security</span></button>\
            <button data-tab="performance" type="button"><i class="fa-solid fa-gauge-high"></i><span>Speed</span></button>\
            <button data-tab="stack" type="button"><i class="fa-solid fa-microchip"></i><span>Stack</span></button>\
          </nav>\
          <div class="nwi-tab-panel" id="nwiPanel"></div>\
          <footer class="nwi-report-foot"><i class="fa-solid fa-circle-info"></i><span>Hasil adalah audit teknis point-in-time, bukan jaminan keamanan absolut. Uji pentest aktif tidak dilakukan.</span></footer>\
        </section>\
      </section>';

    var root=body.querySelector('.nwi');
    var launch=root.querySelector('#nwiLaunch');
    var scanning=root.querySelector('#nwiScanning');
    var errorBox=root.querySelector('#nwiError');
    var report=root.querySelector('#nwiReport');
    var form=root.querySelector('#nwiScanForm');
    var urlInput=root.querySelector('#nwiUrl');
    var panel=root.querySelector('#nwiPanel');
    var tabs=root.querySelector('#nwiTabs');
    var state={data:null,controller:null,stageTimer:0,activeTab:'overview'};

    function show(view){launch.hidden=view!=='launch';scanning.hidden=view!=='scanning';errorBox.hidden=view!=='error';report.hidden=view!=='report';}

    function readHistory(){try{var rows=JSON.parse(localStorage.getItem('nexora_web_intelligence_history')||'[]');return Array.isArray(rows)?rows.slice(0,6):[];}catch(_){return [];}}
    function writeHistory(data){try{var rows=readHistory().filter(function(row){return row.host!==data.host;});rows.unshift({host:data.host,url:data.finalUrl,score:data.scores.overall,grade:data.scores.grade,scannedAt:data.scannedAt});localStorage.setItem('nexora_web_intelligence_history',JSON.stringify(rows.slice(0,6)));}catch(_){}}
    function renderHistory(){var rows=readHistory();var section=root.querySelector('#nwiRecent');var list=root.querySelector('#nwiRecentList');section.hidden=!rows.length;list.replaceChildren();rows.forEach(function(row){var button=node('button','nwi-recent-item');button.type='button';var orb=node('span','nwi-recent-score '+scoreTone(row.score),row.score);var copy=node('div');copy.append(node('strong','',row.host),node('small','',dateTime(row.scannedAt)));var arrow=icon('fa-solid fa-arrow-up-right');button.append(orb,copy,arrow);button.addEventListener('click',function(){urlInput.value=row.url;startScan();});list.appendChild(button);});}

    function scanMode(){var checked=form.querySelector('input[name="nwiMode"]:checked');return checked&&checked.value==='deep'?'deep':'standard';}
    function normalizedForDisplay(value){var text=String(value||'').trim();if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(text))text='https://'+text;try{return new URL(text);}catch(_){return null;}}

    function startProgress(mode){
      var stages=mode==='deep'?[['Validating public target','Memvalidasi URL, port, dan resolusi DNS publik.'],['Reading response surface','Membaca redirect, header, TLS, dan dokumen HTML.'],['Mapping intelligence','Memetakan SEO, DOM, link, tracker, serta technology stack.'],['Running mobile Lighthouse','Menunggu audit Lighthouse dari Google PageSpeed.'],['Building evidence matrix','Menghitung skor berbobot dan rekomendasi prioritas.']]:[['Validating public target','Memvalidasi URL, port, dan resolusi DNS publik.'],['Reading response surface','Membaca redirect, header, TLS, dan dokumen HTML.'],['Mapping intelligence','Memetakan SEO, DOM, link, tracker, serta technology stack.'],['Building evidence matrix','Menghitung skor berbobot dan rekomendasi prioritas.']];
      var index=0;var stage=root.querySelector('#nwiScanStage');var bar=root.querySelector('#nwiStageBar');var hint=root.querySelector('#nwiScanHint');
      function next(){var row=stages[Math.min(index,stages.length-1)];stage.textContent=row[1];hint.textContent=row[0]+' · tahap '+(Math.min(index+1,stages.length))+'/'+stages.length;bar.style.width=Math.min(92,12+(index/stages.length)*80)+'%';index+=1;}
      next();clearInterval(state.stageTimer);state.stageTimer=setInterval(next,mode==='deep'?4200:2300);
    }

    function stopProgress(){clearInterval(state.stageTimer);state.stageTimer=0;root.querySelector('#nwiStageBar').style.width='100%';}

    async function startScan(){
      var parsed=normalizedForDisplay(urlInput.value);
      if(!parsed){urlInput.focus();form.classList.add('is-invalid');setTimeout(function(){form.classList.remove('is-invalid');},800);return;}
      if(state.controller)state.controller.abort();
      var controller=new AbortController();state.controller=controller;body.__nxCleanup=function(){controller.abort();clearInterval(state.stageTimer);};
      var mode=scanMode();root.querySelector('#nwiScanHost').textContent=parsed.hostname;show('scanning');startProgress(mode);
      try{
        var response=await window.NexoraFetch('/api/web-intelligence',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({url:urlInput.value,mode:mode}),signal:controller.signal,nexoraTimeoutMs:mode==='deep'?150000:22000,nexoraRetries:0});
        var payload=await response.json().catch(function(){return {};});
        if(!response.ok||!payload.ok)throw new Error(payload.message||payload.error||('HTTP '+response.status));
        if(state.controller!==controller)return;
        state.data=payload;stopProgress();writeHistory(payload);renderReport(payload);show('report');
      }catch(error){
        if(error&&error.name==='AbortError'){if(state.controller===controller){stopProgress();show('launch');}return;}
        if(state.controller!==controller)return;
        stopProgress();errorBox.querySelector('p').textContent=error&&error.message?error.message:'Website belum dapat dianalisis.';show('error');
      }
    }

    function verdictCopy(data){
      if(data.scores.overall>=90)return 'Fondasi website sangat kuat. Fokus berikutnya adalah penyempurnaan kecil dan mempertahankan standar saat fitur bertambah.';
      if(data.scores.overall>=75)return 'Website berada di kondisi baik, tetapi beberapa celah masih menahan kualitas dan kepercayaan teknisnya.';
      if(data.scores.overall>=50)return 'Website dapat digunakan, namun temuan prioritas perlu diperbaiki agar lebih aman, cepat, mudah ditemukan, dan ramah pengguna.';
      return 'Website memiliki kelemahan teknis serius. Mulai dari rekomendasi critical/high sebelum menambah fitur baru.';
    }

    function badge(textValue,className,iconName){var span=node('span',className);if(iconName)span.append(icon(iconName));span.append(document.createTextNode(textValue));return span;}

    function renderReport(data){
      root.querySelector('#nwiReportHost').textContent=data.host;root.querySelector('#nwiReportUrl').textContent=data.finalUrl;
      root.querySelector('#nwiOverallScore').textContent=data.scores.overall;root.querySelector('#nwiGrade').textContent=data.scores.grade;
      root.querySelector('#nwiScoreRing').style.setProperty('--score',data.scores.overall);root.querySelector('#nwiScoreRing').className='nwi-score-ring '+scoreTone(data.scores.overall);
      root.querySelector('#nwiVerdictLabel').textContent=data.verdict.level.replace(/-/g,' ').toUpperCase();root.querySelector('#nwiPageTitle').textContent=data.page.title||data.host;
      root.querySelector('#nwiVerdictText').textContent=verdictCopy(data);
      var meta=root.querySelector('#nwiVerdictMeta');meta.replaceChildren(badge('HTTP '+data.response.status,'is-neutral','fa-solid fa-server'),badge(data.response.responseTimeMs+' ms',scoreTone(data.scores.performance),'fa-solid fa-stopwatch'),badge(data.mode==='deep'?'Deep Intelligence':'Standard Scan','is-mode','fa-solid fa-atom'),badge(data.cache&&data.cache.hit?'Cached':'Fresh','is-neutral','fa-solid fa-database'));
      var grid=root.querySelector('#nwiScoreGrid');grid.replaceChildren();CATEGORIES.forEach(function(id){var score=data.scores[id];var info=categoryMeta(id);var card=node('article','nwi-score-card '+scoreTone(score));var top=node('div');var marker=node('span');marker.style.setProperty('--cat',info.color);marker.append(icon(info.icon));top.append(marker,node('small','',info.label));card.append(top,node('strong','',score),node('div','nwi-mini-bar'));card.querySelector('.nwi-mini-bar').style.setProperty('--value',score+'%');card.addEventListener('click',function(){activateTab(id==='bestPractices'?'findings':id==='accessibility'?'findings':id);});grid.appendChild(card);});
      requestAnimationFrame(function(){drawRadar(root.querySelector('#nwiRadar'),data.scores);});state.activeTab='overview';syncTabs();renderPanel(false);
    }

    function drawRadar(canvas,scores){
      if(!canvas)return;var rect=canvas.getBoundingClientRect();var ratio=Math.min(window.devicePixelRatio||1,2);var width=Math.max(250,Math.round(rect.width||280));var height=Math.max(200,Math.round(rect.height||220));canvas.width=width*ratio;canvas.height=height*ratio;var ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);var cx=width/2,cy=height/2+3,radius=Math.min(width,height)*.34;var count=CATEGORIES.length;
      function point(index,factor){var angle=-Math.PI/2+(Math.PI*2*index/count);return [cx+Math.cos(angle)*radius*factor,cy+Math.sin(angle)*radius*factor];}
      ctx.clearRect(0,0,width,height);for(var level=1;level<=4;level++){ctx.beginPath();for(var i=0;i<count;i++){var p=point(i,level/4);if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);}ctx.closePath();ctx.strokeStyle='rgba(148,163,184,'+(level===4?'.18':'.08')+')';ctx.stroke();}
      for(var axis=0;axis<count;axis++){var ap=point(axis,1);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ap[0],ap[1]);ctx.strokeStyle='rgba(148,163,184,.08)';ctx.stroke();}
      ctx.beginPath();CATEGORIES.forEach(function(id,index){var p=point(index,(scores[id]||0)/100);if(index===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.closePath();var gradient=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);gradient.addColorStop(0,'rgba(34,211,238,.26)');gradient.addColorStop(1,'rgba(139,92,246,.09)');ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#38bdf8';ctx.lineWidth=2;ctx.stroke();
      CATEGORIES.forEach(function(id,index){var p=point(index,(scores[id]||0)/100);ctx.beginPath();ctx.arc(p[0],p[1],3.5,0,Math.PI*2);ctx.fillStyle=categoryMeta(id).color;ctx.fill();var lp=point(index,1.22);ctx.fillStyle='#8fa9b8';ctx.font='700 9px Inter, sans-serif';ctx.textAlign=lp[0]<cx-5?'right':lp[0]>cx+5?'left':'center';ctx.textBaseline='middle';ctx.fillText(categoryMeta(id).label.replace('Best Practices','Best'),lp[0],lp[1]);});
    }

    function sectionTitle(kicker,title,subtitle){var wrap=node('div','nwi-content-title');var copy=node('div');copy.append(node('span','',kicker),node('h3','',title));wrap.append(copy,node('p','',subtitle));return wrap;}
    function stat(iconName,label,value,tone){var card=node('article','nwi-stat '+(tone||''));card.append(icon(iconName));var copy=node('div');copy.append(node('small','',label),node('strong','',value));card.appendChild(copy);return card;}
    function checkCard(row){var card=node('article','nwi-check '+row.status);var stateIcon=node('span');stateIcon.append(icon(statusIcon(row.status)));var copy=node('div');var top=node('div');top.append(node('strong','',row.title),badge(categoryMeta(row.category).label,'nwi-category'));copy.append(top,node('p','',row.evidence));if(row.status!=='pass')copy.append(node('small','',row.fix));card.append(stateIcon,copy);return card;}

    function renderOverview(data){
      panel.append(sectionTitle('EXECUTIVE SUMMARY','Intelligence at a glance','Sinyal terpenting dari seluruh permukaan website.'));
      var stats=node('div','nwi-stat-grid');stats.append(stat('fa-solid fa-circle-check','PASSED',data.verdict.passed,'pass'),stat('fa-solid fa-triangle-exclamation','WARNINGS',data.verdict.warnings,'warn'),stat('fa-solid fa-circle-xmark','FAILED',data.verdict.failed,'fail'),stat('fa-solid fa-stopwatch','RESPONSE',data.response.responseTimeMs+' ms','neutral'));panel.appendChild(stats);
      var columns=node('div','nwi-overview-grid');
      var priority=node('section','nwi-content-card');priority.append(sectionTitle('PRIORITY QUEUE','What to fix first','Urutan berdasarkan dampak dan tingkat risiko.'));var list=node('div','nwi-priority-list');(data.recommendations||[]).slice(0,6).forEach(function(item,index){var row=node('article','nwi-priority '+item.priority);row.append(node('span','',String(index+1).padStart(2,'0')));var copy=node('div');copy.append(node('strong','',item.title),node('p','',item.action));row.append(copy,badge(item.priority.toUpperCase(),'nwi-priority-badge'));list.appendChild(row);});if(!list.childElementCount)list.append(node('div','nwi-empty','Tidak ada rekomendasi prioritas.'));priority.appendChild(list);
      var pageCard=node('section','nwi-content-card nwi-page-card');pageCard.append(sectionTitle('PAGE SIGNAL','Search appearance','Metadata utama yang dibaca mesin pencari dan platform sosial.'));var preview=node('article','nwi-serp');preview.append(node('small','',data.finalUrl),node('h4','',data.page.title||'Title tidak ditemukan'),node('p','',data.page.description||'Meta description tidak ditemukan.'));pageCard.appendChild(preview);var pageFacts=node('div','nwi-fact-list');[['Canonical',data.page.canonical||'Tidak ada'],['Language',data.page.lang||'Tidak ada'],['Robots',data.page.robots||'index default'],['JSON-LD',data.page.jsonLd+' blok']].forEach(function(row){var item=node('div');item.append(node('span','',row[0]),node('strong','',row[1]));pageFacts.appendChild(item);});pageCard.appendChild(pageFacts);
      columns.append(priority,pageCard);panel.appendChild(columns);
      if(data.lighthouse){panel.appendChild(renderLighthouse(data.lighthouse,true));}
    }

    function renderFindings(data,category){
      var rows=(data.checks||[]).filter(function(row){return !category||row.category===category;}).sort(function(a,b){var p={fail:0,warn:1,pass:2};return p[a.status]-p[b.status]||b.weight-a.weight;});
      var label=category?categoryMeta(category).label:'All Findings';panel.append(sectionTitle('EVIDENCE MATRIX',label,rows.length+' pemeriksaan dengan evidence dan tindakan perbaikan.'));
      var filters=node('div','nwi-finding-summary');['fail','warn','pass'].forEach(function(status){var count=rows.filter(function(row){return row.status===status;}).length;filters.append(badge(count+' '+(status==='fail'?'failed':status==='warn'?'warning':'passed'),'nwi-summary-pill '+status,statusIcon(status)));});panel.appendChild(filters);
      var list=node('div','nwi-check-list');rows.forEach(function(row){list.appendChild(checkCard(row));});panel.appendChild(list);
    }

    function renderSeo(data){
      renderFindings(data,'seo');
      var cards=node('div','nwi-detail-grid');var meta=node('section','nwi-content-card');meta.append(sectionTitle('METADATA INVENTORY','Crawler surface','Nilai aktual yang ditemukan di HTML.'));var list=node('div','nwi-fact-list');[['Title',data.page.title||'—'],['Description',data.page.description||'—'],['Canonical',data.page.canonical||'—'],['Robots',data.page.robots||'default'],['Open Graph Title',data.page.ogTitle||'—'],['Open Graph Image',data.page.ogImage||'—'],['Twitter Card',data.page.twitterCard||'—']].forEach(function(row){var item=node('div');item.append(node('span','',row[0]),node('strong','',row[1]));list.appendChild(item);});meta.appendChild(list);
      var structure=node('section','nwi-content-card');structure.append(sectionTitle('CONTENT STRUCTURE','Document outline','Heading, media, dan struktur data.'));var metrics=node('div','nwi-metric-mosaic');Object.entries(data.metrics.headingCounts||{}).forEach(function(row){metrics.append(stat('fa-solid fa-heading',row[0].toUpperCase(),row[1]));});metrics.append(stat('fa-solid fa-images','IMAGES',data.metrics.images),stat('fa-solid fa-diagram-project','JSON-LD',data.page.jsonLd));structure.appendChild(metrics);cards.append(meta,structure);panel.appendChild(cards);
    }

    function renderSecurity(data){
      renderFindings(data,'security');
      var grid=node('div','nwi-detail-grid');var matrix=node('section','nwi-content-card');matrix.append(sectionTitle('HEADER MATRIX','Security controls','Header defensif pada respons URL final.'));var headers=node('div','nwi-header-list');(data.security.headers||[]).forEach(function(row){var item=node('article',row.present?'is-present':'is-missing');item.append(icon(row.present?'fa-solid fa-shield-halved':'fa-solid fa-circle-xmark'));var copy=node('div');copy.append(node('strong','',row.name),node('small','',row.value||'Not detected'));item.appendChild(copy);headers.appendChild(item);});matrix.appendChild(headers);
      var transport=node('section','nwi-content-card');transport.append(sectionTitle('TRUST SURFACE','TLS & reputation','Kondisi koneksi terenkripsi dan hasil daftar ancaman.'));var tls=data.security.tls||{};var rep=data.security.reputation;var facts=node('div','nwi-fact-list');[['TLS Protocol',tls.protocol||'Tidak tersedia'],['Certificate Subject',tls.subject||'Tidak tersedia'],['Certificate Issuer',tls.issuer||'Tidak tersedia'],['Certificate Expiry',tls.validTo||'Tidak tersedia'],['Days Remaining',finite(tls.daysRemaining)?tls.daysRemaining:'—'],['Safe Browsing',!rep?'Standard scan':rep.status==='no-match'?'No list match':rep.status==='flagged'?'FLAGGED: '+rep.matches.join(', '):rep.status.replace(/-/g,' ')]].forEach(function(row){var item=node('div');item.append(node('span','',row[0]),node('strong','',row[1]));facts.appendChild(item);});transport.appendChild(facts);grid.append(matrix,transport);panel.appendChild(grid);
    }

    function lighthouseMetric(label,row){return stat('fa-solid fa-wave-square',label,row&&row.display||'—',row&&finite(row.value)?scoreTone(row.value<2500?90:row.value<4000?65:35):'neutral');}
    function renderLighthouse(lighthouse,compact){
      var section=node('section','nwi-content-card nwi-lighthouse');section.append(sectionTitle('GOOGLE LIGHTHOUSE','Mobile lab intelligence',lighthouse.available?'Audit Lighthouse '+(lighthouse.version||''):'Lighthouse tidak tersedia pada scan ini.'));
      if(!lighthouse.available){section.append(node('div','nwi-empty',lighthouse.keyConfigured?'Provider PageSpeed sedang tidak tersedia.':'Deep scan dapat berjalan tanpa key, tetapi key disarankan agar kuota lebih stabil.'));return section;}
      var scoreGrid=node('div','nwi-lh-score-grid');Object.entries(lighthouse.scores||{}).forEach(function(row){scoreGrid.append(stat('fa-solid fa-gauge',categoryMeta(row[0]).label||row[0],finite(row[1])?row[1]:'—',finite(row[1])?scoreTone(row[1]):'neutral'));});section.appendChild(scoreGrid);
      if(!compact){var metrics=node('div','nwi-metric-mosaic');metrics.append(lighthouseMetric('FCP',lighthouse.metrics.fcp),lighthouseMetric('LCP',lighthouse.metrics.lcp),lighthouseMetric('SPEED INDEX',lighthouse.metrics.speedIndex),lighthouseMetric('TBT',lighthouse.metrics.tbt),lighthouseMetric('CLS',lighthouse.metrics.cls));section.appendChild(metrics);var opportunities=node('div','nwi-opportunities');(lighthouse.opportunities||[]).forEach(function(row){var item=node('article');item.append(node('span',scoreTone(row.score),row.score));var copy=node('div');copy.append(node('strong','',row.title),node('small','',row.display||'Perlu optimasi'));item.appendChild(copy);opportunities.appendChild(item);});if(opportunities.childElementCount)section.appendChild(opportunities);}
      return section;
    }

    function renderPerformance(data){renderFindings(data,'performance');var metrics=node('div','nwi-metric-mosaic nwi-performance-metrics');[['fa-solid fa-file-code','HTML SIZE',bytes(data.metrics.htmlBytes)],['fa-solid fa-sitemap','DOM NODES',number(data.metrics.domNodes)],['fa-brands fa-js','SCRIPTS',number(data.metrics.scripts)],['fa-solid fa-palette','STYLESHEETS',number(data.metrics.stylesheets)],['fa-solid fa-ban','BLOCKING',number(data.metrics.renderBlockingScripts)],['fa-solid fa-image','LAZY IMAGES',data.metrics.lazyImages+'/'+data.metrics.images]].forEach(function(row){metrics.append(stat(row[0],row[1],row[2]));});panel.appendChild(metrics);if(data.lighthouse)panel.appendChild(renderLighthouse(data.lighthouse,false));else{var callout=node('section','nwi-deep-callout');callout.append(icon('fa-solid fa-atom'));var copy=node('div');copy.append(node('strong','','Unlock Lighthouse Intelligence'),node('p','','Pilih Deep Intelligence pada scan baru untuk FCP, LCP, Speed Index, TBT, CLS, serta peluang optimasi lab mobile.'));callout.appendChild(copy);var button=node('button','','NEW DEEP SCAN');button.type='button';button.addEventListener('click',function(){newScan(true);});callout.appendChild(button);panel.appendChild(callout);}}

    function renderStack(data){
      panel.append(sectionTitle('TECHNOLOGY GRAPH','Detected stack & dependencies','Deteksi berbasis signature respons—bukan tebakan acak.'));
      var tech=node('div','nwi-tech-grid');(data.technologies||[]).forEach(function(row){var card=node('article');var mark=node('span');mark.append(icon(row.category==='Hosting'?'fa-solid fa-cloud':row.category==='CDN'?'fa-solid fa-network-wired':row.category==='CMS'?'fa-solid fa-newspaper':'fa-solid fa-code'));var copy=node('div');copy.append(node('strong','',row.name),node('small','',row.category+' · '+row.evidence));card.append(mark,copy);tech.appendChild(card);});if(!tech.childElementCount)tech.append(node('div','nwi-empty','Technology signature belum terdeteksi dari HTML dan header.'));panel.appendChild(tech);
      var grid=node('div','nwi-detail-grid');var links=node('section','nwi-content-card');links.append(sectionTitle('LINK TOPOLOGY','Navigation surface','Peta tautan yang ditemukan pada halaman.'));var linkMetrics=node('div','nwi-metric-mosaic');[['TOTAL',data.links.total],['INTERNAL',data.links.internal],['EXTERNAL',data.links.external],['MAIL',data.links.mailto],['PHONE',data.links.telephone],['FRAGMENT',data.links.fragments]].forEach(function(row){linkMetrics.append(stat('fa-solid fa-link',row[0],row[1]));});links.appendChild(linkMetrics);var domains=node('div','nwi-domain-list');(data.links.topExternalDomains||[]).forEach(function(row){var item=node('div');item.append(node('span','',row.domain),node('strong','',row.count+' link'));domains.appendChild(item);});links.appendChild(domains);
      var privacy=node('section','nwi-content-card');privacy.append(sectionTitle('PRIVACY SIGNALS','Tracker surface','Signature tracking yang terlihat di source halaman.'));var trackers=node('div','nwi-tracker-list');(data.trackers||[]).forEach(function(row){trackers.append(badge(row.name,'nwi-tracker','fa-solid fa-location-crosshairs'));});if(!trackers.childElementCount)trackers.append(node('div','nwi-empty','Tidak ada signature tracker umum yang terdeteksi.'));privacy.appendChild(trackers);var dns=node('div','nwi-fact-list');(data.security.dns||[]).forEach(function(row,index){var item=node('div');item.append(node('span','','DNS '+(index+1)+' · IPv'+row.family),node('strong','',row.address));dns.appendChild(item);});privacy.appendChild(dns);grid.append(links,privacy);panel.appendChild(grid);
    }

    function renderPanel(shouldScroll){if(!state.data)return;panel.replaceChildren();var data=state.data;if(state.activeTab==='overview')renderOverview(data);else if(state.activeTab==='findings')renderFindings(data);else if(state.activeTab==='seo')renderSeo(data);else if(state.activeTab==='security')renderSecurity(data);else if(state.activeTab==='performance')renderPerformance(data);else renderStack(data);if(shouldScroll!==false){var scroller=document.getElementById('nxUniversalRoomScroll');if(scroller)scroller.scrollTo({top:Math.max(0,tabs.offsetTop-62),behavior:'smooth'});}}
    function syncTabs(){tabs.querySelectorAll('button').forEach(function(button){button.classList.toggle('is-active',button.dataset.tab===state.activeTab);});}
    function activateTab(tab){state.activeTab=tab;syncTabs();renderPanel(true);}

    function newScan(deep){if(state.controller)state.controller.abort();state.controller=null;state.data=null;show('launch');if(deep){var input=form.querySelector('input[value="deep"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}setTimeout(function(){urlInput.focus();},80);}
    function fileName(extension){var host=state.data&&state.data.host?state.data.host.replace(/[^a-z0-9.-]+/gi,'-'):'website';return 'nexora-web-intelligence-'+host+'-'+new Date().toISOString().slice(0,10)+'.'+extension;}
    function download(content,type,name){var blob=new Blob([content],{type:type});var url=URL.createObjectURL(blob);var link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
    function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
    function htmlReport(data){var scores=CATEGORIES.map(function(id){return '<div class="score"><span>'+escapeHtml(categoryMeta(id).label)+'</span><b>'+data.scores[id]+'</b></div>';}).join('');var recs=(data.recommendations||[]).map(function(row,index){return '<article><em>'+String(index+1).padStart(2,'0')+'</em><div><small>'+escapeHtml(row.priority.toUpperCase()+' · '+categoryMeta(row.category).label)+'</small><h3>'+escapeHtml(row.title)+'</h3><p>'+escapeHtml(row.evidence)+'</p><strong>'+escapeHtml(row.action)+'</strong></div></article>';}).join('');return '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nexora Web Intelligence — '+escapeHtml(data.host)+'</title><style>body{margin:0;background:#071018;color:#e8f8ff;font:14px Inter,Arial,sans-serif}main{max-width:960px;margin:auto;padding:32px 18px}header{padding:28px;border:1px solid #164052;border-radius:24px;background:linear-gradient(145deg,#0b1c29,#090d18)}.brand{color:#67e8f9;font-weight:900;letter-spacing:.14em}.hero{display:flex;align-items:center;gap:24px;margin-top:20px}.overall{display:grid;place-items:center;width:120px;height:120px;border-radius:50%;border:8px solid #22d3ee;font-size:34px;font-weight:900}.hero h1{margin:0 0 8px;font-size:28px}.hero p{color:#8ca8b5;line-height:1.6}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:18px 0}.score{padding:15px;border:1px solid #173544;border-radius:16px;background:#0a1721}.score span{display:block;color:#7895a3;font-size:10px}.score b{display:block;margin-top:8px;font-size:24px}article{display:flex;gap:14px;margin:10px 0;padding:16px;border:1px solid #173544;border-radius:16px;background:#0a151f}article em{color:#22d3ee;font-style:normal;font-weight:900}article small{color:#67e8f9}article h3{margin:4px 0}article p{color:#879da8}article strong{color:#d6f8e9}footer{margin-top:24px;color:#627b87}@media(max-width:700px){.scores{grid-template-columns:repeat(2,1fr)}.hero{align-items:flex-start;flex-direction:column}}</style><main><header><div class="brand">NEXORA WEB INTELLIGENCE</div><div class="hero"><div class="overall">'+data.scores.overall+'</div><div><h1>'+escapeHtml(data.page.title||data.host)+'</h1><p>'+escapeHtml(data.finalUrl)+'<br>Grade '+escapeHtml(data.scores.grade)+' · '+escapeHtml(dateTime(data.scannedAt))+'</p></div></div></header><section class="scores">'+scores+'</section><h2>Priority Intelligence</h2>'+recs+'<footer>Point-in-time technical audit. Bukan jaminan keamanan absolut.</footer></main></html>';}

    form.addEventListener('submit',function(event){event.preventDefault();startScan();});
    form.querySelectorAll('input[name="nwiMode"]').forEach(function(input){input.addEventListener('change',function(){form.querySelectorAll('.nwi-mode').forEach(function(label){label.classList.toggle('is-active',label.contains(form.querySelector('input[name="nwiMode"]:checked')));});});});
    root.querySelector('#nwiCancel').addEventListener('click',function(){if(state.controller)state.controller.abort();});
    errorBox.querySelector('button').addEventListener('click',function(){show('launch');urlInput.focus();});
    root.querySelector('#nwiNewScan').addEventListener('click',function(){newScan(false);});
    tabs.addEventListener('click',function(event){var button=event.target.closest('button[data-tab]');if(button)activateTab(button.dataset.tab);});
    root.querySelector('#nwiCopy').addEventListener('click',async function(){if(!state.data)return;var data=state.data;var text='Nexora Web Intelligence — '+data.host+'\nScore: '+data.scores.overall+'/100 ('+data.scores.grade+')\nSEO '+data.scores.seo+' · Security '+data.scores.security+' · Performance '+data.scores.performance+' · Accessibility '+data.scores.accessibility+'\nTop fix: '+(data.recommendations[0]?data.recommendations[0].action:'Tidak ada prioritas');try{await navigator.clipboard.writeText(text);this.classList.add('is-done');setTimeout(function(){root.querySelector('#nwiCopy').classList.remove('is-done');},1200);}catch(_){}});
    root.querySelector('#nwiExportJson').addEventListener('click',function(){if(state.data)download(JSON.stringify(state.data,null,2),'application/json',fileName('json'));});
    root.querySelector('#nwiExportHtml').addEventListener('click',function(){if(state.data)download(htmlReport(state.data),'text/html',fileName('html'));});
    renderHistory();
  };
})();

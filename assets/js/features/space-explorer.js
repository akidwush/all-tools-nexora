/* Nexora Space Explorer v6.3.13 HF6 */
(function(){
  'use strict';

  function create(tag,className,text){
    var node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }
  function finite(value){return typeof value==='number'&&Number.isFinite(value);}
  function today(offset){var date=new Date();date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()+(offset||0));return date.toISOString().slice(0,10);}
  function formatDate(value,withTime){
    if(!value)return '—';
    var date=new Date(value.length===10?value+'T00:00:00Z':value);
    if(!Number.isFinite(date.getTime()))return String(value);
    try{return new Intl.DateTimeFormat('id-ID',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'long',timeZone:'UTC'}).format(date);}
    catch(_error){return date.toLocaleString();}
  }
  function compact(value,digits){
    if(!finite(value))return '—';
    return new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:digits===undefined?1:digits}).format(value);
  }
  function distance(value){
    if(!finite(value))return '—';
    if(value>=1000000)return (value/1000000).toFixed(2)+' juta km';
    return new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(value)+' km';
  }
  function escapeFile(value){return String(value||'space').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'space';}

  window.renderSpaceExplorer=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <main class="nse" aria-label="Nexora Space Explorer">\
        <section class="nse-hero">\
          <div class="nse-stars nse-stars-a"></div><div class="nse-stars nse-stars-b"></div>\
          <div class="nse-hero-copy">\
            <div class="nse-kicker"><span></span> NASA DEEP SPACE LINK <b id="nseUtc">UTC --:--</b></div>\
            <h2><span>SPACE</span> EXPLORER</h2>\
            <p>Jelajahi citra astronomi, arsip misi Mars, lintasan objek dekat Bumi, dan aktivitas Matahari melalui data resmi NASA.</p>\
            <div class="nse-signal-row"><span><i class="fa-solid fa-satellite"></i> OPEN API</span><span><i class="fa-solid fa-shield-halved"></i> KEY SERVER-SIDE</span><span id="nseLinkState"><i class="fa-solid fa-circle-notch fa-spin"></i> CONNECTING</span></div>\
          </div>\
          <div class="nse-orbit-scene" aria-hidden="true"><div class="nse-planet"><i></i></div><div class="nse-orbit nse-o1"><b></b></div><div class="nse-orbit nse-o2"><b></b></div><div class="nse-scanline"></div></div>\
        </section>\
        <nav class="nse-tabs" aria-label="Modul Space Explorer">\
          <button type="button" class="is-active" data-space-tab="apod"><i class="fa-solid fa-wand-sparkles"></i><span>APOD</span><small>Hari ini</small></button>\
          <button type="button" data-space-tab="mars"><i class="fa-solid fa-robot"></i><span>Mars</span><small>Galeri misi</small></button>\
          <button type="button" data-space-tab="asteroids"><i class="fa-solid fa-meteor"></i><span>Asteroid</span><small>Near Earth</small></button>\
          <button type="button" data-space-tab="weather"><i class="fa-solid fa-sun"></i><span>Cuaca</span><small>Space weather</small></button>\
        </nav>\
        <section id="nseStage" class="nse-stage" aria-live="polite"></section>\
        <footer class="nse-footer"><i class="fa-solid fa-circle-info"></i><p>Data ilmiah berasal dari NASA. Jarak, diameter, dan klasifikasi ditampilkan untuk edukasi dan dapat diperbarui oleh penyedia.</p><button id="nseRefresh" type="button"><i class="fa-solid fa-rotate"></i> Refresh data</button></footer>\
        <div id="nseModal" class="nse-modal" hidden><button class="nse-modal-close" type="button" aria-label="Tutup detail"><i class="fa-solid fa-xmark"></i></button><div class="nse-modal-card"><div id="nseModalMedia"></div><div id="nseModalCopy"></div></div></div>\
      </main>';

    var root=body.querySelector('.nse');
    var stage=root.querySelector('#nseStage');
    var linkState=root.querySelector('#nseLinkState');
    var utc=root.querySelector('#nseUtc');
    var refresh=root.querySelector('#nseRefresh');
    var modal=root.querySelector('#nseModal');
    var modalMedia=root.querySelector('#nseModalMedia');
    var modalCopy=root.querySelector('#nseModalCopy');
    var state={active:'apod',controller:null,clientCache:new Map(),radar:[],weather:[],weatherFilter:'all',destroyed:false};
    var favoriteKey='nexora-space-favorites-v1';
    var favorites=new Set();
    try{favorites=new Set(JSON.parse(localStorage.getItem(favoriteKey)||'[]'));}catch(_error){}

    function saveFavorites(){try{localStorage.setItem(favoriteKey,JSON.stringify(Array.from(favorites).slice(-100)));}catch(_error){}}
    function requestJson(url,controller){
      if(typeof window.NexoraFetchJson==='function')return window.NexoraFetchJson(url,{signal:controller.signal,nexoraTimeoutMs:18000,nexoraRetries:1});
      return fetch(url,{signal:controller.signal}).then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.message||data.error||'HTTP '+response.status);return data;});});
    }
    function apiUrl(section,params,force){
      var url=new URL('/api/space-explorer',location.origin);url.searchParams.set('section',section);
      Object.keys(params||{}).forEach(function(key){if(params[key]!==undefined&&params[key]!==null&&params[key]!=='')url.searchParams.set(key,String(params[key]));});
      if(force)url.searchParams.set('refresh','1');
      return url.pathname+url.search;
    }
    function tabParams(tab){
      if(tab==='apod')return {date:root.querySelector('#nseApodDate')?.value||today()};
      if(tab==='mars')return {mission:root.querySelector('[data-mission].is-active')?.dataset.mission||'perseverance',page:Number(root.querySelector('#nseMarsPage')?.dataset.page||1)};
      if(tab==='asteroids')return {date:root.querySelector('#nseAsteroidDate')?.value||today()};
      return {days:Number(root.querySelector('#nseWeatherDays')?.value||7)};
    }
    function skeleton(label){
      stage.innerHTML='<div class="nse-loading"><div class="nse-loader-orbit"><i></i><b></b></div><strong>'+label+'</strong><span>Menyelaraskan telemetri dengan pusat data NASA…</span><div class="nse-skeleton-lines"><i></i><i></i><i></i></div></div>';
    }
    function renderError(message){
      stage.innerHTML='';
      var box=create('div','nse-error');box.innerHTML='<div><i class="fa-solid fa-satellite-dish"></i></div>';
      box.append(create('strong','', 'Sinyal data terputus'),create('p','',message||'Data NASA belum dapat diambil. Periksa koneksi lalu coba kembali.'));
      var button=create('button','', 'Hubungkan kembali');button.type='button';button.addEventListener('click',function(){load(state.active,tabParams(state.active),true);});box.appendChild(button);stage.appendChild(box);
      linkState.className='is-error';linkState.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> LINK ERROR';
    }
    function providerBar(data){
      var bar=create('div','nse-provider');
      var left=create('div');left.innerHTML='<i class="fa-solid fa-tower-broadcast"></i>';
      var copy=create('span');copy.append(create('strong','',data.provider?.name||'NASA'),create('small','',data.warning||(data.cache?.stale?'Cache darurat aktif':data.cache?.hit?'Cache hemat kuota':'Data baru diterima')));left.appendChild(copy);
      var badge=create('b',data.provider?.keyMode==='personal'?'is-personal':'',data.provider?.keyMode==='personal'?'PERSONAL KEY':data.provider?.keyMode==='not-required'?'NO KEY REQUIRED':'DEMO KEY');
      bar.append(left,badge);return bar;
    }
    async function load(tab,params,force){
      if(state.controller)state.controller.abort();
      var key=apiUrl(tab,params,false);
      if(!force&&state.clientCache.has(key)){render(tab,state.clientCache.get(key));return;}
      state.controller=new AbortController();skeleton(tab==='apod'?'Membuka observatorium harian':tab==='mars'?'Menghubungkan arsip misi Mars':tab==='asteroids'?'Menghitung lintasan objek dekat Bumi':'Membaca aktivitas Matahari');
      try{
        var data=await requestJson(apiUrl(tab,params,force),state.controller);
        if(state.destroyed)return;
        state.clientCache.set(key,data);render(tab,data);
        linkState.className='is-online';linkState.innerHTML='<i class="fa-solid fa-circle"></i> LINK ONLINE';
      }catch(error){if(error&&error.name==='AbortError')return;renderError(error&&error.message);}
    }
    function sectionHead(kicker,title,description){
      var head=create('header','nse-section-head');var copy=create('div');copy.append(create('span','',kicker),create('h3','',title),create('p','',description));head.appendChild(copy);return head;
    }
    function actionButton(icon,label){var button=create('button','nse-action');button.type='button';button.innerHTML='<i class="'+icon+'"></i><span></span>';button.querySelector('span').textContent=label;return button;}
    function openModal(item){
      modalMedia.innerHTML='';modalCopy.innerHTML='';
      if(item.image){var img=create('img');img.src=item.image;img.alt=item.title||'NASA image';img.loading='eager';modalMedia.appendChild(img);}
      modalCopy.append(create('span','nse-modal-kicker',item.center||'NASA MISSION ARCHIVE'),create('h3','',item.title||'NASA image'),create('p','',item.description||'Deskripsi belum tersedia.'));
      var meta=create('div','nse-modal-meta');if(item.dateCreated)meta.append(create('span','',formatDate(item.dateCreated)));if(item.photographer)meta.append(create('span','',item.photographer));modalCopy.appendChild(meta);
      if(item.detailsUrl){var link=create('a','nse-source-link','Buka detail resmi NASA');link.href=item.detailsUrl;link.target='_blank';link.rel='noopener noreferrer';modalCopy.appendChild(link);}
      modal.hidden=false;requestAnimationFrame(function(){modal.classList.add('is-open');});document.body.style.overflow='hidden';
    }
    function closeModal(){modal.classList.remove('is-open');setTimeout(function(){modal.hidden=true;modalMedia.innerHTML='';modalCopy.innerHTML='';},180);document.body.style.overflow='hidden';}
    function renderApod(data){
      stage.innerHTML='';stage.appendChild(providerBar(data));
      var head=sectionHead('ASTRONOMY PICTURE OF THE DAY','Jendela semesta hari ini','Satu observasi pilihan NASA, lengkap dengan cerita ilmiah di baliknya.');
      var controls=create('div','nse-date-control');var date=create('input');date.type='date';date.id='nseApodDate';date.min='1995-06-16';date.max=today();date.value=data.item.date||today();date.setAttribute('aria-label','Tanggal APOD');var go=actionButton('fa-solid fa-arrow-right','Buka');go.addEventListener('click',function(){load('apod',{date:date.value});});date.addEventListener('change',function(){load('apod',{date:date.value});});controls.append(date,go);head.appendChild(controls);stage.appendChild(head);
      var card=create('article','nse-apod');var media=create('div','nse-apod-media');
      if(data.item.image){var img=create('img');img.src=data.item.image;img.alt=data.item.title;img.loading='eager';img.decoding='async';media.appendChild(img);var veil=create('div','nse-media-veil');veil.append(create('span','',data.item.mediaType==='video'?'VIDEO FEATURE':'NASA IMAGE'));media.appendChild(veil);media.addEventListener('click',function(){openModal({image:data.item.hdImage||data.item.image,title:data.item.title,description:data.item.explanation,dateCreated:data.item.date,center:'ASTRONOMY PICTURE OF THE DAY',detailsUrl:data.item.videoUrl});});}
      else media.appendChild(create('div','nse-no-image','Media visual tidak tersedia untuk tanggal ini.'));
      var copy=create('div','nse-apod-copy');var meta=create('div','nse-chip-row');meta.append(create('span','',formatDate(data.item.date)),create('span','',data.item.mediaType.toUpperCase()));if(data.item.copyright)meta.append(create('span','',data.item.copyright));copy.append(meta,create('h3','',data.item.title),create('p','',data.item.explanation||'Penjelasan belum tersedia.'));
      var actions=create('div','nse-actions');var share=actionButton('fa-solid fa-share-nodes','Bagikan');share.addEventListener('click',async function(){var payload={title:data.item.title,text:data.item.title,url:location.href};try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(data.item.title+' — '+location.href);share.querySelector('span').textContent='Tersalin';}}catch(_error){}});actions.appendChild(share);
      if(data.item.hdImage){var hd=create('a','nse-action');hd.href=data.item.hdImage;hd.target='_blank';hd.rel='noopener noreferrer';hd.innerHTML='<i class="fa-solid fa-expand"></i><span>Resolusi HD</span>';actions.appendChild(hd);}if(data.item.videoUrl){var watch=create('a','nse-action');watch.href=data.item.videoUrl;watch.target='_blank';watch.rel='noopener noreferrer';watch.innerHTML='<i class="fa-solid fa-play"></i><span>Tonton sumber</span>';actions.appendChild(watch);}copy.appendChild(actions);card.append(media,copy);stage.appendChild(card);
    }
    function missionSwitcher(active){
      var wrap=create('div','nse-missions');[['perseverance','Perseverance'],['curiosity','Curiosity'],['ingenuity','Ingenuity'],['orbiter','Mars Orbiter']].forEach(function(row){var button=create('button',row[0]===active?'is-active':'',row[1]);button.type='button';button.dataset.mission=row[0];button.addEventListener('click',function(){wrap.querySelectorAll('button').forEach(function(item){item.classList.remove('is-active');});button.classList.add('is-active');load('mars',{mission:row[0],page:1});});wrap.appendChild(button);});return wrap;
    }
    function marsCard(item){
      var card=create('article','nse-mars-card');var media=create('button','nse-mars-media');media.type='button';var img=create('img');img.src=item.image;img.alt=item.title;img.loading='lazy';img.decoding='async';media.appendChild(img);var saved=favorites.has(item.nasaId);var favorite=create('button','nse-favorite'+(saved?' is-saved':''));favorite.type='button';favorite.setAttribute('aria-label',saved?'Hapus dari favorit':'Simpan ke favorit');favorite.innerHTML='<i class="fa-'+(saved?'solid':'regular')+' fa-bookmark"></i>';favorite.addEventListener('click',function(event){event.stopPropagation();if(favorites.has(item.nasaId))favorites.delete(item.nasaId);else favorites.add(item.nasaId);saveFavorites();favorite.classList.toggle('is-saved',favorites.has(item.nasaId));favorite.innerHTML='<i class="fa-'+(favorites.has(item.nasaId)?'solid':'regular')+' fa-bookmark"></i>';});media.appendChild(favorite);media.addEventListener('click',function(){openModal(item);});
      var copy=create('div','nse-mars-copy');copy.append(create('small','',item.center||'NASA'),create('h4','',item.title),create('span','',formatDate(item.dateCreated)));card.append(media,copy);return card;
    }
    function renderMars(data){
      stage.innerHTML='';stage.appendChild(providerBar(data));var head=sectionHead('MARS MISSION ARCHIVE','Permukaan planet merah','Galeri resmi misi NASA menggantikan Mars Rover Photos API yang sudah diarsipkan.');head.appendChild(missionSwitcher(data.mission));stage.appendChild(head);
      var info=create('div','nse-source-note');info.innerHTML='<i class="fa-solid fa-circle-check"></i>';info.appendChild(create('span','',data.sourceNote));stage.appendChild(info);
      var grid=create('div','nse-mars-grid');if(data.items.length)data.items.forEach(function(item){grid.appendChild(marsCard(item));});else grid.appendChild(create('div','nse-empty','Tidak ada citra pada halaman ini. Coba misi atau halaman lain.'));stage.appendChild(grid);
      var pager=create('div','nse-pager');var prev=actionButton('fa-solid fa-chevron-left','Sebelumnya');prev.disabled=data.page<=1;var marker=create('strong','', 'HALAMAN '+data.page+' · '+compact(data.total,1)+' ARSIP');marker.id='nseMarsPage';marker.dataset.page=String(data.page);var next=actionButton('fa-solid fa-chevron-right','Berikutnya');prev.addEventListener('click',function(){load('mars',{mission:data.mission,page:data.page-1});});next.addEventListener('click',function(){load('mars',{mission:data.mission,page:data.page+1});});pager.append(prev,marker,next);stage.appendChild(pager);
    }
    function metric(icon,label,value,tone){var card=create('article','nse-metric '+(tone||''));card.innerHTML='<i class="'+icon+'"></i>';var copy=create('div');copy.append(create('small','',label),create('strong','',value));card.appendChild(copy);return card;}
    function drawRadar(){
      var canvas=stage.querySelector('#nseRadar');if(!canvas||!state.radar.length)return;var rect=canvas.getBoundingClientRect();var ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio));var ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);var w=rect.width,h=rect.height,cx=w/2,cy=h/2,size=Math.min(w,h)*.43;ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(103,232,249,.14)';ctx.lineWidth=1;[.25,.5,.75,1].forEach(function(scale){ctx.beginPath();ctx.arc(cx,cy,size*scale,0,Math.PI*2);ctx.stroke();});ctx.strokeStyle='rgba(103,232,249,.08)';ctx.beginPath();ctx.moveTo(cx-size,cy);ctx.lineTo(cx+size,cy);ctx.moveTo(cx,cy-size);ctx.lineTo(cx,cy+size);ctx.stroke();var max=Math.max.apply(null,state.radar.map(function(item){return item.missDistanceKm||0;}))||1;state.radar.slice(0,18).forEach(function(item,index){var angle=((Number(item.id.replace(/\D/g,'').slice(-6))||index*7919)%360)*Math.PI/180;var radius=size*(.16+.78*Math.sqrt((item.missDistanceKm||0)/max));var x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;ctx.shadowBlur=item.hazardous?12:7;ctx.shadowColor=item.hazardous?'#fb7185':'#67e8f9';ctx.fillStyle=item.hazardous?'#fb7185':'#67e8f9';ctx.beginPath();ctx.arc(x,y,item.hazardous?4:2.7,0,Math.PI*2);ctx.fill();});ctx.shadowBlur=16;ctx.shadowColor='#60a5fa';ctx.fillStyle='#60a5fa';ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#a5f3fc';ctx.font='700 9px sans-serif';ctx.fillText('EARTH',cx+12,cy+3);
    }
    function asteroidCard(item,index){
      var card=create('article','nse-asteroid-card'+(item.hazardous?' is-hazardous':''));var rank=create('b','',String(index+1).padStart(2,'0'));var copy=create('div','nse-asteroid-name');copy.append(create('small','',item.hazardous?'POTENTIALLY HAZARDOUS':'MONITORED OBJECT'),create('h4','',item.name));var facts=create('div','nse-asteroid-facts');facts.append(create('span','',distance(item.missDistanceKm)+' jarak lintasan'),create('span','',compact(item.velocityKph,1)+' km/jam'),create('span','',finite(item.diameterKm.max)?(item.diameterKm.max*1000).toFixed(0)+' m maks':'Diameter —'));card.append(rank,copy,facts);if(item.detailsUrl){var link=create('a','', 'JPL');link.href=item.detailsUrl;link.target='_blank';link.rel='noopener noreferrer';card.appendChild(link);}return card;
    }
    function renderAsteroids(data){
      stage.innerHTML='';stage.appendChild(providerBar(data));var head=sectionHead('NEAR EARTH OBJECTS','Radar asteroid terdekat','Lintasan terurut dari jarak pendekatan paling dekat terhadap Bumi.');var control=create('div','nse-date-control');var date=create('input');date.type='date';date.id='nseAsteroidDate';date.max=today(7);date.min='1995-06-16';date.value=data.date;date.setAttribute('aria-label','Tanggal radar asteroid');date.addEventListener('change',function(){load('asteroids',{date:date.value});});control.appendChild(date);head.appendChild(control);stage.appendChild(head);
      var metrics=create('div','nse-metrics');metrics.append(metric('fa-solid fa-meteor','Terdeteksi',String(data.summary.total),'is-blue'),metric('fa-solid fa-triangle-exclamation','Berisiko',String(data.summary.hazardous),data.summary.hazardous?'is-red':'is-green'),metric('fa-solid fa-location-crosshairs','Paling dekat',data.summary.closest?distance(data.summary.closest.missDistanceKm):'—','is-purple'),metric('fa-solid fa-gauge-high','Tercepat',data.summary.fastest?compact(data.summary.fastest.velocityKph,1)+' km/j':'—','is-orange'));stage.appendChild(metrics);
      var layout=create('div','nse-radar-layout');var radar=create('article','nse-radar-card');var radarHead=create('div','nse-card-label');radarHead.append(create('span','', 'ORBITAL PROXIMITY MAP'),create('small','', 'Visual relatif · bukan skala orbit'));var canvas=create('canvas');canvas.id='nseRadar';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Peta relatif jarak asteroid terhadap Bumi');radar.append(radarHead,canvas);var legend=create('div','nse-radar-legend');legend.innerHTML='<span><i class="safe"></i> Objek termonitor</span><span><i class="risk"></i> Potensial berbahaya</span>';radar.appendChild(legend);layout.appendChild(radar);var list=create('div','nse-asteroid-list');if(data.items.length)data.items.forEach(function(item,index){list.appendChild(asteroidCard(item,index));});else list.appendChild(create('div','nse-empty','Tidak ada objek dekat Bumi pada tanggal ini.'));layout.appendChild(list);stage.appendChild(layout);state.radar=data.items;requestAnimationFrame(drawRadar);
    }
    function renderWeatherList(container){
      container.innerHTML='';var rows=state.weatherFilter==='all'?state.weather:state.weather.filter(function(item){return item.type===state.weatherFilter;});if(!rows.length){container.appendChild(create('div','nse-empty','Tidak ada event untuk filter ini. Kondisi tenang juga merupakan data yang valid.'));return;}
      rows.forEach(function(item){var card=create('article','nse-weather-event is-'+item.severity);var rail=create('div','nse-weather-rail');rail.innerHTML='<i></i>';var copy=create('div','nse-weather-copy');var meta=create('div');meta.append(create('span','',item.type),create('time','',formatDate(item.issuedAt,true)));copy.append(meta,create('h4','',item.label),create('p','',item.summary||'Detail event belum tersedia.'));if(item.sourceUrl){var link=create('a','', 'Buka bulletin NASA');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';copy.appendChild(link);}card.append(rail,copy);container.appendChild(card);});
    }
    function renderWeather(data){
      stage.innerHTML='';stage.appendChild(providerBar(data));var head=sectionHead('DONKI SPACE WEATHER','Cuaca antariksa','Bulletin aktivitas Matahari dan dampaknya pada lingkungan antariksa Bumi.');var select=create('select');select.id='nseWeatherDays';select.setAttribute('aria-label','Rentang cuaca antariksa');[3,7,14,30].forEach(function(days){var option=create('option','',days+' hari');option.value=String(days);option.selected=days===data.days;select.appendChild(option);});select.addEventListener('change',function(){load('weather',{days:Number(select.value)});});var control=create('label','nse-select-control');control.append(create('span','', 'Rentang'),select);head.appendChild(control);stage.appendChild(head);
      var metrics=create('div','nse-metrics');metrics.append(metric('fa-solid fa-satellite-dish','Total event',String(data.summary.total),'is-blue'),metric('fa-solid fa-burst','Prioritas tinggi',String(data.summary.high),data.summary.high?'is-red':'is-green'),metric('fa-solid fa-sun','Solar flare',String(data.summary.byType.FLR||0),'is-orange'),metric('fa-solid fa-magnet','Geomagnetik',String(data.summary.byType.GST||0),'is-purple'));stage.appendChild(metrics);
      var filter=create('div','nse-weather-filter');var types=[['all','Semua'],['CME','CME'],['FLR','Solar Flare'],['GST','Geomagnetik'],['SEP','Particles']];types.forEach(function(row){var button=create('button',row[0]===state.weatherFilter?'is-active':'',row[1]);button.type='button';button.addEventListener('click',function(){state.weatherFilter=row[0];filter.querySelectorAll('button').forEach(function(item){item.classList.remove('is-active');});button.classList.add('is-active');renderWeatherList(list);});filter.appendChild(button);});stage.appendChild(filter);state.weather=data.items;var list=create('div','nse-weather-list');renderWeatherList(list);stage.appendChild(list);
      if(data.fallback){var note=create('div','nse-source-note');note.innerHTML='<i class="fa-solid fa-code-branch"></i>';note.appendChild(create('span','', 'Feed bulletin utama sedang bermasalah; data dialihkan ke endpoint CME, GST, dan FLR NASA.'));stage.appendChild(note);}
    }
    function render(tab,data){if(tab==='apod')renderApod(data);else if(tab==='mars')renderMars(data);else if(tab==='asteroids')renderAsteroids(data);else renderWeather(data);}

    root.querySelectorAll('[data-space-tab]').forEach(function(button){button.addEventListener('click',function(){var tab=button.dataset.spaceTab;if(tab===state.active)return;state.active=tab;root.querySelectorAll('[data-space-tab]').forEach(function(item){item.classList.toggle('is-active',item===button);});load(tab,tab==='apod'?{}:tab==='mars'?{mission:'perseverance',page:1}:tab==='asteroids'?{date:today()}:{days:7});});});
    refresh.addEventListener('click',function(){state.clientCache.clear();load(state.active,tabParams(state.active),true);});
    modal.querySelector('.nse-modal-close').addEventListener('click',closeModal);modal.addEventListener('click',function(event){if(event.target===modal)closeModal();});
    function keydown(event){if(event.key==='Escape'&&!modal.hidden)closeModal();}
    function clock(){if(state.destroyed)return;var now=new Date();utc.textContent='UTC '+String(now.getUTCHours()).padStart(2,'0')+':'+String(now.getUTCMinutes()).padStart(2,'0')+':'+String(now.getUTCSeconds()).padStart(2,'0');}
    var clockTimer=setInterval(clock,1000);clock();var resizeTimer;function resize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(drawRadar,100);}window.addEventListener('resize',resize,{passive:true});document.addEventListener('keydown',keydown);
    body.__nxCleanup=function(){state.destroyed=true;if(state.controller)state.controller.abort();clearInterval(clockTimer);clearTimeout(resizeTimer);window.removeEventListener('resize',resize);document.removeEventListener('keydown',keydown);document.body.style.overflow='';modal.hidden=true;};
    load('apod',{});
  };
})();

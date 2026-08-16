/* Nexora BMKG Indonesia HF10 */
(function(){
  'use strict';

  function create(tag,className,text){
    var node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }
  function finite(value){return typeof value==='number'&&Number.isFinite(value);}
  function fmtDate(value,withTime){
    if(!value)return '—';
    var date=new Date(value);
    if(!Number.isFinite(date.getTime()))return String(value);
    try{return new Intl.DateTimeFormat('id-ID',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(date);}
    catch(_error){return date.toLocaleString();}
  }
  function weatherIcon(text){
    var value=String(text||'').toLowerCase();
    if(/petir|badai|thunder/.test(value))return 'fa-solid fa-cloud-bolt';
    if(/hujan/.test(value))return 'fa-solid fa-cloud-showers-heavy';
    if(/kabut|mist|fog/.test(value))return 'fa-solid fa-smog';
    if(/berawan|cloud/.test(value))return 'fa-solid fa-cloud';
    if(/cerah|clear|sun/.test(value))return 'fa-solid fa-sun';
    return 'fa-solid fa-cloud-sun';
  }
  function potentialClass(text){
    var value=String(text||'').toLowerCase();
    if(value.includes('tidak berpotensi tsunami'))return 'is-safe';
    if(value.includes('tsunami'))return 'is-danger';
    return 'is-info';
  }
  function requestJson(url,controller){
    if(typeof window.NexoraFetchJson==='function')return window.NexoraFetchJson(url,{signal:controller.signal,nexoraTimeoutMs:16000,nexoraRetries:1});
    return fetch(url,{signal:controller.signal,cache:'no-store',credentials:'same-origin'}).then(function(response){
      return response.json().catch(function(){return {};}).then(function(data){if(!response.ok||data.ok===false)throw new Error(data.message||data.error||('HTTP '+response.status));return data;});
    });
  }

  window.renderBmkgIndonesia=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <main class="nbmkg" aria-label="BMKG Indonesia">\
        <section class="nbmkg-hero">\
          <div class="nbmkg-brand">\
            <div class="nbmkg-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>\
            <div><span>BMKG OPEN DATA</span><strong>INDONESIA</strong></div>\
          </div>\
          <div class="nbmkg-hero-copy">\
            <div class="nbmkg-kicker"><span></span> OFFICIAL PUBLIC DATA <b>NO API KEY</b></div>\
            <h2>CUACA &amp; GEMPA <em>INDONESIA</em></h2>\
            <p>Pantau gempa terkini, prakiraan cuaca 3 hari, dan peringatan dini cuaca dari jalur Open Data resmi BMKG.</p>\
            <div class="nbmkg-signals"><span><i class="fa-solid fa-earth-asia"></i> GEMPA</span><span><i class="fa-solid fa-cloud-sun"></i> CUACA 3 HARI</span><span><i class="fa-solid fa-triangle-exclamation"></i> NOWCAST</span></div>\
          </div>\
        </section>\
        <nav class="nbmkg-tabs" aria-label="Menu BMKG">\
          <button type="button" class="is-active" data-bmkg-tab="quake"><i class="fa-solid fa-wave-square"></i><span>Gempa</span><small>Terkini & dirasakan</small></button>\
          <button type="button" data-bmkg-tab="weather"><i class="fa-solid fa-cloud-sun-rain"></i><span>Cuaca</span><small>Prakiraan 3 hari</small></button>\
          <button type="button" data-bmkg-tab="alerts"><i class="fa-solid fa-bell"></i><span>Peringatan</span><small>Nowcast aktif</small></button>\
        </nav>\
        <section class="nbmkg-stage" id="nbmkgStage" aria-live="polite"></section>\
        <footer class="nbmkg-footer">\
          <div><i class="fa-solid fa-circle-info"></i><p><strong>Sumber: BMKG</strong> — Badan Meteorologi, Klimatologi, dan Geofisika. Data ditampilkan tanpa mengubah makna sumber resmi.</p></div>\
          <div class="nbmkg-footer-links"><a href="https://data.bmkg.go.id/" target="_blank" rel="noopener noreferrer">Data Terbuka BMKG</a><span id="nbmkgAccessed">Belum dimuat</span></div>\
        </footer>\
      </main>';

    var root=body.querySelector('.nbmkg');
    var stage=root.querySelector('#nbmkgStage');
    var accessed=root.querySelector('#nbmkgAccessed');
    var state={tab:'quake',quakeMode:'latest',controller:null,destroyed:false,cache:new Map()};
    var storageKey='nexora-bmkg-adm4-v1';

    function setAccess(meta){
      if(!meta||!meta.accessedAt){accessed.textContent='Belum dimuat';return;}
      accessed.textContent='Diakses '+fmtDate(meta.accessedAt,true)+(meta.cached?' • cache hemat kuota':'');
    }
    function skeleton(label){
      stage.innerHTML='<div class="nbmkg-loading"><div class="nbmkg-pulse"><i></i><i></i><i></i></div><strong>'+label+'</strong><span>Mengambil data resmi BMKG…</span></div>';
    }
    function errorBox(message,retry){
      stage.innerHTML='';
      var box=create('div','nbmkg-error');
      box.innerHTML='<div class="nbmkg-error-icon"><i class="fa-solid fa-cloud-bolt"></i></div>';
      box.append(create('strong','', 'Data belum dapat dimuat'),create('p','',message||'Koneksi ke layanan BMKG terputus.'));
      if(typeof retry==='function'){
        var button=create('button','nbmkg-btn','Coba lagi');button.type='button';button.addEventListener('click',retry);box.appendChild(button);
      }
      stage.appendChild(box);
    }
    function api(section,params){
      var url=new URL('/api/bmkg',location.origin);url.searchParams.set('section',section);
      Object.keys(params||{}).forEach(function(key){if(params[key]!==undefined&&params[key]!==null&&params[key]!=='')url.searchParams.set(key,String(params[key]));});
      return url.pathname+url.search;
    }
    async function load(section,params,render,force){
      if(state.controller)state.controller.abort();
      var key=api(section,params||{});
      if(!force&&state.cache.has(key)){var cached=state.cache.get(key);setAccess(cached.meta);render(cached);return;}
      var controller=new AbortController();state.controller=controller;
      try{
        var payload=await requestJson(key,controller);
        if(state.destroyed)return;
        state.cache.set(key,payload);setAccess(payload.meta);render(payload);
      }catch(error){
        if(error&&error.name==='AbortError')return;
        errorBox(error&&error.message?error.message:'Data BMKG belum tersedia.',function(){load(section,params,render,true);});
      }
    }
    function sourceRow(meta,kind){
      var row=create('div','nbmkg-source');
      var left=create('span');left.innerHTML='<i class="fa-solid fa-shield-check"></i> <strong>Sumber: BMKG</strong>';
      var link=create('a','',kind==='quake'?'Dokumentasi Gempa':kind==='weather'?'Dokumentasi Cuaca':'Dokumentasi Peringatan');
      link.href=meta&&meta.sourceUrl?meta.sourceUrl:'https://data.bmkg.go.id/';link.target='_blank';link.rel='noopener noreferrer';
      row.append(left,link);return row;
    }

    function quakeCard(item,large){
      var card=create('article','nbmkg-quake'+(large?' is-primary':''));
      var mag=create('div','nbmkg-mag');mag.append(create('small','', 'MAGNITUDO'),create('strong','',finite(item.magnitude)?item.magnitude.toFixed(1):'—'));
      var copy=create('div','nbmkg-quake-copy');
      var title=create('h4','',item.region||'Lokasi belum tersedia');
      var time=create('p','');time.innerHTML='<i class="fa-regular fa-clock"></i> '+(item.date||'—')+' • '+(item.time||'—');
      var stats=create('div','nbmkg-quake-stats');
      var depth=create('span');depth.innerHTML='<i class="fa-solid fa-arrow-down"></i><b>'+(item.depth||'—')+'</b><small>Kedalaman</small>';
      var coord=create('span');coord.innerHTML='<i class="fa-solid fa-location-dot"></i><b>'+(item.coordinates||'—')+'</b><small>Koordinat</small>';
      stats.append(depth,coord);copy.append(title,time,stats);
      if(item.felt){var felt=create('div','nbmkg-felt');felt.append(create('i','fa-solid fa-people-group'),create('span','',item.felt));copy.appendChild(felt);}
      var side=create('div','nbmkg-quake-side');
      var potential=create('span','nbmkg-potential '+potentialClass(item.potential),item.potential||'Status potensi belum tersedia');side.appendChild(potential);
      if(item.shakemap){var map=create('a','nbmkg-outline','Shakemap BMKG');map.href=item.shakemap;map.target='_blank';map.rel='noopener noreferrer';side.appendChild(map);}
      card.append(mag,copy,side);return card;
    }
    function renderQuakeData(payload){
      stage.innerHTML='';
      var controls=create('div','nbmkg-toolbar');
      var title=create('div');title.append(create('span','', 'SEISMIK INDONESIA'),create('h3','',state.quakeMode==='latest'?'Gempa terbaru':state.quakeMode==='recent'?'15 Gempa M 5.0+':'15 Gempa Dirasakan'));
      var modes=create('div','nbmkg-segment');
      [['latest','Terbaru'],['recent','M 5.0+'],['felt','Dirasakan']].forEach(function(row){
        var button=create('button',state.quakeMode===row[0]?'is-active':'',row[1]);button.type='button';button.dataset.mode=row[0];modes.appendChild(button);
      });
      controls.append(title,modes);stage.appendChild(controls);
      var rows=Array.isArray(payload.quakes)?payload.quakes:[];
      if(!rows.length){stage.appendChild(create('div','nbmkg-empty','Belum ada data gempa pada feed ini.'));return;}
      var list=create('div','nbmkg-quake-list');rows.forEach(function(item,index){list.appendChild(quakeCard(item,index===0));});stage.append(list,sourceRow(payload.meta,'quake'));
      modes.addEventListener('click',function(event){var button=event.target.closest('button[data-mode]');if(!button)return;state.quakeMode=button.dataset.mode;skeleton('Membaca jaringan seismik');load(state.quakeMode,{},renderQuakeData,false);});
    }
    function renderQuake(){skeleton('Membaca jaringan seismik');load(state.quakeMode,{},renderQuakeData,false);}

    function weatherMetric(icon,label,value){var row=create('span');row.innerHTML='<i class="'+icon+'"></i><b>'+value+'</b><small>'+label+'</small>';return row;}
    function forecastCard(item){
      var card=create('article','nbmkg-forecast');
      var top=create('div','nbmkg-forecast-top');
      var date=new Date(String(item.localDateTime||'').replace(' ','T'));
      var when=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('id-ID',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date):item.localDateTime||'—';
      top.append(create('span','',when),create('i',weatherIcon(item.weather)));
      var center=create('div','nbmkg-forecast-center');center.append(create('strong','',finite(item.temperatureC)?Math.round(item.temperatureC)+'°C':'—'),create('p','',item.weather||'Kondisi belum tersedia'));
      var metrics=create('div','nbmkg-weather-metrics');
      metrics.append(weatherMetric('fa-solid fa-droplet','Kelembapan',finite(item.humidityPct)?item.humidityPct+'%':'—'),weatherMetric('fa-solid fa-wind','Angin',finite(item.windKmh)?item.windKmh+' km/j':'—'),weatherMetric('fa-solid fa-eye','Jarak pandang',item.visibility||'—'));
      card.append(top,center,metrics);return card;
    }
    function renderWeatherData(payload){
      stage.innerHTML='';
      var location=payload.location||{};
      var heading=create('div','nbmkg-weather-heading');
      var copy=create('div');copy.append(create('span','', 'PRAKIRAAN 3 HARI'),create('h3','',[location.village,location.district].filter(Boolean).join(', ')||'Wilayah BMKG'),create('p','',[location.city,location.province].filter(Boolean).join(' • ')));
      var badge=create('b','',location.adm4||'ADM4');heading.append(copy,badge);stage.appendChild(heading);
      var grid=create('div','nbmkg-forecast-grid');(payload.forecasts||[]).forEach(function(item){grid.appendChild(forecastCard(item));});stage.append(grid,sourceRow(payload.meta,'weather'));
    }
    function renderWeather(){
      stage.innerHTML='';
      var panel=create('section','nbmkg-weather-search');
      var head=create('div');head.append(create('span','', 'PRAKIRAAN CUACA'),create('h3','', 'Cari berdasarkan kode wilayah ADM4'),create('p','', 'Gunakan kode kelurahan/desa format XX.XX.XX.XXXX. Contoh resmi BMKG: 31.71.03.1001 untuk Kemayoran.'));
      var form=create('form','nbmkg-form');
      var input=create('input');input.type='text';input.inputMode='numeric';input.autocomplete='off';input.placeholder='31.71.03.1001';input.maxLength=13;input.setAttribute('aria-label','Kode wilayah ADM4');
      try{input.value=localStorage.getItem(storageKey)||'';}catch(_error){}
      var button=create('button','nbmkg-btn','Lihat prakiraan');button.type='submit';button.innerHTML='<i class="fa-solid fa-magnifying-glass"></i><span>Lihat prakiraan</span>';
      form.append(input,button);panel.append(head,form);
      var help=create('div','nbmkg-help');help.innerHTML='<i class="fa-solid fa-circle-info"></i><span>Kode ADM4 mengikuti kode wilayah administrasi tingkat IV yang dipakai API publik BMKG.</span><a href="https://data.bmkg.go.id/prakiraan-cuaca/" target="_blank" rel="noopener noreferrer">Panduan resmi</a>';
      panel.appendChild(help);stage.appendChild(panel);
      form.addEventListener('submit',function(event){event.preventDefault();var adm4=String(input.value||'').trim();if(!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4)){input.focus();input.classList.add('is-invalid');setTimeout(function(){input.classList.remove('is-invalid');},1200);return;}try{localStorage.setItem(storageKey,adm4);}catch(_error){}skeleton('Menyusun prakiraan cuaca');load('weather',{adm4:adm4},renderWeatherData,false);});
    }

    function alertCard(item){
      var card=create('article','nbmkg-alert');
      var icon=create('div','nbmkg-alert-icon');icon.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i>';
      var copy=create('div');copy.append(create('h4','',item.title||'Peringatan dini cuaca'),create('p','',item.description||'Detail wilayah terdampak tersedia pada BMKG.'));
      var meta=create('div','nbmkg-alert-meta');if(item.publishedAt)meta.append(create('span','',item.publishedAt));if(item.author)meta.append(create('span','',item.author));copy.appendChild(meta);
      var action=create('a','nbmkg-outline','Detail BMKG');action.href=item.link||'https://www.bmkg.go.id/cuaca/peringatan-dini-cuaca';action.target='_blank';action.rel='noopener noreferrer';
      card.append(icon,copy,action);return card;
    }
    function renderAlertsData(payload){
      stage.innerHTML='';
      var head=create('div','nbmkg-alert-head');
      var copy=create('div');copy.append(create('span','', 'NOWCAST NASIONAL'),create('h3','', 'Peringatan dini cuaca aktif'),create('p','',payload.lastBuildDate?'Pembaruan feed: '+payload.lastBuildDate:'Feed peringatan BMKG diperbarui setiap saat.'));
      var count=create('b','',String((payload.alerts||[]).length));count.appendChild(create('small','', 'aktif'));head.append(copy,count);stage.appendChild(head);
      var list=create('div','nbmkg-alert-list');
      if(!(payload.alerts||[]).length){var empty=create('div','nbmkg-empty is-safe');empty.innerHTML='<i class="fa-solid fa-shield-heart"></i><strong>Tidak ada peringatan aktif pada feed saat ini.</strong><span>Tetap pantau pembaruan resmi BMKG jika kondisi cuaca berubah.</span>';list.appendChild(empty);}
      else (payload.alerts||[]).forEach(function(item){list.appendChild(alertCard(item));});
      stage.append(list,sourceRow(payload.meta,'alerts'));
    }
    function renderAlerts(){skeleton('Memeriksa peringatan dini');load('alerts',{},renderAlertsData,false);}

    function switchTab(tab){
      state.tab=tab;
      root.querySelectorAll('[data-bmkg-tab]').forEach(function(button){button.classList.toggle('is-active',button.dataset.bmkgTab===tab);});
      if(tab==='weather')renderWeather();else if(tab==='alerts')renderAlerts();else renderQuake();
    }
    root.querySelector('.nbmkg-tabs').addEventListener('click',function(event){var button=event.target.closest('button[data-bmkg-tab]');if(button)switchTab(button.dataset.bmkgTab);});

    body.__nxCleanup=function(){state.destroyed=true;if(state.controller)state.controller.abort();};
    switchTab('quake');
  };
})();

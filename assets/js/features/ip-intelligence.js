/* Nexora IP & ASN Intelligence — IPinfo Lite */
(function(){
  'use strict';
  var HISTORY_KEY='nexora-ip-intel-history-v1';
  var activeController=null;

  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
  function esc(value){return String(value==null?'':value);}
  function loadHistory(){try{var rows=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,6):[];}catch(_){return[];}}
  function saveHistory(row){try{var rows=loadHistory().filter(function(item){return item&&item.ip!==row.ip;});rows.unshift({ip:row.ip,asn:row.asn||'',country:row.country||'',at:Date.now()});localStorage.setItem(HISTORY_KEY,JSON.stringify(rows.slice(0,6)));}catch(_){}}
  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();}
  function errorMessage(payload,status){if(payload&&payload.message)return payload.message;if(status===503)return 'IPinfo belum dikonfigurasi di server.';if(status===429)return 'Permintaan terlalu banyak. Coba lagi sebentar.';return 'Lookup IP gagal. Periksa alamat IP lalu coba lagi.';}

  window.renderIpIntelligence=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <section class="nip" aria-label="IP dan ASN Intelligence">\
        <div class="nip-hero">\
          <div class="nip-grid-bg" aria-hidden="true"></div>\
          <div class="nip-kicker"><i class="fa-solid fa-network-wired"></i><span>NETWORK INTELLIGENCE</span><b>IPINFO LITE</b></div>\
          <h2>Kenali jaringan di balik <em>alamat IP.</em></h2>\
          <p>Lookup IPv4/IPv6 untuk ASN, organisasi jaringan, domain, negara, benua, dan status bogon melalui backend Nexora. Token API tidak pernah dikirim ke browser.</p>\
          <form class="nip-form" id="nipForm">\
            <label class="nip-input-wrap" for="nipInput"><i class="fa-solid fa-location-crosshairs"></i><input id="nipInput" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="8.8.8.8 atau 2001:4860:4860::8888" aria-label="Alamat IPv4 atau IPv6"></label>\
            <div class="nip-actions"><button class="nip-primary" type="submit"><i class="fa-solid fa-magnifying-glass"></i><span>ANALISIS IP</span></button><button class="nip-secondary" type="button" id="nipSelf"><i class="fa-solid fa-crosshairs"></i><span>IP SAYA</span></button></div>\
          </form>\
          <div class="nip-trust"><span><i class="fa-solid fa-lock"></i>API key server-side</span><span><i class="fa-solid fa-bolt"></i>IPv4 + IPv6</span><span><i class="fa-solid fa-database"></i>Cache aman</span></div>\
        </div>\
        <section class="nip-state" id="nipState" hidden aria-live="polite"></section>\
        <section class="nip-result" id="nipResult" hidden></section>\
        <section class="nip-recent" id="nipRecent" hidden><div class="nip-section-head"><div><span>RECENT LOOKUPS</span><small>Tersimpan hanya di perangkat ini</small></div><button type="button" id="nipClear">Hapus</button></div><div class="nip-history" id="nipHistory"></div></section>\
        <div class="nip-footnote"><i class="fa-solid fa-circle-info"></i><p>IPinfo Lite menyediakan data tingkat negara/benua dan ASN dasar. Tool ini tidak mengarang kota, koordinat, VPN, proxy, atau ISP type yang memang tidak tersedia di paket Lite.</p></div>\
      </section>';

    var form=body.querySelector('#nipForm'),input=body.querySelector('#nipInput'),selfBtn=body.querySelector('#nipSelf'),state=body.querySelector('#nipState'),result=body.querySelector('#nipResult'),recent=body.querySelector('#nipRecent'),history=body.querySelector('#nipHistory'),clear=body.querySelector('#nipClear');

    function setBusy(on,label){var buttons=form.querySelectorAll('button');buttons.forEach(function(button){button.disabled=on;});var primary=form.querySelector('.nip-primary span');if(primary)primary.textContent=on?(label||'MENGANALISIS...'):'ANALISIS IP';form.classList.toggle('is-busy',on);}
    function showState(kind,title,message){state.hidden=false;state.className='nip-state is-'+kind;state.innerHTML='';var ico=el('i',kind==='error'?'fa-solid fa-triangle-exclamation':kind==='loading'?'fa-solid fa-circle-notch fa-spin':'fa-solid fa-circle-info');var wrap=el('div');wrap.append(el('strong','',title),el('span','',message));state.append(ico,wrap);}
    function hideState(){state.hidden=true;state.innerHTML='';}
    function field(iconName,label,value,wide){var card=el('article','nip-data-card'+(wide?' is-wide':''));var icon=el('div','nip-data-icon');icon.append(el('i',iconName));var copy=el('div','nip-data-copy');copy.append(el('small','',label),el('strong','',value||'—'));card.append(icon,copy);return card;}
    function renderHistory(){var rows=loadHistory();history.innerHTML='';recent.hidden=!rows.length;if(!rows.length)return;rows.forEach(function(row){var button=el('button','nip-history-item');button.type='button';var main=el('span');main.append(el('strong','',row.ip),el('small','',[(row.asn||''),(row.country||'')].filter(Boolean).join(' · ')||'Lookup IP'));button.append(el('i','fa-solid fa-clock-rotate-left'),main,el('i','fa-solid fa-chevron-right'));button.addEventListener('click',function(){input.value=row.ip;lookup({ip:row.ip});});history.append(button);});}
    function renderResult(data,meta){
      result.hidden=false;result.innerHTML='';
      var top=el('div','nip-result-top');var identity=el('div','nip-identity');var badge=el('span','nip-version',data.version||'IP');badge.append(el('i','fa-solid fa-circle-nodes'));identity.append(badge,el('h3','',data.ip||'Unknown IP'),el('p','',data.bogon?'Alamat ini terdeteksi sebagai bogon / non-routable.':'Alamat IP routable dengan data jaringan dari IPinfo Lite.'));
      var copy=el('button','nip-copy');copy.type='button';copy.append(el('i','fa-regular fa-copy'),el('span','','Salin JSON'));copy.addEventListener('click',function(){copyText(JSON.stringify(data,null,2)).then(function(){copy.querySelector('span').textContent='Tersalin';setTimeout(function(){if(copy.isConnected)copy.querySelector('span').textContent='Salin JSON';},1300);});});top.append(identity,copy);result.append(top);
      var status=el('div','nip-status-row');status.append(el('span','nip-status '+(data.bogon?'is-warn':'is-ok'),data.bogon?'BOGON / NON-ROUTABLE':'ROUTABLE'),el('span','nip-provider',(meta&&meta.cached?'CACHE · ':'LIVE · ')+(data.provider||'IPinfo Lite')));result.append(status);
      var grid=el('div','nip-data-grid');grid.append(field('fa-solid fa-fingerprint','IP ADDRESS',data.ip,true),field('fa-solid fa-diagram-project','ASN',data.asn),field('fa-solid fa-building','ORGANIZATION',data.asName,true),field('fa-solid fa-globe','AS DOMAIN',data.asDomain),field('fa-solid fa-flag','COUNTRY',[data.country,data.countryCode].filter(Boolean).join(' · ')),field('fa-solid fa-earth-americas','CONTINENT',[data.continent,data.continentCode].filter(Boolean).join(' · ')));result.append(grid);
      if(data.asDomain){var domain=el('a','nip-domain-link','Buka '+data.asDomain);domain.href='https://'+data.asDomain.replace(/^https?:\/\//i,'');domain.target='_blank';domain.rel='noopener noreferrer';domain.prepend(el('i','fa-solid fa-arrow-up-right-from-square'));result.append(domain);}
    }
    async function lookup(options){
      options=options||{};var query='';
      if(options.self)query='self=1';else{var raw=esc(options.ip||input.value).trim();if(!raw){showState('error','IP belum diisi','Masukkan IPv4/IPv6 atau tekan tombol IP Saya.');input.focus();return;}query='ip='+encodeURIComponent(raw);}
      if(activeController)activeController.abort();activeController=new AbortController();setBusy(true,options.self?'MENDETEKSI IP...':'MENGANALISIS...');result.hidden=true;showState('loading','Menghubungkan ke IPinfo Lite','Memeriksa jaringan, ASN, organisasi, dan lokasi tingkat negara.');
      try{var response=await fetch('/api/ip-intelligence?'+query,{headers:{Accept:'application/json'},cache:'no-store',signal:activeController.signal});var payload=await response.json().catch(function(){return{};});if(!response.ok||!payload.ok)throw Object.assign(new Error(errorMessage(payload,response.status)),{status:response.status});hideState();renderResult(payload.data,payload.meta);if(payload.data&&payload.data.ip){input.value=payload.data.ip;saveHistory(payload.data);renderHistory();}}
      catch(error){if(error&&error.name==='AbortError')return;result.hidden=true;showState('error','Lookup gagal',error&&error.message?error.message:'Terjadi gangguan saat membaca data IP.');}
      finally{setBusy(false);activeController=null;}
    }
    form.addEventListener('submit',function(event){event.preventDefault();lookup({ip:input.value});});
    selfBtn.addEventListener('click',function(){lookup({self:true});});
    clear.addEventListener('click',function(){try{localStorage.removeItem(HISTORY_KEY);}catch(_){}renderHistory();});
    renderHistory();
    body.__nxCleanup=function(){if(activeController)activeController.abort();activeController=null;};
  };
})();

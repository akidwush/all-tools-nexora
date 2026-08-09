/* Nexora Crypto Market Scanner v6.3.13 HF4 */
(function(){
  'use strict';

  function create(tag,className,text){
    var node=document.createElement(tag);
    if(className) node.className=className;
    if(text!==undefined&&text!==null) node.textContent=String(text);
    return node;
  }

  function finite(value){return typeof value==='number'&&Number.isFinite(value);}

  window.renderCryptoMarket=function(body){
    if(typeof body.__nxCleanup==='function')body.__nxCleanup();
    body.innerHTML='\
      <section class="nx-crypto" aria-label="Crypto Market Scanner">\
        <div class="nx-crypto-toolbar">\
          <div class="nx-crypto-live"><span class="nx-crypto-pulse"></span><div><strong>LIVE MARKET</strong><small id="nxCryptoUpdated">Menyiapkan scanner…</small></div></div>\
          <div class="nx-crypto-controls">\
            <label>Currency<select id="nxCryptoCurrency"><option value="idr">IDR</option><option value="usd">USD</option></select></label>\
            <label>Jumlah<select id="nxCryptoLimit"><option value="10">Top 10</option><option value="25" selected>Top 25</option><option value="50">Top 50</option></select></label>\
            <button id="nxCryptoRefresh" type="button"><i class="fa-solid fa-rotate"></i><span>Refresh</span></button>\
          </div>\
        </div>\
        <div id="nxCryptoProvider" class="nx-crypto-provider" role="status" aria-live="polite">Menghubungkan provider market…</div>\
        <div id="nxCryptoSummary" class="nx-crypto-summary" aria-label="Ringkasan pasar"></div>\
        <div class="nx-crypto-section-head"><div><span>MARKET PULSE</span><h3>Pergerakan 24 Jam</h3></div><small>Naik dan turun terbesar dari daftar aktif</small></div>\
        <div id="nxCryptoSpotlight" class="nx-crypto-spotlight"></div>\
        <div class="nx-crypto-market-head">\
          <label class="nx-crypto-search"><i class="fa-solid fa-magnifying-glass"></i><input id="nxCryptoSearch" type="search" inputmode="search" placeholder="Cari BTC, Ethereum…" autocomplete="off"><span id="nxCryptoCount">0 aset</span></label>\
          <label class="nx-crypto-sort"><span>Urutkan</span><select id="nxCryptoSort"><option value="rank">Market Cap</option><option value="volume">Volume</option><option value="gainers">Top Gainer</option><option value="losers">Top Loser</option><option value="price">Harga</option></select></label>\
        </div>\
        <div id="nxCryptoLoading" class="nx-crypto-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Membaca pasar crypto</strong><span>Harga, volume, dominasi, dan tren sedang disiapkan.</span></div>\
        <div id="nxCryptoError" class="nx-crypto-error" hidden><i class="fa-solid fa-cloud-bolt"></i><strong>Data market belum tersedia</strong><span></span><button type="button">Coba lagi</button></div>\
        <div id="nxCryptoCoins" class="nx-crypto-coins" aria-live="polite"></div>\
        <footer class="nx-crypto-foot"><i class="fa-solid fa-circle-info"></i><span>Data market bersifat informatif, bukan saran finansial. Refresh dilakukan manual agar kuota API tetap hemat.</span></footer>\
      </section>';

    var root=body.querySelector('.nx-crypto');
    var currency=root.querySelector('#nxCryptoCurrency');
    var limit=root.querySelector('#nxCryptoLimit');
    var refresh=root.querySelector('#nxCryptoRefresh');
    var search=root.querySelector('#nxCryptoSearch');
    var sort=root.querySelector('#nxCryptoSort');
    var summary=root.querySelector('#nxCryptoSummary');
    var provider=root.querySelector('#nxCryptoProvider');
    var spotlight=root.querySelector('#nxCryptoSpotlight');
    var coinsRoot=root.querySelector('#nxCryptoCoins');
    var loading=root.querySelector('#nxCryptoLoading');
    var errorBox=root.querySelector('#nxCryptoError');
    var count=root.querySelector('#nxCryptoCount');
    var updated=root.querySelector('#nxCryptoUpdated');
    var state={coins:[],currency:'idr',controller:null};

    function money(value,compact){
      if(!finite(value)) return '—';
      var code=state.currency==='idr'?'IDR':'USD';
      var maximum=value>0&&value<1?8:value<100?4:2;
      try{return new Intl.NumberFormat('id-ID',{style:'currency',currency:code,notation:compact?'compact':'standard',maximumFractionDigits:compact?2:maximum}).format(value);}
      catch(_error){return String(value);}
    }

    function number(value){
      if(!finite(value)) return '—';
      return new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:2}).format(value);
    }

    function percent(value,withSign){
      if(!finite(value)) return '—';
      return (withSign&&value>0?'+':'')+value.toFixed(Math.abs(value)<0.1?2:1)+'%';
    }

    function movementClass(value){return !finite(value)?'is-flat':value>0?'is-up':value<0?'is-down':'is-flat';}

    function metric(icon,label,value,change){
      var card=create('article','nx-crypto-metric');
      var iconNode=create('span','nx-crypto-metric-icon');
      var i=create('i',icon); iconNode.appendChild(i);
      var copy=create('div'); copy.append(create('small','',label),create('strong','',value));
      if(change!==undefined){var delta=create('em',movementClass(change),percent(change,true));copy.appendChild(delta);}
      card.append(iconNode,copy); return card;
    }

    function renderSummary(global){
      summary.replaceChildren(
        metric('fa-solid fa-globe','Total Market Cap',money(global&&global.totalMarketCap,true),global&&global.marketCapChange24h),
        metric('fa-solid fa-chart-column','Volume 24 Jam',money(global&&global.totalVolume,true)),
        metric('fa-brands fa-bitcoin','Dominasi Bitcoin',percent(global&&global.btcDominance,false)),
        metric('fa-solid fa-coins','Crypto Aktif',number(global&&global.activeCryptocurrencies))
      );
    }

    function coinIdentity(coin,small){
      var wrap=create('div','nx-crypto-identity'+(small?' is-small':''));
      var avatar=create('span','nx-crypto-avatar');
      var fallback=create('b','',String(coin.symbol||'?').slice(0,2));
      avatar.appendChild(fallback);
      if(coin.image){
        var img=create('img'); img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=coin.image;
        img.addEventListener('load',function(){fallback.hidden=true;});
        img.addEventListener('error',function(){img.remove();fallback.hidden=false;});
        avatar.appendChild(img);
      }
      var names=create('div'); names.append(create('strong','',coin.name),create('small','',coin.symbol));
      wrap.append(avatar,names);return wrap;
    }

    function drawSparkline(canvas,points,positive){
      if(!canvas||!Array.isArray(points)||points.length<2) return;
      var box=canvas.getBoundingClientRect();
      var ratio=Math.min(window.devicePixelRatio||1,2);
      var width=Math.max(90,Math.round(box.width||120));
      var height=Math.max(30,Math.round(box.height||42));
      canvas.width=width*ratio;canvas.height=height*ratio;
      var ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
      var min=Math.min.apply(null,points),max=Math.max.apply(null,points),range=max-min||1;
      var color=positive?'#34d399':'#fb7185';
      var gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,positive?'rgba(52,211,153,.28)':'rgba(251,113,133,.25)');gradient.addColorStop(1,'rgba(8,12,22,0)');
      ctx.beginPath();points.forEach(function(point,index){var x=(index/(points.length-1))*width;var y=height-4-((point-min)/range)*(height-9);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
      ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
      ctx.beginPath();points.forEach(function(point,index){var x=(index/(points.length-1))*width;var y=height-4-((point-min)/range)*(height-9);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
    }

    function changeCell(label,value){
      var box=create('div','nx-crypto-change '+movementClass(value));
      box.append(create('small','',label),create('strong','',percent(value,true)));return box;
    }

    function coinCard(coin){
      var card=create('article','nx-crypto-coin');
      var top=create('div','nx-crypto-coin-top');
      var rank=create('span','nx-crypto-rank','#'+(finite(coin.rank)?coin.rank:'—'));
      top.append(rank,coinIdentity(coin,false));
      var price=create('div','nx-crypto-price');price.append(create('strong','',money(coin.currentPrice,false)),create('small','',money(coin.marketCap,true)+' market cap'));
      top.appendChild(price);
      var chart=create('div','nx-crypto-chart');
      if(Array.isArray(coin.sparkline)&&coin.sparkline.length>1){var canvas=create('canvas');canvas.setAttribute('aria-label','Grafik harga 7 hari '+coin.name);chart.appendChild(canvas);requestAnimationFrame(function(){drawSparkline(canvas,coin.sparkline,(coin.change7d||0)>=0);});}
      else chart.appendChild(create('span','nx-crypto-no-chart','Sparkline tidak tersedia di fallback'));
      var changes=create('div','nx-crypto-changes');changes.append(changeCell('1 JAM',coin.change1h),changeCell('24 JAM',coin.change24h),changeCell('7 HARI',coin.change7d));
      var stats=create('div','nx-crypto-stats');
      var volume=create('span');volume.append(create('small','','VOLUME 24J'),create('b','',money(coin.volume24h,true)));
      var supply=create('span');supply.append(create('small','','SUPLAI BEREDAR'),create('b','',number(coin.circulatingSupply)));
      stats.append(volume,supply);
      card.append(top,chart,changes,stats);return card;
    }

    function renderCoins(){
      var query=String(search.value||'').trim().toLowerCase();
      var rows=state.coins.filter(function(coin){return !query||String(coin.name).toLowerCase().includes(query)||String(coin.symbol).toLowerCase().includes(query);});
      var mode=sort.value;
      rows=rows.slice().sort(function(a,b){
        if(mode==='volume')return (b.volume24h||0)-(a.volume24h||0);
        if(mode==='gainers')return (b.change24h||-Infinity)-(a.change24h||-Infinity);
        if(mode==='losers')return (a.change24h||Infinity)-(b.change24h||Infinity);
        if(mode==='price')return (b.currentPrice||0)-(a.currentPrice||0);
        return (a.rank||Infinity)-(b.rank||Infinity);
      });
      count.textContent=rows.length+' aset';coinsRoot.replaceChildren();
      if(!rows.length){coinsRoot.appendChild(create('div','nx-crypto-empty','Aset tidak ditemukan. Coba nama atau simbol lain.'));return;}
      var fragment=document.createDocumentFragment();rows.forEach(function(coin){fragment.appendChild(coinCard(coin));});coinsRoot.appendChild(fragment);
    }

    function renderSpotlight(rows){
      spotlight.replaceChildren();
      (Array.isArray(rows)?rows:[]).slice(0,5).forEach(function(coin){
        var card=create('button','nx-crypto-mover '+movementClass(coin.change24h));card.type='button';
        card.append(coinIdentity(coin,true),create('strong','',percent(coin.change24h,true)));
        card.addEventListener('click',function(){search.value=coin.symbol||coin.name;renderCoins();});
        spotlight.appendChild(card);
      });
      if(!spotlight.childElementCount)spotlight.appendChild(create('div','nx-crypto-empty','Pergerakan market belum tersedia.'));
    }

    function setBusy(busy){
      loading.hidden=!busy;refresh.disabled=busy;currency.disabled=busy;limit.disabled=busy;
      refresh.querySelector('i').className=busy?'fa-solid fa-circle-notch fa-spin':'fa-solid fa-rotate';
      if(busy){errorBox.hidden=true;coinsRoot.replaceChildren();}
    }

    function showError(message){
      loading.hidden=true;errorBox.hidden=false;errorBox.querySelector('span').textContent=message||'Coba beberapa saat lagi.';provider.className='nx-crypto-provider is-error';provider.textContent='Provider market tidak dapat dijangkau';
    }

    async function load(){
      if(state.controller)state.controller.abort();
      var controller=new AbortController();state.controller=controller;body.__nxCleanup=function(){controller.abort();};setBusy(true);
      try{
        var endpoint='/api/crypto-market?currency='+encodeURIComponent(currency.value)+'&limit='+encodeURIComponent(limit.value);
        var response=await window.NexoraFetch(endpoint,{method:'GET',cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal,nexoraTimeoutMs:12000,nexoraRetries:1});
        var payload=await response.json().catch(function(){return {};});
        if(!response.ok||!payload.ok)throw new Error(payload.message||'Data pasar belum tersedia.');
        state.currency=payload.currency==='usd'?'usd':'idr';
        if(currency.value!==state.currency)currency.value=state.currency;
        state.coins=Array.isArray(payload.coins)?payload.coins:[];
        renderSummary(payload.global||{});renderSpotlight(payload.spotlight||[]);renderCoins();
        var source=payload.source==='coingecko'?'CoinGecko Demo API':'CoinPaprika Fallback';
        provider.className='nx-crypto-provider '+(payload.warning?'is-warning':'is-ready');
        provider.replaceChildren(create('i',payload.warning?'fa-solid fa-triangle-exclamation':'fa-solid fa-shield-check'),create('strong','',source),create('span','',payload.warning||'API key terlindungi di server dan data cache aktif.'));
        var date=new Date(payload.updatedAt);updated.textContent='Diperbarui '+(Number.isNaN(date.getTime())?'baru saja':date.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}));
        errorBox.hidden=true;
      }catch(error){
        if(error&&error.name==='AbortError')return;
        showError(error&&error.message?error.message:'Koneksi ke market terputus.');
      }finally{if(state.controller===controller)setBusy(false);}
    }

    search.addEventListener('input',renderCoins);sort.addEventListener('change',renderCoins);
    currency.addEventListener('change',load);limit.addEventListener('change',load);refresh.addEventListener('click',load);
    errorBox.querySelector('button').addEventListener('click',load);
    load();
  };
})();

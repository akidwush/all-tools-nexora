/* Additive overlay; coordinates stay relative to each unmodified source image. */
(function(){
 'use strict';
 var current=null;
 function node(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;}
 async function transport(){
  try{if(parent!==window&&parent.location.origin===location.origin&&parent.NexoraSupabase)return parent.NexoraSupabase;}catch(ignore){}
  if(window.NexoraSupabase)return window.NexoraSupabase;
  await new Promise(function(resolve,reject){var script=node('script');script.src='/assets/js/shared/supabase-client.js?v=comic-translate1';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
  return window.NexoraSupabase;
 }
 function popup(region){
  var d=node('dialog','nx-ct-dialog');d.append(node('strong','',region.type==='sound_effect'?'Efek suara':'Terjemahan Indonesia'),node('p','',region.translated),node('small','','Teks asli'),node('p','',region.original));
  var close=node('button','','Tutup');close.type='button';close.onclick=function(){d.close();};d.append(close);d.addEventListener('close',function(){d.remove();});document.body.append(d);d.showModal();
 }
 function fit(box){
  var text=box.firstChild,w=box.clientWidth-2,h=box.clientHeight-2;if(w<=0||h<=0)return false;
  var lo=10,hi=Math.min(26,Math.floor(h/1.15)),best=10;
  while(lo<=hi){var mid=Math.floor((lo+hi)/2);text.style.fontSize=mid+'px';if(text.scrollHeight<=h&&text.scrollWidth<=w){best=mid;lo=mid+1;}else hi=mid-1;}
  text.style.fontSize=best+'px';var overflow=text.scrollHeight>h||text.scrollWidth>w||h<12;
  box.classList.toggle('needs-detail',overflow);box.setAttribute('aria-label',(overflow?'Teks panjang, buka terjemahan lengkap: ':'')+box.dataset.translation);
  return overflow;
 }
 function renderPage(s,index){
  var p=s.pages[index];if(!p)return;
  p.layer.replaceChildren();p.note.textContent='';p.note.hidden=true;
  if(s.mode.value!=='id'||!p.visible||!p.img.naturalWidth)return;
  var result=s.results.get(index);
  if(!result){if(s.failed.has(index)){p.note.textContent='Terjemahan halaman gagal. Tekan Retry halaman gagal.';p.note.hidden=false;}return;}
  var inaccurate=false;
  result.translation.regions.forEach(function(r){
   if(r.type==='sound_effect'&&!s.sfx.checked)return;
   // Defensive validation even when a shared cache supplies the result.
   if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001||typeof r.translated!=='string')return;
   var b=node('button','nx-ct-region'+(r.dark?' is-dark':''));b.type='button';b.dataset.translation=r.translated;
   b.style.left=(r.x*100)+'%';b.style.top=(r.y*100)+'%';b.style.width=(r.width*100)+'%';b.style.height=(r.height*100)+'%';b.append(node('span','',r.translated));b.onclick=function(){popup(r);};p.layer.append(b);if(r.lowConfidence)inaccurate=true;
  });
  requestAnimationFrame(function(){if(current!==s||!p.visible)return;var overflow=false;p.layer.querySelectorAll('button').forEach(function(b){overflow=fit(b)||overflow;});p.note.textContent=[inaccurate?'Terjemahan mungkin kurang akurat.':'',overflow?'Teks terlalu panjang untuk balon kecil. Ketuk balon untuk membaca lengkap.':''].filter(Boolean).join(' ');p.note.hidden=!p.note.textContent;});
 }
 function render(s){s.pages.forEach(function(p,i){renderPage(s,i);});}
 function status(s,text){if(current===s)s.status.textContent=text;}
 function progress(s){status(s,'Menerjemahkan chapter: '+s.results.size+' / '+s.pages.length+' halaman'+(s.failed.size?' • '+s.failed.size+' gagal':''));}
 function stop(s){if(!s)return;s.control.cancel&&s.control.cancel();s.controller.abort();s.observer&&s.observer.disconnect();s.resize&&s.resize.disconnect();clearInterval(s.timer);if(s.jobId&&s.api)s.api.invoke('comic-translate-chapter',{action:'cancel',jobId:s.jobId}).catch(function(){});}
 async function start(s){
  if(s.busy||current!==s)return;
  if(!s.translationCompatible){status(s,'Translate All belum kompatibel untuk '+(s.sourceLabel||s.source||'source ini')+'. Teks asli tetap tersedia.');return;}
  s.busy=true;s.start.disabled=true;s.cancel.hidden=false;s.retry.hidden=true;s.failed.clear();s.controller=new AbortController();s.control={};var cancelled=false,paused='';
  s.cancel.onclick=function(){cancelled=true;s.control.cancel&&s.control.cancel();status(s,'Menghentikan antrean… hasil yang sudah selesai tetap tersedia.');};
  try{
   status(s,'Menyiapkan Translate All…');s.api=await transport();if(cancelled||current!==s)return;
   var job=await s.api.invoke('comic-translate-chapter',{action:'prepare',mangaId:s.mangaId,chapterId:s.chapterId},s.controller.signal);
   s.jobId=job.jobId;if(cancelled||current!==s)return;
   if(job.totalPages!==s.pages.length)throw Error('Halaman sumber berubah. Buka ulang chapter sebelum menerjemahkan.');
   s.results.forEach(function(r,i){if(r.imageHash!==job.identities[i])s.results.delete(i);});render(s);
   if(!s.sfxTouched)s.sfx.checked=job.sfxDefault;
   var visible=s.pages.findIndex(function(p){return p.visible;}),pages=[];
   s.pages.forEach(function(p,i){if(!s.results.has(i))pages.push(i);});
   pages.sort(function(a,b){return Number(job.cachedPages.includes(b))-Number(job.cachedPages.includes(a))||Math.abs(a-Math.max(0,visible))-Math.abs(b-Math.max(0,visible));});
   var nextRequestAt=0;
   async function delay(ms){if(ms<=0||cancelled||s.controller.signal.aborted)return;await new Promise(function(resolve){var timer=setTimeout(done,ms);function done(){clearTimeout(timer);s.controller.signal.removeEventListener('abort',done);resolve();}s.controller.signal.addEventListener('abort',done,{once:true});});}
   progress(s);
   await window.NexoraComicQueue.run({pages:pages,concurrency:job.maxConcurrentPages,control:s.control,
    request:async function(i){if(!job.cachedPages.includes(i)){var wait=Math.max(0,nextRequestAt-Date.now());nextRequestAt=Math.max(Date.now(),nextRequestAt)+Math.max(0,Number(job.pageIntervalMs)||0);await delay(wait);}if(cancelled||paused||current!==s||s.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');return s.api.invoke('comic-translate-page',{jobId:job.jobId,pageIndex:i,targetLanguage:'id'},s.controller.signal);},
    delay:function(ms){return new Promise(function(resolve){var t=setTimeout(resolve,ms);s.controller.signal.addEventListener('abort',function(){clearTimeout(t);resolve();},{once:true});});},
    result:function(i,r){if(current!==s)return;s.results.set(i,r);s.failed.delete(i);if(!s.resultsShown){s.mode.value='id';s.resultsShown=true;render(s);}else renderPage(s,i);},
    progress:function(){if(!cancelled&&!paused)progress(s);},
    failed:function(i){if(current!==s)return;s.failed.add(i);renderPage(s,i);},
    pause:function(e){paused=e.message||'Layanan terjemahan sedang tidak tersedia.';status(s,paused+' '+s.results.size+' / '+s.pages.length+' halaman tersimpan. Tekan Translate All untuk melanjutkan.');}
   });
   if(current!==s)return;
   if(!paused)status(s,cancelled?'Dibatalkan. '+s.results.size+' / '+s.pages.length+' halaman tersimpan.':s.failed.size?'Beberapa halaman belum berhasil diterjemahkan. '+s.results.size+' / '+s.pages.length+' halaman siap.':'Selesai: '+s.results.size+' / '+s.pages.length+' halaman dalam Bahasa Indonesia.');
   if(s.results.size===s.pages.length){s.mode.value='id';render(s);}
  }catch(e){if(current===s&&e.name!=='AbortError')status(s,(e.message||'Layanan terjemahan sedang tidak tersedia.')+' Teks asli tetap bisa dibaca.');}
  finally{

   if(s.jobId&&s.api)await s.api.invoke('comic-translate-chapter',{action:'cancel',jobId:s.jobId}).catch(function(){});
   s.jobId=null;s.busy=false;if(current===s){s.start.disabled=!s.translationCompatible;s.cancel.hidden=true;s.retry.hidden=!s.translationCompatible||!s.failed.size;}
  }
 }
 document.addEventListener('nexora:comic-pages',function(event){
  stop(current);var d=event.detail,host=document.getElementById('mangaReaderPages');if(!host)return;
  var compatible=d.translationCompatible!==false,source=d.source||'mangadex',sourceLabel=source==='mangadex'?'MangaDex':source;
  var toolbar=node('div','nx-ct-toolbar'),mode=node('select'),startButton=node('button','','Translate All'),cancel=node('button','','Cancel'),retry=node('button','','Retry halaman gagal'),sfx=node('input'),message=node('p','nx-ct-status');
  mode.setAttribute('aria-label','Bahasa komik');[['original','Original']].concat(compatible?[['id','Indonesia']]:[]).forEach(function(pair){var o=node('option','',pair[1]);o.value=pair[0];mode.append(o);});
  var icon=node('i','fa-solid fa-language');icon.setAttribute('aria-hidden','true');startButton.prepend(icon,document.createTextNode(' '));
  [startButton,cancel,retry].forEach(function(b){b.type='button';});startButton.disabled=!compatible;startButton.title=compatible?'Terjemahkan semua halaman chapter':'Belum kompatibel dengan source ini';cancel.hidden=true;retry.hidden=true;sfx.type='checkbox';var label=node('label');label.append(sfx,document.createTextNode('Translate SFX'));label.hidden=!compatible;message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  toolbar.append(mode,startButton,cancel,retry,label,message);host.before(toolbar);
  var s=current={source:source,sourceLabel:sourceLabel,translationCompatible:compatible,mangaId:d.mangaId,chapterId:d.chapterId,host:host,toolbar:toolbar,pages:[],results:new Map(),failed:new Set(),mode:mode,sfx:sfx,start:startButton,cancel:cancel,retry:retry,status:message,control:{},controller:new AbortController(),busy:false};
  if(!compatible)message.textContent='Translate All belum kompatibel untuk '+sourceLabel+'. Mode Original tetap tersedia.';
  Array.from(host.querySelectorAll(':scope > img')).forEach(function(img,i){
   var wrap=node('div','nx-ct-page'),plane=node('div','nx-ct-overlay'),note=node('small','nx-ct-page-note'),container=node('div');
   note.hidden=true;container.style.position='relative';img.replaceWith(wrap);container.append(img,plane);wrap.append(container,note);
   s.pages.push({img:img,wrap:wrap,layer:plane,note:note,visible:false});img.addEventListener('load',function(){renderPage(s,i);});
  });
  s.observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){var i=s.pages.findIndex(function(p){return p.wrap===entry.target;});if(i>=0){s.pages[i].visible=entry.isIntersecting;renderPage(s,i);}});},{rootMargin:'500px 0px'});s.pages.forEach(function(p){s.observer.observe(p.wrap);});
  s.resize=new ResizeObserver(function(){render(s);});s.pages.forEach(function(p){s.resize.observe(p.img);});
  s.timer=setInterval(function(){if(!host.isConnected&&current===s){stop(s);current=null;}},1000);
  mode.onchange=function(){render(s);if(mode.value==='id'&&!s.results.size)status(s,'Tekan Translate All untuk mulai menerjemahkan chapter.');};sfx.onchange=function(){s.sfxTouched=true;render(s);};startButton.onclick=retry.onclick=function(){start(s);};
 });
 document.addEventListener('nexora:comic-loading',function(){stop(current);current=null;});
 window.addEventListener('pagehide',function(){stop(current);current=null;});
 window.NexoraComicTranslation={fit:fit};
})();

/* Nexora Comic Reader Standalone Engine v1
   No Base64, no srcdoc, no API postMessage bridge.
   CANONICAL FILE: accidental replacement is blocked by scripts/check-project.js. */

(function(){
'use strict';

const SOURCE_API = '/api/comics';
const MD_API = 'https://api.mangadex.org';
const SOURCE_IMAGE_PROXY = '';
const FAVORITES_KEY = 'nx_manga_favorites_v1';
const HISTORY_KEY = 'nx_manga_history_v1';

const state = {
  view:'home',
  tab:'latest',
  category:'all',
  statusFilter:'all',
  selectedLang:'',
  availableLanguages:[],
  query:'',
  page:1,
  hasMore:true,
  loading:false,
  mangaId:null,
  mangaData:null,
  chapters:[],
  chapterIndex:-1,
  readerQuality:'saver',
  sourceMode:'auto',
  source:'mangadex',
  sourceRegistry:[],
  sourceHealth:{},
  sourceMatches:[],
  searchController:null,
  searchItems:new Map(),
  capabilities:null,
  listGeneration:0,
  detailScrollY:0,
  restoreDetailScrollPending:false
};

function $(id){return document.getElementById(id)}
function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function toast(message){
  const item=document.createElement('div');
  item.className='toast';
  item.textContent=message;
  $('toastWrap').appendChild(item);
  setTimeout(()=>item.remove(),3200);
}
async function fetchJson(url,timeoutMs=20000,externalSignal){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(externalSignal){if(externalSignal.aborted)controller.abort();else externalSignal.addEventListener('abort',abort,{once:true});}
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!res.ok){const error=new Error('HTTP '+res.status);error.status=res.status;error.retryAfter=res.headers&&res.headers.get?res.headers.get('retry-after'):'';throw error;}
    return await res.json();
  }finally{clearTimeout(timer);if(externalSignal)externalSignal.removeEventListener('abort',abort)}
}
function storageGet(key){
  try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return[]}
}
function storageSet(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}
}
function chooseText(object,preferred){
  if(!object||typeof object!=='object') return '';
  for(const key of preferred){
    if(typeof object[key]==='string'&&object[key].trim()) return object[key].trim();
  }
  const first=Object.values(object).find(v=>typeof v==='string'&&v.trim());
  return first||'';
}
function typeFromLanguage(lang){
  if(lang==='ja') return 'Manga';
  if(lang==='ko') return 'Manhwa';
  if(lang==='zh'||lang==='zh-hk') return 'Manhua';
  return 'Komik';
}
function statusLabel(status){
  const map={ongoing:'Ongoing',completed:'Tamat',cancelled:'Dibatalkan',hiatus:'Hiatus'};
  return map[status]||status||'-';
}
function coverFromManga(item,size=512){
  const rel=(item.relationships||[]).find(r=>r.type==='cover_art');
  const file=rel&&rel.attributes&&rel.attributes.fileName;
  return file ? `https://uploads.mangadex.org/covers/${item.id}/${file}.${size}.jpg` : '';
}
function authorFromManga(item){
  const rel=(item.relationships||[]).find(r=>r.type==='author');
  return rel&&rel.attributes&&rel.attributes.name ? rel.attributes.name : null;
}
function directItem(item){
  const a=item.attributes||{};
  return {
    id:item.id,
    title:chooseText(a.title,['id','en','ja-ro','ja']),
    cover:coverFromManga(item,512),
    type:typeFromLanguage(a.originalLanguage),
    realStatus:String(a.status||'').toLowerCase()
  };
}
function sourceImageUrl(raw){
  return raw || '';
}
function mangaCoverImgHtml(rawUrl){
  if(!rawUrl) return '<div class="manga-cover-wrap cover-broken"></div>';
  const raw=escapeHtml(rawUrl).replace(/'/g,'&#39;');
  const src=escapeHtml(sourceImageUrl(rawUrl));
  return `<img src="${src}" loading="lazy" decoding="async" alt="cover" referrerpolicy="no-referrer" data-raw="${raw}" data-fallback-stage="0" onerror="mangaCoverFallback(this)">`;
}
window.mangaCoverFallback=function(img){
  const stage=Number(img.dataset.fallbackStage||0);
  const raw=img.dataset.raw||'';
  if(stage===0&&raw){
    img.dataset.fallbackStage='1';
    img.src=raw+(raw.includes('?')?'&':'?')+'retry='+Date.now();
  }else{
    if(img.parentElement) img.parentElement.classList.add('cover-broken');
    img.remove();
  }
};


function sourceKey(id,source){return (source||state.source||'mangadex')+':'+String(id||'')}
function sourceDefinition(id){return state.sourceRegistry.find(row=>row.id===id)||null}
function sourceLabel(id){const row=sourceDefinition(id);return row?row.label:(id==='all'?'All Sources':id)}
function sourceCapabilities(id){const row=sourceDefinition(id);return row&&row.capabilities?row.capabilities:{};}
function itemType(item){return item&&item.metadata&&item.metadata.mediaType||typeFromLanguage(item&&item.language)||'Komik'}
function updateSourceHealth(id,health){if(!id||id==='all')return;state.sourceHealth[id]={...(state.sourceHealth[id]||{}),...health};renderSourceHealth()}
function healthLabel(row){if(!row||row.status==='unchecked')return'Belum dicek';if(row.status==='active')return'Online';if(row.status==='degraded')return'Degraded';return'Unavailable'}
function renderSourceHealth(){
  const node=$('comicSourceHealth');if(!node)return;
  const id=state.source==='all'?'mangadex':state.source;const row=state.sourceHealth[id]||sourceDefinition(id)?.health||{status:'unchecked'};
  const label=healthLabel(row);
  node.className='source-health is-'+String(row.status||'unchecked');
  node.dataset.shortStatus=label;
  node.innerHTML='<i></i><span>'+escapeHtml(sourceLabel(id))+' · '+escapeHtml(label)+'</span>';
}
function updateAttribution(){
  const row=sourceDefinition(state.source);const host=$('mangaAttributionText');if(!host)return;
  if(state.source==='all'){host.textContent='Pencarian paralel memakai source yang dipilih secara on-demand. Hak karya tetap milik kreator dan penerbit masing-masing.';return;}
  const label=row?row.label:sourceLabel(state.source);host.innerHTML='Source: <strong>'+escapeHtml(label)+'</strong>. Hak karya milik kreator/penerbit; Nexora hanya mengambil data on-demand.';
}
function renderSourceSelector(){
  const select=$('comicSourceSelect');if(!select)return;
  const options=[{id:'mangadex',label:'MangaDex'},...state.sourceRegistry.filter(row=>row.id!=='mangadex').map(row=>({id:row.id,label:row.label})),{id:'all',label:'All Sources'}];
  const seen=new Set();select.innerHTML=options.filter(row=>!seen.has(row.id)&&seen.add(row.id)).map(row=>'<option value="'+escapeHtml(row.id)+'" '+(row.id===state.source?'selected':'')+'>'+escapeHtml(row.label)+'</option>').join('');
  renderSourceHealth();updateAttribution();
}
async function loadSourceRegistry(){
  try{
    const json=await fetchJson(SOURCE_API+'?action=sources',10000);
    if(Array.isArray(json.sources)&&json.sources.length){state.sourceRegistry=json.sources;json.sources.forEach(row=>{if(row.health)state.sourceHealth[row.id]=row.health});}
  }catch(error){state.sourceRegistry=[{id:'mangadex',label:'MangaDex',capabilities:{search:true,detail:true,chapters:true,pages:true,languageFilter:true,pagination:true,translationCompatible:true},health:{status:'unchecked'}}];}
  renderSourceSelector();
}

function setComicView(view){
  state.view=view;
  document.body.classList.toggle('home-mode',view==='home');
  document.body.classList.toggle('detail-mode',view==='detail');
  document.body.classList.toggle('reader-mode',view==='reader');
  if(window.parent&&window.parent!==window){
    try{window.parent.postMessage({type:'nx-comic-view',view},location.origin)}catch(ignore){}
  }
}
function cleanReaderMeta(value){
  return String(value==null?'':value)
    .replace(/(?:^|[·|—-])\s*(?:no[- ]?group|unknown group|null|undefined)\s*$/ig,'')
    .replace(/\s*[·|—-]\s*$/g,'').replace(/\s{2,}/g,' ').trim();
}
function formatReaderChapterTitle(chapter){
  const item=chapter||{};
  const explicit=cleanReaderMeta(item.title||(item.metadata&&item.metadata.title)||'');
  if(explicit&&!/^(?:no[- ]?group|unknown group|null|undefined)$/i.test(explicit))return explicit;
  const extra=cleanReaderMeta(String(item.extra||'').replace(/^\s*[—-]\s*/,''));
  if(extra&&!/^(?:no[- ]?group|unknown group|null|undefined)$/i.test(extra))return extra;
  const number=item.number;
  if(number!==null&&number!==undefined&&String(number).trim()!==''&&String(number).trim()!=='?')return 'Chapter '+String(number).trim();
  const name=cleanReaderMeta(item.name||'');
  if(name&&!/^(?:no[- ]?group|unknown group|null|undefined)$/i.test(name))return name;
  return 'Chapter';
}
function mangaSkeletonHtml(count=6){
  return '<div class="manga-skeleton-grid" aria-label="Memuat komik">'+Array.from({length:count},()=>'<div class="manga-skeleton"></div>').join('')+'</div>';
}
function detailSkeletonHtml(){
  return '<div class="detail-skeleton" aria-label="Memuat detail"><div class="detail-skeleton-cover"></div><div class="detail-skeleton-copy"><div class="detail-skeleton-line"></div><div class="detail-skeleton-line short"></div><div class="detail-skeleton-line tiny"></div></div></div>';
}
function updateFilterButton(){
  const count=Number(state.category!=='all')+Number(state.statusFilter!=='all');
  const badge=$('mangaFilterCount');if(badge){badge.hidden=!count;badge.textContent=String(count)}
  const button=$('mangaFilterBtn');if(button)button.classList.toggle('active',count>0);
}
let sheetReturnFocus=null;
let sheetHistoryPushed=false;
function closeComicSheet(fromPop=false){
  const backdrop=$('comicSheetBackdrop');if(!backdrop||backdrop.hidden)return;
  backdrop.hidden=true;document.body.classList.remove('sheet-open');
  if(sheetHistoryPushed&&!fromPop){sheetHistoryPushed=false;history.back();}
  else if(fromPop)sheetHistoryPushed=false;
  const target=sheetReturnFocus;sheetReturnFocus=null;if(target&&target.focus)requestAnimationFrame(()=>target.focus());
}
function openComicSheet(title,bodyHtml,actionsHtml=''){
  const backdrop=$('comicSheetBackdrop'),sheet=$('comicBottomSheet');if(!backdrop||!sheet)return;
  sheetReturnFocus=document.activeElement;
  $('comicSheetTitle').textContent=title;$('comicSheetBody').innerHTML=bodyHtml;
  const actions=$('comicSheetActions');actions.innerHTML=actionsHtml;actions.hidden=!actionsHtml;
  backdrop.hidden=false;document.body.classList.add('sheet-open');
  if(!sheetHistoryPushed){history.pushState({nxComicSheet:true},'');sheetHistoryPushed=true;}
  requestAnimationFrame(()=>sheet.focus());
}
function filterOption(kind,value,label,current){
  return '<button class="sheet-option '+(value===current?'is-selected':'')+'" type="button" data-filter-kind="'+kind+'" data-filter-value="'+escapeHtml(value)+'"><span>'+escapeHtml(label)+'</span><i class="fa-solid '+(value===current?'fa-circle-check':'fa-circle')+'"></i></button>';
}
function openFilterSheet(){
  let draftCategory=state.category,draftStatus=state.statusFilter;
  const render=()=>{
    $('comicSheetBody').innerHTML='<div class="sheet-section"><div class="sheet-label">Tipe</div><div class="sheet-options">'+[
      ['all','Semua'],['manga','Manga'],['manhwa','Manhwa'],['manhua','Manhua']
    ].map(row=>filterOption('category',row[0],row[1],draftCategory)).join('')+'</div></div><div class="sheet-section"><div class="sheet-label">Status</div><div class="sheet-options">'+[
      ['all','Semua'],['ongoing','Ongoing'],['tamat','Tamat']
    ].map(row=>filterOption('status',row[0],row[1],draftStatus)).join('')+'</div></div>';
    $('comicSheetBody').querySelectorAll('[data-filter-kind]').forEach(button=>button.onclick=()=>{if(button.dataset.filterKind==='category')draftCategory=button.dataset.filterValue;else draftStatus=button.dataset.filterValue;render();});
  };
  openComicSheet('Filter komik','', '<button type="button" id="sheetFilterReset">Reset</button><button class="primary" type="button" id="sheetFilterApply">Terapkan</button>');
  render();
  $('sheetFilterReset').onclick=()=>{draftCategory='all';draftStatus='all';render()};
  $('sheetFilterApply').onclick=()=>{state.category=draftCategory;state.statusFilter=draftStatus;document.querySelectorAll('#mangaCategoryTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));document.querySelectorAll('#mangaStatusTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.status===state.statusFilter));updateFilterButton();closeComicSheet();mangaShowHome(true)};
}
function providerSheetRow(id,current,enabled=true){
  const health=state.sourceHealth[id]||sourceDefinition(id)?.health||{status:'unchecked'};
  const status=healthLabel(health),isCurrent=id===current;
  return '<button class="sheet-provider is-'+escapeHtml(health.status||'unchecked')+(isCurrent?' is-current':'')+'" type="button" data-source="'+escapeHtml(id)+'" '+(enabled?'':'disabled')+'><i></i><b>'+(isCurrent?'<span class="provider-check">✓</span> ':'')+escapeHtml(sourceLabel(id))+'</b><small>'+escapeHtml(status)+(enabled?'':' · Mapping belum tersedia')+'</small></button>';
}
function openReaderSourceSheet(){
  const current=state.mangaData&&state.mangaData.source||state.source;
  const mapped=new Set([current,...state.sourceMatches.map(row=>row.source)]);
  const ids=state.sourceRegistry.map(row=>row.id).filter(id=>id&&id!=='all');if(!ids.includes(current))ids.unshift(current);
  openComicSheet('Sumber','<div class="sheet-provider-list">'+ids.map(id=>providerSheetRow(id,current,mapped.has(id))).join('')+'</div><p class="sheet-note">Source hanya dapat dipindah jika mapping manga sudah tervalidasi.</p>');
  $('comicSheetBody').querySelectorAll('[data-source]:not([disabled])').forEach(button=>button.onclick=()=>{const source=button.dataset.source;closeComicSheet();mangaSwitchReaderSource(source)});
}
function openReaderChapterSheet(){
  const render=(query='')=>{
    const q=String(query||'').toLowerCase().trim();
    const rows=state.chapters.map((chapter,index)=>({chapter,index,title:formatReaderChapterTitle(chapter)})).filter(row=>!q||row.title.toLowerCase().includes(q));
    $('comicSheetBody').innerHTML='<label class="sheet-search"><i class="fa-solid fa-magnifying-glass"></i><input id="readerChapterSearch" type="search" placeholder="Cari chapter" aria-label="Cari chapter" value="'+escapeHtml(query)+'"></label><div class="chapter-sheet-list">'+rows.map(row=>'<button class="chapter-sheet-item '+(row.index===state.chapterIndex?'is-current':'')+'" type="button" data-chapter-index="'+row.index+'"><span>'+escapeHtml(row.title)+'</span>'+(row.index===state.chapterIndex?'<i class="fa-solid fa-check"></i>':'')+'</button>').join('')+'</div>';
    const input=$('readerChapterSearch');if(input){input.oninput=()=>render(input.value);requestAnimationFrame(()=>{const next=$('readerChapterSearch');if(next){next.focus();next.setSelectionRange(next.value.length,next.value.length)}})}
    $('comicSheetBody').querySelectorAll('[data-chapter-index]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.chapterIndex);closeComicSheet();if(Number.isInteger(index))mangaOpenReader(index)});
  };
  openComicSheet('Chapter List','');render('');
}
function openReaderSettingsSheet(){
  const active=state.readerQuality;
  openComicSheet('Reading Settings','<div class="sheet-section"><div class="sheet-label">Kualitas gambar</div><div class="sheet-setting-row"><button type="button" data-quality="saver" class="'+(active==='saver'?'active':'')+'">Hemat</button><button type="button" data-quality="full" class="'+(active==='full'?'active':'')+'">Original / HD</button></div></div><div class="sheet-section"><div class="sheet-option is-selected reader-fit-status"><span><i class="fa-solid fa-arrows-left-right-to-line"></i> Fit Width</span><i class="fa-solid fa-check"></i></div></div>');
  $('comicSheetBody').querySelectorAll('[data-quality]').forEach(button=>button.onclick=()=>{closeComicSheet();changeReaderQuality(button.dataset.quality)});
}
function readerTranslationControls(){
  const toolbar=document.querySelector('.nx-ct-toolbar');if(!toolbar)return null;
  const secondary=[...toolbar.querySelectorAll('.nx-ct-secondary')];
  return{
    toolbar,
    mode:toolbar.querySelector('select'),
    start:toolbar.querySelector('.nx-ct-primary'),
    cancel:secondary.find(button=>/^Cancel$/i.test(button.textContent.trim()))||null,
    retry:secondary.find(button=>/^Retry/i.test(button.textContent.trim()))||null,
    status:toolbar.querySelector('.nx-ct-status')
  };
}
function readerTranslationSection(current){
  const tx=readerTranslationControls();const capabilities=state.capabilities||sourceCapabilities(current);
  const compatible=tx?!tx.toolbar.classList.contains('is-unavailable'):capabilities.translationCompatible!==false;
  if(!compatible)return '<div class="sheet-section"><div class="sheet-label">TRANSLATION</div><p class="sheet-note">Not available for <strong>'+escapeHtml(sourceLabel(current))+'</strong>.</p></div>';
  if(!tx)return '<div class="sheet-section"><div class="sheet-label">TRANSLATION</div><p class="sheet-note">Translation controls sedang dimuat.</p></div>';
  const mode=tx.mode&&tx.mode.value==='id'?'id':'original';
  const busy=!!(tx.cancel&&!tx.cancel.hidden);const canRetry=!!(tx.retry&&!tx.retry.hidden);
  const statusText=tx.status&&!tx.status.hidden?tx.status.textContent.trim():'';
  return '<div class="sheet-section"><div class="sheet-label">TRANSLATION</div>'+
    '<div class="sheet-label reader-translation-mode-label">Mode</div><div class="sheet-setting-row">'+
      '<button type="button" data-translation-mode="original" class="'+(mode==='original'?'active':'')+'">Original</button>'+
      '<button type="button" data-translation-mode="id" class="'+(mode==='id'?'active':'')+'">Indonesia</button></div>'+
    (busy?'<button class="sheet-option" type="button" data-translation-action="cancel"><span><i class="fa-solid fa-stop"></i> Cancel Translation</span><i class="fa-solid fa-chevron-right"></i></button>':'<button class="sheet-option" type="button" data-translation-action="start"><span><i class="fa-solid fa-language"></i> Translate All</span><i class="fa-solid fa-chevron-right"></i></button>')+
    (canRetry?'<button class="sheet-option" type="button" data-translation-action="retry"><span><i class="fa-solid fa-rotate-right"></i> Retry Failed Pages</span><i class="fa-solid fa-chevron-right"></i></button>':'')+
    (statusText?'<p class="sheet-note reader-translation-status">'+escapeHtml(statusText)+'</p>':'')+'</div>';
}
function openReaderMoreSheet(){
  const current=state.mangaData&&state.mangaData.source||state.source;
  const failed=document.querySelectorAll('#mangaReaderPages img.page-failed').length;
  openComicSheet('Reader Menu','<div class="sheet-section"><div class="sheet-label">READING</div><div class="reader-menu-list">'+
    '<button class="sheet-option" type="button" data-reader-action="source"><span><i class="fa-solid fa-layer-group"></i> Source</span><small>'+escapeHtml(sourceLabel(current))+'</small></button>'+
    '<button class="sheet-option" type="button" data-reader-action="chapters"><span><i class="fa-solid fa-list"></i> Chapter List</span><i class="fa-solid fa-chevron-right"></i></button>'+
    '<button class="sheet-option" type="button" data-reader-action="settings"><span><i class="fa-solid fa-sliders"></i> Reading Quality</span><small>'+(state.readerQuality==='full'?'Original / HD':'Hemat')+'</small></button>'+
    '<button class="sheet-option" type="button" data-reader-action="reload" '+(failed?'':'disabled')+'><span><i class="fa-solid fa-rotate-right"></i> Reload Failed Images</span><small>'+(failed?failed+' gagal':'Tidak ada gagal')+'</small></button>'+
    '<button class="sheet-option" type="button" data-reader-action="home"><span><i class="fa-solid fa-house"></i> Comic Home</span><i class="fa-solid fa-chevron-right"></i></button></div></div>'+readerTranslationSection(current));
  const body=$('comicSheetBody');
  body.querySelectorAll('[data-reader-action]').forEach(button=>button.onclick=()=>{
    const action=button.dataset.readerAction;
    if(action==='source')openReaderSourceSheet();else if(action==='chapters')openReaderChapterSheet();else if(action==='settings')openReaderSettingsSheet();else if(action==='reload'){closeComicSheet();mangaRetryFailedPages();}else if(action==='home'){closeComicSheet();mangaShowHome(true);}
  });
  body.querySelectorAll('[data-translation-mode]').forEach(button=>button.onclick=()=>{
    const tx=readerTranslationControls();if(!tx||!tx.mode)return;
    tx.mode.value=button.dataset.translationMode;tx.mode.dispatchEvent(new Event('change',{bubbles:true}));openReaderMoreSheet();
  });
  body.querySelectorAll('[data-translation-action]').forEach(button=>button.onclick=()=>{
    const tx=readerTranslationControls();if(!tx)return;
    const action=button.dataset.translationAction;const target=action==='start'?tx.start:action==='cancel'?tx.cancel:action==='retry'?tx.retry:null;
    if(target&&!target.disabled){target.click();closeComicSheet();}
  });
}
function openTranslationInfo(sourceLabelText){
  openComicSheet('Tentang terjemahan','<p class="sheet-note">Translate All belum tersedia untuk <strong>'+escapeHtml(sourceLabelText||sourceLabel(state.source))+'</strong>. Mode Original tetap tersedia dan reader tidak mengaktifkan terjemahan sebelum kompatibilitas provider diverifikasi.</p>');
}
window.NexoraComicUI={openFilter:openFilterSheet,openReaderSource:openReaderSourceSheet,openReaderSettings:openReaderSettingsSheet,openReaderChapter:openReaderChapterSheet,openReaderMore:openReaderMoreSheet,openTranslationInfo,closeSheet:closeComicSheet};
function setSearchProgress(rows){const host=$('comicSourceProgress');if(!host)return;if(!rows||!rows.length){host.hidden=true;host.innerHTML='';return;}host.hidden=false;host.innerHTML=rows.map(row=>'<span class="source-progress is-'+escapeHtml(row.state)+'"><i></i>'+escapeHtml(sourceLabel(row.id))+' '+escapeHtml(row.state)+'</span>').join('');}
async function runBounded(items,limit,worker,onState){
  const width=Math.max(1,Math.min(3,Number(limit)||1));const results=[];
  for(let start=0;start<items.length;start+=width){
    const batch=items.slice(start,start+width);batch.forEach(item=>onState&&onState(item,'loading'));
    const settled=await Promise.allSettled(batch.map((item,index)=>worker(item,start+index)));
    settled.forEach((row,index)=>{const item=batch[index];onState&&onState(item,row.status==='fulfilled'?'complete':(row.reason&&row.reason.name==='AbortError'?'cancelled':'failed'));results.push(row)});
  }
  return results;
}
async function searchOneSource(source,query,signal,limit=24){
  const params=new URLSearchParams({action:'search',source,q:query,page:'1',limit:String(Math.min(50,limit))});
  const json=await sourceCall(params,12000,signal,source);return Array.isArray(json.items)?json.items:[];
}
async function allSourceSearch(query,signal){
  const providers=state.sourceRegistry.filter(row=>row.capabilities&&row.capabilities.search).map(row=>row.id);const progress=providers.map(id=>({id,state:'queued'}));setSearchProgress(progress);
  const results=await runBounded(providers,2,source=>searchOneSource(source,query,signal,18),(id,next)=>{const row=progress.find(item=>item.id===id);if(row)row.state=next;setSearchProgress(progress)});
  const items=[];results.forEach((row,index)=>{if(row.status==='fulfilled')items.push(...row.value.map(item=>({...item,source:item.source||providers[index]})));});
  return{items,hasMore:false};
}
async function sourceCall(params,timeout=18000,signal,explicitSource){
  const source=explicitSource||params.get('source')||state.source||'mangadex';if(source!=='all'&&!params.has('source'))params.set('source',source);
  const url=SOURCE_API+'?'+params.toString();const started=performance.now();
  try{
    const json=await fetchJson(url,timeout,signal);
    if(!json||json.success===false){const e=new Error((json&&json.message)||'API sumber gagal');e.status=json&&json.status;throw e;}
    state.sourceMode='source';updateSourceHealth(source,{status:'active',latency:Math.max(1,Math.round(performance.now()-started)),lastCheckedAt:new Date().toISOString(),consecutiveFailures:0});
    const statusBadge=document.getElementById('nxComicApiHealth');
    if(statusBadge){statusBadge.className='ok';statusBadge.innerHTML='<i></i><span>Nexora Comic API aktif</span>';}
    return json;
  }catch(error){
    if(error&&error.name!=='AbortError'){
      const code=Number(error.status||0);if(!code||code===429||code>=500){const previous=state.sourceHealth[source]||{};const failures=Number(previous.consecutiveFailures||0)+1;updateSourceHealth(source,{status:failures>=3?'unavailable':'degraded',lastCheckedAt:new Date().toISOString(),consecutiveFailures:failures});}
    }
    throw error;
  }
}

function appendMany(params,key,values){
  values.forEach(value=>params.append(key,value));
}

async function directList({query,category,page}){
  const limit=24;
  const params=new URLSearchParams();
  params.set('limit',String(limit));
  params.set('offset',String((page-1)*limit));
  params.append('includes[]','cover_art');
  params.append('contentRating[]','safe');
  params.append('contentRating[]','suggestive');
  params.append('contentRating[]','erotica');
  params.set('hasAvailableChapters','true');

  if(query){
    params.set('title',query);
    params.set('order[relevance]','desc');
  }else if(state.tab==='popular'){
    params.set('order[followedCount]','desc');
  }else{
    params.set('order[latestUploadedChapter]','desc');
  }

  const languageMap={manga:['ja'],manhwa:['ko'],manhua:['zh','zh-hk']};
  if(category!=='all'&&languageMap[category]){
    appendMany(params,'originalLanguage[]',languageMap[category]);
  }

  if(state.statusFilter==='ongoing'){
    appendMany(params,'status[]',['ongoing','hiatus']);
  }else if(state.statusFilter==='tamat'){
    appendMany(params,'status[]',['completed','cancelled']);
  }

  const json=await fetchJson(MD_API+'/manga?'+params.toString(),20000);
  state.sourceMode='direct';
  return {
    items:(json.data||[]).map(directItem),
    hasMore:Number(json.offset||0)+Number(json.limit||limit)<Number(json.total||0)
  };
}

async function sourceList(args){
  if(state.source==='all'){
    if(!args.query)return{items:[],hasMore:false,needsQuery:true};
    return allSourceSearch(args.query,args.signal);
  }
  const params=new URLSearchParams();params.set('source',state.source);
  if(args.query){params.set('action','search');params.set('q',args.query)}
  else{params.set('action','list');params.set('tab',state.tab==='popular'?'popular':'latest');params.set('page',String(args.page));}
  params.set('limit','24');if(args.category&&args.category!=='all'&&state.source==='mangadex')params.set('type',args.category);
  const json=await sourceCall(params,15000,args.signal,state.source);
  let items=(json.items||[]).map(m=>({...m,source:m.source||state.source,cover:m.coverUrl||'',type:itemType(m),realStatus:String(m.status||'').toLowerCase()}));
  if(state.statusFilter!=='all'){
    const ended=state.statusFilter==='tamat';items=items.filter(m=>!m.realStatus||(ended?['completed','cancelled','tamat'].includes(m.realStatus):['ongoing','hiatus'].includes(m.realStatus)));
  }
  return{items,hasMore:!args.query&&!!json.hasMore};
}
async function fetchList(args){return sourceList(args);}

async function directDetail(id){
  const params=new URLSearchParams();
  params.append('includes[]','cover_art');
  params.append('includes[]','author');
  params.append('includes[]','artist');
  const json=await fetchJson(MD_API+'/manga/'+encodeURIComponent(id)+'?'+params.toString(),20000);
  const item=json.data;
  if(!item) throw new Error('Detail komik kosong');
  const a=item.attributes||{};
  return{
    id,
    title:chooseText(a.title,['id','en','ja-ro','ja']),
    cover:coverFromManga(item,512),
    type:typeFromLanguage(a.originalLanguage),
    desc:chooseText(a.description,['id','en'])||'Belum ada sinopsis untuk komik ini.',
    status:statusLabel(a.status),
    realStatus:a.status||'',
    year:a.year||'-',
    author:authorFromManga(item),
    tags:(a.tags||[]).map(t=>chooseText((t.attributes||{}).name,['id','en'])).filter(Boolean)
  };
}
async function sourceDetail(id,hint){
  const source=hint&&hint.source||state.source;const params=new URLSearchParams({action:'detail',source,id});
  if(hint&&hint.slug)params.set('slug',hint.slug);if(hint&&hint.title)params.set('title',hint.title);
  const json=await sourceCall(params,20000,null,source);const d=json.data||{};
  return{...d,id:d.id||id,source:d.source||source,cover:d.coverUrl||(hint&&((hint.coverUrl)||(hint.cover)))||'',type:itemType(d),desc:d.description||'Belum ada sinopsis untuk komik ini.',tags:d.genres||[],author:(d.authors||[])[0]||null,year:d.metadata&&d.metadata.year||'-',realStatus:d.status||'',capabilities:json.capabilities||sourceCapabilities(source)};
}
async function getDetail(id,hint){return sourceDetail(id,hint);}

async function directChapters(detail){
  let all=[];
  let offset=0;
  const limit=100;
  for(let round=0;round<5;round++){
    const params=new URLSearchParams();
    params.set('limit',String(limit));
    params.set('offset',String(offset));
    params.set('order[publishAt]','desc');
    params.set('includeFutureUpdates','0');
    params.append('contentRating[]','safe');
    params.append('contentRating[]','suggestive');
    params.append('contentRating[]','erotica');
    const json=await fetchJson(MD_API+'/manga/'+encodeURIComponent(detail.id)+'/feed?'+params.toString(),24000);
    const batch=json.data||[];
    all=all.concat(batch);
    offset+=batch.length;
    if(batch.length<limit||offset>=Number(json.total||0)) break;
  }
  state.availableLanguages=[...new Set(all.map(c=>c.attributes&&c.attributes.translatedLanguage).filter(Boolean))].sort();
  let filtered=state.selectedLang?all.filter(c=>c.attributes&&c.attributes.translatedLanguage===state.selectedLang):all;

  const seen=new Set();
  filtered=filtered.filter(c=>{
    const a=c.attributes||{};
    const key=[a.translatedLanguage,a.chapter,a.title,a.volume].join('|');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return filtered.map(c=>{
    const a=c.attributes||{};
    const number=a.chapter||'?';
    const title=a.title?` — ${a.title}`:'';
    return{
      id:c.id,
      name:`Chapter ${number}`,
      extra:title,
      lang:a.translatedLanguage||'',
      date:a.publishAt?new Date(a.publishAt).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):''
    };
  });
}
async function sourceChapters(detail){
  const params=new URLSearchParams({action:'chapters',source:detail.source||state.source,id:detail.id});if(state.selectedLang)params.set('lang',state.selectedLang);
  const json=await sourceCall(params,22000,null,detail.source||state.source);state.availableLanguages=json.languages||[];
  return(json.data||[]).map(c=>({
    ...c,id:c.id,source:c.source||detail.source||state.source,
    name:c.metadata&&c.metadata.displayName||('Chapter '+(c.number==null?'?':c.number)),
    extra:c.metadata&&c.metadata.displayExtra||(c.title?' — '+c.title:'')+(c.group?' · '+c.group:''),
    lang:c.language||'',date:c.metadata&&c.metadata.displayDate||(c.publishedAt?new Date(c.publishedAt).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'')
  }));
}
async function getChapters(detail){return sourceChapters(detail);}

async function directPages(chapter){
  const json=await fetchJson(MD_API+'/at-home/server/'+encodeURIComponent(chapter.id),22000);
  const base=json.baseUrl;
  const data=json.chapter||{};
  const saver=data.dataSaver||[];
  const full=data.data||[];
  const useFull=state.readerQuality==='full'&&full.length;
  const files=useFull?full:saver.length?saver:full;
  const folder=useFull?'data':'data-saver';
  if(!base||!data.hash||!files.length) throw new Error('Halaman chapter kosong');
  return files.map(file=>`${base}/${folder}/${data.hash}/${file}`);
}
async function sourcePages(chapter){
  const source=chapter.source||state.mangaData&&state.mangaData.source||state.source;const params=new URLSearchParams({action:'pages',source,id:chapter.id,quality:state.readerQuality});
  if(state.mangaId)params.set('mangaId',state.mangaId);const json=await sourceCall(params,22000,null,source);const pages=json.data&&json.data.pages||[];
  const images=pages.length?pages.map(page=>page.url):(json.data&&json.data.image||[]);if(!images.length)throw new Error('Halaman chapter kosong');return images;
}
async function getPages(chapter){return sourcePages(chapter);}

function getFavorites(){return storageGet(FAVORITES_KEY)}
function isFavorite(id,source){return getFavorites().some(item=>sourceKey(item.id,item.source||'mangadex')===sourceKey(id,source||state.source))}
function toggleFavorite(item){
  let favs=getFavorites();const key=sourceKey(item.id,item.source||state.source);
  if(favs.some(f=>sourceKey(f.id,f.source||'mangadex')===key)) favs=favs.filter(f=>sourceKey(f.id,f.source||'mangadex')!==key);
  else{const top=state.chapters&&state.chapters[0]?state.chapters[0].id:null;favs.unshift({id:item.id,source:item.source||state.source,title:item.title,cover:item.cover,type:item.type||'Komik',slug:item.slug||null,lastSeenChapterId:top});}
  storageSet(FAVORITES_KEY,favs);return isFavorite(item.id,item.source||state.source);
}
function getHistory(){return storageGet(HISTORY_KEY)}
function addHistory(item,chapter){
  let history=getHistory().filter(h=>sourceKey(h.id,h.source||'mangadex')!==sourceKey(item.id,item.source||state.source));
  history.unshift({
    id:item.id,source:item.source||state.source,title:item.title,cover:item.cover,type:item.type||'Komik',slug:item.slug||null,
    lastChapterId:chapter&&chapter.id,lastChapterName:chapter&&chapter.name,time:Date.now()
  });
  storageSet(HISTORY_KEY,history.slice(0,60));
  if(chapter){
    const favs=getFavorites();
    const index=favs.findIndex(f=>sourceKey(f.id,f.source||'mangadex')===sourceKey(item.id,item.source||state.source));
    if(index>=0){favs[index].lastSeenChapterId=chapter.id;storageSet(FAVORITES_KEY,favs)}
  }
}
function closeComic(){
  parent.postMessage({type:'nx-close-comic-reader'},'*');
}
function restoreDetailScrollPosition(attempt=0){
  if(!state.restoreDetailScrollPending)return;
  if(state.view!=='detail'){state.restoreDetailScrollPending=false;return;}
  const list=$('mangaChapterList');
  if((!list||list.querySelector('.loading'))&&attempt<80){
    setTimeout(()=>restoreDetailScrollPosition(attempt+1),75);
    return;
  }
  state.restoreDetailScrollPending=false;
  const top=Math.max(0,Number(state.detailScrollY)||0);
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top,behavior:'auto'})));
}
function mangaBackFromReader(){
  const manga=state.mangaData;
  const id=state.mangaId||(manga&&manga.id);
  const source=(manga&&manga.source)||state.source;
  if(id){
    state.restoreDetailScrollPending=true;
    mangaOpenDetail(id,source,manga||null);
    restoreDetailScrollPosition();
    return;
  }
  state.restoreDetailScrollPending=false;
  mangaShowHome(false);
}
function mangaGoBack(){
  if(state.view==='reader') mangaBackFromReader();
  else if(state.view==='detail') mangaShowHome(true);
  else closeComic();
}
function mangaSwitchTab(tab){
  state.tab=tab;state.query='';$('mangaSearchInput').value='';
  document.querySelectorAll('#mangaTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  mangaShowHome(true);
}
function mangaSwitchCategory(category){
  state.category=category;state.query='';$('mangaSearchInput').value='';
  document.querySelectorAll('#mangaCategoryTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
  updateFilterButton();mangaShowHome(true);
}
function mangaSwitchStatus(status){
  state.statusFilter=status;
  document.querySelectorAll('#mangaStatusTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.status===status));
  updateFilterButton();mangaShowHome(true);
}
function mangaResetFilters(){
  state.tab='latest';state.category='all';state.statusFilter='all';state.query='';
  $('mangaSearchInput').value='';
  document.querySelectorAll('#mangaTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='latest'));
  document.querySelectorAll('#mangaCategoryTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.category==='all'));
  document.querySelectorAll('#mangaStatusTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.status==='all'));
  updateFilterButton();mangaShowHome(true);
}
function mangaDoSearch(){
  state.query=$('mangaSearchInput').value.trim();if(state.searchController)state.searchController.abort();state.searchController=new AbortController();mangaShowHome(true);
}
function mangaSwitchSource(source){
  if(!source||source===state.source)return;
  if(state.searchController)state.searchController.abort();
  state.searchController=null;state.loading=false;state.hasMore=true;state.page=1;state.searchItems.clear();
  state.source=source;state.capabilities=source==='all'?{}:sourceCapabilities(source);state.sourceMatches=[];state.selectedLang='';state.query='';$('mangaSearchInput').value='';renderSourceSelector();mangaResetFilters();
}
function mangaShowHome(reset){
  setComicView('home');
  const isXyz=state.tab==='xyz';
  const special=state.tab==='favorite'||state.tab==='history'||isXyz;
  $('mangaTitleBar').innerHTML=isXyz
    ?'<i class="fa-solid fa-bolt"></i> xyZ Manga'
    :'<i class="fa-solid fa-book-open"></i> Baca Komik';
  $('mangaBackBtn').hidden=true;
  $('mangaSearchBar').hidden=special;
  $('comicSourceStrip').hidden=special;
  $('comicSourceProgress').hidden=true;
  $('mangaTabs').hidden=false;
  $('mangaCategoryTabs').hidden=true;
  $('mangaStatusTabs').hidden=true;
  const filterButton=$('mangaFilterBtn');if(filterButton)filterButton.hidden=special;
  updateFilterButton();
  const content=$('mangaContent');
  if(isXyz){
    state.hasMore=false;state.loading=false;
    content.className='manga-xyz-wrap';
    content.innerHTML='<iframe class="manga-xyz-frame" id="mangaXyzFrame" src="https://bacamangaxyz.vercel.app/" title="xyZ Manga" loading="eager" allow="fullscreen" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms"></iframe>';
    return;
  }
  content.className='manga-grid';
  if(reset){
    state.page=1;state.hasMore=true;
    content.innerHTML=mangaSkeletonHtml(window.innerWidth<=640?4:6);
  }
  mangaFetchList(reset);
}
async function checkFavoriteUpdates(favs){
  const batches=[];
  for(let i=0;i<favs.length;i+=3) batches.push(favs.slice(i,i+3));
  for(const batch of batches){
    await Promise.all(batch.map(async fav=>{
      const chip=$('upd-'+fav.id);
      if(!chip)return;
      try{
        const detail=await getDetail(fav.id,{...fav,source:fav.source||'mangadex'});
        const chapters=await getChapters(detail);
        const top=chapters[0]&&chapters[0].id;
        if(top&&top!==fav.lastSeenChapterId){
          chip.innerHTML='<i class="fa-solid fa-bell"></i> Chapter Baru';
          chip.classList.add('has-update');
        }
      }catch(e){}
    }));
  }
}
async function mangaFetchList(reset){
  if(reset){
    state.listGeneration+=1;
    if(state.searchController)state.searchController.abort();
    state.searchController=new AbortController();
    state.loading=false;
  }
  const generation=state.listGeneration;
  if(state.loading||(!state.hasMore&&!reset))return;
  state.loading=true;
  const content=$('mangaContent');

  if(state.tab==='favorite'||state.tab==='history'){
    const items=state.tab==='favorite'?getFavorites():getHistory();
    if(reset)content.innerHTML='';
    document.querySelector('.loading')?.remove();
    document.querySelector('.load-more')?.remove();
    if(!items.length){
      content.innerHTML=`<div class="empty"><i class="fa-solid fa-book-open"></i><span>${state.tab==='favorite'?'Belum ada komik favorit.':'Belum ada riwayat baca.'}</span></div>`;
    }else{
      items.forEach(m=>{
        const card=document.createElement('article');
        card.className='manga-card';
        card.onclick=()=>mangaOpenDetail(m.id,m.source||state.source,m);
        card.innerHTML=`
          <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
          <span class="manga-badge">${escapeHtml(m.type)}</span><span class="manga-source-badge">${escapeHtml(sourceLabel(m.source||state.source))}</span>
          <div class="manga-card-title">${escapeHtml(m.title)}</div>
          ${m.lastChapterName?`<div class="manga-history-chip"><i class="fa-solid fa-bookmark"></i> ${escapeHtml(m.lastChapterName)}</div>`:''}
          ${state.tab==='favorite'?`<div class="manga-update-chip" id="upd-${escapeHtml(m.id)}"></div>`:''}`;
        content.appendChild(card);
      });
      if(state.tab==='favorite')checkFavoriteUpdates(items);
    }
    state.hasMore=false;state.loading=false;return;
  }

  try{
    const controller=state.searchController||(state.searchController=new AbortController());
    const result=await fetchList({query:state.query,category:state.category,page:state.page,signal:controller.signal});
    if(generation!==state.listGeneration)return;
    if(result.needsQuery){content.innerHTML='<div class="empty"><i class="fa-solid fa-layer-group"></i><span><strong>All Sources siap.</strong><small>Masukkan judul untuk mencari paralel dengan concurrency terbatas.</small></span></div>';state.hasMore=false;state.loading=false;return;}
    if(reset)content.innerHTML='';
    document.querySelector('.loading')?.remove();
    document.querySelector('.load-more')?.remove();

    if(!result.items.length&&state.page===1){
      content.innerHTML='<div class="empty"><i class="fa-solid fa-magnifying-glass"></i><span><strong>Komik tidak ditemukan.</strong><small>Coba kata kunci atau filter lain.</small></span><button class="nav-btn" onclick="mangaResetFilters()"><i class="fa-solid fa-filter-circle-xmark"></i> Reset Filter</button></div>';
      state.hasMore=false;state.loading=false;return;
    }

    result.items.forEach(m=>{
      state.searchItems.set(sourceKey(m.id,m.source||state.source),m);
      const card=document.createElement('article');
      card.className='manga-card';
      card.onclick=()=>mangaOpenDetail(m.id,m.source||state.source,m);
      card.innerHTML=`
        <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
        <span class="manga-badge">${escapeHtml(m.type)}</span><span class="manga-source-badge">${escapeHtml(sourceLabel(m.source||state.source))}</span>
        <div class="manga-card-title">${escapeHtml(m.title)}</div>`;
      content.appendChild(card);
    });

    state.page+=1;state.hasMore=!!result.hasMore;
    if(state.hasMore){
      const button=document.createElement('button');
      button.className='nav-btn load-more';
      button.innerHTML='<i class="fa-solid fa-plus"></i> Muat Lebih Banyak';
      button.onclick=()=>mangaFetchList(false);
      content.appendChild(button);
    }
  }catch(error){
    if(generation!==state.listGeneration||error&&error.name==='AbortError')return;
    if(reset)content.innerHTML=`
      <div class="error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span><strong>${escapeHtml(sourceLabel(state.source))} sedang tidak tersedia.</strong><small>Coba source lain atau ulangi beberapa saat lagi.</small></span>
        <button class="nav-btn" onclick="mangaShowHome(true)"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button>
      </div>`;
    state.hasMore=false;
  }finally{if(generation===state.listGeneration)state.loading=false}
}
function mangaOnFavClick(){
  if(!state.mangaData)return;
  const active=toggleFavorite(state.mangaData);
  const button=$('mangaFavBtn');
  if(button){
    button.classList.toggle('active',active);
    button.innerHTML=active?'<i class="fa-solid fa-heart"></i> Favorit':'<i class="fa-regular fa-heart"></i> Tambah Favorit';
  }
}
async function mangaOpenDetail(id,source,hint){
  setComicView('detail');state.mangaId=id;if(source&&source!=='all')state.source=source;state.selectedLang='';state.availableLanguages=[];state.sourceMatches=[];renderSourceSelector();
  $('mangaSearchBar').hidden=true;$('mangaTabs').hidden=true;$('mangaCategoryTabs').hidden=true;$('mangaStatusTabs').hidden=true;$('comicSourceStrip').hidden=true;$('comicSourceProgress').hidden=true;
  $('mangaTitleBar').innerHTML='<i class="fa-solid fa-book-open"></i> Detail Komik';
  $('mangaBackBtn').hidden=false;
  const content=$('mangaContent');
  content.className='detail';
  content.innerHTML=detailSkeletonHtml();
  window.scrollTo({top:0,behavior:state.restoreDetailScrollPending?'auto':'smooth'});
  try{
    const detail=await getDetail(id,hint||state.searchItems.get(sourceKey(id,state.source))||null);
    state.mangaData=detail;state.capabilities=detail.capabilities||sourceCapabilities(detail.source||state.source);
    $('mangaTitleBar').innerHTML=`<i class="fa-solid fa-book-open"></i> ${escapeHtml(detail.title)}`;
    content.innerHTML=`
      <div class="detail-head">
        <div class="detail-cover manga-cover-wrap">${mangaCoverImgHtml(detail.cover)}</div>
        <div class="detail-info">
          <h2>${escapeHtml(detail.title)}</h2>
          <button id="mangaFavBtn" class="fav-btn ${isFavorite(id,detail.source)?'active':''}" onclick="mangaOnFavClick()">
            <i class="${isFavorite(id,detail.source)?'fa-solid':'fa-regular'} fa-heart"></i> ${isFavorite(id,detail.source)?'Favorit':'Tambah Favorit'}
          </button>
          <div class="meta">
            <span class="tag"><i class="fa-solid fa-circle"></i> ${escapeHtml(detail.status)}</span>
            ${detail.year&&detail.year!=='-'?`<span class="tag"><i class="fa-solid fa-calendar"></i> ${escapeHtml(detail.year)}</span>`:''}
            ${detail.author?`<span class="tag"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(detail.author)}</span>`:''}
          </div>
          <div class="meta">${(detail.tags||[]).slice(0,12).map(tag=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="detail-source-row"><span class="tag"><i class="fa-solid fa-database"></i> Sumber: ${escapeHtml(sourceLabel(detail.source||state.source))}</span>${detail.url?`<a class="source-open-link" href="${escapeHtml(detail.url)}" target="_blank" rel="noopener noreferrer">Buka sumber <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`:''}</div>
      <div class="available-sources"><div><strong>Sumber tersedia</strong><small>Switch hanya jika mapping cukup yakin.</small></div><div id="mangaSourceMatches"><button class="source-match-btn is-current" type="button">${escapeHtml(sourceLabel(detail.source||state.source))}</button><button class="source-match-btn source-search-btn" type="button" onclick="mangaDiscoverSources()"><span><i class="fa-solid fa-magnifying-glass"></i> Cari sumber lain</span></button></div></div>
      <div class="detail-desc-wrap" id="mangaDescWrap"><p class="detail-desc">${escapeHtml(detail.desc)}</p><button class="detail-desc-toggle" type="button" onclick="mangaToggleDescription()">Selengkapnya</button></div>
      <div id="mangaLangBar" class="lang-bar" style="display:none"></div>
      <div class="chapter-head"><h3><i class="fa-solid fa-book"></i> Daftar Chapter</h3><span class="tag" id="chapterCount">Memuat</span></div>
      <div id="mangaChapterList"><div class="loading"><i class="fa-solid fa-spinner spin"></i><span>Memuat chapter...</span></div></div>`;
    mangaLoadChapters(detail);
  }catch(error){
    content.innerHTML=`
      <div class="error"><i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>${escapeHtml(sourceLabel(state.source))} sedang tidak tersedia.</strong><small>Coba lagi atau pilih source lain.</small></span>
      <button class="nav-btn" onclick="mangaOpenDetail('${String(id).replace(/'/g,"\\'")}')"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
  }
}
function mangaToggleDescription(){
  const wrap=$('mangaDescWrap');if(!wrap)return;const expanded=wrap.classList.toggle('is-expanded');const button=wrap.querySelector('.detail-desc-toggle');if(button)button.textContent=expanded?'Ringkas':'Selengkapnya';
}
const LANG_LABELS={
  en:'English',id:'Indonesia',ja:'Japanese',ko:'Korean',zh:'Chinese','zh-hk':'Chinese (HK)',
  es:'Spanish','es-la':'Spanish (LatAm)','pt-br':'Portuguese (BR)',fr:'French',de:'German',
  ru:'Russian',ar:'Arabic',th:'Thai',vi:'Vietnamese',it:'Italian',tr:'Turkish',pl:'Polish',uk:'Ukrainian'
};
function langLabel(code){return LANG_LABELS[code]||(code?code.toUpperCase():'?')}
async function mangaLoadChapters(detail){
  const list=$('mangaChapterList');
  const langBar=$('mangaLangBar');
  try{
    const chapters=await getChapters(detail);
    state.chapters=chapters;
    $('chapterCount').textContent=chapters.length+' chapter';
    const langs=state.availableLanguages||[];
    if(langs.length&&(state.capabilities&&state.capabilities.languageFilter!==false)){
      langBar.style.display='flex';
      langBar.innerHTML=`
        <i class="fa-solid fa-language"></i>
        <select id="mangaLangSelect">
          <option value="">Semua Bahasa</option>
          ${langs.map(lang=>`<option value="${escapeHtml(lang)}" ${state.selectedLang===lang?'selected':''}>${escapeHtml(langLabel(lang))}</option>`).join('')}
        </select>`;
      $('mangaLangSelect').onchange=e=>{state.selectedLang=e.target.value||'';mangaLoadChapters(detail)};
    }else langBar.style.display='none';

    if(!chapters.length){
      list.innerHTML='<div class="empty"><i class="fa-solid fa-file-circle-xmark"></i><span>Belum ada chapter untuk komik ini.</span></div>';
      return;
    }
    list.innerHTML=chapters.map((chapter,index)=>`
      <div class="chapter-item" onclick="mangaOpenReader(${index})">
        <div>
          <div class="ch-name">${escapeHtml(chapter.name)}${escapeHtml(chapter.extra||'')} ${chapter.lang?`<span class="ch-lang">${escapeHtml(langLabel(chapter.lang))}</span>`:''}</div>
          <div class="ch-date">${escapeHtml(chapter.date||'')}</div>
        </div>
        <i class="fa-solid fa-chevron-right"></i>
      </div>`).join('');
  }catch(error){
    list.innerHTML=`<div class="error"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>${escapeHtml(sourceLabel(detail.source||state.source))} sedang tidak tersedia.</strong><small>Daftar chapter source ini gagal dimuat; source lain tetap dapat dipakai.</small></span></div>`;
  }
}
let readerGeneration=0;
async function mangaOpenReader(index){
  const chapter=state.chapters[index];
  if(!chapter)return;
  if(state.view==='detail')state.detailScrollY=Math.max(0,Number(window.scrollY)||0);
  const manga=state.mangaData;
  if(!state.mangaId&&manga&&manga.id)state.mangaId=manga.id;
  if(manga&&manga.source)state.source=manga.source;
  const generation=++readerGeneration;
  document.dispatchEvent(new CustomEvent('nexora:comic-loading'));
  setComicView('reader');state.chapterIndex=index;
  if(state.mangaData)addHistory(state.mangaData,chapter);
  closeComicSheet();
  window.scrollTo({top:0});
  const content=$('mangaContent');
  content.className='';
  const currentSource=state.mangaData&&state.mangaData.source||state.source;
  const readerChapterTitle=formatReaderChapterTitle(chapter);
  content.innerHTML=`
    <div class="reader-topbar">
      <button class="icon-btn" id="readerBackBtn" type="button" aria-label="Kembali ke detail"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="reader-title" title="${escapeHtml(readerChapterTitle)}">${escapeHtml(readerChapterTitle)}</div>
      <button class="reader-more" id="readerMoreButton" type="button" aria-label="Menu reader"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
    <div class="reader-failure-banner" id="readerFailureBanner" hidden><div><span>Beberapa halaman gagal dimuat.</span><button type="button" onclick="mangaRetryFailedPages()"><i class="fa-solid fa-rotate-right"></i> Retry gagal</button></div></div>
    <div class="reader-pages" id="mangaReaderPages">
      <div class="page-loader"><i class="fa-solid fa-spinner spin"></i><span>Memuat halaman komik...</span></div>
    </div>
    <div class="reader-bottom">
      <button class="nav-btn" id="mangaPrevBtn" onclick="mangaChangeChapter(1)"><i class="fa-solid fa-backward-step"></i> Sebelumnya</button>
      <button class="nav-btn" id="mangaNextBtn" onclick="mangaChangeChapter(-1)">Selanjutnya <i class="fa-solid fa-forward-step"></i></button>
    </div>`;
  $('mangaPrevBtn').disabled=index>=state.chapters.length-1;
  $('mangaNextBtn').disabled=index<=0;
  $('readerBackBtn').onclick=mangaBackFromReader;
  $('readerMoreButton').onclick=openReaderMoreSheet;
  try{
    const pages=await getPages(chapter);
    if(generation!==readerGeneration||state.view!=='reader')return;
    $('mangaReaderPages').innerHTML=pages.map((url,pageIndex)=>`
      <img src="${escapeHtml(url)}" loading="${pageIndex<2?'eager':'lazy'}" decoding="async" alt="Halaman ${pageIndex+1}" data-page-index="${pageIndex}" data-page-state="loading" data-raw="${escapeHtml(url)}" data-tries="0" onload="mangaPageLoadHandler(this)" onerror="mangaPageErrorHandler(this)">`).join('');
    document.dispatchEvent(new CustomEvent('nexora:comic-pages',{detail:{source:currentSource,sourceLabel:sourceLabel(currentSource),mangaId:state.mangaId,chapterId:chapter.id,translationCompatible:!!(state.capabilities&&state.capabilities.translationCompatible)}}));
  }catch(error){
    if(generation!==readerGeneration||state.view!=='reader')return;
    $('mangaReaderPages').innerHTML=`
      <div class="page-loader"><i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>${escapeHtml(sourceLabel(chapter.source||state.source))} sedang tidak tersedia.</strong><small>Gambar chapter source ini gagal dimuat. Source lain tetap dapat dipakai.</small></span>
      <button class="nav-btn" onclick="mangaOpenReader(${index})"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
  }
}
function normalizeMatchTitle(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}
function matchConfidence(detail,candidate){const target=normalizeMatchTitle(detail.title),names=[candidate.title,...(candidate.altTitles||[])].map(normalizeMatchTitle);if(!target||!names.includes(target))return'low';const a=normalizeMatchTitle(detail.author),b=(candidate.authors||[]).map(normalizeMatchTitle);return a&&b.includes(a)?'high':'medium'}
async function mangaDiscoverSources(){
  if(!state.mangaData)return;const host=$('mangaSourceMatches');if(!host)return;host.innerHTML='<span class="source-match-loading"><i class="fa-solid fa-spinner spin"></i> Mencari…</span>';
  const providers=state.sourceRegistry.filter(row=>row.id!==(state.mangaData.source||state.source)&&row.capabilities&&row.capabilities.search).map(row=>row.id);const matches=[];
  const results=await runBounded(providers,2,source=>searchOneSource(source,state.mangaData.title,null,12));
  results.forEach((row,index)=>{if(row.status!=='fulfilled')return;for(const candidate of row.value){const confidence=matchConfidence(state.mangaData,candidate);if(confidence==='high'||confidence==='medium')matches.push({...candidate,source:candidate.source||providers[index],confidence});}});
  state.sourceMatches=matches;renderSourceMatches();
}
function renderSourceMatches(){
  const host=$('mangaSourceMatches');if(!host||!state.mangaData)return;const current=state.mangaData.source||state.source;host.innerHTML='<button class="source-match-btn is-current" type="button">'+escapeHtml(sourceLabel(current))+'</button>'+state.sourceMatches.map((m,index)=>'<button class="source-match-btn" type="button" onclick="mangaOpenMatchedSource('+index+')">'+escapeHtml(sourceLabel(m.source))+' <small>'+escapeHtml(m.confidence)+'</small></button>').join('')+(state.sourceMatches.length?'':'<span class="source-match-empty">Tidak ada match medium/high.</span>');
}
function mangaOpenMatchedSource(index){const match=state.sourceMatches[index];if(match)mangaOpenDetail(match.id,match.source,match)}
function readerSourceOptions(){const current=state.mangaData&&state.mangaData.source||state.source;const options=[{source:current,title:sourceLabel(current)},...state.sourceMatches.map(row=>({source:row.source,title:sourceLabel(row.source)}))];const seen=new Set();return options.filter(row=>!seen.has(row.source)&&seen.add(row.source)).map(row=>'<option value="'+escapeHtml(row.source)+'" '+(row.source===current?'selected':'')+'>'+escapeHtml(row.title)+'</option>').join('')}
function mangaSwitchReaderSource(source){const current=state.mangaData&&state.mangaData.source||state.source;if(source===current)return;const match=state.sourceMatches.find(row=>row.source===source);if(!match){toast('Source belum memiliki mapping yang tervalidasi.');return;}mangaOpenDetail(match.id,match.source,match)}
function changeReaderQuality(quality){
  if(state.readerQuality===quality)return;
  state.readerQuality=quality;
  toast(quality==='full'?'Mode gambar HD aktif':'Mode hemat data aktif');
  mangaOpenReader(state.chapterIndex);
}
function readerErrorContainer(img){return img.closest('.nx-ct-page')?.querySelector('div[style*="position"]')||img.parentElement}
function updateReaderFailureWarning(){
  const banner=$('readerFailureBanner');if(!banner)return;
  const indexes=[...document.querySelectorAll('#mangaReaderPages img.page-failed')].map(img=>Number(img.dataset.pageIndex)).filter(Number.isFinite).sort((a,b)=>a-b);
  let streak=0,maxStreak=0,previous=-2;for(const index of indexes){streak=index===previous+1?streak+1:1;maxStreak=Math.max(maxStreak,streak);previous=index;}
  banner.hidden=maxStreak<3;
  const text=banner.querySelector('span');if(text)text.textContent=indexes.length+' halaman gagal dimuat.';
}
function renderReaderPageFailure(img){
  if(!img||img.classList.contains('page-failed'))return;
  img.classList.add('page-failed');img.dataset.pageState='failed';img.hidden=true;img.title='Tekan Retry untuk mencoba lagi';
  const existing=readerErrorContainer(img)?.querySelector('.reader-page-error[data-page-index="'+img.dataset.pageIndex+'"]');if(existing){existing.hidden=false;updateReaderFailureWarning();return;}
  const block=document.createElement('div');block.className='reader-page-error';block.dataset.pageIndex=img.dataset.pageIndex||'';
  const sourceUrl=state.mangaData&&state.mangaData.url;
  block.innerHTML='<div><strong>Image gagal dimuat</strong>Halaman '+(Number(img.dataset.pageIndex||0)+1)+' tidak dapat diambil.</div><div class="reader-page-error-actions"><button type="button" class="retry-page"><i class="fa-solid fa-rotate-right"></i> Retry</button>'+(sourceUrl?'<a href="'+escapeHtml(sourceUrl)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka sumber</a>':'')+'</div>';
  block.querySelector('.retry-page').onclick=()=>mangaRetryPage(img);img.insertAdjacentElement('afterend',block);updateReaderFailureWarning();
}
function mangaRetryPage(img){
  if(!img)return;const raw=img.dataset.raw||'';const block=readerErrorContainer(img)?.querySelector('.reader-page-error[data-page-index="'+img.dataset.pageIndex+'"]');if(block)block.remove();
  img.hidden=false;img.classList.remove('page-failed');img.dataset.tries='0';img.dataset.pageState='loading';img.src=raw+(raw.includes('?')?'&':'?')+'retry='+Date.now();updateReaderFailureWarning();
}
window.mangaPageLoadHandler=function(img){
  if(!img)return;img.dataset.pageState='loaded';img.dataset.tries='0';img.hidden=false;img.classList.remove('page-failed');const block=readerErrorContainer(img)?.querySelector('.reader-page-error[data-page-index="'+img.dataset.pageIndex+'"]');if(block)block.remove();updateReaderFailureWarning();
};
window.mangaPageErrorHandler=function(img){
  const tries=Number(img.dataset.tries||0),raw=img.dataset.raw||'';img.dataset.pageState='failed';
  if(tries<2&&raw){img.dataset.tries=String(tries+1);setTimeout(()=>{if(img.isConnected&&!img.classList.contains('page-failed'))img.src=raw+(raw.includes('?')?'&':'?')+'retry='+Date.now()},700*(tries+1));return;}
  renderReaderPageFailure(img);
};
window.mangaRetryFailedPages=function(){document.querySelectorAll('#mangaReaderPages img.page-failed').forEach(img=>mangaRetryPage(img))};
function mangaChangeChapter(direction){
  const next=state.chapterIndex+direction;
  if(next<0||next>=state.chapters.length)return;
  mangaOpenReader(next);
}

$('mangaBackBtn').onclick=mangaGoBack;
$('mangaSearchBtn').onclick=mangaDoSearch;
let mangaSearchDebounce=0;$('mangaSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(mangaSearchDebounce);mangaDoSearch()}});$('mangaSearchInput').addEventListener('input',()=>{clearTimeout(mangaSearchDebounce);mangaSearchDebounce=setTimeout(()=>{if($('mangaSearchInput').value.trim().length>=2)mangaDoSearch()},420)});
$('comicSourceSelect').onchange=e=>mangaSwitchSource(e.target.value);
document.querySelectorAll('#mangaTabs .tab[data-tab]').forEach(button=>button.onclick=()=>mangaSwitchTab(button.dataset.tab));
document.querySelectorAll('#mangaCategoryTabs .tab').forEach(button=>button.onclick=()=>mangaSwitchCategory(button.dataset.category));
document.querySelectorAll('#mangaStatusTabs .tab').forEach(button=>button.onclick=()=>mangaSwitchStatus(button.dataset.status));
$('mangaFilterBtn').onclick=openFilterSheet;
$('comicSheetClose').onclick=()=>closeComicSheet();
$('comicSheetBackdrop').addEventListener('click',event=>{if(event.target===$('comicSheetBackdrop'))closeComicSheet()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('comicSheetBackdrop').hidden)closeComicSheet()});
window.addEventListener('popstate',()=>{if(!$('comicSheetBackdrop').hidden)closeComicSheet(true)});

async function mangaXyzFetch(section){
  let sourceError=null;
  try{
    const params=new URLSearchParams({action:'list',source:'mangadex',tab:section.sourceTab,page:String(section.sourcePage||1)});
    const json=await sourceCall(params,15000,null,'mangadex');
    const items=(json.items||[]).map(m=>({id:m.id,source:'mangadex',title:m.title,cover:m.coverUrl||m.cover||'',type:itemType(m)}));
    if(items.length) return items.slice(0,12);
    throw new Error('Data kosong');
  }catch(error){sourceError=error}
  try{
    const params=new URLSearchParams();
    params.set('limit','12');
    params.set('offset','0');
    params.append('includes[]','cover_art');
    params.append('contentRating[]','safe');
    params.append('contentRating[]','suggestive');
    params.set('hasAvailableChapters','true');
    params.set('order['+section.order+']','desc');
    const json=await fetchJson(MD_API+'/manga?'+params.toString(),20000);
    return (json.data||[]).map(directItem);
  }catch(directError){
    throw new Error('API sumber: '+sourceError.message+' | MangaDex: '+directError.message);
  }
}
async function mangaXyzHome(){
  const content=$('mangaContent');
  content.className='manga-xyz-native';
  content.innerHTML='<div class="loading"><i class="fa-solid fa-spinner spin"></i><span>Memuat komik xyZ...</span></div>';
  const sections=[
    {icon:'fa-arrow-trend-up',title:'Populer',sourceTab:'popular',order:'followedCount'},
    {icon:'fa-bolt',title:'Terbaru',sourceTab:'latest',order:'latestUploadedChapter'},
    {icon:'fa-ranking-star',title:'Top Ranking',sourceTab:'popular',sourcePage:2,order:'rating'}
  ];
  const results=await Promise.allSettled(sections.map(section=>mangaXyzFetch(section)));
  if(state.tab!=='xyz'||state.view!=='home')return;
  if(results.every(r=>r.status==='rejected')){
    const reason=results[0].reason;
    content.innerHTML=`
      <div class="error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Gagal memuat komik xyZ.<br><small>${escapeHtml((reason&&reason.message)||'Koneksi bermasalah')}</small></span>
        <button class="nav-btn" onclick="mangaShowHome(true)"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button>
      </div>`;
    return;
  }
  content.innerHTML='';
  sections.forEach((section,index)=>{
    if(results[index].status!=='fulfilled')return;
    const head=document.createElement('div');
    head.className='manga-xyz-sec';
    head.innerHTML='<i class="fa-solid '+section.icon+'"></i> '+section.title;
    content.appendChild(head);
    const grid=document.createElement('div');
    grid.className='manga-grid manga-xyz-grid';
    results[index].value.forEach(m=>{
      const card=document.createElement('article');
      card.className='manga-card';
      card.onclick=()=>mangaOpenDetail(m.id,m.source||state.source,m);
      card.innerHTML=`
        <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
        <span class="manga-badge">${escapeHtml(m.type)}</span><span class="manga-source-badge">${escapeHtml(sourceLabel(m.source||state.source))}</span>
        <div class="manga-card-title">${escapeHtml(m.title)}</div>`;
      grid.appendChild(card);
    });
    content.appendChild(grid);
  });
}
window.mangaShowHome=mangaShowHome;
window.mangaOpenDetail=mangaOpenDetail;
window.mangaOnFavClick=mangaOnFavClick;
window.mangaOpenReader=mangaOpenReader;
window.mangaBackFromReader=mangaBackFromReader;
window.mangaChangeChapter=mangaChangeChapter;window.mangaDiscoverSources=mangaDiscoverSources;window.mangaOpenMatchedSource=mangaOpenMatchedSource;

loadSourceRegistry().finally(()=>mangaShowHome(true));
})();

(function(){
  "use strict";
  var nativeFetch = window.fetch.bind(window);
  var badge;

  function ensure(){
    if(badge) return badge;
    badge = document.createElement("div");
    badge.id = "nxComicApiHealth";
    badge.className = "idle";
    badge.innerHTML = "<i></i><span>Nexora Comic API siap</span>";
    var target =
      document.querySelector("header") ||
      document.querySelector(".header") ||
      document.querySelector("main") ||
      document.body.firstElementChild;

    if(target && target.insertAdjacentElement){
      target.insertAdjacentElement("afterend",badge);
    }else{
      document.body.prepend(badge);
    }
    return badge;
  }

  function tracked(url){
    if(String(url||'').indexOf('/api/comics')===0) return true;
    try{
      var target = new URL(url,location.href);
      return target.pathname === "/api/comics";
    }catch(error){
      return false;
    }
  }

  function set(state,detail){
    var node = ensure();
    node.className = state;
    node.querySelector("span").textContent = detail;
    try{
      parent.postMessage({
        type:"nx-api-status",
        provider:(new URL(url,location.href)).searchParams.get("source")||"mangadex",
        state:state,
        detail:detail
      },"*");
    }catch(error){}
  }

  window.fetch = async function(input,init){
    var url = typeof input === "string" ? input : input && input.url || "";
    if(!tracked(url)) return nativeFetch(input,init);
    var start = performance.now();
    set("checking","Menghubungkan Nexora Comic API…");
    try{
      var response = await nativeFetch(input,init);
      var ms = Math.max(1,Math.round(performance.now()-start));
      if(response.ok) set("ok","Nexora Comic API aktif · " + ms + " ms");
      else if(response.status < 500) set("warn","Comic source merespons HTTP " + response.status);
      else set("err","Comic source gangguan HTTP " + response.status);
      return response;
    }catch(error){
      set(
        error && error.name === "AbortError" ? "warn" : "err",
        error && error.name === "AbortError"
          ? "Request comic source dibatalkan"
          : "Nexora Comic API gagal jaringan"
      );
      throw error;
    }
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded",ensure,{once:true});
  }else ensure();
})();

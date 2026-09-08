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
  sourceMode:'auto'
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
async function fetchJson(url,timeoutMs=20000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }finally{clearTimeout(timer)}
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
  return `<img src="${sourceImageUrl(rawUrl)}" loading="lazy" decoding="async" alt="cover" data-raw="${raw}" data-fallback-stage="0" onerror="mangaCoverFallback(this)">`;
}
window.mangaCoverFallback=function(img){
  const stage=Number(img.dataset.fallbackStage||0);
  const raw=img.dataset.raw||'';
  if(stage===0&&raw){
    img.dataset.fallbackStage='1';
    img.src='https://wsrv.nl/?url='+encodeURIComponent(raw);
  }else if(stage===1&&raw){
    img.dataset.fallbackStage='2';
    img.src=raw;
  }else{
    if(img.parentElement) img.parentElement.classList.add('cover-broken');
    img.remove();
  }
};

async function sourceCall(params,timeout=18000){
  const url=SOURCE_API+'?'+params.toString();
  const json=await fetchJson(url,timeout);
  if(!json||json.success===false) throw new Error((json&&json.message)||'API sumber gagal');
  state.sourceMode='source';
  const statusBadge=document.getElementById('nxComicApiHealth');
  if(statusBadge){statusBadge.className='ok';statusBadge.innerHTML='<i></i><span>Nexora Comic API aktif</span>';}
  return json;
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
  const params=new URLSearchParams();
  if(args.query){params.set('action','search');params.set('q',args.query)}
  else{
    params.set('action','list');
    params.set('tab',state.tab==='popular'?'popular':'latest');
    params.set('page',String(args.page));
  }
  if(args.category&&args.category!=='all') params.set('type',args.category);
  const json=await sourceCall(params,15000);
  let items=(json.items||[]).map(m=>({
    id:m.id,title:m.title,cover:m.cover,type:m.type||'Komik',
    realStatus:String(m.status||'').toLowerCase()
  }));
  if(state.statusFilter!=='all'){
    const ended=state.statusFilter==='tamat';
    items=items.filter(m=>!m.realStatus||(ended?['completed','cancelled'].includes(m.realStatus):['ongoing','hiatus'].includes(m.realStatus)));
  }
  return{items,hasMore:!args.query&&!!json.hasMore};
}

async function fetchList(args){
  return await sourceList(args);
}

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
async function sourceDetail(id){
  const params=new URLSearchParams({action:'detail',id});
  const json=await sourceCall(params,20000);
  const d=json.data||{};
  return{
    id,title:d.title,cover:d.cover,type:d.type||'Komik',
    desc:d.desc||'Belum ada sinopsis untuk komik ini.',
    status:d.status||'-',year:d.year||'-',author:d.author||null,tags:d.genres||[]
  };
}
async function getDetail(id){
  return await sourceDetail(id);
}

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
  const params=new URLSearchParams({action:'chapters',id:detail.id});
  if(state.selectedLang) params.set('lang',state.selectedLang);
  const json=await sourceCall(params,22000);
  state.availableLanguages=json.languages||[];
  return(json.data||[]).map(c=>({
    id:c.id,name:c.name||'Chapter',extra:c.extra||'',lang:c.lang||'',date:c.date||''
  }));
}
async function getChapters(detail){
  return await sourceChapters(detail);
}

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
  const params=new URLSearchParams({action:'pages',id:chapter.id,quality:state.readerQuality});
  const json=await sourceCall(params,22000);
  const images=json.data&&json.data.image||[];
  if(!images.length) throw new Error('Halaman chapter kosong');
  return images;
}
async function getPages(chapter){
  return await sourcePages(chapter);
}

function getFavorites(){return storageGet(FAVORITES_KEY)}
function isFavorite(id){return getFavorites().some(item=>item.id===id)}
function toggleFavorite(item){
  let favs=getFavorites();
  if(favs.some(f=>f.id===item.id)) favs=favs.filter(f=>f.id!==item.id);
  else{
    const top=state.chapters&&state.chapters[0]?state.chapters[0].id:null;
    favs.unshift({id:item.id,title:item.title,cover:item.cover,type:item.type||'Komik',lastSeenChapterId:top});
  }
  storageSet(FAVORITES_KEY,favs);
  return isFavorite(item.id);
}
function getHistory(){return storageGet(HISTORY_KEY)}
function addHistory(item,chapter){
  let history=getHistory().filter(h=>h.id!==item.id);
  history.unshift({
    id:item.id,title:item.title,cover:item.cover,type:item.type||'Komik',
    lastChapterId:chapter&&chapter.id,lastChapterName:chapter&&chapter.name,time:Date.now()
  });
  storageSet(HISTORY_KEY,history.slice(0,60));
  if(chapter){
    const favs=getFavorites();
    const index=favs.findIndex(f=>f.id===item.id);
    if(index>=0){favs[index].lastSeenChapterId=chapter.id;storageSet(FAVORITES_KEY,favs)}
  }
}
function closeComic(){
  parent.postMessage({type:'nx-close-comic-reader'},'*');
}
function mangaGoBack(){
  if(state.view==='reader') mangaOpenDetail(state.mangaId);
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
  mangaShowHome(true);
}
function mangaSwitchStatus(status){
  state.statusFilter=status;
  document.querySelectorAll('#mangaStatusTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.status===status));
  mangaShowHome(true);
}
function mangaResetFilters(){
  state.tab='latest';state.category='all';state.statusFilter='all';state.query='';
  $('mangaSearchInput').value='';
  document.querySelectorAll('#mangaTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='latest'));
  document.querySelectorAll('#mangaCategoryTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.category==='all'));
  document.querySelectorAll('#mangaStatusTabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.status==='all'));
  mangaShowHome(true);
}
function mangaDoSearch(){
  state.query=$('mangaSearchInput').value.trim();
  mangaShowHome(true);
}
function mangaShowHome(reset){
  state.view='home';
  const isXyz=state.tab==='xyz';
  const special=state.tab==='favorite'||state.tab==='history'||isXyz;
  document.body.classList.remove('reader-mode');
  $('mangaTitleBar').innerHTML=isXyz
    ?'<i class="fa-solid fa-bolt"></i> xyZ Manga'
    :'<i class="fa-solid fa-book-open"></i> Baca Komik';
  $('mangaBackBtn').style.display='none';
  document.querySelector('.manga-topbar').style.display='none';
  $('mangaSearchBar').style.display=special?'none':'flex';
  $('mangaTabs').style.display='flex';
  $('mangaCategoryTabs').style.display=special?'none':'flex';
  $('mangaStatusTabs').style.display=special?'none':'flex';
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
    content.innerHTML='<div class="loading"><i class="fa-solid fa-spinner spin"></i><span>Memuat komik...</span></div>';
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
        const detail=await getDetail(fav.id);
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
        card.onclick=()=>mangaOpenDetail(m.id);
        card.innerHTML=`
          <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
          <span class="manga-badge">${escapeHtml(m.type)}</span>
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
    const result=await fetchList({
      query:state.query,category:state.category,page:state.page
    });
    if(reset)content.innerHTML='';
    document.querySelector('.loading')?.remove();
    document.querySelector('.load-more')?.remove();

    if(!result.items.length&&state.page===1){
      content.innerHTML='<div class="empty"><i class="fa-solid fa-magnifying-glass"></i><span><strong>Komik tidak ditemukan.</strong><small>Coba kata kunci atau filter lain.</small></span><button class="nav-btn" onclick="mangaResetFilters()"><i class="fa-solid fa-filter-circle-xmark"></i> Reset Filter</button></div>';
      state.hasMore=false;state.loading=false;return;
    }

    result.items.forEach(m=>{
      const card=document.createElement('article');
      card.className='manga-card';
      card.onclick=()=>mangaOpenDetail(m.id);
      card.innerHTML=`
        <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
        <span class="manga-badge">${escapeHtml(m.type)}</span>
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
    if(reset)content.innerHTML=`
      <div class="error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span><strong>Tidak dapat memuat daftar komik.</strong><small>Coba lagi beberapa saat.</small></span>
        <button class="nav-btn" onclick="mangaShowHome(true)"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button>
      </div>`;
    state.hasMore=false;
  }finally{state.loading=false}
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
async function mangaOpenDetail(id){
  state.view='detail';state.mangaId=id;state.selectedLang='';state.availableLanguages=[];
  $('mangaSearchBar').style.display='none';
  $('mangaTabs').style.display='none';
  $('mangaCategoryTabs').style.display='none';
  $('mangaStatusTabs').style.display='none';
  $('mangaTitleBar').innerHTML='<i class="fa-solid fa-book-open"></i> Detail Komik';
  $('mangaBackBtn').style.display='';
  document.querySelector('.manga-topbar').style.display='flex';
  const content=$('mangaContent');
  content.className='detail';
  content.innerHTML='<div class="loading"><i class="fa-solid fa-spinner spin"></i><span>Memuat detail...</span></div>';
  window.scrollTo({top:0,behavior:'smooth'});
  try{
    const detail=await getDetail(id);
    state.mangaData=detail;
    $('mangaTitleBar').innerHTML=`<i class="fa-solid fa-book-open"></i> ${escapeHtml(detail.title)}`;
    content.innerHTML=`
      <div class="detail-head">
        <div class="detail-cover manga-cover-wrap">${mangaCoverImgHtml(detail.cover)}</div>
        <div class="detail-info">
          <h2>${escapeHtml(detail.title)}</h2>
          <button id="mangaFavBtn" class="fav-btn ${isFavorite(id)?'active':''}" onclick="mangaOnFavClick()">
            <i class="${isFavorite(id)?'fa-solid':'fa-regular'} fa-heart"></i> ${isFavorite(id)?'Favorit':'Tambah Favorit'}
          </button>
          <div class="meta">
            <span class="tag"><i class="fa-solid fa-circle"></i> ${escapeHtml(detail.status)}</span>
            ${detail.year&&detail.year!=='-'?`<span class="tag"><i class="fa-solid fa-calendar"></i> ${escapeHtml(detail.year)}</span>`:''}
            ${detail.author?`<span class="tag"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(detail.author)}</span>`:''}
          </div>
          <div class="meta">${(detail.tags||[]).slice(0,12).map(tag=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        </div>
      </div>
      <p class="detail-desc">${escapeHtml(detail.desc)}</p>
      <div id="mangaLangBar" class="lang-bar" style="display:none"></div>
      <div class="chapter-head"><h3><i class="fa-solid fa-book"></i> Daftar Chapter</h3><span class="tag" id="chapterCount">Memuat</span></div>
      <div id="mangaChapterList"><div class="loading"><i class="fa-solid fa-spinner spin"></i><span>Memuat chapter...</span></div></div>`;
    mangaLoadChapters(detail);
  }catch(error){
    content.innerHTML=`
      <div class="error"><i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>Tidak dapat memuat detail komik.</strong><small>Coba lagi beberapa saat.</small></span>
      <button class="nav-btn" onclick="mangaOpenDetail('${String(id).replace(/'/g,"\\'")}')"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
  }
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
    if(langs.length){
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
    list.innerHTML=`<div class="error"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Tidak dapat memuat daftar chapter.</strong><small>Coba lagi beberapa saat.</small></span></div>`;
  }
}
let readerGeneration=0;
async function mangaOpenReader(index){
  const generation=++readerGeneration;
  document.dispatchEvent(new CustomEvent('nexora:comic-loading'));
  state.view='reader';state.chapterIndex=index;
  const chapter=state.chapters[index];
  if(!chapter)return;
  if(state.mangaData)addHistory(state.mangaData,chapter);
  document.body.classList.add('reader-mode');
  window.scrollTo({top:0});
  const content=$('mangaContent');
  content.className='';
  content.innerHTML=`
    <div class="reader-topbar">
      <button class="icon-btn" onclick="mangaOpenDetail(state.mangaId)" title="Kembali ke Detail"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="reader-title"><i class="fa-solid fa-book-open-reader"></i> ${escapeHtml(chapter.name)}${escapeHtml(chapter.extra||'')}</div>
      <div class="quality-switch">
        <button id="qualitySaver" class="${state.readerQuality==='saver'?'active':''}" type="button">Hemat</button>
        <button id="qualityFull" class="${state.readerQuality==='full'?'active':''}" type="button">HD</button>
      </div>
      <button class="icon-btn" onclick="mangaShowHome(true)" title="Daftar Komik"><i class="fa-solid fa-house"></i></button>
    </div>
    <div class="reader-pages" id="mangaReaderPages">
      <div class="page-loader"><i class="fa-solid fa-spinner spin"></i><span>Memuat halaman komik...</span></div>
    </div>
    <div class="reader-bottom">
      <button class="nav-btn" id="mangaPrevBtn" onclick="mangaChangeChapter(1)"><i class="fa-solid fa-backward-step"></i> Chapter Sebelumnya</button>
      <button class="nav-btn" id="mangaNextBtn" onclick="mangaChangeChapter(-1)">Chapter Selanjutnya <i class="fa-solid fa-forward-step"></i></button>
    </div>`;
  $('mangaPrevBtn').disabled=index>=state.chapters.length-1;
  $('mangaNextBtn').disabled=index<=0;
  $('qualitySaver').onclick=()=>changeReaderQuality('saver');
  $('qualityFull').onclick=()=>changeReaderQuality('full');
  try{
    const pages=await getPages(chapter);
    if(generation!==readerGeneration||state.view!=='reader')return;
    $('mangaReaderPages').innerHTML=pages.map((url,pageIndex)=>`
      <img src="${escapeHtml(url)}" loading="${pageIndex<2?'eager':'lazy'}" decoding="async" alt="Halaman ${pageIndex+1}" data-raw="${escapeHtml(url)}" data-tries="0" onerror="mangaPageErrorHandler(this)">`).join('');
    document.dispatchEvent(new CustomEvent('nexora:comic-pages',{detail:{mangaId:state.mangaId,chapterId:chapter.id}}));
  }catch(error){
    if(generation!==readerGeneration||state.view!=='reader')return;
    $('mangaReaderPages').innerHTML=`
      <div class="page-loader"><i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>Tidak dapat memuat gambar chapter.</strong><small>Coba lagi beberapa saat.</small></span>
      <button class="nav-btn" onclick="mangaOpenReader(${index})"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button></div>`;
  }
}
function changeReaderQuality(quality){
  if(state.readerQuality===quality)return;
  state.readerQuality=quality;
  toast(quality==='full'?'Mode gambar HD aktif':'Mode hemat data aktif');
  mangaOpenReader(state.chapterIndex);
}
window.mangaPageErrorHandler=function(img){
  const tries=Number(img.dataset.tries||0);
  const raw=img.dataset.raw||'';
  if(tries<2){
    img.dataset.tries=String(tries+1);
    setTimeout(()=>{img.src=raw+(raw.includes('?')?'&':'?')+'retry='+Date.now()},1000);
  }else if(tries===2&&raw){
    img.dataset.tries='3';
    img.src=sourceImageUrl(raw);
  }else{
    img.classList.add('page-failed');
    img.style.cursor='pointer';
    img.title='Tekan untuk mencoba lagi';
    img.onclick=()=>{img.dataset.tries='0';img.classList.remove('page-failed');img.src=raw+'?retry='+Date.now()};
  }
};
function mangaChangeChapter(direction){
  const next=state.chapterIndex+direction;
  if(next<0||next>=state.chapters.length)return;
  mangaOpenReader(next);
}

$('mangaBackBtn').onclick=mangaGoBack;
$('mangaSearchBtn').onclick=mangaDoSearch;
$('mangaSearchInput').addEventListener('keydown',event=>{if(event.key==='Enter')mangaDoSearch()});
document.querySelectorAll('#mangaTabs .tab').forEach(button=>button.onclick=()=>mangaSwitchTab(button.dataset.tab));
document.querySelectorAll('#mangaCategoryTabs .tab').forEach(button=>button.onclick=()=>mangaSwitchCategory(button.dataset.category));
document.querySelectorAll('#mangaStatusTabs .tab').forEach(button=>button.onclick=()=>mangaSwitchStatus(button.dataset.status));

async function mangaXyzFetch(section){
  let sourceError=null;
  try{
    const params=new URLSearchParams({action:'list',tab:section.sourceTab,page:String(section.sourcePage||1)});
    const json=await sourceCall(params,15000);
    const items=(json.items||[]).map(m=>({id:m.id,title:m.title,cover:m.cover,type:m.type||'Komik'}));
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
      card.onclick=()=>mangaOpenDetail(m.id);
      card.innerHTML=`
        <div class="manga-cover-wrap">${mangaCoverImgHtml(m.cover)}</div>
        <span class="manga-badge">${escapeHtml(m.type)}</span>
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
window.mangaChangeChapter=mangaChangeChapter;

mangaShowHome(true);
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
        provider:"mangadex",
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
      else if(response.status < 500) set("warn","MangaDex merespons HTTP " + response.status);
      else set("err","MangaDex gangguan HTTP " + response.status);
      return response;
    }catch(error){
      set(
        error && error.name === "AbortError" ? "warn" : "err",
        error && error.name === "AbortError"
          ? "Request MangaDex dibatalkan"
          : "Nexora Comic API gagal jaringan"
      );
      throw error;
    }
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded",ensure,{once:true});
  }else ensure();
})();

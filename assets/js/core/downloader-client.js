(function(){
  "use strict";
  if(window.NexoraDownloader) return;
  var active=Object.create(null);
  var hosts={terabox:["terabox.com","teraboxapp.com","1024tera.com","dubox.com","teraboxlink.com"],instagram:["instagram.com","instagr.am"],tiktok:["tiktok.com"],youtube:["youtube.com","youtu.be"],spotify:["spotify.com","spotify.link"]};
  function matchesHost(host,list){host=String(host||"").toLowerCase().replace(/\.$/,"");return list.some(function(suffix){return host===suffix||host.endsWith("."+suffix);});}
  function validate(provider,value){
    var parsed;try{parsed=new URL(String(value||"").trim());}catch(_){throw new Error("URL tidak valid.");}
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.port)throw new Error("Gunakan URL HTTPS publik tanpa kredensial atau port khusus.");
    if(!hosts[provider]||!matchesHost(parsed.hostname,hosts[provider]))throw new Error("Link bukan URL "+provider+" yang didukung.");
    parsed.hash="";return parsed.toString();
  }
  function friendly(error){
    if(error&&error.name==="AbortError")return "Permintaan sebelumnya dibatalkan.";
    if(error&&error.code==="REQUEST_TIMEOUT")return "Provider melewati batas waktu. Coba lagi beberapa saat lagi.";
    if(error&&error.status===429)return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
    if(error&&error.status===422)return error.message||"Media tidak ditemukan, kedaluwarsa, privat, atau memerlukan login.";
    if(error&&error.status>=500)return error.message||"Provider sedang bermasalah. Coba lagi nanti.";
    return error&&error.message?error.message:"Permintaan downloader gagal.";
  }
  async function request(provider,value,options){
    var url=validate(provider,value);if(active[provider])active[provider].abort();
    var controller=new AbortController();active[provider]=controller;
    var external=options&&options.signal,onAbort=function(){controller.abort();};
    if(external){if(external.aborted)controller.abort();else external.addEventListener("abort",onAbort,{once:true});}
    try{
      var data=await window.NexoraFetchJson("/api/downloader",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({provider:provider,url:url}),signal:controller.signal,nexoraTimeoutMs:22000,nexoraRetries:0});
      if(!data||data.ok!==true||!data.data)throw new Error(data&&data.message||"Respons downloader tidak lengkap.");return data;
    }catch(error){if(error&&error.name!=="AbortError")error.message=friendly(error);throw error;}
    finally{if(external)external.removeEventListener("abort",onAbort);if(active[provider]===controller)delete active[provider];}
  }
  function abort(provider){if(active[provider]){active[provider].abort();delete active[provider];}}
  function legacyTikTok(result){
    var item=result&&result.data||{},media=Array.isArray(item.media)?item.media:[];
    function pick(id){var found=media.find(function(row){return row.id===id;});return found&&found.url||"";}
    var photos=media.filter(function(row){return row.type==="JPG";}).map(function(row){return row.url;});
    return {data:{title:item.caption||item.title||"",cover:item.thumbnail||"",origin_cover:item.thumbnail||"",duration:item.duration||0,author:{nickname:item.author||"",unique_id:item.authorId||"",avatar:item.avatar||""},hdplay:pick("hd")||pick("standard"),play:pick("standard")||pick("hd"),wmplay:pick("watermark"),music:pick("audio"),size:(media.find(function(row){return row.id==="hd";})||{}).size||0,wm_size:(media.find(function(row){return row.id==="watermark";})||{}).size||0,images:photos,play_count:item.stats&&item.stats.plays||0,digg_count:item.stats&&item.stats.likes||0,comment_count:item.stats&&item.stats.comments||0,share_count:item.stats&&item.stats.shares||0}};
  }
  window.NexoraDownloader=Object.freeze({abort:abort,friendly:friendly,legacyTikTok:legacyTikTok,request:request,validate:validate});
})();

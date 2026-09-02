(function(){
  "use strict";
  if(window.NexoraFetch) return;
  var nativeFetch=window.fetch.bind(window);
  function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  function methodOf(init){return String(init&&init.method||"GET").toUpperCase();}
  function timeoutOf(init){
    var explicit=Number(init&&init.nexoraTimeoutMs);
    if(Number.isFinite(explicit)&&explicit>0)return Math.min(explicit,90000);
    return init&&typeof FormData!=="undefined"&&init.body instanceof FormData?150000:18000;
  }
  function dispatch(kind,detail){try{document.dispatchEvent(new CustomEvent(kind,{detail:detail}));}catch(_){ }}
  async function request(input,init){
    init=Object.assign({},init||{});
    delete init.nexoraTimeoutMs;
    delete init.nexoraRetries;
    var method=methodOf(init);
    var retries=Number.isFinite(Number(arguments[1]&&arguments[1].nexoraRetries))?Math.max(0,Math.min(2,Number(arguments[1].nexoraRetries))):(method==="GET"||method==="HEAD"?1:0);
    var timeout=timeoutOf(arguments[1]||{});
    var url=typeof input==="string"?input:(input&&input.url)||"";
    var lastError=null;
    for(var attempt=0;attempt<=retries;attempt++){
      var controller=new AbortController();
      var externalSignal=init.signal;
      var onAbort=function(){controller.abort();};
      if(externalSignal){if(externalSignal.aborted)controller.abort();else externalSignal.addEventListener("abort",onAbort,{once:true});}
      var timer=setTimeout(function(){controller.abort();},timeout);
      try{
        var response=await nativeFetch(input,Object.assign({},init,{signal:controller.signal}));
        clearTimeout(timer);
        if(externalSignal)externalSignal.removeEventListener("abort",onAbort);
        if((response.status===429||response.status>=500)&&attempt<retries){try{await response.body?.cancel();}catch(_){ }await delay(350*(attempt+1));continue;}
        if(response.status>=500)dispatch("nexora:network-error",{url:url,method:method,status:response.status,reason:"HTTP_"+response.status});
        return response;
      }catch(error){
        clearTimeout(timer);
        if(externalSignal)externalSignal.removeEventListener("abort",onAbort);
        lastError=error;
        if(externalSignal&&externalSignal.aborted)throw error;
        if(attempt<retries){await delay(350*(attempt+1));continue;}
      }
    }
    var timeoutError=lastError&&lastError.name==="AbortError";
    dispatch("nexora:network-error",{url:url,method:method,status:null,reason:timeoutError?"TIMEOUT":"NETWORK_ERROR",message:lastError&&lastError.message||"Request gagal"});
    if(timeoutError){var error=new Error("Permintaan melewati batas waktu. Periksa koneksi atau coba lagi.");error.code="REQUEST_TIMEOUT";throw error;}
    throw lastError||new Error("Permintaan jaringan gagal.");
  }
  window.NexoraFetch=request;
  window.NexoraFetchJson=async function(input,init){
    var response=await request(input,init),text="",data={};
    try{text=await response.text();}catch(_){text="";}
    if(text){try{data=JSON.parse(text);}catch(_){var parseError=new Error(response.ok?"Server mengembalikan respons non-JSON.":("HTTP "+response.status));parseError.status=response.status;parseError.code="INVALID_JSON_RESPONSE";throw parseError;}}
    if(!response.ok){var error=new Error(data.message||data.error||("HTTP "+response.status));error.status=response.status;error.code=data.error||("HTTP_"+response.status);error.payload=data;throw error;}
    return data;
  };
})();

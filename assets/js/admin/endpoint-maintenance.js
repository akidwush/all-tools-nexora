(function(){
  "use strict";

  var state={loaded:false,loading:false,editable:false,providers:[],groups:[],group:"comic",query:"",filter:"all",tested:null,editing:null};
  var $=function(sel,root){return (root||document).querySelector(sel);};
  var $$=function(sel,root){return Array.from((root||document).querySelectorAll(sel));};

  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];});}
  function cookie(name){var row=document.cookie.split(";").map(function(v){return v.trim();}).find(function(v){return v.indexOf(name+"=")===0;});return row?decodeURIComponent(row.slice(name.length+1)):"";}
  function headers(){return{"Content-Type":"application/json","X-CSRF-Token":cookie("nx_admin_csrf")};}
  async function api(options){
    var response=await fetch("/api/admin/dashboard?mode=endpoint-maintenance",Object.assign({cache:"no-store",credentials:"same-origin"},options||{}));
    var data=await response.json().catch(function(){return{};});
    if(response.status===401){location.replace("/admin/login");throw new Error("Sesi berakhir.");}
    if(!response.ok||data.ok===false)throw Object.assign(new Error(data.message||data.error||"Permintaan gagal."),{data:data,status:response.status});
    return data;
  }
  function toast(text,type){var stack=$("#toastStack");if(!stack)return;var el=document.createElement("div");el.className="toast "+(type||"success");el.textContent=text;stack.appendChild(el);setTimeout(function(){el.remove();},3800);}
  function modeLabel(mode){return mode==="maintenance"?"MAINTENANCE":mode==="disabled"?"DISABLED":"ACTIVE";}
  function statusLabel(provider){
    if(provider.effective.mode==="maintenance")return"MAINTENANCE";
    if(provider.effective.mode==="disabled")return"DISABLED";
    var status=provider.lastCheck&&provider.lastCheck.status;
    if(status==="online")return"ONLINE";
    if(status==="degraded")return"DEGRADED";
    if(status==="unavailable")return"UNAVAILABLE";
    return"NOT CHECKED";
  }
  function statusClass(provider){return statusLabel(provider).toLowerCase().replace(/\s+/g,"-");}
  function currentProviders(){
    return state.providers.filter(function(p){
      if(p.group!==state.group)return false;
      if(state.filter!=="all"&&p.effective.mode!==state.filter&&String(p.lastCheck&&p.lastCheck.status||"")!==state.filter)return false;
      var q=state.query.toLowerCase();
      if(!q)return true;
      return [p.id,p.label,p.category,p.effective.baseUrl].join(" ").toLowerCase().includes(q);
    });
  }
  function render(){
    var root=$("#endpointProviderMaintenance");if(!root)return;
    var providers=currentProviders();
    root.innerHTML=
      '<div class="endpoint-maint-toolbar">'+
        '<div class="endpoint-tabs">'+state.groups.map(function(g){return'<button type="button" data-endpoint-group="'+esc(g.id)+'" class="'+(g.id===state.group?"is-active":"")+'">'+esc(g.label)+'</button>';}).join("")+'</div>'+
        '<div class="endpoint-filters"><label class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input data-endpoint-search type="search" placeholder="Cari provider, group, host" value="'+esc(state.query)+'"></label>'+
        '<select data-endpoint-filter class="select-box"><option value="all">Semua</option><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="disabled">Disabled</option><option value="degraded">Degraded</option></select></div>'+
      '</div>'+
      '<div class="endpoint-provider-grid">'+
      (providers.length?providers.map(card).join(""):'<div class="endpoint-empty">Tidak ada provider pada filter ini.</div>')+
      '</div>';
    var filter=$("[data-endpoint-filter]",root);if(filter)filter.value=state.filter;
  }
  function card(p){
    var check=p.lastCheck;
    var last=check&&check.checkedAt?new Date(check.checkedAt).toLocaleString("id-ID"):"Belum dicek";
    var history=p.history&&p.history.length?p.history[0]:null;
    return '<article class="endpoint-provider-card" data-endpoint-id="'+esc(p.id)+'">'+
      '<div class="endpoint-provider-head"><div><span class="endpoint-provider-group">'+esc(p.group.toUpperCase())+'</span><h3>'+esc(p.label)+'</h3><small>'+esc(p.id)+'</small></div><span class="endpoint-status is-'+statusClass(p)+'">'+statusLabel(p)+'</span></div>'+
      '<dl class="endpoint-meta">'+
        '<div><dt>Mode</dt><dd>'+modeLabel(p.effective.mode)+'</dd></div>'+
        '<div><dt>Source</dt><dd>'+esc(p.source)+'</dd></div>'+
        '<div><dt>Base URL</dt><dd class="endpoint-code">'+esc(p.effective.baseUrl)+'</dd></div>'+
        (p.effective.path?'<div><dt>Path</dt><dd class="endpoint-code">'+esc(p.effective.path)+'</dd></div>':"")+
        '<div><dt>Timeout</dt><dd>'+esc(p.effective.timeoutMs)+' ms</dd></div>'+
        '<div><dt>Last checked</dt><dd>'+esc(last)+'</dd></div>'+
        (p.credential.ref?'<div><dt>Credential</dt><dd>'+esc(p.credential.ref)+' · '+(p.credential.configured?"Configured ✓":"Missing")+'</dd></div>':"")+
      '</dl>'+
      '<div class="endpoint-actions">'+
        '<button type="button" class="secondary-button" data-endpoint-test-current><i class="fa-solid fa-vial"></i> Test</button>'+
        '<button type="button" class="secondary-button" data-endpoint-edit '+(state.editable?"":"disabled")+'>Edit</button>'+
        (history?'<button type="button" class="ghost-button" data-endpoint-rollback="'+esc(history.id)+'" '+(state.editable?"":"disabled")+'>Rollback</button>':"")+
      '</div>'+
    '</article>';
  }
  function provider(id){return state.providers.find(function(p){return p.id===id;});}
  function ensureDialog(){
    var d=$("#endpointMaintenanceDialog");if(d)return d;
    d=document.createElement("dialog");d.id="endpointMaintenanceDialog";d.className="endpoint-maint-dialog";
    d.innerHTML='<form method="dialog" class="endpoint-maint-drawer"><header><div><p class="eyebrow">ENDPOINT MAINTENANCE</p><h2 data-endpoint-dialog-title>Provider</h2></div><button value="cancel" type="submit" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></header><div data-endpoint-dialog-body></div></form>';
    document.body.appendChild(d);return d;
  }
  function field(name,label,value,type,extra){
    return '<label class="endpoint-field"><span>'+esc(label)+'</span><input data-endpoint-field="'+esc(name)+'" type="'+(type||"text")+'" value="'+esc(value==null?"":value)+'" '+(extra||"")+'></label>';
  }
  function openEdit(p){
    state.editing=p;state.tested=null;
    var d=ensureDialog(),body=$("[data-endpoint-dialog-body]",d);$("[data-endpoint-dialog-title]",d).textContent=p.label;
    var editable=new Set(p.editableFields||[]);
    var fallbacks=(p.fallbackOptions||[]).map(function(row){return'<option value="'+esc(row.id)+'">'+esc(row.label)+'</option>';}).join("");
    body.innerHTML=
      '<div class="endpoint-current-candidate"><section><b>Current effective</b><code>'+esc(p.effective.baseUrl+(p.effective.path||""))+'</code><small>'+esc(p.source)+'</small></section><section><b>Code default</b><code>'+esc(p.default.baseUrl+(p.default.path||""))+'</code><small>DEFAULT</small></section></div>'+
      '<div class="endpoint-edit-fields">'+
        '<label class="endpoint-field"><span>Mode</span><select data-endpoint-field="mode"><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="disabled">Disabled</option></select></label>'+
        (editable.has("baseUrl")?field("baseUrl","Base URL",p.effective.baseUrl):"")+
        (editable.has("path")?field("path","Provider path",p.effective.path):"")+
        (editable.has("apiVersion")?field("apiVersion","API Version",p.effective.apiVersion):"")+
        (editable.has("timeoutMs")?field("timeoutMs","Timeout (ms)",p.effective.timeoutMs,"number",'min="'+p.timeoutRange.min+'" max="'+p.timeoutRange.max+'"'):"")+
        (editable.has("healthPath")?field("healthPath","Health path",p.effective.healthPath):"")+
        (editable.has("fallbackProvider")?'<label class="endpoint-field"><span>Fallback provider</span><select data-endpoint-field="fallbackProvider"><option value="">None</option>'+fallbacks+'</select></label>':"")+
        '<label class="endpoint-field"><span>Change reason</span><input data-endpoint-reason maxlength="500" placeholder="Contoh: Provider moved API domain"></label>'+
      '</div>'+
      '<div class="endpoint-allowlist"><b>Allowed host</b><span>'+p.allowedHosts.map(esc).join(", ")+'</span></div>'+
      '<div class="endpoint-test-result" data-endpoint-test-result>Candidate belum diuji.</div>'+
      '<footer class="endpoint-drawer-actions"><button type="button" class="secondary-button" data-test-candidate>Test Candidate</button><button type="button" class="primary-button" data-save-candidate disabled>Save</button><button type="button" class="ghost-button" data-reset-default '+(p.source==="OVERRIDE"?"":"disabled")+'>Reset to Default</button></footer>';
    $("[data-endpoint-field=mode]",d).value=p.effective.mode;
    if(editable.has("fallbackProvider"))$("[data-endpoint-field=fallbackProvider]",d).value=p.effective.fallbackProvider||"";
    if(typeof d.showModal==="function")d.showModal();else d.setAttribute("open","");
  }
  function candidateFromDialog(){
    var d=ensureDialog(),out={};
    $$("[data-endpoint-field]",d).forEach(function(input){out[input.dataset.endpointField]=input.type==="number"?Number(input.value):input.value.trim();});
    return out;
  }
  async function reload(){
    var data=await api();
    state.loaded=true;state.editable=Boolean(data.editable);state.providers=Array.isArray(data.providers)?data.providers:[];state.groups=Array.isArray(data.groups)?data.groups:[];
    render();return data;
  }
  async function testCurrent(p,button){
    button.disabled=true;
    try{
      var data=await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"test_current",providerId:p.id})});
      toast(p.label+": "+String(data.result.status).toUpperCase()+" · "+(data.result.httpStatus||"—")+" · "+data.result.latencyMs+"ms");
      await reload();
    }catch(e){toast(e.message,"error");await reload().catch(function(){});}
    finally{button.disabled=false;}
  }
  async function testCandidateAction(){
    var p=state.editing,d=ensureDialog(),box=$("[data-endpoint-test-result]",d),button=$("[data-test-candidate]",d),save=$("[data-save-candidate]",d);
    button.disabled=true;save.disabled=true;box.textContent="Testing candidate…";
    try{
      var data=await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"test_candidate",providerId:p.id,candidate:candidateFromDialog()})});
      state.tested=JSON.stringify(candidateFromDialog());
      box.textContent=String(data.result.status).toUpperCase()+" · HTTP "+(data.result.httpStatus||"—")+" · "+data.result.latencyMs+" ms · "+data.result.resolvedHost;
      save.disabled=!state.editable;
    }catch(e){
      state.tested=null;box.textContent=(e.data&&e.data.result&&e.data.result.error)||e.message;toast(e.message,"error");
    }finally{button.disabled=false;}
  }
  async function saveCandidate(){
    var p=state.editing,d=ensureDialog(),candidate=candidateFromDialog(),reason=$("[data-endpoint-reason]",d).value.trim();
    var save=$("[data-save-candidate]",d);save.disabled=true;
    try{
      await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"save",providerId:p.id,candidate:candidate,reason:reason,tested:state.tested===JSON.stringify(candidate)})});
      d.close();toast("Endpoint "+p.label+" tersimpan.");await reload();
    }catch(e){
      if(e.status===409&&confirm("Candidate belum memiliki hasil test terbaru. Simpan dengan konfirmasi?")){
        await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"save",providerId:p.id,candidate:candidate,reason:reason,confirmDegraded:true})});
        d.close();toast("Endpoint "+p.label+" tersimpan dengan konfirmasi.");await reload();return;
      }
      toast(e.message,"error");
    }finally{if(d.open)save.disabled=!state.editable;}
  }
  async function resetDefault(){
    var p=state.editing;if(!confirm("Hapus override dan kembali ke code default untuk "+p.label+"?"))return;
    try{await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"reset_default",providerId:p.id,reason:"Reset to code default"})});ensureDialog().close();toast("Override dihapus.");await reload();}
    catch(e){toast(e.message,"error");}
  }
  async function rollback(p,historyId){
    if(!confirm("Rollback "+p.label+" ke konfigurasi sebelumnya?"))return;
    try{await api({method:"PATCH",headers:headers(),body:JSON.stringify({action:"rollback",providerId:p.id,historyId:historyId,reason:"Admin rollback"})});toast("Rollback selesai.");await reload();}
    catch(e){toast(e.message,"error");}
  }
  function bind(){
    var root=$("#endpointProviderMaintenance");if(!root)return;
    root.addEventListener("click",function(event){
      var group=event.target.closest("[data-endpoint-group]");if(group){state.group=group.dataset.endpointGroup;render();return;}
      var card=event.target.closest("[data-endpoint-id]");if(!card)return;var p=provider(card.dataset.endpointId);if(!p)return;
      var test=event.target.closest("[data-endpoint-test-current]");if(test){testCurrent(p,test);return;}
      if(event.target.closest("[data-endpoint-edit]")){openEdit(p);return;}
      var rollbackButton=event.target.closest("[data-endpoint-rollback]");if(rollbackButton)rollback(p,rollbackButton.dataset.endpointRollback);
    });
    root.addEventListener("input",function(event){if(event.target.matches("[data-endpoint-search]")){state.query=event.target.value;render();}});
    root.addEventListener("change",function(event){if(event.target.matches("[data-endpoint-filter]")){state.filter=event.target.value;render();}});
    var d=ensureDialog();
    d.addEventListener("click",function(event){
      if(event.target.closest("[data-test-candidate]"))testCandidateAction();
      else if(event.target.closest("[data-save-candidate]"))saveCandidate();
      else if(event.target.closest("[data-reset-default]"))resetDefault();
      else if(event.target.matches("[data-endpoint-field]")){$("[data-save-candidate]",d).disabled=true;state.tested=null;}
    });
    window.addEventListener("nexora:admin-section-changed",function(event){if(event.detail&&event.detail.section==="control"&&!state.loaded)reload().catch(function(e){toast(e.message,"error");});});
    reload().catch(function(e){toast(e.message,"error");});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
  window.NexoraEndpointMaintenance={reload:reload};
})();

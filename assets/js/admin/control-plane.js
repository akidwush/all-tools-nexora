(function(){
  "use strict";

  var state={loaded:false,loading:false,editable:false,config:null,eligibleTools:[]};
  var $=function(selector,root){return (root||document).querySelector(selector);};

  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>'"]/g,function(char){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char];
    });
  }
  function readCookie(name){
    var item=document.cookie.split(";").map(function(v){return v.trim();})
      .find(function(v){return v.indexOf(name+"=")===0;});
    return item?decodeURIComponent(item.slice(name.length+1)):"";
  }
  function csrfHeaders(){
    return {"Content-Type":"application/json","X-CSRF-Token":readCookie("nx_admin_csrf")};
  }
  async function api(url,options){
    var response=await fetch(url,Object.assign({cache:"no-store",credentials:"same-origin"},options||{}));
    var data=await response.json().catch(function(){return {};});
    if(response.status===401){location.replace("/admin/login");throw new Error("Sesi berakhir.");}
    if(!response.ok||data.ok===false)throw new Error(data.message||data.error||"Permintaan gagal.");
    return data;
  }
  function toast(text,type){
    var stack=$("#toastStack");if(!stack)return;
    var el=document.createElement("div");el.className="toast "+(type||"success");el.textContent=text;
    stack.appendChild(el);setTimeout(function(){el.remove();},3600);
  }
  function formatUntil(value){
    if(!value)return "";
    var date=new Date(value);if(Number.isNaN(date.getTime()))return "";
    var local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }
  function effective(item){
    if(!item||item.enabled!==true)return "off";
    if(!item.until)return "active";
    var until=new Date(item.until).getTime();
    return Number.isFinite(until)&&until>Date.now()?"active":"expired";
  }

  function render(){
    if(!state.config)return;
    var access=state.config.publicAccess||{};
    var locked=access.locked===true;
    var badge=$("#controlAccessState");
    var toggle=$("#controlPublicLocked");
    var message=$("#controlPublicMessage");
    var save=$("#savePublicAccess");
    if(badge){
      badge.textContent=locked?"LOCKED":"OPEN";
      badge.className="control-state "+(locked?"is-locked":"is-open");
    }
    if(toggle){toggle.checked=locked;toggle.disabled=!state.editable;}
    if(message){message.value=access.message||"";message.disabled=!state.editable;}
    if(save)save.disabled=!state.editable;

    var list=$("#endpointMaintenanceList");
    if(list){
      list.innerHTML=state.eligibleTools.map(function(toolId){
        var item=(state.config.endpoints||{})[toolId]||{enabled:false,reason:"",until:null};
        var status=effective(item);
        var label=status==="active"?"MAINTENANCE":status==="expired"?"EXPIRED":"ONLINE POLICY";
        return '<article class="control-endpoint" data-control-tool="'+escapeHtml(toolId)+'">'+
          '<div class="control-endpoint-head"><div><b>'+escapeHtml(toolId)+'</b><small>Server-gated endpoint</small></div>'+
          '<span class="control-endpoint-status is-'+status+'">'+label+'</span></div>'+
          '<label class="control-switch"><span><b>Maintenance</b><small>Request operasional akan menerima HTTP 503 saat aktif.</small></span>'+
          '<input data-maint-enabled type="checkbox" '+(item.enabled?'checked ':'')+(state.editable?'':'disabled ')+'></label>'+
          '<label><span>Alasan</span><input data-maint-reason maxlength="240" value="'+escapeHtml(item.reason||"")+'" '+(state.editable?'':'disabled ')+' placeholder="Contoh: provider sedang gangguan"></label>'+
          '<label><span>Sampai (opsional)</span><input data-maint-until type="datetime-local" value="'+escapeHtml(formatUntil(item.until))+'" '+(state.editable?'':'disabled ')+'></label>'+
          '<button class="secondary-button" data-save-maint type="button" '+(state.editable?'':'disabled')+'><i class="fa-solid fa-floppy-disk"></i> Simpan endpoint</button>'+
        '</article>';
      }).join("");
    }

    var note=$("#controlReadOnlyNote");
    if(note)note.hidden=state.editable;
  }

  async function load(force){
    if(state.loading||(!force&&state.loaded))return;
    state.loading=true;
    var loading=$("#controlPlaneLoading");if(loading)loading.hidden=false;
    var errorBox=$("#controlPlaneError");if(errorBox){errorBox.hidden=true;errorBox.textContent="";}
    try{
      var result=await api("/api/admin/dashboard?mode=control-plane");
      state.loaded=true;state.editable=Boolean(result.editable);
      state.config=result.config||{publicAccess:{locked:false,message:""},endpoints:{}};
      state.eligibleTools=Array.isArray(result.eligibleTools)?result.eligibleTools:[];
      render();
    }catch(error){
      if(errorBox){errorBox.hidden=false;errorBox.textContent=error.message;}
      toast(error.message,"error");
    }finally{
      state.loading=false;if(loading)loading.hidden=true;
    }
  }

  async function savePublicAccess(){
    if(!state.editable)return;
    var button=$("#savePublicAccess");button.disabled=true;
    try{
      var result=await api("/api/admin/dashboard?mode=control-plane",{
        method:"PATCH",
        headers:csrfHeaders(),
        body:JSON.stringify({
          action:"set_public_lock",
          locked:$("#controlPublicLocked").checked,
          message:$("#controlPublicMessage").value.trim()
        })
      });
      state.config=result.config;render();
      toast(state.config.publicAccess.locked?"Public tool access terkunci di server.":"Public tool access dibuka.");
    }catch(error){toast(error.message,"error");}
    finally{button.disabled=!state.editable;}
  }

  async function saveMaintenance(row){
    if(!state.editable||!row)return;
    var button=$("[data-save-maint]",row);button.disabled=true;
    try{
      var localUntil=$("[data-maint-until]",row).value;
      var until=localUntil?new Date(localUntil).toISOString():null;
      var toolId=row.getAttribute("data-control-tool");
      var result=await api("/api/admin/dashboard?mode=control-plane",{
        method:"PATCH",
        headers:csrfHeaders(),
        body:JSON.stringify({
          action:"set_maintenance",
          toolId:toolId,
          enabled:$("[data-maint-enabled]",row).checked,
          reason:$("[data-maint-reason]",row).value.trim(),
          until:until
        })
      });
      state.config=result.config;render();
      toast("Policy endpoint "+toolId+" tersimpan.");
    }catch(error){toast(error.message,"error");}
    finally{if(document.body.contains(button))button.disabled=!state.editable;}
  }

  function bind(){
    var save=$("#savePublicAccess");if(save)save.addEventListener("click",savePublicAccess);
    var refresh=$("#refreshControlPlane");if(refresh)refresh.addEventListener("click",function(){load(true);});
    var list=$("#endpointMaintenanceList");
    if(list)list.addEventListener("click",function(event){
      var button=event.target.closest("[data-save-maint]");
      if(button)saveMaintenance(button.closest("[data-control-tool]"));
    });
    document.addEventListener("click",function(event){
      var button=event.target.closest("[data-control-go]");
      if(!button)return;
      var target=document.querySelector('[data-section="'+button.getAttribute("data-control-go")+'"]');
      if(target)target.click();
    });
    window.addEventListener("nexora:admin-section-changed",function(event){
      if(event.detail&&event.detail.section==="control")load(false);
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);
  else bind();

  window.NexoraAdminControlPlane={load:load};
})();

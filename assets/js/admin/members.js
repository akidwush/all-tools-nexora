(function(){
  "use strict";
  const $=selector=>document.querySelector(selector);
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const readCookie=name=>{const item=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="));return item?decodeURIComponent(item.slice(name.length+1)):""};
  const toolAccess=new Map();
  const nativeFetch=window.fetch.bind(window);
  let searchTimer;

  // Add the access selector to the existing dashboard save request without
  // duplicating its form controller.
  window.fetch=function(input,init={}){
    try{
      const url=typeof input==="string"?input:input.url;
      const method=String(init.method||"GET").toUpperCase();
      if(/^\/api\/admin\/tools(?:\?|$)/.test(url)&&["POST","PATCH"].includes(method)&&init.body){
        const body=JSON.parse(init.body);
        if(body.id&&!body.action)body.accessLevel=$("#editToolAccess")?.value||"free";
        init={...init,body:JSON.stringify(body)};
      }
    }catch{}
    return nativeFetch(input,init);
  };

  async function api(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json","X-CSRF-Token":readCookie("nx_admin_csrf")}:{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.message||data.error||"Permintaan gagal");
    return data;
  }
  const formatDate=value=>value?new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"Belum aktif";
  async function loadMembers(){
    const grid=$("#memberAdminGrid");if(!grid)return;
    grid.innerHTML='<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><b>Memuat membership</b></div>';
    try{
      const result=await api(`/api/admin/tools?resource=members&q=${encodeURIComponent($("#memberSearch").value.trim())}&status=${encodeURIComponent($("#memberStatusFilter").value)}`);
      const rows=result.data||[];
      grid.innerHTML=rows.length?rows.map(item=>`<article class="member-card"><header><span class="member-avatar">${escapeHtml((item.display_name||item.email||"U")[0].toUpperCase())}</span><div><b>${escapeHtml(item.display_name||"User Nexora")}</b><small>${escapeHtml(item.email||"-")}</small></div><em class="member-status ${escapeHtml(item.effective_status)}">${escapeHtml(item.effective_status.toUpperCase())}</em></header><div class="member-meta"><span>Paket <b>${escapeHtml((item.subscription?.plan||"free").toUpperCase())}</b></span><span>Terdaftar <b>${escapeHtml(formatDate(item.created_at))}</b></span><span>Mulai VVIP <b>${escapeHtml(formatDate(item.subscription?.started_at))}</b></span><span>Berakhir <b>${escapeHtml(formatDate(item.subscription?.expires_at))}</b></span></div><footer>${item.role==="admin"?'<span class="read-only-badge">Admin dilindungi</span>':`<select data-member-days><option value="1">1 hari</option><option value="7">7 hari</option><option value="30" selected>30 hari</option><option value="90">90 hari</option><option value="365">1 tahun</option></select><button data-member-action="${item.effective_status==="vvip"?"extend":"activate"}" data-user-id="${escapeHtml(item.id)}">${item.effective_status==="vvip"?"Perpanjang":"Aktifkan VVIP"}</button><input data-member-date type="date" aria-label="Tanggal berakhir VVIP"><button data-member-action="activate" data-use-custom="1" data-user-id="${escapeHtml(item.id)}">Set tanggal</button><button data-member-action="${item.effective_status==="suspended"?"restore":"suspend"}" data-user-id="${escapeHtml(item.id)}">${item.effective_status==="suspended"?"Pulihkan":"Tangguhkan"}</button>${item.effective_status==="vvip"||item.effective_status==="expired"?`<button class="danger" data-member-action="revoke" data-user-id="${escapeHtml(item.id)}">Cabut</button>`:""}`}</footer></article>`).join(""):'<div class="empty-state"><i class="fa-solid fa-users-slash"></i><b>Member tidak ditemukan</b></div>';
    }catch(error){grid.innerHTML=`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><b>${escapeHtml(error.message)}</b></div>`;}
  }
  document.addEventListener("click",async event=>{
    if(event.target.closest?.("[data-section='members']"))setTimeout(loadMembers,0);
    const edit=event.target.closest?.("[data-edit-tool]");
    if(edit)setTimeout(()=>{const select=$("#editToolAccess");if(select)select.value=toolAccess.get(edit.dataset.editTool)||"free"},0);
    const button=event.target.closest?.("[data-member-action]");if(!button)return;
    const footer=button.closest("footer"),days=footer.querySelector("[data-member-days]")?.value,custom=button.dataset.useCustom?footer.querySelector("[data-member-date]")?.value:"";if(button.dataset.useCustom&&!custom)return window.alert("Pilih tanggal berakhir VVIP.");button.disabled=true;
    try{await api("/api/admin/tools?resource=members",{method:"PATCH",body:JSON.stringify({userId:button.dataset.userId,action:button.dataset.memberAction,days:Number(days||30),expiresAt:custom?`${custom}T23:59:59+07:00`:null})});await loadMembers();}
    catch(error){window.alert(error.message);}finally{button.disabled=false;}
  });
  document.addEventListener("DOMContentLoaded",()=>{
    api("/api/admin/tools").then(result=>(result.data||[]).forEach(item=>toolAccess.set(item.id,item.access_level||"free"))).catch(()=>{});
    $("#refreshMembers")?.addEventListener("click",loadMembers);
    $("#memberStatusFilter")?.addEventListener("change",loadMembers);
    $("#memberSearch")?.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadMembers,250)});
  });
})();

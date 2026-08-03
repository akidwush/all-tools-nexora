(function(){
  "use strict";
  const state={session:null,dashboard:null,tools:[],activeSection:"overview",editing:null};
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const headings={overview:"Ringkasan Sistem",tools:"Manajemen Tools",health:"Tool Health Monitoring",feedback:"Feedback Pengguna"};

  function escapeHtml(value){
    return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }
  function readCookie(name){
    const item=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${name}=`));
    return item?decodeURIComponent(item.slice(name.length+1)):"";
  }
  function csrfHeaders(){return {"Content-Type":"application/json","X-CSRF-Token":readCookie("nx_admin_csrf")};}
  function formatDate(value){
    if(!value)return "Belum ada";
    const date=new Date(value); if(Number.isNaN(date.getTime()))return "-";
    return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(date);
  }
  function toast(text,type="success"){
    const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=text;$("#toastStack").appendChild(el);
    setTimeout(()=>el.remove(),3400);
  }
  async function api(url,options={}){
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){location.replace("/admin/login");throw new Error("Sesi berakhir.");}
    if(!response.ok||data.ok===false)throw new Error(data.message||data.error||"Permintaan gagal.");
    return data;
  }
  function switchSection(section){
    state.activeSection=section;
    $$('[data-panel]').forEach(panel=>panel.classList.toggle("is-active",panel.dataset.panel===section));
    $$('[data-section]').forEach(button=>button.classList.toggle("is-active",button.dataset.section===section));
    $("#pageHeading").textContent=headings[section]||"Dashboard";
    if(section==="tools")renderTools();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function renderSession(){
    const info=state.session.admin;const name=info.displayName||"Admin";
    $("#adminName").textContent=name;$("#adminRole").textContent=info.role;$("#adminAvatar").textContent=name.charAt(0).toUpperCase();
  }
  function metricCard(icon,label,value,caption,tone){return `<article class="metric-card" style="--accent:${tone.bg};--accent-text:${tone.text}"><span class="metric-icon"><i class="${icon}"></i></span><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></article>`;}
  function renderOverview(){
    const summary=state.dashboard.summary;const feedback=summary.feedback.counts;const health=summary.health.counts;
    $("#metricGrid").innerHTML=[
      metricCard("fa-solid fa-screwdriver-wrench","Total tools",summary.tools.total,`${summary.tools.active} aktif`,{bg:"rgba(168,85,247,.13)",text:"#c084fc"}),
      metricCard("fa-solid fa-toggle-on","Tools aktif",summary.tools.active,`${summary.tools.inactive} nonaktif`,{bg:"rgba(52,211,153,.11)",text:"#6ee7b7"}),
      metricCard("fa-regular fa-message","Feedback baru",feedback.new,`${summary.feedback.total} total`,{bg:"rgba(34,211,238,.10)",text:"#67e8f9"}),
      metricCard("fa-solid fa-triangle-exclamation","Tool bermasalah",health.degraded+health.offline,`${health.operational} operational`,{bg:"rgba(251,191,36,.10)",text:"#fcd34d"})
    ].join("");
    const healthItems=[
      ["fa-solid fa-circle-check","Operational",health.operational,"tone-green"],
      ["fa-solid fa-gauge-high","Degraded",health.degraded,"tone-yellow"],
      ["fa-solid fa-circle-xmark","Offline",health.offline,"tone-red"],
      ["fa-solid fa-circle-question","Unknown",health.unknown,"tone-muted"]
    ];
    $("#healthSummary").innerHTML=healthItems.map(([icon,label,count,tone])=>`<div class="health-summary-item ${tone}"><i class="${icon}"></i><b>${count}</b><span>${label}</span></div>`).join("");
    const recent=state.dashboard.recentFeedback||[];
    $("#recentFeedback").innerHTML=recent.length?recent.slice(0,5).map(item=>`<div class="compact-item"><span class="compact-mark"></span><div><b>${escapeHtml(item.name)} · ${escapeHtml(item.category)}</b><span>${escapeHtml(item.message)}</span></div><em class="status-pill">${escapeHtml(item.status)}</em></div>`).join(""):'<div class="compact-item"><div><b>Belum ada feedback</b><span>Pesan pengguna akan tampil di sini.</span></div></div>';
    const settings=state.dashboard.settings||[];
    $("#settingsList").innerHTML=settings.length?settings.map(item=>`<div class="setting-item"><span class="compact-mark"></span><div><b>${escapeHtml(item.key)}</b><span>${escapeHtml(JSON.stringify(item.value))}</span></div><em class="status-pill">${item.is_public?"public":"private"}</em></div>`).join(""):'<div class="setting-item"><div><b>Belum ada pengaturan</b><span>Jalankan migration database.</span></div></div>';
  }
  function renderHealth(){
    const rows=state.dashboard.health||[];$("#healthTime").textContent=`Terakhir: ${formatDate(state.dashboard.summary.health.lastCheckedAt)}`;
    $("#healthTableBody").innerHTML=rows.length?rows.map(item=>`<tr><td class="health-tool"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.toolId)}</span></td><td><span class="health-badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td>${item.httpStatus??"-"}</td><td>${item.latencyMs==null?"-":`${item.latencyMs} ms`}</td><td>${Number(item.successRate||0).toFixed(1)}%</td><td>${formatDate(item.lastCheckedAt)}</td></tr>`).join(""):'<tr><td colspan="6">Belum ada data health.</td></tr>';
  }
  function renderFeedback(){
    const rows=state.dashboard.recentFeedback||[];
    $("#feedbackGrid").innerHTML=rows.length?rows.map(item=>`<article class="feedback-card"><header><b>${escapeHtml(item.name)}</b><time>${formatDate(item.created_at)}</time></header><p>${escapeHtml(item.message)}</p><footer><span>${escapeHtml(item.category)}</span><span class="status-pill">${escapeHtml(item.status)}</span></footer></article>`).join(""):'<div class="empty-state"><i class="fa-regular fa-message"></i><b>Belum ada feedback</b></div>';
  }
  function filteredTools(){
    const query=$("#toolSearch").value.trim().toLowerCase();const status=$("#toolStatusFilter").value;const category=$("#toolCategoryFilter").value;
    return state.tools.filter(item=>(!query||`${item.name} ${item.id} ${item.description}`.toLowerCase().includes(query))&&(status==="all"||(status==="active"?item.is_active:!item.is_active))&&(category==="all"||item.category===category));
  }
  function renderTools(){
    const rows=filteredTools();$("#toolEmpty").hidden=rows.length>0;
    $("#toolAdminGrid").innerHTML=rows.map(item=>`<article class="tool-admin-card"><div class="tool-card-top"><span class="tool-card-icon"><i class="${escapeHtml(item.icon||"fa-solid fa-cube")}"></i></span><span class="tool-state ${item.is_active?"active":"inactive"}">${item.is_active?"Aktif":"Nonaktif"}</span></div><h3>${escapeHtml(item.name)}</h3><span class="tool-id">${escapeHtml(item.id)}</span><p>${escapeHtml(item.description||"Belum ada deskripsi.")}</p><div class="tool-card-meta"><span>${escapeHtml(item.category)}</span><span>Urutan ${item.sort_order}</span>${item.badge?`<span>${escapeHtml(item.badge)}</span>`:""}</div><div class="tool-card-actions"><button data-edit-tool="${escapeHtml(item.id)}" type="button"><i class="fa-solid fa-pen"></i> Edit</button></div></article>`).join("");
  }
  function openToolEditor(id){
    const item=state.tools.find(tool=>tool.id===id);if(!item)return;state.editing=item;
    $("#editToolId").value=item.id;$("#editToolName").value=item.name||"";$("#editToolCategory").value=item.category||"tools";$("#editToolDescription").value=item.description||"";$("#editToolBadge").value=item.badge||"";$("#editToolIcon").value=item.icon||"";$("#editToolUrl").value=item.external_url||"";$("#editToolOrder").value=item.sort_order??0;$("#editToolActive").checked=Boolean(item.is_active);$("#toolModalMessage").textContent="";$("#toolModal").hidden=false;document.body.style.overflow="hidden";
  }
  function closeToolEditor(){$("#toolModal").hidden=true;document.body.style.overflow="";state.editing=null;}
  async function saveTool(event){
    event.preventDefault();const button=$("#saveToolButton");button.disabled=true;button.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    const payload={id:$("#editToolId").value,name:$("#editToolName").value,category:$("#editToolCategory").value,description:$("#editToolDescription").value,badge:$("#editToolBadge").value,icon:$("#editToolIcon").value,externalUrl:$("#editToolUrl").value,sortOrder:Number($("#editToolOrder").value||0),isActive:$("#editToolActive").checked};
    try{
      const result=await api("/api/admin/tools",{method:"PATCH",headers:csrfHeaders(),body:JSON.stringify(payload)});
      const index=state.tools.findIndex(item=>item.id===payload.id);if(index>=0)state.tools[index]={...state.tools[index],...result.data};
      renderTools();toast("Perubahan tool berhasil disimpan.");closeToolEditor();
      const dashboard=await api("/api/admin/dashboard");state.dashboard=dashboard;renderOverview();renderHealth();renderFeedback();
    }catch(error){const msg=$("#toolModalMessage");msg.textContent=error.message;msg.className="modal-message is-error";}
    finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';}
  }
  async function logout(){
    try{await api("/api/admin/auth",{method:"DELETE",headers:csrfHeaders()});}catch{}location.replace("/admin/login");
  }
  function bind(){
    $$('[data-section]').forEach(button=>button.addEventListener("click",()=>switchSection(button.dataset.section)));
    $$('[data-go-section]').forEach(button=>button.addEventListener("click",()=>switchSection(button.dataset.goSection)));
    [$("#toolSearch"),$("#toolStatusFilter"),$("#toolCategoryFilter")].forEach(input=>input.addEventListener("input",renderTools));
    $("#toolAdminGrid").addEventListener("click",event=>{const button=event.target.closest("[data-edit-tool]");if(button)openToolEditor(button.dataset.editTool);});
    $("#closeToolModal").addEventListener("click",closeToolEditor);$("#cancelToolEdit").addEventListener("click",closeToolEditor);$("#toolModal").addEventListener("click",event=>{if(event.target.id==="toolModal")closeToolEditor();});
    $("#toolEditForm").addEventListener("submit",saveTool);$("#logoutButton").addEventListener("click",logout);document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("#toolModal").hidden)closeToolEditor();});
  }
  async function boot(){
    try{
      const session=await api("/api/admin/auth");if(!session.authenticated){location.replace("/admin/login");return;}state.session=session;renderSession();
      const [dashboard,tools]=await Promise.all([api("/api/admin/dashboard"),api("/api/admin/tools")]);state.dashboard=dashboard;state.tools=tools.data||[];
      renderOverview();renderHealth();renderFeedback();renderTools();bind();$("#adminApp").hidden=false;$("#adminLoader").hidden=true;
    }catch(error){console.error(error);toast(error.message||"Dashboard gagal dimuat.","error");setTimeout(()=>location.replace("/admin/login"),1200);}
  }
  boot();
})();

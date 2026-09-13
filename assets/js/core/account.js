(function(){"use strict";
const GUEST_MEMBERSHIP=Object.freeze({role:"guest",isVvip:false,status:"guest"});
const state={ready:false,authenticated:null,user:null,membership:{role:"unknown",isVvip:false,status:"unknown"},tools:new Map(),wa:"",error:null};
let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve});
const defaultRestrictedTools=new Map();
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cookie=n=>{const x=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(n+"="));return x?decodeURIComponent(x.slice(n.length+1)):""};
async function api(options={}){const mutation=options.method&&!['GET'].includes(options.method);const response=await fetch("/api/account",{credentials:"same-origin",cache:"no-store",...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(mutation?{"X-CSRF-Token":cookie("nx_account_csrf")}:{})}});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.message||data.error||"Permintaan gagal.");return data;}
function cacheTools(){document.querySelectorAll(".tools-card[data-tool-id]").forEach(card=>state.tools.set(card.dataset.toolId,{id:card.dataset.toolId,name:card.getAttribute("aria-label")?.replace(/^Buka /,"")||card.dataset.toolId,accessLevel:card.dataset.accessLevel||"free"}));}
function ensureButton(){
  let b=document.getElementById("nxAccountButton");
  if(!b){
    b=document.createElement("button");b.id="nxAccountButton";b.className="nx-account-button";b.type="button";document.body.appendChild(b);
  }
  if(b.dataset.accountBound!=="1"){
    b.dataset.accountBound="1";
    b.addEventListener("click",()=>{if(!state.ready)return;open(state.authenticated?"profile":"login")});
  }
  return b;
}
function renderButton(){
  const b=ensureButton();
  if(!state.ready){
    b.disabled=true;b.setAttribute("aria-busy","true");b.setAttribute("aria-label","Memuat akun");
    b.classList.add("is-hydrating");b.classList.remove("is-vvip");
    b.innerHTML='<span class="nx-account-skeleton" aria-hidden="true"></span>';
    return;
  }
  b.disabled=false;b.removeAttribute("aria-busy");b.classList.remove("is-hydrating");
  b.classList.toggle("is-vvip",state.membership.isVvip);
  b.setAttribute("aria-label",state.authenticated?"Buka profil Nexora":"Login Nexora");
  b.innerHTML=`<i class="fas ${state.authenticated?state.membership.isVvip?'fa-crown':'fa-user':'fa-right-to-bracket'}"></i><span>${esc(state.authenticated?(state.user?.displayName||"Akun Nexora")+(state.membership.isVvip?" · VVIP":" · FREE"):"Login")}</span>`;
}
function shell(){let x=document.getElementById("nxAccountModal");if(x)return x;x=document.createElement("div");x.id="nxAccountModal";x.className="nx-account-backdrop";x.hidden=true;x.innerHTML='<section class="nx-account-modal" role="dialog" aria-modal="true"><header class="nx-account-head"><div><p>NEXORA ACCOUNT</p><h2 id="nxAccountTitle">Akun</h2><p id="nxAccountSubtitle"></p></div><button class="nx-account-close" type="button" aria-label="Tutup"><i class="fas fa-xmark"></i></button></header><div id="nxAccountBody"></div></section>';x.addEventListener("click",e=>{if(e.target===x||e.target.closest(".nx-account-close"))close()});document.body.appendChild(x);return x;}
function authForm(mode){const reg=mode==="register",forgot=mode==="forgot",recovery=mode==="recovery";return `<form class="nx-account-form" id="nxAccountForm">${reg?'<label>Nama tampil<input name="displayName" maxlength="80" required></label>':''}${!recovery?'<label>Email<input name="email" type="email" autocomplete="email" required></label>':''}${!forgot?`<label>${recovery?'Password baru':'Password'}<input name="password" type="password" minlength="8" autocomplete="${recovery||reg?'new-password':'current-password'}" required></label>`:''}<button class="nx-account-primary" type="submit">${forgot?'Kirim tautan pemulihan':recovery?'Simpan password baru':reg?'Buat akun FREE':'Login'}</button><p class="nx-account-message" id="nxAccountMessage"></p></form><div class="nx-account-links">${mode!=="login"?'<button data-account-view="login">Kembali ke login</button>':'<button data-account-view="register">Daftar akun</button><button data-account-view="forgot">Lupa password?</button>'}</div>`;}
function profile(){const m=state.membership,expires=m.expiresAt?new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeStyle:"short"}).format(new Date(m.expiresAt)):"Tidak ada masa aktif";return `<div class="nx-account-profile"><div class="nx-membership-card"><span>STATUS MEMBERSHIP</span><strong>${esc(m.role.toUpperCase())}</strong><span>${esc(m.status)} · ${esc(expires)}</span></div><form class="nx-account-form" id="nxProfileForm"><label>Nama tampil<input name="displayName" maxlength="80" value="${esc(state.user?.displayName)}" required></label><label>URL avatar<input name="avatarUrl" type="url" value="${esc(state.user?.avatarUrl||"")}"></label><button class="nx-account-primary" type="submit">Simpan profil</button><p class="nx-account-message" id="nxAccountMessage"></p></form>${!m.isVvip?'<button class="nx-account-wa" data-account-upgrade><i class="fab fa-whatsapp"></i> Upgrade ke VVIP</button>':''}<button class="nx-account-secondary" data-account-logout>Logout</button></div>`;}
function upgrade(tool){const name=tool?.name||"tool premium",msg=`Halo Admin Nexora, saya ingin upgrade VVIP untuk mengakses ${name}.\nEmail: ${state.user?.email||'belum login'}\nNama: ${state.user?.displayName||'-'}`,url=state.wa?`${state.wa}${state.wa.includes('?')?'&':'?'}text=${encodeURIComponent(msg)}`:"#";return `<div class="nx-account-profile"><div class="nx-membership-card"><span>VVIP ACCESS</span><strong>${esc(name)}</strong><span>Tool ini hanya dapat dijalankan oleh member VVIP aktif.</span></div>${!state.authenticated?'<button class="nx-account-primary" data-account-view="login">Login dahulu</button>':`<a class="nx-account-wa" href="${esc(url)}" ${state.wa?'target="_blank" rel="noopener"':''}><i class="fab fa-whatsapp"></i> Hubungi admin untuk upgrade</a>`}<button class="nx-account-secondary" data-account-close>Nanti saja</button></div>`;}
function open(view="login",tool=null){const x=shell(),body=x.querySelector("#nxAccountBody");x.querySelector("#nxAccountTitle").textContent={upgrade:"Khusus VVIP",profile:"Profil & Membership",register:"Daftar akun",forgot:"Pulihkan akun",recovery:"Password baru",login:"Login"}[view]||"Akun";x.querySelector("#nxAccountSubtitle").textContent=view==="upgrade"?"Upgrade dikelola langsung oleh admin Nexora.":"Satu akun untuk seluruh All Tools Nexora.";body.innerHTML=view==="profile"?profile():view==="upgrade"?upgrade(tool):authForm(view);x.hidden=false;document.body.style.overflow="hidden";bind(view,tool);}
function close(){shell().hidden=true;document.body.style.overflow="";}
function message(text,error=false){const x=document.getElementById("nxAccountMessage");if(x){x.textContent=text;x.classList.toggle("is-error",error)}}
function busy(form,value,label){const button=form?.querySelector("button[type='submit']");if(!button)return;button.disabled=value;if(value){button.dataset.label=button.textContent;button.textContent=label||"Memproses…";}else if(button.dataset.label){button.textContent=button.dataset.label;delete button.dataset.label;}}
function bind(view,tool){const body=document.getElementById("nxAccountBody");body.querySelectorAll("[data-account-view]").forEach(b=>b.addEventListener("click",()=>open(b.dataset.accountView,tool)));body.querySelector("[data-account-close]")?.addEventListener("click",close);body.querySelector("[data-account-upgrade]")?.addEventListener("click",()=>open("upgrade",tool));body.querySelector("[data-account-logout]")?.addEventListener("click",async event=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;try{await api({method:"DELETE"});hydrate({authenticated:false});open("login")}catch(err){message(err.message,true);button.disabled=false;}});body.querySelector("#nxAccountForm")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;if(form.dataset.busy==="1")return;form.dataset.busy="1";busy(form,true);const d=Object.fromEntries(new FormData(form));try{const recovery=view==="recovery";const result=await api({method:recovery?"PATCH":"POST",body:JSON.stringify({action:recovery?"reset-password":view,...d})});if(result.authenticated){hydrate(result);close()}else message(result.message||"Periksa email Anda.")}catch(err){message(err.message,true)}finally{form.dataset.busy="0";busy(form,false)}});body.querySelector("#nxProfileForm")?.addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;if(form.dataset.busy==="1")return;form.dataset.busy="1";busy(form,true,"Menyimpan…");try{hydrate(await api({method:"PATCH",body:JSON.stringify({action:"profile",...Object.fromEntries(new FormData(form))})}));message("Profil berhasil disimpan.")}catch(err){message(err.message,true)}finally{form.dataset.busy="0";busy(form,false)}});}
function hydrate(data,meta={}){const first=!state.ready;state.ready=true;state.authenticated=Boolean(data&&data.authenticated);state.user=data&&data.user||null;state.membership=data&&data.membership||GUEST_MEMBERSHIP;state.error=meta.error||null;renderButton();const detail={ready:true,authenticated:state.authenticated,user:state.user,membership:state.membership,error:state.error};window.dispatchEvent(new CustomEvent("nexora:account-ready",{detail}));if(first)resolveReady(detail);}
function guard(id){cacheTools();if(!state.ready)return false;const tool=state.tools.get(id)||defaultRestrictedTools.get(id);if(tool?.accessLevel!=="vvip"||state.membership.isVvip)return true;open("upgrade",tool);return false;}
document.addEventListener("click",e=>{const card=e.target.closest?.(".tools-card[data-access-level='vvip']");if(card&&!state.membership.isVvip){e.preventDefault();e.stopImmediatePropagation();guard(card.dataset.toolId)}},true);document.addEventListener("nexora:tools-rendered",cacheTools);window.NexoraAccount={state,ready,guard,open,canAccess:id=>guard(id)};
async function loadSocialContact(){
  try{
    const social=await fetch("/api/health?mode=database&resource=socials",{cache:"no-store"}).then(r=>r.json());
    state.wa=(social.data||[]).find(x=>x.key==="whatsapp_access")?.url||"";
  }catch{}
}
async function accountRequestWithTimeout(options){
  const timeoutMs=4200;
  if(typeof AbortController!=="function"){
    let timer;
    try{
      return await Promise.race([
        api(options||{}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("ACCOUNT_BOOT_TIMEOUT")),timeoutMs)})
      ]);
    }finally{if(timer)clearTimeout(timer);}
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await api({...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function boot(){
  shell();renderButton();
  void loadSocialContact();
  const hash=new URLSearchParams(location.hash.replace(/^#/,""));
  if(hash.get("access_token")&&hash.get("refresh_token")){
    try{
      hydrate(await accountRequestWithTimeout({method:"POST",body:JSON.stringify({action:"adopt-session",accessToken:hash.get("access_token"),refreshToken:hash.get("refresh_token"),expiresIn:hash.get("expires_in")})}));
      history.replaceState({},"",location.pathname+location.search);open("recovery");return;
    }catch{}
  }
  try{hydrate(await accountRequestWithTimeout());}
  catch(error){hydrate({authenticated:false,user:null,membership:GUEST_MEMBERSHIP},{error:error&&error.name==="AbortError"?"ACCOUNT_BOOT_TIMEOUT":"ACCOUNT_SESSION_UNAVAILABLE"});}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();

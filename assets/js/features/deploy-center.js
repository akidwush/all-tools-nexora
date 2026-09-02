/* Deploy Center workspace — standalone canonical app. Classic script; keep execution order. */
(function(){
  "use strict";
  var DEPLOY_APP_URL="/assets/apps/deploy-center/index.html?v=standalone-v1";
  var ov=null,loader=null,fallback=null;

  function copyTermuxDeploy(){
    var commands="pkg install nodejs git -y\nnpm install -g vercel\ncd ~/all-tools-nexora-deploy\nvercel --prod";
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(commands).then(function(){var button=document.getElementById("deployFallbackCopy");if(button){button.textContent="Perintah tersalin";setTimeout(function(){button.textContent="Salin perintah Termux";},1800);}}).catch(function(){window.prompt("Salin perintah Termux berikut:",commands);});}
    else window.prompt("Salin perintah Termux berikut:",commands);
  }

  async function checkDeployBackend(){
    if(!fallback) return;fallback.classList.remove("show");
    try{var response=await fetch("/api/vdeploy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"health",platform:"vercel"})});var data={};try{data=await response.json();}catch(error){}var code=String(data.code||data.error||"").toLowerCase();if(code.indexOf("deploy_access_not_configured")!==-1||code.indexOf("provider_not_configured")!==-1) fallback.classList.add("show");}
    catch(error){fallback.classList.add("show");}
  }

  function buildOnce(){
    if(ov) return;
    ov=document.createElement("div");ov.id="deployOverlay";ov.style.display="none";ov.setAttribute("aria-hidden","true");
    var bar=document.createElement("header");bar.id="deployTopBar";
    var btn=document.createElement("button");btn.id="deployTopBack";btn.type="button";btn.setAttribute("aria-label","Kembali");btn.innerHTML='<i class="fas fa-arrow-left"></i>';btn.addEventListener("click",closeDeploy);
    var ttl=document.createElement("div");ttl.id="deployTopTitle";ttl.innerHTML='<b>DEPLOY CENTER</b><span>All Tools Nexora · Vercel Workspace</span>';
    var status=document.createElement("div");status.id="deployTopStatus";status.title="Internal Nexora Page";status.innerHTML='<i class="fas fa-cloud-arrow-up"></i>';
    bar.appendChild(btn);bar.appendChild(ttl);bar.appendChild(status);ov.appendChild(bar);
    fallback=document.createElement("section");fallback.id="deployFallback";fallback.setAttribute("role","status");fallback.innerHTML='<div><b>Deploy otomatis belum dikonfigurasi</b><span>Gunakan jalur resmi di bawah sampai token server dipasang. Tidak ada token yang diminta atau disimpan di browser.</span></div><nav><a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer">Buka Vercel</a><a href="https://app.netlify.com/drop" target="_blank" rel="noopener noreferrer">Buka Netlify Drop</a><button id="deployFallbackCopy" type="button">Salin perintah Termux</button></nav>';fallback.querySelector("button").addEventListener("click",copyTermuxDeploy);ov.appendChild(fallback);
    var stage=document.createElement("main");stage.id="deployStage";
    loader=document.createElement("div");loader.id="deployLoader";loader.innerHTML='<div><span class="spinner"></span><span>Memuat Deploy Center</span></div>';
    var fr=document.createElement("iframe");fr.title="Nexora Deploy Center";fr.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads");fr.setAttribute("referrerpolicy","no-referrer");fr.setAttribute("loading","eager");fr.addEventListener("load",function(){if(loader) loader.classList.add("hidden");},{once:true});fr.src=DEPLOY_APP_URL;
    stage.appendChild(loader);stage.appendChild(fr);ov.appendChild(stage);document.body.appendChild(ov);
  }

  window.openDeploy=function(){buildOnce();ov.style.display="grid";ov.setAttribute("aria-hidden","false");document.body.classList.add("nx-deploy-open");requestAnimationFrame(function(){ov.classList.add("on");});checkDeployBackend();};
  function closeDeploy(){if(!ov) return;ov.classList.remove("on");ov.setAttribute("aria-hidden","true");document.body.classList.remove("nx-deploy-open");setTimeout(function(){ov.style.display="none";},240);}
  window.closeDeploy=closeDeploy;
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&ov&&ov.classList.contains("on")){e.preventDefault();closeDeploy();}});
  function patchDeploy(){document.querySelectorAll(".tools-card h4").forEach(function(h){if(!["Deploy Website","Deploy & Update Web"].includes(h.textContent.trim())) return;var card=h.closest(".tools-card");if(!card) return;card.removeAttribute("onclick");card.onclick=window.openDeploy;card.setAttribute("role","button");card.setAttribute("tabindex","0");card.onkeydown=function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();window.openDeploy();}};});}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",patchDeploy);else patchDeploy();setTimeout(patchDeploy,350);
})();

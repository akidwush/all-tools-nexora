/* Unban WhatsApp workspace — standalone canonical app. Classic script; keep execution order. */
(function(){
  "use strict";
  var UNBAN_APP_URL="/assets/apps/unban-whatsapp/index.html?v=standalone-v1";
  var loaded=false;
  var room=document.getElementById("nxUnbanRoom");
  var frame=document.getElementById("nxUnbanFrame");
  var loader=document.getElementById("nxUnbanLoader");
  var backButton=document.getElementById("nxUnbanBack");
  function ensureLoaded(){
    if(loaded||!frame) return;loaded=true;
    frame.addEventListener("load",function(){if(loader) loader.classList.add("is-hidden");},{once:true});
    frame.addEventListener("error",function(){if(loader){loader.textContent="Unban WhatsApp gagal dimuat";}},{once:true});
    frame.src=UNBAN_APP_URL;
  }
  function openUnban(){if(!room) return;ensureLoaded();room.classList.add("is-open");room.setAttribute("aria-hidden","false");document.body.classList.add("nx-about-dev-open");}
  function closeUnban(){if(!room) return;room.classList.remove("is-open");room.setAttribute("aria-hidden","true");document.body.classList.remove("nx-about-dev-open");}
  if(backButton) backButton.addEventListener("click",closeUnban);
  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&room&&room.classList.contains("is-open")) closeUnban();});
  window.openNexoraUnban=openUnban;window.closeNexoraUnban=closeUnban;
})();

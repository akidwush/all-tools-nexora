/* Nexora safe-pass postload controller. Noncritical UI/services start after DOM is ready. */
(function(){
  "use strict";
  if(window.__NEXORA_POSTLOAD_V1__)return;
  window.__NEXORA_POSTLOAD_V1__=true;

  var sources=["assets/js/core/social-links.js?v=6.4.0-hf11.1-no-wa-notif","assets/branding.js?v=6.4.0-branding1","assets/js/core/tool-health.js?v=6.4.0","assets/js/core/analytics.js?v=6.4.0","assets/js/core/personal-ai.js?v=6.4.0-hf16-mobile-paint1-dashboard-only1","assets/js/core/custom-select.js?v=6.4.0-global-select-final1","assets/js/features/visual-website.js?v=6.4.0-visual-website1","assets/js/features/placeholder-prompt-limit.js?v=6.4.0-placeholder-limit1"];
  var started=false;

  function append(src){
    if(document.querySelector('script[data-nx-postload="'+src.replace(/"/g,'\\"')+'"]'))return;
    var script=document.createElement("script");
    script.src=src;
    script.async=true;
    script.dataset.nxPostload=src;
    script.onerror=function(){
      try{window.dispatchEvent(new CustomEvent("nexora:postload-error",{detail:{src:src}}));}catch(_){ }
    };
    document.body.appendChild(script);
  }

  function start(){
    if(started)return;
    started=true;
    sources.forEach(append);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();

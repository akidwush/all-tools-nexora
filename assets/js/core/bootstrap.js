/* Nexora v6.3 — tiny critical bootstrap. */
(function(){
  "use strict";
  try{
    var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var lowPower=Boolean((connection&&connection.saveData)||(navigator.deviceMemory&&navigator.deviceMemory<=4)||reduced);
    if(lowPower)document.documentElement.classList.add("nx-low-power");
    var params=new URLSearchParams(location.search);
    if(params.get("__nexora_visual_test")==="1"){
      var current=document.currentScript;
      var script=document.createElement("script");
      script.src=current&&current.dataset.runtimeObserver||"assets/js/core/runtime-observer.js";
      script.async=true;
      document.head.appendChild(script);
    }
  }catch(_){ }
})();

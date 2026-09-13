/* Nexora v6.3 — tiny critical bootstrap. */
(function(){
  "use strict";
  var root=document.documentElement;
  var required={account:false,catalog:false,registry:false,status:false};
  var revealed=false;
  var resolveReady;
  var ready=new Promise(function(resolve){resolveReady=resolve;});
  var bootTimer=0;

  root.classList.add("nx-hydrating");
  root.classList.remove("nx-ready");
  root.dataset.appState="booting";

  function complete(reason){
    if(revealed)return;
    revealed=true;
    if(bootTimer)clearTimeout(bootTimer);
    var paint=typeof requestAnimationFrame==="function"?requestAnimationFrame:function(fn){fn();};
    paint(function(){
      root.classList.remove("nx-hydrating");
      root.classList.add("nx-ready");
      root.dataset.appState=reason==="timeout"?"ready-timeout":"ready";
      var detail={reason:reason,milestones:Object.assign({},required)};
      resolveReady(detail);
      window.dispatchEvent(new CustomEvent("nexora:app-ready",{detail:detail}));
    });
  }

  function maybeComplete(){
    if(required.account&&required.catalog&&required.registry&&required.status)complete("ready");
  }

  function mark(name){
    if(Object.prototype.hasOwnProperty.call(required,name)){
      required[name]=true;
      maybeComplete();
    }
  }

  window.addEventListener("nexora:account-ready",function(){mark("account");});
  window.addEventListener("nexora:tool-registry-ready",function(){mark("registry");});
  document.addEventListener("nexora:tools-rendered",function(){mark("catalog");});
  document.addEventListener("nexora:tool-status-ready",function(){mark("status");});

  /* Graceful ceiling only: this is not an artificial delay. Core state reveals
     immediately when all milestones are ready, otherwise neutral shell wins. */
  bootTimer=setTimeout(function(){complete("timeout");},4500);

  window.NexoraBoot=Object.freeze({
    ready:ready,
    mark:mark,
    state:function(){return{revealed:revealed,milestones:Object.assign({},required)};}
  });

  try{
    var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var lowPower=Boolean((connection&&connection.saveData)||(navigator.deviceMemory&&navigator.deviceMemory<=4)||reduced);
    if(lowPower)root.classList.add("nx-low-power");
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

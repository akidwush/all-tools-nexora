/* Nexora HF24 — DLYYZ red cursor with persistent Android touch position. */
(function(){
  "use strict";
  if(window.__NEXORA_RED_CURSOR__)return;

  var fine=window.matchMedia("(any-hover:hover) and (any-pointer:fine)");
  var coarse=window.matchMedia("(any-pointer:coarse)");
  var reduced=window.matchMedia("(prefers-reduced-motion:reduce)");
  var dot=null;
  var ring=null;
  var targetX=0;
  var targetY=0;
  var ringX=0;
  var ringY=0;
  var frame=0;
  var mounted=false;
  var visible=false;
  var hasPosition=false;
  var lastPointerType="";

  function transform(element,x,y){
    element.style.transform="translate3d("+x.toFixed(2)+"px,"+y.toFixed(2)+"px,0) translate(-50%,-50%)";
  }

  function render(){
    frame=0;
    if(!mounted)return;
    transform(dot,targetX,targetY);
    if(reduced.matches){
      ringX=targetX;
      ringY=targetY;
    }else{
      ringX+=(targetX-ringX)*.22;
      ringY+=(targetY-ringY)*.22;
    }
    transform(ring,ringX,ringY);
    if(!reduced.matches&&(Math.abs(targetX-ringX)>.15||Math.abs(targetY-ringY)>.15))schedule();
  }

  function schedule(){
    if(!frame)frame=requestAnimationFrame(render);
  }

  function setVisible(next){
    visible=next;
    if(!dot||!ring)return;
    dot.classList.toggle("is-visible",next);
    ring.classList.toggle("is-visible",next);
  }

  function setHover(next){
    if(!dot||!ring)return;
    dot.classList.toggle("is-hovering",next);
    ring.classList.toggle("is-hovering",next);
  }

  function interactiveTarget(target){
    return target instanceof Element&&Boolean(target.closest("a,button,[role='button'],.tools-card,input,select,textarea"));
  }

  function moveTo(event){
    lastPointerType=event.pointerType||"mouse";
    targetX=event.clientX;
    targetY=event.clientY;
    hasPosition=true;
    if(!visible){
      ringX=targetX;
      ringY=targetY;
      setVisible(true);
    }
    schedule();
  }

  function onPointerDown(event){moveTo(event);}
  function onPointerMove(event){moveTo(event);}

  function onPointerOver(event){setHover(interactiveTarget(event.target));}
  function onPointerOut(event){
    if(lastPointerType==="mouse"&&!event.relatedTarget)setVisible(false);
    setHover(interactiveTarget(event.relatedTarget));
  }
  function onVisibility(){
    if(document.hidden)setVisible(false);
    else if(hasPosition&&(lastPointerType!=="mouse"||coarse.matches))setVisible(true);
  }

  function createNode(id){
    var node=document.createElement("span");
    node.id=id;
    node.setAttribute("aria-hidden","true");
    document.body.appendChild(node);
    return node;
  }

  function mount(){
    if(mounted)return;
    dot=document.getElementById("nxRedCursorDot")||createNode("nxRedCursorDot");
    ring=document.getElementById("nxRedCursorRing")||createNode("nxRedCursorRing");
    document.documentElement.classList.add("nx-red-cursor-enabled");
    document.addEventListener("pointerdown",onPointerDown,{passive:true});
    document.addEventListener("pointermove",onPointerMove,{passive:true});
    document.addEventListener("pointerover",onPointerOver,{passive:true});
    document.addEventListener("pointerout",onPointerOut,{passive:true});
    document.addEventListener("visibilitychange",onVisibility);
    mounted=true;
    if(coarse.matches&&!fine.matches){
      targetX=Math.round(window.innerWidth/2);
      targetY=Math.round(window.innerHeight/3);
      ringX=targetX;
      ringY=targetY;
      hasPosition=true;
      lastPointerType="touch";
      setVisible(true);
      schedule();
    }
  }

  function unmount(){
    if(!mounted)return;
    document.removeEventListener("pointerdown",onPointerDown);
    document.removeEventListener("pointermove",onPointerMove);
    document.removeEventListener("pointerover",onPointerOver);
    document.removeEventListener("pointerout",onPointerOut);
    document.removeEventListener("visibilitychange",onVisibility);
    document.documentElement.classList.remove("nx-red-cursor-enabled");
    if(frame)cancelAnimationFrame(frame);
    frame=0;
    setVisible(false);
    dot&&dot.remove();
    ring&&ring.remove();
    dot=ring=null;
    mounted=false;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();

  window.__NEXORA_RED_CURSOR__={version:"1.1.0",touchPersistent:true,mount:mount,unmount:unmount};
})();

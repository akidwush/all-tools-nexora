/* Nexora Liquid Reactor motion — lightweight public interactions. */
(function(){
  'use strict';
  if(window.__NEXORA_LIQUID_REACTOR__)return;

  var reduced=Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var coarse=Boolean(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches);
  var nav=document.getElementById('navTabs');
  var indicator;
  var flipState=null;
  var pointerCard=null;
  var pointerFrame=0;
  var pointerX=0;
  var pointerY=0;
  var catalogVisible=true;
  var indicatorTimer=0;

  function raf(callback){return window.requestAnimationFrame?window.requestAnimationFrame(callback):setTimeout(callback,16);}
  function activeTab(){return nav&&nav.querySelector('.nav-tab.active');}
  function positionIndicator(instant){
    if(!indicator||!nav)return;
    var active=activeTab();
    if(!active)return;
    if(instant)indicator.classList.add('is-instant');
    var navBox=nav.getBoundingClientRect();
    var tabBox=active.getBoundingClientRect();
    indicator.style.transform='translate3d('+Math.round(tabBox.left-navBox.left+nav.scrollLeft)+'px,0,0)';
    indicator.style.width=Math.round(tabBox.width)+'px';
    indicator.style.height=Math.round(tabBox.height)+'px';
    if(instant)raf(function(){raf(function(){if(indicator)indicator.classList.remove('is-instant');});});
  }
  function moveIndicator(){
    if(!indicator)return;
    positionIndicator();
    indicator.classList.remove('is-moving');
    void indicator.offsetWidth;
    indicator.classList.add('is-moving');
    clearTimeout(indicatorTimer);
    indicatorTimer=setTimeout(function(){indicator.classList.remove('is-moving');},620);
  }
  function setupNavigation(){
    if(!nav)return;
    function onKeyboard(event){
      if(!/^Arrow(Left|Right)$/.test(event.key))return;
      var tabs=Array.prototype.slice.call(nav.querySelectorAll('.nav-tab'));
      var index=tabs.indexOf(document.activeElement);
      if(index<0)return;
      event.preventDefault();
      var next=(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }
    nav.addEventListener('keydown',onKeyboard);
    // The indicator is shared by desktop and touch layouts. Expensive card
    // FLIP remains disabled for coarse pointers in setupGrid().
    indicator=document.createElement('span');
    indicator.className='nx-mercury-indicator';
    indicator.setAttribute('aria-hidden','true');
    nav.prepend(indicator);
    positionIndicator();
    window.addEventListener('resize',function(){positionIndicator(coarse);},{passive:true});
    nav.addEventListener('scroll',function(){positionIndicator(coarse);},{passive:true});
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){positionIndicator(coarse);});
  }
  function cards(){return Array.prototype.slice.call(document.querySelectorAll('.tab-content.active .tools-card'));}
  function tabDistance(card,tab){
    var cardBox=card.getBoundingClientRect();
    var tabBox=tab.getBoundingClientRect();
    return Math.min(150,Math.abs((cardBox.left+cardBox.width/2)-(tabBox.left+tabBox.width/2)));
  }
  function captureFlip(){
    var tab=activeTab();
    flipState={tab:tab,items:cards().map(function(card){return {id:card.dataset.toolId,rect:card.getBoundingClientRect(),card:card};})};
  }
  function animateFlip(){
    if(!flipState)return;
    var prior=flipState;
    flipState=null;
    moveIndicator();
    if(reduced||coarse)return;
    var incoming=cards();
    var byId=new Map(prior.items.map(function(item){return [item.id,item];}));
    var reactor=document.createElement('div');
    reactor.className='nx-reactor-layer';
    document.body.appendChild(reactor);
    prior.items.forEach(function(item){
      if(incoming.some(function(card){return card.dataset.toolId===item.id;}))return;
      var ghost=item.card.cloneNode(true);
      ghost.classList.add('nx-reactor-ghost');
      ghost.style.width=item.rect.width+'px';ghost.style.height=item.rect.height+'px';
      ghost.style.transform='translate3d('+item.rect.left+'px,'+item.rect.top+'px,0)';
      reactor.appendChild(ghost);
      raf(function(){ghost.classList.add('is-absorbed');});
    });
    incoming.forEach(function(card){
      var before=byId.get(card.dataset.toolId);
      var after=card.getBoundingClientRect();
      var distance=tabDistance(card,prior.tab||activeTab());
      var delay=Math.round(Math.min(110,distance*.18));
      card.style.setProperty('--nx-liquid-delay',delay+'ms');
      if(before){
        var dx=before.rect.left-after.left,dy=before.rect.top-after.top;
        card.style.transform='translate3d('+dx+'px,'+dy+'px,0) scale(.98)';
        card.classList.add('nx-liquid-flip');
        raf(function(){card.style.transform='';card.classList.add('nx-liquid-settle');});
      }else{
        card.classList.add('nx-liquid-forming');
      }
      setTimeout(function(){card.classList.remove('nx-liquid-flip','nx-liquid-settle','nx-liquid-forming');card.style.removeProperty('--nx-liquid-delay');},680+delay);
    });
    setTimeout(function(){reactor.remove();},620);
  }
  function setupGrid(){
    document.addEventListener('nexora:navigation-before',function(){
      if(!coarse)captureFlip();
    });
    document.addEventListener('nexora:navigation-changed',function(){
      if(coarse){raf(moveIndicator);return;}
      queueMicrotask(animateFlip);
    });
    document.addEventListener('click',function(event){
      var card=event.target.closest&&event.target.closest('.tools-card');
      if(card){
        var box=card.getBoundingClientRect();
        window.__NEXORA_LIQUID_ORIGIN__={x:box.left+box.width/2,y:box.top+box.height/2,visible:box.bottom>0&&box.top<innerHeight};
      }
    },true);
    if('IntersectionObserver' in window){
      var observer=new IntersectionObserver(function(entries){catalogVisible=Boolean(entries[0]&&entries[0].isIntersecting);if(!catalogVisible)clearPointer();},{threshold:0.02});
      if(nav)observer.observe(nav);
    }
    document.addEventListener('nexora:tools-rendered',function(event){
      var detail=event.detail||{};
      var active=document.querySelector('.tab-content.active .section-title');
      if(!active)return;
      var meta=active.querySelector('.nx-catalog-meta');
      if(!meta){
        meta=document.createElement('span');
        meta.className='nx-catalog-meta';
        meta.innerHTML='<span>reactor catalog</span><b class="nx-catalog-count">0</b>';
        active.appendChild(meta);
      }
      var count=meta.querySelector('.nx-catalog-count');
      if(count)count.textContent=String(Number(detail.count)||0);
    });
    raf(function(){
      var initial=cards().length;
      document.dispatchEvent(new CustomEvent('nexora:tools-rendered',{detail:{count:initial,total:initial,tab:'all'}}));
    });
  }
  function clearPointer(){
    if(pointerFrame){cancelAnimationFrame(pointerFrame);pointerFrame=0;}
    if(pointerCard){pointerCard.classList.remove('nx-liquid-active');pointerCard.removeAttribute('data-nx-edge');pointerCard.style.removeProperty('--nx-tilt-x');pointerCard.style.removeProperty('--nx-tilt-y');pointerCard.style.removeProperty('--nx-spec-x');pointerCard.style.removeProperty('--nx-spec-y');pointerCard=null;}
  }
  function setupCards(){
    if(coarse||reduced)return;
    document.addEventListener('pointermove',function(event){
      var card=event.target.closest&&event.target.closest('.tools-card');
      if(!catalogVisible||!card){if(pointerCard)clearPointer();return;}
      if(pointerCard!==card){clearPointer();pointerCard=card;card.classList.add('nx-liquid-active');}
      pointerX=event.clientX;pointerY=event.clientY;
      if(pointerFrame)return;
      pointerFrame=raf(function(){
        pointerFrame=0;if(!pointerCard||document.hidden)return;
        var box=pointerCard.getBoundingClientRect();
        var px=Math.max(0,Math.min(1,(pointerX-box.left)/box.width));
        var py=Math.max(0,Math.min(1,(pointerY-box.top)/box.height));
        pointerCard.style.setProperty('--nx-tilt-x',((.5-py)*2.2).toFixed(2)+'deg');
        pointerCard.style.setProperty('--nx-tilt-y',((px-.5)*2.2).toFixed(2)+'deg');
        pointerCard.style.setProperty('--nx-spec-x',(px*100).toFixed(1)+'%');
        pointerCard.style.setProperty('--nx-spec-y',(py*100).toFixed(1)+'%');
        var edges={left:px,right:1-px,top:py,bottom:1-py};
        var nearest=Object.keys(edges).reduce(function(best,key){return edges[key]<edges[best]?key:best;},'left');
        pointerCard.setAttribute('data-nx-edge',nearest);
      });
    },{passive:true});
    document.addEventListener('pointerout',function(event){if(pointerCard&&!pointerCard.contains(event.relatedTarget))clearPointer();},{passive:true});
    document.addEventListener('visibilitychange',function(){if(document.hidden)clearPointer();});
  }
  function setupRoomEvents(){
    if(coarse)return;
    window.addEventListener('nexora:tool-room-open',function(){
      var room=document.getElementById('nxUniversalRoom');
      var origin=window.__NEXORA_LIQUID_ORIGIN__;
      if(!room||!origin||reduced)return;
      room.style.setProperty('--nx-origin-x',Math.round(origin.x)+'px');
      room.style.setProperty('--nx-origin-y',Math.round(origin.y)+'px');
      room.classList.add('nx-liquid-room-enter');
      setTimeout(function(){room.classList.remove('nx-liquid-room-enter');},560);
    });
    window.addEventListener('nexora:tool-room-close',function(){
      var room=document.getElementById('nxUniversalRoom');
      if(!room||reduced||!window.__NEXORA_LIQUID_ORIGIN__?.visible)return;
      room.classList.add('nx-liquid-room-exit');
      setTimeout(function(){room.classList.remove('nx-liquid-room-exit');},260);
    });
  }
  function setupCursorReactor(){
    var fine=Boolean(window.matchMedia&&window.matchMedia('(pointer: fine)').matches);
    // Reduced-motion is an explicit accessibility preference. Coarse-pointer
    // phones still receive the lightweight touch halo: it only schedules a
    // frame while a finger is moving and trails are strictly bounded.
    if(reduced){
      window.__NEXORA_CURSOR_REACTOR__={version:'1.2.0',enabled:false,finePointer:fine,reducedMotion:true,mobileTouch:false};
      return;
    }

    var ring=document.createElement('span');
    var core=document.createElement('span');
    var touch=document.createElement('span');
    ring.className='custom-cursor';
    core.className='custom-cursor-core';
    touch.className='touch-follower';
    [ring,core,touch].forEach(function(element){element.setAttribute('aria-hidden','true');});
    document.body.append(ring,core,touch);
    if(fine)document.documentElement.classList.add('nx-custom-cursor-enabled');

    var interactiveSelector='a,button,input,textarea,select,label,[role="button"],[contenteditable="true"],[tabindex]:not([tabindex="-1"]),.tools-card';
    function clock(){return window.performance&&typeof window.performance.now==='function'?window.performance.now():Date.now();}
    var mouseX=innerWidth/2,mouseY=innerHeight/2,ringX=mouseX,ringY=mouseY;
    var ringVX=0,ringVY=0,ringTargetX=mouseX,ringTargetY=mouseY;
    var lastMouseX=mouseX,lastMouseY=mouseY,lastMouseTime=clock();
    var frame=0,mouseDirty=false,mouseVisible=false,ringSettled=true;
    var activeTouchId=null,touchX=0,touchY=0,lastTouchX=0,lastTouchY=0,lastTouchTime=0;
    var touchStretch=0,touchAngle=0,touchDirty=false,touchReleaseTimer=0,holdTimer=0;
    var lastMouseTrail=0,lastTouchTrail=0,trailCount=0;

    function interactiveFrom(target){return target&&target.closest?target.closest(interactiveSelector):null;}
    function transformAt(x,y,extra){return 'translate3d('+x.toFixed(2)+'px,'+y.toFixed(2)+'px,0) translate3d(-50%,-50%,0)'+(extra||'');}
    function schedule(){if(!frame)frame=raf(render);}
    function removeTrail(trail){if(!trail||!trail.parentNode)return;trail.remove();trailCount=Math.max(0,trailCount-1);}
    function spawnTrail(x,y,type,angle){
      var limit=type==='mouse'?6:4;
      if(trailCount>=limit)return;
      var trail=document.createElement('span');
      trail.className='cursor-trail is-'+type;
      trail.setAttribute('aria-hidden','true');
      trail.style.setProperty('--nx-trail-x',x.toFixed(1)+'px');
      trail.style.setProperty('--nx-trail-y',y.toFixed(1)+'px');
      trail.style.setProperty('--nx-trail-angle',(angle||0).toFixed(1)+'deg');
      document.body.appendChild(trail);
      trailCount+=1;
      trail.addEventListener('animationend',function(){removeTrail(trail);},{once:true});
    }
    function spawnRipple(x,y){
      if(trailCount>=4)return;
      var ripple=document.createElement('span');
      ripple.className='cursor-trail is-ripple';
      ripple.setAttribute('aria-hidden','true');
      ripple.style.setProperty('--nx-trail-x',x.toFixed(1)+'px');
      ripple.style.setProperty('--nx-trail-y',y.toFixed(1)+'px');
      document.body.appendChild(ripple);
      trailCount+=1;
      ripple.addEventListener('animationend',function(){removeTrail(ripple);},{once:true});
    }
    function render(){
      frame=0;
      if(document.hidden)return;
      if(mouseDirty){
        core.style.transform=transformAt(mouseX,mouseY,' scale('+(ring.classList.contains('is-down')?'.72':'1')+')');
        mouseDirty=false;
      }
      if(mouseVisible&&!ringSettled){
        var dx=ringTargetX-ringX,dy=ringTargetY-ringY;
        ringVX=(ringVX+dx*.14)*.72;
        ringVY=(ringVY+dy*.14)*.72;
        ringX+=ringVX;ringY+=ringVY;
        ring.style.transform=transformAt(ringX,ringY);
        ringSettled=Math.abs(dx)+Math.abs(dy)+Math.abs(ringVX)+Math.abs(ringVY)<.16;
        if(ringSettled){ringX=ringTargetX;ringY=ringTargetY;ring.style.transform=transformAt(ringX,ringY);}
      }
      if(touchDirty||activeTouchId!==null&&touchStretch>.01){
        var stretch=1+touchStretch,squash=1-Math.min(.18,touchStretch*.42);
        touch.style.transform=transformAt(touchX,touchY,' rotate('+touchAngle.toFixed(1)+'deg) scale('+stretch.toFixed(3)+','+squash.toFixed(3)+')');
        touchDirty=false;
        touchStretch*=.66;
      }
      if(mouseDirty||mouseVisible&&!ringSettled||activeTouchId!==null&&touchStretch>.01)schedule();
    }
    function showMouse(){
      if(mouseVisible)return;
      mouseVisible=true;
      ringX=ringTargetX;ringY=ringTargetY;ringVX=0;ringVY=0;
      ring.style.transform=transformAt(ringX,ringY);
      ring.classList.add('is-visible');
      core.classList.add('is-visible');
    }
    function hideMouse(){
      mouseVisible=false;
      ring.classList.remove('is-visible','is-interactive','is-down');
      core.classList.remove('is-visible','is-interactive');
    }
    function onMouseMove(event){
      var wasVisible=mouseVisible;
      var now=event.timeStamp||clock();
      var dt=Math.max(8,now-lastMouseTime);
      var dx=event.clientX-lastMouseX,dy=event.clientY-lastMouseY;
      var speed=Math.hypot(dx,dy)/dt;
      var interactive=interactiveFrom(event.target);
      mouseX=event.clientX;mouseY=event.clientY;
      ringTargetX=mouseX;ringTargetY=mouseY;
      if(interactive){
        var box=interactive.getBoundingClientRect();
        ringTargetX+=(box.left+box.width/2-mouseX)*.11;
        ringTargetY+=(box.top+box.height/2-mouseY)*.11;
      }
      ring.classList.toggle('is-interactive',Boolean(interactive));
      core.classList.toggle('is-interactive',Boolean(interactive));
      showMouse();
      mouseDirty=true;ringSettled=false;
      if(wasVisible&&speed>.75&&now-lastMouseTrail>42){spawnTrail(mouseX,mouseY,'mouse',Math.atan2(dy,dx)*180/Math.PI);lastMouseTrail=now;}
      lastMouseX=mouseX;lastMouseY=mouseY;lastMouseTime=now;
      schedule();
    }
    function beginTouch(event){
      if(activeTouchId!==null)return;
      activeTouchId=event.pointerId;
      clearTimeout(touchReleaseTimer);clearTimeout(holdTimer);
      touchX=lastTouchX=event.clientX;touchY=lastTouchY=event.clientY;
      lastTouchTime=event.timeStamp||clock();
      touchStretch=0;touchAngle=0;touchDirty=true;
      var target=interactiveFrom(event.target);
      var onCard=Boolean(target&&target.closest&&target.closest('.tools-card'));
      touch.classList.remove('is-releasing','is-holding');
      touch.classList.add('is-active');
      touch.classList.toggle('is-on-card',onCard);
      if(onCard)spawnRipple(touchX,touchY);
      holdTimer=setTimeout(function(){if(activeTouchId===event.pointerId)touch.classList.add('is-holding');},520);
      schedule();
    }
    function moveTouch(event){
      if(event.pointerId!==activeTouchId)return;
      var now=event.timeStamp||clock();
      var dt=Math.max(8,now-lastTouchTime);
      var dx=event.clientX-lastTouchX,dy=event.clientY-lastTouchY;
      var distance=Math.hypot(dx,dy),speed=distance/dt;
      touchX=event.clientX;touchY=event.clientY;
      touchAngle=distance>.2?Math.atan2(dy,dx)*180/Math.PI:touchAngle;
      touchStretch=Math.min(.28,speed*.16);
      touchDirty=true;
      if(distance>6){clearTimeout(holdTimer);touch.classList.remove('is-holding');}
      if(speed>.72&&now-lastTouchTrail>48){spawnTrail(touchX,touchY,'touch',touchAngle);lastTouchTrail=now;}
      lastTouchX=touchX;lastTouchY=touchY;lastTouchTime=now;
      schedule();
    }
    function endTouch(event){
      if(event.pointerId!==activeTouchId)return;
      activeTouchId=null;
      clearTimeout(holdTimer);
      touch.classList.remove('is-active','is-holding','is-on-card');
      touch.classList.add('is-releasing');
      touch.style.transform=transformAt(touchX,touchY,' rotate('+touchAngle.toFixed(1)+'deg) scale(.34)');
      touchReleaseTimer=setTimeout(function(){touch.classList.remove('is-releasing');},260);
    }
    function onPointerDown(event){
      if(event.pointerType==='mouse'&&fine){ring.classList.add('is-down');return;}
      beginTouch(event);
    }
    function onPointerMove(event){
      if(event.pointerType==='mouse'&&fine){onMouseMove(event);return;}
      moveTouch(event);
    }
    function onPointerEnd(event){
      if(event.pointerType==='mouse'&&fine){ring.classList.remove('is-down');return;}
      endTouch(event);
    }

    document.addEventListener('pointerdown',onPointerDown,{passive:true});
    document.addEventListener('pointermove',onPointerMove,{passive:true});
    document.addEventListener('pointerup',onPointerEnd,{passive:true});
    document.addEventListener('pointercancel',onPointerEnd,{passive:true});
    document.addEventListener('pointerout',function(event){if(event.pointerType==='mouse'&&!event.relatedTarget)hideMouse();},{passive:true});
    window.addEventListener('blur',function(){hideMouse();if(activeTouchId!==null)endTouch({pointerId:activeTouchId,pointerType:'touch'});});
    document.addEventListener('visibilitychange',function(){if(document.hidden){hideMouse();clearTimeout(holdTimer);}});

    window.__NEXORA_CURSOR_REACTOR__={
      version:'1.2.0',enabled:true,finePointer:fine,reducedMotion:false,mobileTouch:coarse,
      getState:function(){return {mouseVisible:mouseVisible,touchActive:activeTouchId!==null,trailCount:trailCount,frameActive:Boolean(frame)};}
    };
  }
  function setupVisibility(){
    document.addEventListener('visibilitychange',function(){document.documentElement.classList.toggle('nx-reactor-paused',document.hidden);});
  }
  function init(){setupNavigation();setupGrid();setupCards();setupRoomEvents();setupCursorReactor();setupVisibility();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.__NEXORA_LIQUID_REACTOR__={version:'1.0.0',reducedMotion:reduced};
})();

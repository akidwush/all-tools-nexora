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
  function positionIndicator(){
    if(!indicator||!nav)return;
    var active=activeTab();
    if(!active)return;
    var navBox=nav.getBoundingClientRect();
    var tabBox=active.getBoundingClientRect();
    indicator.style.transform='translate3d('+Math.round(tabBox.left-navBox.left+nav.scrollLeft)+'px,0,0)';
    indicator.style.width=Math.round(tabBox.width)+'px';
    indicator.style.height=Math.round(tabBox.height)+'px';
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
    indicator=document.createElement('span');
    indicator.className='nx-mercury-indicator';
    indicator.setAttribute('aria-hidden','true');
    nav.prepend(indicator);
    positionIndicator();
    window.addEventListener('resize',positionIndicator,{passive:true});
    nav.addEventListener('scroll',positionIndicator,{passive:true});
    nav.addEventListener('click',function(event){if(event.target.closest('.nav-tab'))raf(moveIndicator);});
    nav.addEventListener('keydown',function(event){
      if(!/^Arrow(Left|Right)$/.test(event.key))return;
      var tabs=Array.prototype.slice.call(nav.querySelectorAll('.nav-tab'));
      var index=tabs.indexOf(document.activeElement);
      if(index<0)return;
      event.preventDefault();
      var next=(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
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
    positionIndicator();
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
    document.addEventListener('click',function(event){
      var tab=event.target.closest&&event.target.closest('.nav-tab');
      if(tab&&nav&&nav.contains(tab)){
        captureFlip();
        queueMicrotask(animateFlip);
        return;
      }
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
  function setupAperture(){
    var hero=document.querySelector('[data-nx-hero]');
    if(!hero||reduced||coarse)return;
    hero.classList.add('nx-aperture-reveal');
    var finish=function(){hero.classList.remove('nx-aperture-reveal');hero.classList.add('nx-aperture-complete');};
    hero.addEventListener('animationend',finish,{once:true});
    setTimeout(finish,1250);
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
  function setupVisibility(){
    document.addEventListener('visibilitychange',function(){document.documentElement.classList.toggle('nx-reactor-paused',document.hidden);});
  }
  function init(){setupAperture();setupNavigation();setupGrid();setupCards();setupRoomEvents();setupVisibility();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.__NEXORA_LIQUID_REACTOR__={version:'1.0.0',reducedMotion:reduced};
})();

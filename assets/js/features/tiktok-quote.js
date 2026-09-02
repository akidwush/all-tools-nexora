/* TikTok Quote — standalone canonical app. Classic script; keep execution order. */
(function(){
  'use strict';
  var TTQUOTE_APP_URL='/assets/apps/tiktok-quote/index.html?v=standalone-v1';
  window.renderTiktokQuote=function(body){
    body.innerHTML='<div class="nx-ttquote-embed"><div class="nx-ttquote-loading" id="nxTtQuoteLoading">Loading Quote Chat</div><iframe class="nx-ttquote-frame" id="nxTtQuoteFrame" title="Nexora TikTok Quote Chat" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" allow="clipboard-write" referrerpolicy="no-referrer" loading="eager"></iframe></div>';
    var frame=document.getElementById('nxTtQuoteFrame'); var loading=document.getElementById('nxTtQuoteLoading'); if(!frame) return;
    frame.addEventListener('load',function(){if(loading) loading.classList.add('is-hidden');},{once:true});
    frame.addEventListener('error',function(){if(loading){loading.textContent='Aplikasi gagal dimuat';loading.style.color='#fb7185';}},{once:true});
    frame.src=TTQUOTE_APP_URL;
  };
})();
(function(){
  'use strict';
  function isTikTokQuoteOpen(){var room=document.getElementById('nxUniversalRoom');return !!(room&&room.classList.contains('is-open')&&room.getAttribute('data-tool')==='ttquote');}
  function closeTikTokQuoteDirect(event){
    if(event){event.preventDefault();event.stopPropagation();if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();}
    var room=document.getElementById('nxUniversalRoom'); if(!room||room.getAttribute('data-tool')!=='ttquote') return false;
    room.classList.remove('is-visible','is-open');room.style.display='none';room.setAttribute('aria-hidden','true');
    var body=document.getElementById('nxUniversalRoomBody');if(body) body.innerHTML='';
    document.body.classList.remove('nx-universal-room-open');document.body.style.overflow='auto';
    if(history.state&&history.state.nxUniversalTool==='ttquote'){try{history.back();}catch(err){try{history.replaceState(null,'',location.href.split('#')[0]);}catch(ignore){}}}
    else if(location.hash.indexOf('#tool-ttquote')===0){try{history.replaceState(null,'',location.href.split('#')[0]);}catch(ignore){}}
    return true;
  }
  function bindBackButton(){var button=document.getElementById('nxUniversalRoomBack');if(!button||button.dataset.ttquoteDirectBack==='1') return;button.dataset.ttquoteDirectBack='1';button.addEventListener('click',function(event){if(isTikTokQuoteOpen()) closeTikTokQuoteDirect(event);},true);}
  document.addEventListener('click',function(event){var button=event.target&&event.target.closest?event.target.closest('#nxUniversalRoomBack'):null;if(button&&isTikTokQuoteOpen()) closeTikTokQuoteDirect(event);},true);
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&isTikTokQuoteOpen()) closeTikTokQuoteDirect(event);},true);
  var observer=new MutationObserver(bindBackButton);observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindBackButton); else bindBackButton();
  window.closeTikTokQuoteNexora=closeTikTokQuoteDirect;
})();

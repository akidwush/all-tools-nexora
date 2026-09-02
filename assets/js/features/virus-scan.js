/* Virus Scan — standalone canonical app. Classic script; keep execution order. */
(function(){
  'use strict';
  var VIRUS_SCAN_APP_URL='/assets/apps/virus-scan/index.html?v=standalone-v1';
  window.renderVirusScan=function(body){
    body.innerHTML='<div class="nx-virus-embed"><div class="nx-virus-loading" id="nxVirusLoading">Loading Security Core</div><iframe class="nx-virus-frame" id="nxVirusFrame" title="All Tools Nexora Virus Scan" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" allow="clipboard-write" referrerpolicy="no-referrer" loading="eager"></iframe></div>';
    var frame=document.getElementById('nxVirusFrame');var loading=document.getElementById('nxVirusLoading');if(!frame) return;
    frame.addEventListener('load',function(){if(loading) loading.classList.add('is-hidden');},{once:true});
    frame.addEventListener('error',function(){if(loading){loading.textContent='Virus Scan gagal dimuat';loading.style.color='#fb7185';}},{once:true});
    frame.src=VIRUS_SCAN_APP_URL;
  };
})();
(function(){
  'use strict';
  function isOpen(){var room=document.getElementById('nxUniversalRoom');return !!(room&&room.classList.contains('is-open')&&room.getAttribute('data-tool')==='virusscan');}
  function closeDirect(event){
    if(event){event.preventDefault();event.stopPropagation();if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();}
    var room=document.getElementById('nxUniversalRoom');if(!room||room.getAttribute('data-tool')!=='virusscan') return false;
    room.classList.remove('is-visible','is-open');room.style.display='none';room.setAttribute('aria-hidden','true');
    var body=document.getElementById('nxUniversalRoomBody');if(body) body.innerHTML='';
    document.body.classList.remove('nx-universal-room-open');document.body.style.overflow='auto';
    if(history.state&&history.state.nxUniversalTool==='virusscan'){try{history.back();}catch(ignore){}}
    else if(location.hash.indexOf('#tool-virusscan')===0){try{history.replaceState(null,'',location.href.split('#')[0]);}catch(ignore){}}
    return true;
  }
  document.addEventListener('click',function(event){var button=event.target&&event.target.closest?event.target.closest('#nxUniversalRoomBack'):null;if(button&&isOpen()) closeDirect(event);},true);
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&isOpen()) closeDirect(event);},true);
  window.closeVirusScanNexora=closeDirect;
})();

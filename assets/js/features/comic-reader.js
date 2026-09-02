/* Nexora Comic Reader shell — standalone static app v1.
 * IMPORTANT: UI/engine live in /assets/comic-reader/. Keep this shell minimal.
 * Project audit locks this architecture so unrelated feature work cannot silently restore legacy UI.
 */
(function(){
  'use strict';

  var activeComicFrame = null;
  var COMIC_APP_URL = '/assets/comic-reader/index.html?v=standalone-v1';

  function closeComicReader(event){
    if(event){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
    }

    var room=document.getElementById('nxUniversalRoom');
    if(!room || room.getAttribute('data-tool')!=='comicreader') return false;

    room.classList.remove('is-visible','is-open');
    room.style.display='none';
    room.setAttribute('aria-hidden','true');

    var body=document.getElementById('nxUniversalRoomBody');
    if(body) body.innerHTML='';

    document.body.classList.remove('nx-universal-room-open');
    document.body.style.overflow='auto';
    activeComicFrame=null;

    if(history.state && history.state.nxUniversalTool==='comicreader'){
      try{ history.back(); }catch(ignore){}
    }else if(location.hash.indexOf('#tool-comicreader')===0){
      try{ history.replaceState(null,'',location.href.split('#')[0]); }catch(ignore){}
    }
    return true;
  }

  window.renderComicReader=function(body){
    body.innerHTML=
      '<div class="nx-comic-embed">'+
        '<div class="nx-comic-loading" id="nxComicLoading">Loading Comic Core</div>'+
        '<iframe class="nx-comic-frame" id="nxComicFrame" title="Nexora Comic Reader" allow="clipboard-write" referrerpolicy="no-referrer" loading="eager"></iframe>'+
      '</div>';

    var frame=document.getElementById('nxComicFrame');
    var loading=document.getElementById('nxComicLoading');
    activeComicFrame=frame;
    if(!frame) return;

    frame.addEventListener('load',function(){
      if(loading) loading.classList.add('is-hidden');
    },{once:true});

    frame.src=COMIC_APP_URL;
  };

  window.addEventListener('message',function(event){
    if(!activeComicFrame || event.source!==activeComicFrame.contentWindow || !event.data) return;
    if(event.data.type==='nx-close-comic-reader') closeComicReader();
  });

  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('#nxUniversalRoomBack'):null;
    var room=document.getElementById('nxUniversalRoom');
    if(button&&room&&room.classList.contains('is-open')&&room.getAttribute('data-tool')==='comicreader'){
      closeComicReader(event);
    }
  },true);

  document.addEventListener('keydown',function(event){
    var room=document.getElementById('nxUniversalRoom');
    if(event.key==='Escape'&&room&&room.classList.contains('is-open')&&room.getAttribute('data-tool')==='comicreader'){
      closeComicReader(event);
    }
  },true);

  window.closeComicReaderNexora=closeComicReader;
})();

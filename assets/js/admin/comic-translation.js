(function(){
 'use strict';
 var form=document.getElementById('comicTranslationSettingsForm');if(!form)return;
 var enabled=form.querySelector('[name=enabled]'),sfx=form.querySelector('[name=sfxDefault]'),concurrency=form.querySelector('[name=maxConcurrentPages]'),message=form.querySelector('[role=status]');
 var editable=false,busy=false,dirty=false;
 function controls(){form.querySelectorAll('input,select,button').forEach(function(n){n.disabled=!editable||busy;});}
 form.onchange=function(){dirty=true;};
 window.NexoraAdminComicTranslation={sync:function(dashboard,canEdit){editable=Boolean(canEdit);if(!dirty&&!busy){var row=(dashboard.settings||[]).find(function(s){return s.key==='comic_translation';}),value=row&&row.value||{enabled:true,sfxDefault:false,maxConcurrentPages:2};enabled.checked=value.enabled===true;sfx.checked=value.sfxDefault===true;concurrency.value=String(value.maxConcurrentPages||2);}controls();}};
 form.onsubmit=async function(event){
  event.preventDefault();if(!editable||busy)return;busy=true;controls();message.textContent='Menyimpan…';
  var csrf=(document.cookie.match(/(?:^|;\s*)nx_admin_csrf=([^;]*)/)||[])[1]||'';
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
  try{
   var r=await fetch('/api/admin/dashboard',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf)},body:JSON.stringify({key:'comic_translation',value:{enabled:enabled.checked,sfxDefault:sfx.checked,maxConcurrentPages:Number(concurrency.value)}}),signal:controller.signal});
   var d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'Pengaturan belum dapat disimpan.');
   dirty=false;document.dispatchEvent(new CustomEvent('nexora:comic-settings-saved',{detail:d.data}));message.textContent='Pengaturan Translate All tersimpan.';
  }catch(e){message.textContent=e.name==='AbortError'?'Koneksi melewati batas waktu. Muat ulang untuk memeriksa hasil.':e.message;}
  finally{clearTimeout(timer);busy=false;controls();}
 };
 controls();
})();

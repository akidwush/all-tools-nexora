(function(){
  "use strict";
  var form=document.getElementById("multiAiSettingsForm");if(!form)return;
  var grid=document.getElementById("multiAiProviderGrid"),status=document.getElementById("multiAiKeyStatus"),message=form.querySelector("[role=status]"),registry=[],dashboard=null,editable=false,busy=false,dirty=false;
  function esc(value){return String(value||"").replace(/[&<>"']/g,function(ch){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch];});}
  function controls(){form.querySelectorAll("input,select,button").forEach(function(node){node.disabled=!editable||busy;});}
  function row(){return (dashboard&&dashboard.settings||[]).find(function(item){return item.key==="multi_ai";});}
  function render(){
    var value=row()&&row().value||{enabled:true,maxConcurrentAi:4,providers:{}};
    if(!dirty&&!busy){form.elements.enabled.checked=value.enabled!==false;form.elements.maxConcurrentAi.value=String(value.maxConcurrentAi||4);}
    grid.innerHTML=registry.map(function(provider){var checked=value.providers&&value.providers[provider.id]===false?false:true;return '<label class="nx-multiai-provider"><input type="checkbox" data-provider="'+esc(provider.id)+'" '+(checked?'checked':'')+'><span><b>'+esc(provider.name)+'</b><small>'+esc(provider.category)+'</small></span><em data-status="'+esc(provider.status||"unknown")+'"></em></label>';}).join("")||"<p>Registry provider belum tersedia.</p>";
    status.classList.toggle("is-good",Boolean(dashboard&&dashboard.multiAiConfigured));status.querySelector("span").textContent=dashboard&&dashboard.multiAiConfigured?"Configured":"Not Configured";controls();
  }
  async function loadRegistry(){try{var response=await fetch("/api/ai/provider",{credentials:"same-origin",headers:{Accept:"application/json"}}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"Registry gagal dimuat.");registry=data.providers||[];render();}catch(error){grid.textContent=error.message;}}
  window.NexoraAdminMultiAi={sync:function(value,canEdit){dashboard=value;editable=Boolean(canEdit);render();if(!registry.length)loadRegistry();}};
  form.addEventListener("change",function(){dirty=true;});
  form.addEventListener("submit",async function(event){event.preventDefault();if(!editable||busy)return;busy=true;controls();message.textContent="Menyimpan…";var providers={};grid.querySelectorAll("[data-provider]").forEach(function(input){providers[input.dataset.provider]=input.checked;});var csrf=(document.cookie.match(/(?:^|;\s*)nx_admin_csrf=([^;]*)/)||[])[1]||"";
    try{var response=await fetch("/api/admin/dashboard",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":decodeURIComponent(csrf)},body:JSON.stringify({key:"multi_ai",value:{enabled:form.elements.enabled.checked,maxConcurrentAi:Number(form.elements.maxConcurrentAi.value),providers:providers}})}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"Pengaturan belum dapat disimpan.");var list=dashboard.settings||[],index=list.findIndex(function(item){return item.key==="multi_ai";});if(index>=0)list[index]=data.data;else list.push(data.data);dashboard.settings=list;dirty=false;message.textContent="Pengaturan Multi-AI tersimpan.";document.dispatchEvent(new CustomEvent("nexora:multi-ai-settings-saved",{detail:data.data}));}
    catch(error){message.textContent=error.message;}finally{busy=false;controls();}
  });
  controls();
})();

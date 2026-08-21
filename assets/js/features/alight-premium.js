/* Nexora Alight Motion Premium — same-origin proxy, upstream GET */
(function(){
  "use strict";

  function escapeHtml(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(char){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char];});
  }

  function prettyPayload(value){
    if(value == null) return "";
    try{return JSON.stringify(value,null,2);}catch(_){return String(value);}
  }

  function validGmail(email){
    return /^[^\s@]+@gmail\.com$/i.test(String(email||'').trim());
  }

  async function request(action,payload){
    var response=await fetch('/api/alight-premium',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(Object.assign({action:action},payload||{}))
    });
    var text=await response.text();
    var data={};
    try{data=text?JSON.parse(text):{};}catch(_){data={message:text};}
    if(!response.ok||!data.ok){
      throw Object.assign(new Error(data.message||data.error||('HTTP '+response.status)),{payload:data,status:response.status});
    }
    return data;
  }

  window.renderAlightPremium=function(body){
    body.innerHTML=`
      <main class="nap" aria-label="Alight Motion Premium 1 Tahun">
        <section class="nap-hero">
          <div class="nap-mark"><i class="fa-solid fa-wave-square"></i></div>
          <div>
            <span class="nap-kicker">ALIGHT MOTION · PREMIUM WORKSPACE</span>
            <h2>Premium <b>1 Tahun</b></h2>
            <p>Magic Link dan Apply Premium diteruskan oleh server Nexora ke dua endpoint GET provider.</p>
          </div>
          <div class="nap-health is-ok" id="napHealth"><i class="fa-solid fa-shield-halved"></i><span>SERVER PROXY</span></div>
        </section>

        <section class="nap-endpoint-note">
          <i class="fa-solid fa-link"></i>
          <div><strong>Provider GET API</strong><span>Browser tetap di origin Nexora. Server meneruskan request ke endpoint GET provider tanpa API key tambahan dan tanpa timeout buatan 20/60 detik.</span></div>
        </section>

        <section class="nap-grid">
          <article class="nap-card">
            <header><span>01</span><div><small>STEP ONE</small><h3>Request Magic Link</h3></div></header>
            <label for="napEmailOne">Email Alight Motion</label>
            <div class="nap-field"><i class="fa-regular fa-envelope"></i><input id="napEmailOne" type="email" inputmode="email" autocomplete="email" placeholder="name@gmail.com"></div>
            <button class="nap-primary" id="napMagicBtn" type="button"><i class="fa-solid fa-paper-plane"></i><span>Request Magic Link</span></button>
            <div class="nap-result" id="napMagicResult" hidden></div>
          </article>

          <article class="nap-card">
            <header><span>02</span><div><small>STEP TWO</small><h3>Apply Premium</h3></div></header>
            <label for="napEmailTwo">Email Alight Motion</label>
            <div class="nap-field"><i class="fa-regular fa-envelope"></i><input id="napEmailTwo" type="email" inputmode="email" autocomplete="email" placeholder="name@gmail.com"></div>
            <label for="napMagicLink">Magic Link</label>
            <div class="nap-field nap-field-link"><i class="fa-solid fa-link"></i><input id="napMagicLink" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste magic link dari email"></div>
            <button class="nap-primary nap-apply" id="napApplyBtn" type="button"><i class="fa-solid fa-bolt"></i><span>Apply Premium 1 Tahun</span></button>
            <div class="nap-result" id="napApplyResult" hidden></div>
          </article>
        </section>

        <section class="nap-status">
          <div><span class="nap-dot"></span><div><small>SESSION STATUS</small><strong id="napSessionStatus">READY</strong></div></div>
          <button id="napReset" type="button"><i class="fa-solid fa-rotate-right"></i> Reset Session</button>
        </section>
      </main>`;

    var root=body.querySelector('.nap');
    var emailOne=root.querySelector('#napEmailOne');
    var emailTwo=root.querySelector('#napEmailTwo');
    var magicLink=root.querySelector('#napMagicLink');
    var magicButton=root.querySelector('#napMagicBtn');
    var applyButton=root.querySelector('#napApplyBtn');
    var magicResult=root.querySelector('#napMagicResult');
    var applyResult=root.querySelector('#napApplyResult');
    var sessionStatus=root.querySelector('#napSessionStatus');

    function setBusy(button,busy,label){
      button.disabled=busy;
      if(busy){button.dataset.original=button.innerHTML;button.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i><span>'+escapeHtml(label)+'</span>';}
      else if(button.dataset.original){button.innerHTML=button.dataset.original;delete button.dataset.original;}
    }

    function showResult(target,type,message,data){
      target.hidden=false;
      target.className='nap-result '+(type==='ok'?'is-ok':'is-error');
      var details=data && typeof data==='object' && Object.keys(data).length ? '<details><summary>Response provider</summary><pre>'+escapeHtml(prettyPayload(data))+'</pre></details>' : '';
      target.innerHTML='<div><i class="fa-solid '+(type==='ok'?'fa-circle-check':'fa-triangle-exclamation')+'"></i><span>'+escapeHtml(message||'Selesai')+'</span></div>'+details;
    }

    magicButton.addEventListener('click',async function(){
      var email=emailOne.value.trim().toLowerCase();
      if(!validGmail(email)){showResult(magicResult,'error','Gunakan alamat email @gmail.com yang valid.');emailOne.focus();return;}
      setBusy(magicButton,true,'Requesting…');sessionStatus.textContent='REQUESTING MAGIC LINK';magicResult.hidden=true;
      try{
        var data=await request('magic-link',{email:email});
        emailTwo.value=email;
        emailTwo.dataset.synced='1';
        showResult(magicResult,'ok',data.message||'Magic link berhasil diminta.',data.data);
        sessionStatus.textContent='MAGIC LINK REQUESTED';
        magicLink.focus();
      }catch(error){showResult(magicResult,'error',error.message,error.payload&&error.payload.data);sessionStatus.textContent='REQUEST FAILED';}
      finally{setBusy(magicButton,false);}
    });

    applyButton.addEventListener('click',async function(){
      var email=(emailTwo.value.trim()||emailOne.value.trim()).toLowerCase();
      var link=magicLink.value.trim();
      if(!validGmail(email)){showResult(applyResult,'error','Gunakan alamat email @gmail.com yang valid.');emailTwo.focus();return;}
      if(!/^https:\/\//i.test(link)){showResult(applyResult,'error','Paste magic link HTTPS lengkap dari email.');magicLink.focus();return;}
      setBusy(applyButton,true,'Applying…');sessionStatus.textContent='APPLYING PREMIUM';applyResult.hidden=true;
      try{
        var data=await request('apply-premium',{email:email,link:link});
        showResult(applyResult,'ok',data.message||'Premium berhasil diproses.',data.data);
        sessionStatus.textContent='PREMIUM APPLIED';
      }catch(error){showResult(applyResult,'error',error.message,error.payload&&error.payload.data);sessionStatus.textContent='APPLY FAILED';}
      finally{setBusy(applyButton,false);}
    });

    emailOne.addEventListener('input',function(){
      if(!emailTwo.value||emailTwo.dataset.synced==='1'){emailTwo.value=emailOne.value;emailTwo.dataset.synced='1';}
    });
    emailTwo.addEventListener('input',function(){emailTwo.dataset.synced='0';});
    root.querySelector('#napReset').addEventListener('click',function(){
      emailOne.value='';emailTwo.value='';magicLink.value='';magicResult.hidden=true;applyResult.hidden=true;sessionStatus.textContent='READY';emailOne.focus();
    });
  };
})();

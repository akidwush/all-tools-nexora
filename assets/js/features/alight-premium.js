/* Nexora Alight Motion Premium — same-origin GET via protected server route */
(function(){
  "use strict";

  var MAGIC_ROUTE='/api/alight-premium/magic-link';
  var APPLY_ROUTE='/api/alight-premium/apply-premium';

  function escapeHtml(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(char){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char];});
  }

  function prettyPayload(value){
    if(value == null) return "";
    try{return JSON.stringify(value,null,2);}catch(_){return String(value);}
  }

  function providerMessage(data,fallback){
    var candidates=[
      data&&data.message,
      data&&data.msg,
      data&&data.data&&data.data.message,
      data&&data.result&&data.result.message,
      data&&data.error&&data.error.message
    ];
    for(var i=0;i<candidates.length;i++){
      if(typeof candidates[i]==='string'&&candidates[i].trim()) return candidates[i].trim();
    }
    return fallback;
  }

  function validEmail(value){
    var email=String(value||'').trim();
    var separator=email.lastIndexOf('@');
    var local=separator>0?email.slice(0,separator):'';
    var domain=separator>0?email.slice(separator+1):'';
    return email.length<=254 && separator===email.indexOf('@') && local.length>0 && local.length<=64 && !/^\.|\.$|\.\./.test(local) && /^[^\s@\u0000-\u001f\u007f]+$/.test(local) && /^(?=.{1,189}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(domain);
  }

  async function providerGet(action,payload){
    var route=action==='magic-link'?MAGIC_ROUTE:APPLY_ROUTE;
    var url=new URL(route,window.location.origin);
    url.searchParams.set('email',payload.email);
    if(action==='apply-premium') url.searchParams.set('link',payload.link);

    var response;
    try{
      response=await fetch(url.toString(),{
        method:'GET',
        cache:'no-store',
        credentials:'same-origin',
        headers:{Accept:'application/json, text/plain;q=0.9, */*;q=0.8'}
      });
    }catch(error){
      throw Object.assign(new Error('Gateway Nexora tidak dapat menghubungi provider.'),{payload:{networkError:error&&error.message?error.message:String(error)}});
    }

    var text=await response.text();
    var data={};
    try{data=text?JSON.parse(text):{};}catch(_){data={message:text};}

    var rejected=!response.ok || data.status===false || data.ok===false || data.success===false;
    if(rejected){
      var message=providerMessage(data,'Provider mengembalikan HTTP '+response.status+'.');
      throw Object.assign(new Error(message),{payload:data,status:response.status});
    }

    return {
      message:providerMessage(data,action==='magic-link'?'Magic Link berhasil dikirim.':'Premium berhasil diproses.'),
      data:data,
      status:response.status
    };
  }

  window.renderAlightPremium=function(body){
    body.innerHTML=`
      <main class="nap" aria-label="Alight Motion Premium 1 Tahun">
        <section class="nap-hero">
          <div class="nap-mark"><i class="fa-solid fa-wave-square"></i></div>
          <div>
            <span class="nap-kicker">ALIGHT MOTION · PREMIUM WORKSPACE</span>
            <h2>Premium <b>1 Tahun</b></h2>
            <p>Dua endpoint provider diteruskan oleh gateway Nexora agar akses membership tetap diverifikasi server.</p>
          </div>
          <div class="nap-health is-ok" id="napHealth"><i class="fa-solid fa-shield-halved"></i><span>PROTECTED GET</span></div>
        </section>

        <section class="nap-endpoint-note">
          <i class="fa-solid fa-shuffle"></i>
          <div><strong>Same-Origin Protected Gateway</strong><span>Browser tetap mengakses domain Nexora; server memverifikasi akses FREE/VVIP sebelum menghubungi provider.</span></div>
        </section>

        <section class="nap-grid">
          <article class="nap-card">
            <header><span>01</span><div><small>STEP ONE</small><h3>Request Magic Link</h3></div></header>
            <label for="napEmailOne">Email Alight Motion</label>
            <div class="nap-field"><i class="fa-regular fa-envelope"></i><input id="napEmailOne" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="nama@email.com"></div>
            <button class="nap-primary" id="napMagicBtn" type="button"><i class="fa-solid fa-paper-plane"></i><span>Request Magic Link</span></button>
            <div class="nap-result" id="napMagicResult" hidden></div>
          </article>

          <article class="nap-card">
            <header><span>02</span><div><small>STEP TWO</small><h3>Apply Premium</h3></div></header>
            <label for="napEmailTwo">Email Alight Motion</label>
            <div class="nap-field"><i class="fa-regular fa-envelope"></i><input id="napEmailTwo" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="nama@email.com"></div>
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
      var email=emailOne.value.trim();
      if(!validEmail(email)){showResult(magicResult,'error','Masukkan alamat email yang valid.');emailOne.focus();return;}
      setBusy(magicButton,true,'Requesting…');sessionStatus.textContent='REQUESTING MAGIC LINK';magicResult.hidden=true;
      try{
        var result=await providerGet('magic-link',{email:email});
        emailTwo.value=email;
        emailTwo.dataset.synced='1';
        showResult(magicResult,'ok',result.message,result.data);
        sessionStatus.textContent='MAGIC LINK REQUESTED';
        magicLink.focus();
      }catch(error){showResult(magicResult,'error',error.message,error.payload);sessionStatus.textContent='REQUEST FAILED';}
      finally{setBusy(magicButton,false);}
    });

    applyButton.addEventListener('click',async function(){
      var email=emailTwo.value.trim()||emailOne.value.trim();
      var link=magicLink.value.trim();
      if(!validEmail(email)){showResult(applyResult,'error','Masukkan alamat email yang valid.');emailTwo.focus();return;}
      if(!/^https:\/\//i.test(link)){showResult(applyResult,'error','Paste magic link HTTPS lengkap dari email.');magicLink.focus();return;}
      setBusy(applyButton,true,'Applying…');sessionStatus.textContent='APPLYING PREMIUM';applyResult.hidden=true;
      try{
        var result=await providerGet('apply-premium',{email:email,link:link});
        showResult(applyResult,'ok',result.message,result.data);
        sessionStatus.textContent='PREMIUM APPLIED';
      }catch(error){showResult(applyResult,'error',error.message,error.payload);sessionStatus.textContent='APPLY FAILED';}
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

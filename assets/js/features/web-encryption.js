/* Nexora v6.3.1 — local Web Encryption tool */
(function(){
  'use strict';

  function bytesToBase64(bytes){
    var binary='';
    var chunk=0x8000;
    for(var i=0;i<bytes.length;i+=chunk){
      binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    }
    return btoa(binary);
  }

  function escapeHtml(value){
    return String(value==null?'':value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function compactHtml(source){
    return String(source||'')
      .replace(/<!--[\s\S]*?-->/g,'')
      .replace(/>\s+</g,'><')
      .trim();
  }

  async function deriveKey(password,salt){
    var material=await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:salt,iterations:180000,hash:'SHA-256'},
      material,
      {name:'AES-GCM',length:256},
      false,
      ['encrypt','decrypt']
    );
  }

  function protectedDocument(payload,title){
    var safeTitle=escapeHtml(title||'Protected Page');
    var payloadJson=JSON.stringify(payload).replace(/</g,'\\u003c');
    return '<!doctype html>\n'+
      '<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<meta name="robots" content="noindex,nofollow"><title>'+safeTitle+'</title>'+ 
      '<style>html,body{min-height:100%;margin:0}body{display:grid;place-items:center;background:#09070d;color:#f8fafc;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:20px;box-sizing:border-box}.card{width:min(440px,100%);background:#12101a;border:1px solid #2b2338;border-radius:24px;padding:24px;box-sizing:border-box;box-shadow:0 24px 80px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#7c3aed22;border:1px solid #a78bfa55;font-size:25px}.eyebrow{margin:20px 0 6px;color:#c4b5fd;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{font-size:25px;line-height:1.2;margin:0 0 10px}p{color:#a8a0b5;line-height:1.6;margin:0 0 18px;font-size:14px}input,button{width:100%;box-sizing:border-box;border-radius:14px;font:inherit}input{padding:14px 15px;background:#0b0910;border:1px solid #332a41;color:#fff;outline:none}input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px #8b5cf622}button{margin-top:11px;padding:14px 16px;border:0;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-weight:800;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.msg{min-height:20px;margin-top:12px;color:#fda4af;font-size:13px}.foot{margin-top:16px;font-size:11px;color:#6f667a;text-align:center}</style></head><body>'+ 
      '<main class="card"><div class="mark">🔐</div><div class="eyebrow">Nexora Protected HTML</div><h1>Halaman dilindungi</h1><p>Masukkan password untuk membuka konten terenkripsi pada browser ini.</p><input id="pw" type="password" autocomplete="current-password" placeholder="Password"><button id="open" type="button">Buka halaman</button><div class="msg" id="msg" role="status"></div><div class="foot">AES-GCM · PBKDF2-SHA256 · diproses lokal</div></main>'+ 
      '<script>(function(){"use strict";var P='+payloadJson+';function b64(v){var s=atob(v),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a}async function key(p,s){var m=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:s,iterations:180000,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["decrypt"])}async function open(){var btn=document.getElementById("open"),msg=document.getElementById("msg"),pw=document.getElementById("pw").value;if(!pw){msg.textContent="Password wajib diisi.";return}btn.disabled=true;btn.textContent="Membuka…";msg.textContent="";try{var plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(P.iv)},await key(pw,b64(P.salt)),b64(P.data));var html=new TextDecoder().decode(plain);document.open();document.write(html);document.close()}catch(e){msg.textContent="Password salah atau file rusak.";btn.disabled=false;btn.textContent="Buka halaman"}}document.getElementById("open").addEventListener("click",open);document.getElementById("pw").addEventListener("keydown",function(e){if(e.key==="Enter")open()})})();<\/script></body></html>';
  }

  async function copyText(text){
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return;
    }
    var area=document.createElement('textarea');
    area.value=text;
    area.style.position='fixed';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  function downloadText(text,filename){
    var blob=new Blob([text],{type:'text/html;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var link=document.createElement('a');
    link.href=url;
    link.download=filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }

  function setMessage(node,message,tone){
    node.textContent=message||'';
    node.dataset.tone=tone||'neutral';
  }

  window.renderWebEncryption=function renderWebEncryption(body){
    body.innerHTML=''+
      '<div class="nx-webenc">'+
        '<div class="nx-webenc-head"><div><span class="nx-webenc-kicker">LOCAL SECURITY TOOL</span><h2><i class="fa-solid fa-shield-halved"></i> Web Encryption</h2><p>Ubah HTML menjadi satu file yang hanya terbuka dengan password. Seluruh proses berjalan di perangkatmu.</p></div><span class="nx-webenc-badge">AES-256-GCM</span></div>'+ 
        '<div class="nx-webenc-note"><i class="fa-solid fa-circle-info"></i><span>Ini perlindungan client-side, bukan DRM mutlak. Simpan source asli dan password secara terpisah.</span></div>'+ 
        '<label class="nx-webenc-file" for="nxWebEncFile"><i class="fa-solid fa-file-code"></i><span><b>Ambil file HTML</b><small>Maksimal 5 MB · .html, .htm, atau .txt</small></span><input id="nxWebEncFile" type="file" accept=".html,.htm,.txt,text/html,text/plain"></label>'+ 
        '<label for="nxWebEncSource">Source HTML</label><textarea id="nxWebEncSource" class="v-textarea nx-webenc-source" spellcheck="false" placeholder="Tempel source HTML lengkap di sini…"></textarea>'+ 
        '<div class="nx-webenc-grid"><label>Judul halaman<input id="nxWebEncTitle" class="v-input" type="text" maxlength="80" value="Protected Page" placeholder="Protected Page"></label><label>Password<input id="nxWebEncPassword" class="v-input" type="password" minlength="4" autocomplete="new-password" placeholder="Minimal 4 karakter"></label></div>'+ 
        '<label class="nx-webenc-check"><input id="nxWebEncCompact" type="checkbox"><span>Rapikan ukuran source sebelum dienkripsi</span></label>'+ 
        '<button class="v-btn" id="nxWebEncGenerate" type="button"><i class="fa-solid fa-lock"></i> Enkripsi HTML</button>'+ 
        '<div class="nx-webenc-status" id="nxWebEncStatus" role="status"></div>'+ 
        '<section class="nx-webenc-result" id="nxWebEncResult" hidden><div class="nx-webenc-result-head"><div><b>File terenkripsi siap</b><span>Password tidak disimpan di dalam file.</span></div><span id="nxWebEncSize"></span></div><textarea id="nxWebEncOutput" class="v-textarea nx-webenc-output" readonly spellcheck="false"></textarea><div class="nx-webenc-actions"><button class="v-btn" id="nxWebEncDownload" type="button"><i class="fa-solid fa-download"></i> Download HTML</button><button class="v-btn nx-webenc-secondary" id="nxWebEncCopy" type="button"><i class="fa-regular fa-copy"></i> Salin source</button></div></section>'+ 
      '</div>';

    var source=document.getElementById('nxWebEncSource');
    var password=document.getElementById('nxWebEncPassword');
    var title=document.getElementById('nxWebEncTitle');
    var compact=document.getElementById('nxWebEncCompact');
    var file=document.getElementById('nxWebEncFile');
    var generate=document.getElementById('nxWebEncGenerate');
    var status=document.getElementById('nxWebEncStatus');
    var result=document.getElementById('nxWebEncResult');
    var output=document.getElementById('nxWebEncOutput');
    var size=document.getElementById('nxWebEncSize');
    var latest='';

    file.addEventListener('change',async function(){
      var selected=file.files&&file.files[0];
      if(!selected)return;
      if(selected.size>5*1024*1024){
        file.value='';
        setMessage(status,'File terlalu besar. Batas maksimal 5 MB.','error');
        return;
      }
      try{
        source.value=await selected.text();
        if(!title.value||title.value==='Protected Page') title.value=selected.name.replace(/\.(?:html?|txt)$/i,'')||'Protected Page';
        setMessage(status,'File berhasil dimuat.','success');
      }catch(error){
        setMessage(status,'File gagal dibaca.','error');
      }
    });

    generate.addEventListener('click',async function(){
      var html=source.value.trim();
      var pass=password.value;
      if(!html){setMessage(status,'Source HTML masih kosong.','error');source.focus();return;}
      if(pass.length<4){setMessage(status,'Password minimal 4 karakter.','error');password.focus();return;}
      if(!window.crypto||!crypto.subtle){setMessage(status,'Browser ini belum mendukung Web Crypto API.','error');return;}
      generate.disabled=true;
      generate.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Mengenkripsi…';
      setMessage(status,'Membuat kunci dan mengenkripsi source…','neutral');
      try{
        if(compact.checked) html=compactHtml(html);
        var salt=crypto.getRandomValues(new Uint8Array(16));
        var iv=crypto.getRandomValues(new Uint8Array(12));
        var key=await deriveKey(pass,salt);
        var encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,new TextEncoder().encode(html));
        latest=protectedDocument({salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(encrypted))},title.value.trim()||'Protected Page');
        output.value=latest;
        size.textContent=(new Blob([latest]).size/1024).toFixed(1)+' KB';
        result.hidden=false;
        setMessage(status,'Enkripsi berhasil. Uji file hasil dengan password sebelum dipublikasikan.','success');
        result.scrollIntoView({behavior:'smooth',block:'nearest'});
      }catch(error){
        console.error('[Nexora Web Encryption]',error);
        setMessage(status,'Enkripsi gagal: '+(error&&error.message?error.message:'kesalahan browser'),'error');
      }finally{
        generate.disabled=false;
        generate.innerHTML='<i class="fa-solid fa-lock"></i> Enkripsi HTML';
      }
    });

    document.getElementById('nxWebEncDownload').addEventListener('click',function(){
      if(!latest)return;
      var filename=(title.value.trim()||'protected-page').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'protected-page';
      downloadText(latest,filename+'-encrypted.html');
    });

    document.getElementById('nxWebEncCopy').addEventListener('click',async function(){
      if(!latest)return;
      try{await copyText(latest);setMessage(status,'Source terenkripsi berhasil disalin.','success');}
      catch(error){setMessage(status,'Gagal menyalin source. Gunakan tombol Download.','error');}
    });
  };
})();

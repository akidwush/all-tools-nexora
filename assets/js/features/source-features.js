/* Source-backed feature overrides — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 9: nxNexusSourceFeatures ===== */
(function(){
  "use strict";

  function nxSafe(value){
    return String(value == null ? "" : value)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function nxFilename(value,fallback){
    const clean = String(value || fallback || "file")
      .replace(/[\\/:*?"<>|]+/g,"_")
      .replace(/\s+/g,"_")
      .slice(0,90);
    return clean || fallback || "file";
  }

  function nxRoundRect(ctx,x,y,w,h,r){
    const radius=Math.max(0,Math.min(r,Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function nxWrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=String(text||"").trim().split(/\s+/).filter(Boolean);
    const lines=[];
    let line="";
    for(const word of words){
      const test=line?line+" "+word:word;
      if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}
      else line=test;
    }
    if(line)lines.push(line);
    const visible=lines.slice(0,maxLines||lines.length);
    if(lines.length>visible.length&&visible.length){
      let last=visible[visible.length-1];
      while(last&&ctx.measureText(last+"…").width>maxWidth)last=last.slice(0,-1);
      visible[visible.length-1]=last+"…";
    }
    visible.forEach((value,index)=>ctx.fillText(value,x,y+index*lineHeight));
  }

  function nxCanvasBlob(canvas){
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob&&blob.size?resolve(blob):reject(new Error("Gagal membuat gambar lokal")),"image/png",0.96);
    });
  }

  async function nxOptionalAvatar(url){
    const clean=String(url||"").trim();
    if(!clean)return null;
    let objectUrl="";
    try{
      const response=await window.NexoraFetch(clean,{nexoraTimeoutMs:8000,nexoraRetries:0});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const blob=await response.blob();
      if(!blob||!blob.size||blob.type&&!blob.type.startsWith("image/"))throw new Error("Bukan gambar");
      objectUrl=URL.createObjectURL(blob);
      const image=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error("Foto profil tidak dapat dibaca"));
        img.src=objectUrl;
      });
      return {image,objectUrl};
    }catch(error){
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      return null;
    }
  }

  async function nxBuildFakeDevFallback(nama,bio,imageUrl){
    const canvas=document.createElement("canvas");
    canvas.width=1200;canvas.height=720;
    const ctx=canvas.getContext("2d");
    const gradient=ctx.createLinearGradient(0,0,1200,720);
    gradient.addColorStop(0,"#070313");
    gradient.addColorStop(.55,"#16072b");
    gradient.addColorStop(1,"#30105e");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,720);

    ctx.globalAlpha=.18;ctx.strokeStyle="#a78bfa";ctx.lineWidth=1;
    for(let x=0;x<=1200;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,720);ctx.stroke();}
    for(let y=0;y<=720;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
    ctx.globalAlpha=1;

    nxRoundRect(ctx,70,70,1060,580,44);
    ctx.fillStyle="rgba(10,4,24,.88)";ctx.fill();
    ctx.strokeStyle="rgba(196,181,253,.38)";ctx.lineWidth=3;ctx.stroke();

    ctx.fillStyle="#c4b5fd";ctx.font="900 26px Orbitron,Arial,sans-serif";
    ctx.fillText("FAKEDEV // LOCAL RESILIENT MODE",120,135);
    ctx.fillStyle="#6ee7b7";ctx.font="800 17px Inter,Arial,sans-serif";
    ctx.fillText("GENERATED ON DEVICE · NO SOURCE API REQUIRED",120,171);

    const avatar=await nxOptionalAvatar(imageUrl);
    ctx.save();
    ctx.beginPath();ctx.arc(260,340,112,0,Math.PI*2);ctx.clip();
    if(avatar){
      const img=avatar.image;
      const sw=img.naturalWidth||img.width,sh=img.naturalHeight||img.height;
      const size=Math.min(sw,sh),sx=(sw-size)/2,sy=(sh-size)/2;
      ctx.drawImage(img,sx,sy,size,size,148,228,224,224);
    }else{
      const avatarGradient=ctx.createLinearGradient(148,228,372,452);
      avatarGradient.addColorStop(0,"#7c3aed");avatarGradient.addColorStop(1,"#22d3ee");
      ctx.fillStyle=avatarGradient;ctx.fillRect(148,228,224,224);
      const initials=String(nama||"Developer").split(/\s+/).slice(0,2).map(v=>v.charAt(0)).join("").toUpperCase()||"FD";
      ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="900 72px Orbitron,Arial,sans-serif";ctx.fillText(initials,260,340);
    }
    ctx.restore();
    if(avatar&&avatar.objectUrl)URL.revokeObjectURL(avatar.objectUrl);
    ctx.beginPath();ctx.arc(260,340,116,0,Math.PI*2);ctx.strokeStyle="#c4b5fd";ctx.lineWidth=8;ctx.stroke();

    ctx.textAlign="left";ctx.textBaseline="alphabetic";
    ctx.fillStyle="#fff";ctx.font="900 58px Poppins,Arial,sans-serif";
    nxWrapCanvasText(ctx,nama||"Developer",430,286,610,68,2);
    ctx.fillStyle="#a78bfa";ctx.font="800 24px Poppins,Arial,sans-serif";
    ctx.fillText("FULL STACK DEVELOPER PROFILE",432,378);
    ctx.fillStyle="#ddd6fe";ctx.font="500 27px Poppins,Arial,sans-serif";
    nxWrapCanvasText(ctx,bio||"Full Stack Developer",432,430,610,42,4);

    const chips=["HTML","CSS","JAVASCRIPT","NODE.JS"];
    chips.forEach((chip,index)=>{
      const x=120+index*245;
      nxRoundRect(ctx,x,540,210,62,18);
      ctx.fillStyle="rgba(167,139,250,.12)";ctx.fill();
      ctx.strokeStyle="rgba(167,139,250,.30)";ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle="#ddd6fe";ctx.textAlign="center";ctx.font="800 19px Inter,Arial,sans-serif";
      ctx.fillText(chip,x+105,579);
    });
    return nxCanvasBlob(canvas);
  }

  async function nxBuildCertificateFallback(nama){
    const canvas=document.createElement("canvas");
    canvas.width=1600;canvas.height=1000;
    const ctx=canvas.getContext("2d");
    const background=ctx.createLinearGradient(0,0,1600,1000);
    background.addColorStop(0,"#080513");
    background.addColorStop(.55,"#160b2b");
    background.addColorStop(1,"#251044");
    ctx.fillStyle=background;ctx.fillRect(0,0,1600,1000);

    ctx.globalAlpha=.16;ctx.strokeStyle="#facc15";ctx.lineWidth=2;
    for(let x=-500;x<1900;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+500,1000);ctx.stroke();}
    ctx.globalAlpha=1;

    nxRoundRect(ctx,90,90,1420,820,40);
    ctx.fillStyle="rgba(8,5,19,.90)";ctx.fill();
    ctx.strokeStyle="#facc15";ctx.lineWidth=7;ctx.stroke();
    nxRoundRect(ctx,118,118,1364,764,30);
    ctx.strokeStyle="rgba(192,132,252,.72)";ctx.lineWidth=3;ctx.stroke();

    ctx.textAlign="center";ctx.textBaseline="alphabetic";
    ctx.fillStyle="#facc15";ctx.font="900 38px Orbitron,Arial,sans-serif";
    ctx.fillText("ALL TOOLS NEXORA",800,220);
    ctx.fillStyle="#ffffff";ctx.font="900 78px Poppins,Arial,sans-serif";
    ctx.fillText("SERTIFIKAT CUSTOM",800,335);
    ctx.fillStyle="#c4b5fd";ctx.font="600 30px Poppins,Arial,sans-serif";
    ctx.fillText("Sertifikat kreatif ini diberikan kepada",800,430);

    ctx.fillStyle="#ffffff";ctx.font="900 82px Poppins,Arial,sans-serif";
    const safeName=String(nama||"Nama Contoh").slice(0,70);
    nxWrapCanvasText(ctx,safeName,800,555,1160,92,2);
    ctx.beginPath();ctx.moveTo(300,665);ctx.lineTo(1300,665);
    ctx.strokeStyle="rgba(250,204,21,.65)";ctx.lineWidth=3;ctx.stroke();

    ctx.fillStyle="#ddd6fe";ctx.font="600 27px Poppins,Arial,sans-serif";
    ctx.fillText("Karya kreatif · dibuat langsung di perangkat",800,735);
    ctx.fillStyle="#a78bfa";ctx.font="700 23px Inter,Arial,sans-serif";
    ctx.fillText(new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"}),800,795);
    ctx.fillStyle="rgba(255,255,255,.62)";ctx.font="600 18px Inter,Arial,sans-serif";
    ctx.fillText("Renderer lokal aktif — tidak bergantung pada API pihak ketiga",800,850);
    return nxCanvasBlob(canvas);
  }

  function nxMarkFallback(apiId,detail){
    try{
      if(typeof window.getApiById==="function"&&typeof window.setApiStatus==="function"){
        window.setApiStatus(window.getApiById(apiId),"warn",detail);
      }
    }catch(error){}
  }

  function nxSetSourceStatus(id,message,type){
    const element=document.getElementById(id);
    if(!element) return;
    element.className="nx-source-status show" + (type ? " "+type : "");
    element.textContent=message;
  }

  function nxClearSourceStatus(id){
    const element=document.getElementById(id);
    if(!element) return;
    element.className="nx-source-status";
    element.textContent="";
  }

  async function nxFetchBlobSource(url,signal){
    const response=await window.NexoraFetch(url,{
      method:"GET",
      headers:{"Accept":"image/*,*/*"},
      signal:signal || undefined,
      nexoraTimeoutMs:10000,
      nexoraRetries:0
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const blob=await response.blob();
    if(!blob || !blob.size) throw new Error("Hasil gambar kosong");
    return blob;
  }

  async function nxDownloadSource(url,filename){
    try{
      const response=await window.NexoraFetch(url,{headers:{"Accept":"*/*"}});
      if(!response.ok) throw new Error("HTTP "+response.status);
      const blob=await response.blob();
      const objectUrl=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=objectUrl;
      anchor.download=filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
    }catch(error){
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.target="_blank";
      anchor.rel="noopener noreferrer";
      anchor.download=filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }

  window.renderFakeDev=function(body){
    body.innerHTML=`
      <div class="nx-source-tool" style="--nx-accent:#a78bfa;--nx-accent-2:#6d28d9;--nx-accent-rgb:167,139,250">
        <section class="nx-source-intro">
          <span class="nx-source-intro-icon"><i class="fa-solid fa-user-tie"></i></span>
          <div><h2>FakeDev Profile</h2><p>API sumber dicoba lebih dahulu. Jika endpoint gagal, profile tetap dibuat melalui renderer lokal di perangkat.</p></div>
        </section>
        <section class="nx-source-grid">
          <div class="nx-source-card nx-source-form">
            <div class="nx-source-field"><label>Nama Developer</label><input id="nxFdNama" type="text" value="Developer" placeholder="Masukkan nama"></div>
            <div class="nx-source-field"><label>Bio / Status</label><input id="nxFdBio" type="text" value="Full Stack Developer" placeholder="Masukkan bio"></div>
            <div class="nx-source-field"><label>URL Foto Profil — opsional</label><input id="nxFdImage" type="url" placeholder="https://example.com/foto.jpg"></div>
            <button class="nx-source-btn" id="nxFdGenerate" type="button"><i class="fa-solid fa-user-tie"></i> Generate Profile</button>
            <div class="nx-source-loader" id="nxFdLoader">Mengambil gambar FakeDev</div>
            <div class="nx-source-status" id="nxFdStatus"></div>
            <div class="nx-source-note">Endpoint sumber: api.ikyyxd.my.id/canvas/fakedev</div>
          </div>
          <div class="nx-source-card nx-source-result">
            <div class="nx-source-stage">
              <div class="nx-source-empty" id="nxFdEmpty"><i class="fa-solid fa-image"></i>Hasil FakeDev asli akan muncul di sini.</div>
              <img id="nxFdResult" alt="Hasil FakeDev API Nexus">
            </div>
            <button class="nx-source-btn secondary" id="nxFdDownload" type="button" disabled><i class="fa-solid fa-download"></i> Download PNG</button>
          </div>
        </section>
      </div>`;

    let currentUrl="", controller=null;
    const run=async()=>{
      const nama=(document.getElementById("nxFdNama").value||"").trim()||"Developer";
      const bio=(document.getElementById("nxFdBio").value||"").trim()||"Full Stack Developer";
      const image=(document.getElementById("nxFdImage").value||"").trim();
      const button=document.getElementById("nxFdGenerate");
      const loader=document.getElementById("nxFdLoader");
      const result=document.getElementById("nxFdResult");
      const empty=document.getElementById("nxFdEmpty");
      const download=document.getElementById("nxFdDownload");

      if(controller) controller.abort();
      controller=new AbortController();
      loader.textContent="Mengambil gambar FakeDev";
      button.disabled=true;loader.classList.add("show");nxClearSourceStatus("nxFdStatus");
      try{
        let endpoint=`https://api.ikyyxd.my.id/canvas/fakedev?nama=${encodeURIComponent(nama)}&bio=${encodeURIComponent(bio)}`;
        if(image) endpoint+=`&image=${encodeURIComponent(image)}`;
        const blob=await nxFetchBlobSource(endpoint,controller.signal);
        if(currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl=URL.createObjectURL(blob);
        result.src=currentUrl;result.classList.add("show");empty.style.display="none";
        download.disabled=false;
        download.onclick=()=>nxDownloadSource(currentUrl,`fakedev_${nxFilename(nama,"Developer")}.png`);
        nxSetSourceStatus("nxFdStatus",`Profile ${nama} berhasil dibuat oleh API sumber.`,"success");
      }catch(error){
        if(error && error.name==="AbortError") return;
        try{
          loader.textContent="API sumber gagal · membuat hasil lokal";
          const blob=await nxBuildFakeDevFallback(nama,bio,image);
          if(currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl=URL.createObjectURL(blob);
          result.src=currentUrl;result.classList.add("show");empty.style.display="none";
          download.disabled=false;
          download.onclick=()=>nxDownloadSource(currentUrl,`fakedev_${nxFilename(nama,"Developer")}.png`);
          const reason=error&&error.message?error.message:"API tidak tersedia";
          nxMarkFallback("ikyyxd","API "+reason+" · generator lokal aktif");
          nxSetSourceStatus("nxFdStatus",`Mode lokal aktif. Profile ${nama} berhasil dibuat meskipun API sumber gagal (${reason}).`,"success");
        }catch(localError){
          nxSetSourceStatus("nxFdStatus","API dan generator lokal gagal: "+localError.message,"error");
        }
      }finally{
        loader.classList.remove("show");button.disabled=false;
      }
    };
    document.getElementById("nxFdGenerate").onclick=run;
    ["nxFdNama","nxFdBio"].forEach(id=>document.getElementById(id).addEventListener("keydown",e=>{if(e.key==="Enter") run();}));
  };

  window.renderSertifikatTololSource=function(body){
    body.innerHTML=`
      <div class="nx-source-tool" style="--nx-accent:#facc15;--nx-accent-2:#a855f7;--nx-accent-rgb:250,204,21">
        <section class="nx-source-intro">
          <span class="nx-source-intro-icon"><i class="fa-solid fa-certificate"></i></span>
          <div><h2>Sertifikat Custom</h2><p>Membuat sertifikat melalui API sumber dengan renderer lokal otomatis saat API sedang tidak tersedia.</p></div>
        </section>
        <section class="nx-source-grid">
          <div class="nx-source-card nx-source-form">
            <div class="nx-source-field"><label>Nama pada Sertifikat</label><input id="nxSertNama" type="text" value="Nama Contoh" placeholder="Masukkan nama"></div>
            <button class="nx-source-btn" id="nxSertGenerate" type="button"><i class="fa-solid fa-certificate"></i> Generate Sertifikat</button>
            <div class="nx-source-loader" id="nxSertLoader">Menyiapkan sertifikat</div>
            <div class="nx-source-status" id="nxSertStatus"></div>
            <div class="nx-source-note">Endpoint sumber: api.siputzx.my.id/api/canvas/sertifikat-tolol</div>
          </div>
          <div class="nx-source-card nx-source-result">
            <div class="nx-source-stage">
              <div class="nx-source-empty" id="nxSertEmpty"><i class="fa-solid fa-certificate"></i>Hasil sertifikat akan muncul di sini.</div>
              <img id="nxSertResult" alt="Sertifikat Custom Nexora">
            </div>
            <button class="nx-source-btn secondary" id="nxSertDownload" type="button" disabled><i class="fa-solid fa-download"></i> Download PNG</button>
          </div>
        </section>
      </div>`;

    let currentUrl="", controller=null;
    const run=async()=>{
      const nama=(document.getElementById("nxSertNama").value||"").trim();
      const button=document.getElementById("nxSertGenerate");
      const loader=document.getElementById("nxSertLoader");
      const result=document.getElementById("nxSertResult");
      const empty=document.getElementById("nxSertEmpty");
      const download=document.getElementById("nxSertDownload");
      if(!nama){nxSetSourceStatus("nxSertStatus","Masukkan nama terlebih dahulu.","error");return;}

      if(controller) controller.abort();
      controller=new AbortController();
      button.disabled=true;loader.classList.add("show");nxClearSourceStatus("nxSertStatus");
      try{
        const endpoint=`https://api.siputzx.my.id/api/canvas/sertifikat-tolol?text=${encodeURIComponent(nama)}`;
        const blob=await nxFetchBlobSource(endpoint,controller.signal);
        if(currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl=URL.createObjectURL(blob);
        result.src=currentUrl;result.classList.add("show");empty.style.display="none";
        download.disabled=false;
        download.onclick=()=>nxDownloadSource(currentUrl,`sertifikat_custom_${nxFilename(nama,"nama")}.png`);
        nxSetSourceStatus("nxSertStatus",`Sertifikat untuk ${nama} berhasil dibuat oleh API sumber.`,"success");
      }catch(error){
        if(error && error.name==="AbortError") return;
        try{
          loader.textContent="API sumber gagal · membuat hasil lokal";
          const blob=await nxBuildCertificateFallback(nama);
          if(currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl=URL.createObjectURL(blob);
          result.src=currentUrl;result.classList.add("show");empty.style.display="none";
          download.disabled=false;
          download.onclick=()=>nxDownloadSource(currentUrl,`sertifikat_custom_${nxFilename(nama,"nama")}.png`);
          const reason=error&&error.message?error.message:"API tidak tersedia";
          nxMarkFallback("siputzx-api","API "+reason+" · renderer sertifikat lokal aktif");
          nxSetSourceStatus("nxSertStatus",`Mode lokal aktif. Sertifikat untuk ${nama} berhasil dibuat meskipun API sumber gagal (${reason}).`,"success");
        }catch(localError){
          nxSetSourceStatus("nxSertStatus","API dan renderer lokal gagal: "+localError.message,"error");
        }
      }finally{
        loader.classList.remove("show");button.disabled=false;
      }
    };
    document.getElementById("nxSertGenerate").onclick=run;
    document.getElementById("nxSertNama").addEventListener("keydown",e=>{if(e.key==="Enter") run();});
  };

  window.renderSpotify=function(body){
    if(typeof window.NexoraDownloaderRenderSpotify==="function") return window.NexoraDownloaderRenderSpotify(body);
    body.innerHTML='<div class="nx-source-status show error">Modul Spotify belum selesai dimuat. Buka kembali tool ini.</div>';
  };
})();

/* Restore the canonical server-side Spotify cascade after this legacy module loads. */
(function(){
  if(typeof window.NexoraDownloaderRenderSpotify!=="function") return;
  window.renderSpotify=function(body){
    return window.NexoraDownloaderRenderSpotify(body);
  };
})();

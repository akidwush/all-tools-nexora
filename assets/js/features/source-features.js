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
    const response=await fetch(url,{
      method:"GET",
      headers:{"Accept":"image/*,*/*"},
      signal:signal || undefined
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const blob=await response.blob();
    if(!blob || !blob.size) throw new Error("Hasil gambar kosong");
    return blob;
  }

  async function nxDownloadSource(url,filename){
    try{
      const response=await fetch(url,{headers:{"Accept":"*/*"}});
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
          <div><h2>FakeDev Profile</h2><p>Fungsi dan endpoint diambil dari HTML Nexus. Hasil gambar dibuat oleh API FakeDev sumber, bukan canvas lokal.</p></div>
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
        nxSetSourceStatus("nxFdStatus","Gagal mengambil FakeDev: "+error.message,"error");
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
          <div><h2>Sertifikat Tolol</h2><p>Menggunakan endpoint Sertifikat Tolol asli dari HTML Nexus. Hasil tidak digambar ulang dan tidak memakai canvas lokal.</p></div>
        </section>
        <section class="nx-source-grid">
          <div class="nx-source-card nx-source-form">
            <div class="nx-source-field"><label>Nama pada Sertifikat</label><input id="nxSertNama" type="text" value="Nama Contoh" placeholder="Masukkan nama"></div>
            <button class="nx-source-btn" id="nxSertGenerate" type="button"><i class="fa-solid fa-certificate"></i> Generate Sertifikat</button>
            <div class="nx-source-loader" id="nxSertLoader">Mengambil sertifikat asli</div>
            <div class="nx-source-status" id="nxSertStatus"></div>
            <div class="nx-source-note">Endpoint sumber: api.siputzx.my.id/api/canvas/sertifikat-tolol</div>
          </div>
          <div class="nx-source-card nx-source-result">
            <div class="nx-source-stage">
              <div class="nx-source-empty" id="nxSertEmpty"><i class="fa-solid fa-certificate"></i>Hasil sertifikat API Nexus akan muncul di sini.</div>
              <img id="nxSertResult" alt="Sertifikat Tolol API Nexus">
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
        download.onclick=()=>nxDownloadSource(currentUrl,`sertifikat_${nxFilename(nama,"nama")}.png`);
        nxSetSourceStatus("nxSertStatus",`Sertifikat untuk ${nama} berhasil dibuat oleh API sumber.`,"success");
      }catch(error){
        if(error && error.name==="AbortError") return;
        nxSetSourceStatus("nxSertStatus","Gagal mengambil sertifikat: "+error.message,"error");
      }finally{
        loader.classList.remove("show");button.disabled=false;
      }
    };
    document.getElementById("nxSertGenerate").onclick=run;
    document.getElementById("nxSertNama").addEventListener("keydown",e=>{if(e.key==="Enter") run();});
  };

  window.renderSpotify=function(body){
    body.innerHTML=`
      <div class="nx-source-tool" style="--nx-accent:#4ade80;--nx-accent-2:#16a34a;--nx-accent-rgb:74,222,128">
        <section class="nx-source-intro">
          <span class="nx-source-intro-icon"><i class="fa-brands fa-spotify"></i></span>
          <div><h2>Spotify Downloader</h2><p>Endpoint, struktur respons, dan proses download mengikuti implementasi Nexus Tools yang kamu kirim.</p></div>
        </section>
        <section class="nx-source-card nx-source-form">
          <div class="nx-source-field"><label>URL Track Spotify</label><input id="nxSpUrl" type="url" placeholder="https://open.spotify.com/track/..."></div>
          <button class="nx-source-btn" id="nxSpGenerate" type="button"><i class="fa-brands fa-spotify"></i> Download Lagu</button>
          <div class="nx-source-loader" id="nxSpLoader">Mengambil data lagu</div>
          <div class="nx-source-status" id="nxSpStatus"></div>
          <div class="nx-spotify-result" id="nxSpResult">
            <div class="nx-spotify-track">
              <span class="nx-spotify-cover"><i class="fa-brands fa-spotify"></i></span>
              <div style="min-width:0"><b id="nxSpTitle">Unknown Title</b><span>Audio Spotify siap diunduh</span></div>
            </div>
            <button class="nx-source-btn secondary" id="nxSpDownload" type="button"><i class="fa-solid fa-download"></i> Download MP3</button>
          </div>
          <div class="nx-source-note">Endpoint sumber: api.ikyyxd.my.id/download/spotifydl</div>
        </section>
      </div>`;

    let currentDownloadUrl="", currentFilename="spotify_track.mp3";
    const findDownload=data=>{
      if(!data || typeof data!=="object") return "";
      return data.download || data.link || data.url ||
        (data.result && (data.result.download || data.result.link || data.result.url)) ||
        (data.data && (data.data.download || data.data.link || data.data.url)) || "";
    };
    const findTitle=data=>{
      if(!data || typeof data!=="object") return "Unknown Title";
      return data.title || data.name || data.song ||
        (data.result && (data.result.title || data.result.name)) ||
        (data.data && (data.data.title || data.data.name)) || "Unknown Title";
    };
    const run=async()=>{
      const url=(document.getElementById("nxSpUrl").value||"").trim();
      const button=document.getElementById("nxSpGenerate");
      const loader=document.getElementById("nxSpLoader");
      const result=document.getElementById("nxSpResult");
      if(!url){setSpotifyStatus("Masukkan URL Spotify terlebih dahulu.","error");return;}
      button.disabled=true;loader.classList.add("show");result.classList.remove("show");clearSpotifyStatus();
      try{
        const apiUrl=`https://api.ikyyxd.my.id/download/spotifydl?url=${encodeURIComponent(url)}`;
        const response=await fetch(apiUrl,{method:"GET",headers:{"Accept":"application/json"}});
        if(!response.ok){
          const raw=await response.text();
          let message="HTTP "+response.status;
          try{const parsed=JSON.parse(raw);message=parsed.message||parsed.error||message;}catch(ignore){}
          throw new Error(message);
        }
        const data=await response.json();
        const link=findDownload(data);
        const title=findTitle(data);
        if(!link) throw new Error("Link download tidak ditemukan");
        currentDownloadUrl=link;
        currentFilename=nxFilename(title,"spotify_track")+".mp3";
        document.getElementById("nxSpTitle").textContent=title;
        result.classList.add("show");
        setSpotifyStatus(`${title} siap diunduh.`,"success");
      }catch(error){
        setSpotifyStatus("Gagal mengambil lagu: "+error.message,"error");
      }finally{
        loader.classList.remove("show");button.disabled=false;
      }
    };
    document.getElementById("nxSpGenerate").onclick=run;
    document.getElementById("nxSpUrl").addEventListener("keydown",e=>{if(e.key==="Enter") run();});
    document.getElementById("nxSpDownload").onclick=()=>{
      if(!currentDownloadUrl){setSpotifyStatus("Generate lagu terlebih dahulu.","error");return;}
      nxDownloadSource(currentDownloadUrl,currentFilename);
    };
  };
})();

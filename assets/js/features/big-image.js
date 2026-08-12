/* Nexora Big Image v6.3.16 — Bigjpg server-side upscale room */
(function(){
  "use strict";
  if(window.renderBigImage) return;

  var ENDPOINT="/api/big-image";
  var MAX_FILE_BYTES=4000000;
  var ACCEPTED=new Set(["image/png","image/jpeg"]);
  var SCALE_MAP={"1":2,"2":4,"3":8,"4":16};

  function formatBytes(value){
    var bytes=Number(value)||0;
    if(bytes<1024)return bytes+" B";
    if(bytes<1024*1024)return (bytes/1024).toFixed(1)+" KB";
    return (bytes/1024/1024).toFixed(2)+" MB";
  }

  function safeFileBase(value){
    var name=String(value||"big-image");
    var dot=name.lastIndexOf(".");
    if(dot>0)name=name.slice(0,dot);
    return name.replace(/[^a-z0-9_-]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"big-image";
  }

  function sleep(ms){
    return new Promise(function(resolve){setTimeout(resolve,ms);});
  }

  window.renderBigImage=function(body){
    if(!body)return;
    if(typeof body.__nxCleanup==="function")body.__nxCleanup();
    body.innerHTML=""
      +"<main class='nbi' aria-label='Big Image AI Upscaler'>"
      +"  <section class='nbi-intro'>"
      +"    <div class='nbi-orbit' aria-hidden='true'><i class='fa-solid fa-up-right-and-down-left-from-center'></i></div>"
      +"    <div class='nbi-intro-copy'>"
      +"      <p class='nbi-kicker'><span></span> AI SUPER RESOLUTION</p>"
      +"      <h2>BIG <em>IMAGE</em></h2>"
      +"      <p>Perbesar ilustrasi dan foto hingga 16× dengan detail yang lebih bersih, tepi stabil, serta reduksi noise berbasis Bigjpg.</p>"
      +"    </div>"
      +"    <div class='nbi-engine' id='nbiEngine' role='status'><i class='fa-solid fa-circle-notch fa-spin'></i><span>CHECKING</span></div>"
      +"  </section>"
      +"  <section class='nbi-feature-strip' aria-label='Kemampuan Big Image'>"
      +"    <article><i class='fa-solid fa-maximize'></i><div><strong>2× — 16×</strong><span>Resolusi adaptif</span></div></article>"
      +"    <article><i class='fa-solid fa-wand-magic-sparkles'></i><div><strong>Anime + Photo</strong><span>Model terpisah</span></div></article>"
      +"    <article><i class='fa-solid fa-shield-halved'></i><div><strong>Server key</strong><span>Tidak bocor ke browser</span></div></article>"
      +"  </section>"
      +"  <div class='nbi-layout'>"
      +"    <section class='nbi-card nbi-control-card'>"
      +"      <div class='nbi-card-heading'><div><span>01 · INPUT</span><h3>Pilih gambar</h3></div><span class='nbi-limit'>PNG/JPG · MAX 4 MB</span></div>"
      +"      <input id='nbiFile' type='file' accept='image/png,image/jpeg' hidden>"
      +"      <label class='nbi-drop' id='nbiDrop' for='nbiFile'>"
      +"        <span class='nbi-drop-icon'><i class='fa-solid fa-cloud-arrow-up'></i></span>"
      +"        <strong>Unggah gambar</strong>"
      +"        <small>Ketuk untuk memilih atau jatuhkan file di sini</small>"
      +"        <span class='nbi-pick'>PILIH FILE <i class='fa-solid fa-arrow-right'></i></span>"
      +"      </label>"
      +"      <article class='nbi-file' id='nbiFileCard' hidden>"
      +"        <img id='nbiThumb' alt='Preview gambar terpilih'>"
      +"        <div><strong id='nbiFileName'>—</strong><span id='nbiFileMeta'>—</span></div>"
      +"        <button id='nbiRemoveFile' type='button' aria-label='Hapus gambar'><i class='fa-solid fa-xmark'></i></button>"
      +"      </article>"
      +"      <details class='nbi-url-box'>"
      +"        <summary><i class='fa-solid fa-link'></i> Gunakan URL gambar publik</summary>"
      +"        <div><input id='nbiUrl' type='url' inputmode='url' placeholder='https://domain.com/gambar.jpg' autocomplete='off'><small>Wajib HTTPS dan dapat diakses tanpa login.</small></div>"
      +"      </details>"
      +"      <div class='nbi-divider'><span>ATUR ENGINE</span></div>"
      +"      <fieldset class='nbi-fieldset' id='nbiStyle'>"
      +"        <legend>Jenis gambar</legend>"
      +"        <div class='nbi-choice-grid nbi-choice-grid-two'>"
      +"          <button type='button' class='is-active' data-style='art'><i class='fa-solid fa-palette'></i><span><strong>Illustration</strong><small>Anime, artwork, logo</small></span><i class='fa-solid fa-circle-check'></i></button>"
      +"          <button type='button' data-style='photo'><i class='fa-solid fa-camera'></i><span><strong>Photo</strong><small>Wajah dan fotografi</small></span><i class='fa-regular fa-circle'></i></button>"
      +"        </div>"
      +"      </fieldset>"
      +"      <fieldset class='nbi-fieldset' id='nbiScale'>"
      +"        <legend>Upscale</legend>"
      +"        <div class='nbi-scale-grid'>"
      +"          <button type='button' class='is-active' data-scale='1'><strong>2×</strong><span>FAST</span></button>"
      +"          <button type='button' data-scale='2'><strong>4×</strong><span>DETAIL</span></button>"
      +"          <button type='button' data-scale='3'><strong>8×</strong><span>PRO</span></button>"
      +"          <button type='button' data-scale='4'><strong>16×</strong><span>PRO</span></button>"
      +"        </div>"
      +"      </fieldset>"
      +"      <label class='nbi-noise' for='nbiNoise'><span><strong>Noise reduction</strong><small>Sesuaikan dengan tingkat artefak gambar.</small></span><select id='nbiNoise'><option value='-1'>None</option><option value='0'>Low</option><option value='1' selected>Medium</option><option value='2'>High</option><option value='3'>Highest</option></select></label>"
      +"      <div class='nbi-privacy'><i class='fa-solid fa-lock'></i><p><strong>Private temporary upload.</strong> File lokal disimpan pada bucket privat melalui URL bertanda tangan, lalu dibersihkan ketika proses selesai atau gagal. Pemrosesan dilakukan oleh Bigjpg.</p></div>"
      +"      <button class='nbi-run' id='nbiRun' type='button' disabled><span><i class='fa-solid fa-wand-magic-sparkles'></i> UPSCALE IMAGE</span><i class='fa-solid fa-arrow-up-right-from-square'></i></button>"
      +"      <button class='nbi-stop' id='nbiStop' type='button' hidden><i class='fa-solid fa-stop'></i> Hentikan proses</button>"
      +"      <section class='nbi-progress' id='nbiProgress' hidden aria-live='polite'>"
      +"        <div><strong id='nbiProgressLabel'>Menyiapkan gambar</strong><span id='nbiProgressValue'>0%</span></div>"
      +"        <div class='nbi-progress-track'><span id='nbiProgressBar'></span></div>"
      +"        <ol><li data-step='upload'>UPLOAD</li><li data-step='submit'>SUBMIT</li><li data-step='upscale'>UPSCALE</li><li data-step='ready'>READY</li></ol>"
      +"      </section>"
      +"    </section>"
      +"    <section class='nbi-card nbi-preview-card'>"
      +"      <div class='nbi-card-heading'><div><span>02 · PREVIEW LAB</span><h3>Before vs After</h3></div><span class='nbi-result-status' id='nbiResultStatus'>WAITING</span></div>"
      +"      <div class='nbi-view-tabs' id='nbiViewTabs'><button type='button' data-view='before'>Before</button><button type='button' class='is-active' data-view='compare'>Compare</button><button type='button' data-view='after'>After</button></div>"
      +"      <div class='nbi-stage is-empty view-compare' id='nbiStage'>"
      +"        <div class='nbi-stage-empty' id='nbiStageEmpty'><i class='fa-regular fa-image'></i><strong>Preview belum tersedia</strong><span>Unggah gambar untuk memulai.</span></div>"
      +"        <div class='nbi-before' id='nbiBefore' hidden><img id='nbiOriginal' alt='Gambar sebelum upscale'><span>BEFORE</span></div>"
      +"        <div class='nbi-after' id='nbiAfter' hidden><img id='nbiResult' alt='Gambar setelah upscale'><span>AFTER</span></div>"
      +"        <div class='nbi-split-line' id='nbiSplitLine' hidden><span><i class='fa-solid fa-left-right'></i></span></div>"
      +"        <input class='nbi-split-range' id='nbiSplit' type='range' min='0' max='100' value='50' aria-label='Bandingkan gambar sebelum dan sesudah' hidden>"
      +"      </div>"
      +"      <div class='nbi-stage-note'><i class='fa-solid fa-expand'></i><span>Preview selalu memakai <b>contain</b> agar gambar tidak terpotong atau ter-zoom di HP.</span></div>"
      +"      <div class='nbi-metrics' id='nbiMetrics' hidden>"
      +"        <article><span>INPUT</span><strong id='nbiMetricInput'>—</strong><small id='nbiMetricInputSize'>—</small></article>"
      +"        <article><span>OUTPUT</span><strong id='nbiMetricOutput'>—</strong><small id='nbiMetricScale'>—</small></article>"
      +"        <article><span>ENGINE</span><strong>BIGJPG</strong><small id='nbiMetricMode'>Illustration</small></article>"
      +"      </div>"
      +"      <div class='nbi-actions' id='nbiActions' hidden><a id='nbiDownload' href='#' target='_blank' rel='noopener noreferrer'><i class='fa-solid fa-download'></i> DOWNLOAD RESULT</a><button id='nbiReset' type='button'><i class='fa-solid fa-rotate-left'></i> RESET</button></div>"
      +"    </section>"
      +"  </div>"
      +"  <div class='nbi-toast' id='nbiToast' role='status' aria-live='polite'></div>"
      +"</main>";

    var root=body.querySelector(".nbi");
    var fileInput=root.querySelector("#nbiFile");
    var drop=root.querySelector("#nbiDrop");
    var fileCard=root.querySelector("#nbiFileCard");
    var thumb=root.querySelector("#nbiThumb");
    var fileName=root.querySelector("#nbiFileName");
    var fileMeta=root.querySelector("#nbiFileMeta");
    var urlInput=root.querySelector("#nbiUrl");
    var runButton=root.querySelector("#nbiRun");
    var stopButton=root.querySelector("#nbiStop");
    var progress=root.querySelector("#nbiProgress");
    var progressLabel=root.querySelector("#nbiProgressLabel");
    var progressValue=root.querySelector("#nbiProgressValue");
    var progressBar=root.querySelector("#nbiProgressBar");
    var stage=root.querySelector("#nbiStage");
    var empty=root.querySelector("#nbiStageEmpty");
    var before=root.querySelector("#nbiBefore");
    var after=root.querySelector("#nbiAfter");
    var originalImage=root.querySelector("#nbiOriginal");
    var resultImage=root.querySelector("#nbiResult");
    var split=root.querySelector("#nbiSplit");
    var splitLine=root.querySelector("#nbiSplitLine");
    var resultStatus=root.querySelector("#nbiResultStatus");
    var engine=root.querySelector("#nbiEngine");
    var metrics=root.querySelector("#nbiMetrics");
    var actions=root.querySelector("#nbiActions");
    var download=root.querySelector("#nbiDownload");
    var toast=root.querySelector("#nbiToast");
    var controls={noise:root.querySelector("#nbiNoise")};
    var state={file:null,objectUrl:"",resultUrl:"",style:"art",scale:"1",busy:false,cancelled:false,destroyed:false,taskId:"",jobToken:"",width:0,height:0,resultWidth:0,resultHeight:0,progress:0,controller:null};

    function notify(message,tone){
      toast.textContent=message;
      toast.className="nbi-toast is-show "+(tone||"");
      clearTimeout(toast.__timer);
      toast.__timer=setTimeout(function(){toast.className="nbi-toast";},3400);
    }

    function setStep(name){
      root.querySelectorAll(".nbi-progress li").forEach(function(item){
        var names=["upload","submit","upscale","ready"];
        var active=names.indexOf(item.dataset.step)<=names.indexOf(name);
        item.classList.toggle("is-active",active);
      });
    }

    function setProgress(value,label,step){
      state.progress=Math.max(state.progress,Math.min(100,Number(value)||0));
      progressBar.style.width=state.progress+"%";
      progressValue.textContent=Math.round(state.progress)+"%";
      if(label)progressLabel.textContent=label;
      if(step)setStep(step);
    }

    function updateRunAvailability(){
      var hasUrl=urlInput.value.trim().toLowerCase().indexOf("https://")===0;
      runButton.disabled=state.busy||(!state.file&&!hasUrl);
    }

    function setBusy(value){
      state.busy=value;
      fileInput.disabled=value;
      urlInput.disabled=value;
      controls.noise.disabled=value;
      root.querySelectorAll("#nbiStyle button,#nbiScale button").forEach(function(button){button.disabled=value;});
      stopButton.hidden=!value;
      updateRunAvailability();
    }

    function revokeObjectUrl(){
      if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl="";}
    }

    function clearResult(){
      state.resultUrl="";
      state.resultWidth=0;
      state.resultHeight=0;
      resultImage.removeAttribute("src");
      after.hidden=true;
      split.hidden=true;
      splitLine.hidden=true;
      metrics.hidden=true;
      actions.hidden=true;
      download.href="#";
      resultStatus.className="nbi-result-status";
      resultStatus.textContent=state.file||urlInput.value.trim()?"READY":"WAITING";
      stage.classList.remove("view-after");
      stage.classList.add("view-compare");
      root.querySelectorAll("#nbiViewTabs button").forEach(function(button){button.classList.toggle("is-active",button.dataset.view==="compare");});
    }

    function setFile(file){
      var lowerName=String(file&&file.name||"").toLowerCase();
      var extensionOk=lowerName.endsWith(".png")||lowerName.endsWith(".jpg")||lowerName.endsWith(".jpeg");
      if(!file||!file.size||file.size>MAX_FILE_BYTES||(!ACCEPTED.has(file.type)&&!extensionOk)){
        notify(file&&file.size>MAX_FILE_BYTES?"Ukuran file melebihi 4 MB.":"Gunakan file PNG atau JPG yang valid.","is-error");
        return;
      }
      revokeObjectUrl();
      clearResult();
      state.file=file;
      state.objectUrl=URL.createObjectURL(file);
      thumb.src=state.objectUrl;
      originalImage.src=state.objectUrl;
      fileName.textContent=file.name;
      fileMeta.textContent=formatBytes(file.size)+" · membaca dimensi…";
      fileCard.hidden=false;
      drop.classList.add("has-file");
      empty.hidden=true;
      before.hidden=false;
      stage.classList.remove("is-empty");
      urlInput.value="";
      var image=new Image();
      image.onload=function(){
        state.width=image.naturalWidth;
        state.height=image.naturalHeight;
        fileMeta.textContent=formatBytes(file.size)+" · "+state.width+" × "+state.height+" px";
        root.querySelector("#nbiMetricInput").textContent=state.width+" × "+state.height;
        root.querySelector("#nbiMetricInputSize").textContent=formatBytes(file.size);
      };
      image.onerror=function(){removeFile();notify("Gambar tidak dapat dibuka.","is-error");};
      image.src=state.objectUrl;
      updateRunAvailability();
    }

    function removeFile(){
      revokeObjectUrl();
      state.file=null;
      state.width=0;
      state.height=0;
      fileInput.value="";
      thumb.removeAttribute("src");
      originalImage.removeAttribute("src");
      fileCard.hidden=true;
      drop.classList.remove("has-file");
      before.hidden=true;
      clearResult();
      if(!urlInput.value.trim()){empty.hidden=false;stage.classList.add("is-empty");}
      updateRunAvailability();
    }

    function previewUrl(){
      var value=urlInput.value.trim();
      if(!value)return;
      try{
        var parsed=new URL(value);
        if(parsed.protocol!=="https:")throw new Error();
      }catch(_){notify("URL gambar wajib memakai HTTPS.","is-error");return;}
      if(state.file)removeFile();
      clearResult();
      originalImage.src=value;
      empty.hidden=true;
      before.hidden=false;
      stage.classList.remove("is-empty");
      originalImage.onload=function(){
        state.width=originalImage.naturalWidth;
        state.height=originalImage.naturalHeight;
        root.querySelector("#nbiMetricInput").textContent=state.width+" × "+state.height;
        root.querySelector("#nbiMetricInputSize").textContent="Public URL";
      };
      originalImage.onerror=function(){notify("Preview URL tidak dapat dimuat. Backend tetap akan memvalidasinya.","is-warning");};
      updateRunAvailability();
    }

    function selectedOptions(){
      return {style:state.style,scale:state.scale,noise:controls.noise.value};
    }

    function makeApiError(response,data){
      var error=new Error(data&&data.message?data.message:"Big Image API gagal (HTTP "+response.status+").");
      error.code=data&&data.error?data.error:"BIGJPG_HTTP_"+response.status;
      error.category=data&&data.category?data.category:"";
      error.status=response.status;
      return error;
    }

    async function api(payload,keepalive){
      var response=await fetch(ENDPOINT,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),cache:"no-store",keepalive:Boolean(keepalive)});
      var data={};
      try{data=await response.json();}catch(_){}
      if(!response.ok||data.ok===false)throw makeApiError(response,data);
      return data;
    }

    async function startUpload(file,options){
      var response=await fetch(ENDPOINT+"?upload=1",{
        method:"POST",
        headers:{
          "Content-Type":file.type||"application/octet-stream",
          "X-Nexora-Filename":encodeURIComponent(file.name||"big-image.jpg"),
          "X-Nexora-Style":options.style,
          "X-Nexora-Noise":options.noise,
          "X-Nexora-Scale":options.scale
        },
        body:file,
        cache:"no-store",
        signal:state.controller.signal
      });
      var data={};
      try{data=await response.json();}catch(_){}
      if(!response.ok||data.ok===false)throw makeApiError(response,data);
      return data;
    }

    function friendlyError(error){
      var code=String(error&&error.code||"").toLowerCase();
      if(code.indexOf("not_configured")!==-1)return "API key Bigjpg belum dikonfigurasi di Vercel.";
      if(code.indexOf("database_not_ready")!==-1||code.indexOf("storage_not_ready")!==-1)return "Database Big Image belum siap. Jalankan migration 015 di Supabase.";
      if(code.indexOf("rate_limited")!==-1)return "Batas proses per perangkat tercapai. Coba lagi setelah periode limit berakhir.";
      if(code.indexOf("daily_limit")!==-1)return "Batas penggunaan Big Image hari ini telah tercapai.";
      if(code.indexOf("param")!==-1||error&&error.category==="parameter")return "Opsi ditolak Bigjpg. Skala 8×/16× memerlukan paket yang mendukungnya.";
      if(error&&error.category==="quota"||/(?:quota|limit|balance|credit)/.test(code))return "Kuota atau saldo Bigjpg tidak mencukupi.";
      if(error&&error.category==="auth"||/(?:auth|api_key|forbidden)/.test(code))return "API key Bigjpg tidak valid atau tidak memiliki izin.";
      if(error&&error.category==="input"||/(?:input|download|url)/.test(code))return "Bigjpg tidak dapat mengambil URL gambar sumber.";
      if(code.indexOf("timeout")!==-1)return "Bigjpg timeout. Coba lagi saat antrean lebih ringan.";
      return error&&error.message?error.message:"Proses Big Image gagal.";
    }

    async function pollTask(started){
      state.taskId=started.taskId;
      state.jobToken=started.jobToken;
      for(var attempt=0;attempt<240&&!state.cancelled&&!state.destroyed;attempt++){
        if(attempt)setProgress(Math.min(93,42+attempt*0.23),"Bigjpg sedang membangun detail resolusi tinggi","upscale");
        var result=await api({action:"result",taskId:state.taskId,jobToken:state.jobToken});
        if(result.status==="success"&&result.url)return result;
        if(result.status==="failed"){
          var error=new Error(result.message||"Bigjpg gagal memproses gambar.");
          error.code=result.errorCode||"BIGJPG_TASK_FAILED";
          error.category=result.errorCategory||"provider";
          throw error;
        }
        await sleep(4000);
      }
      if(state.cancelled)throw Object.assign(new Error("Proses dihentikan."),{code:"BIGJPG_CANCELLED"});
      throw Object.assign(new Error("Proses Bigjpg melebihi 16 menit. Task dapat dicoba kembali."),{code:"BIGJPG_POLL_TIMEOUT"});
    }

    function finish(result,startedAt){
      state.resultUrl=result.url;
      resultImage.src=result.url;
      resultImage.onload=function(){
        state.resultWidth=resultImage.naturalWidth;
        state.resultHeight=resultImage.naturalHeight;
        root.querySelector("#nbiMetricOutput").textContent=state.resultWidth+" × "+state.resultHeight;
      };
      after.hidden=false;
      split.hidden=false;
      splitLine.hidden=false;
      empty.hidden=true;
      stage.classList.remove("is-empty","view-before","view-after");
      stage.classList.add("view-compare");
      metrics.hidden=false;
      actions.hidden=false;
      download.href=result.url;
      download.setAttribute("aria-label","Buka dan unduh hasil Big Image");
      var multiplier=SCALE_MAP[state.scale]||2;
      download.setAttribute("download",safeFileBase(state.file&&state.file.name||"big-image")+"-"+multiplier+"x.jpg");
      root.querySelector("#nbiMetricOutput").textContent=state.width&&state.height?(state.width*multiplier)+" × "+(state.height*multiplier):"Loading…";
      root.querySelector("#nbiMetricScale").textContent=multiplier+"× upscale · "+((performance.now()-startedAt)/1000).toFixed(1)+" s";
      root.querySelector("#nbiMetricMode").textContent=state.style==="art"?"Illustration":"Photo";
      resultStatus.className="nbi-result-status is-success";
      resultStatus.textContent="UPSCALE READY";
      setProgress(100,"Big Image selesai","ready");
      setBusy(false);
      runButton.querySelector("span").innerHTML="<i class='fa-solid fa-rotate'></i> UPSCALE AGAIN";
      notify("Upscale selesai. Geser pembanding untuk melihat detail.","is-success");
      if(matchMedia("(max-width:720px)").matches)root.querySelector(".nbi-preview-card").scrollIntoView({behavior:"smooth",block:"start"});
    }

    async function run(){
      if(state.busy)return;
      var sourceUrl=urlInput.value.trim();
      if(!state.file&&sourceUrl.toLowerCase().indexOf("https://")!==0){notify("Pilih file atau masukkan URL HTTPS.","is-error");return;}
      state.cancelled=false;
      state.controller=new AbortController();
      state.progress=0;
      clearResult();
      setBusy(true);
      progress.hidden=false;
      setProgress(5,"Memvalidasi gambar dan konfigurasi","upload");
      resultStatus.className="nbi-result-status is-working";
      resultStatus.textContent="PROCESSING";
      var startedAt=performance.now();
      try{
        var options=selectedOptions();
        var started;
        if(state.file){
          setProgress(12,"Mengunggah ke penyimpanan privat","upload");
          started=await startUpload(state.file,options);
        }else{
          setProgress(18,"Memvalidasi URL gambar publik","upload");
          started=await api({action:"start-url",inputUrl:sourceUrl,filename:"big-image.jpg",style:options.style,noise:options.noise,scale:options.scale});
        }
        if(state.cancelled)return;
        setProgress(36,"Task Bigjpg dibuat; menunggu AI upscaler","submit");
        var result=await pollTask(started);
        if(!state.cancelled)finish(result,startedAt);
      }catch(error){
        if(state.cancelled||error&&error.code==="BIGJPG_CANCELLED")return;
        setBusy(false);
        setProgress(100,"FAILED · "+friendlyError(error),"ready");
        progressValue.textContent="!";
        resultStatus.className="nbi-result-status is-error";
        resultStatus.textContent="FAILED";
        notify(friendlyError(error),"is-error");
      }
    }

    async function stop(){
      if(!state.busy)return;
      state.cancelled=true;
      if(state.controller)state.controller.abort();
      if(state.taskId&&state.jobToken)api({action:"cleanup",taskId:state.taskId,jobToken:state.jobToken},true).catch(function(){});
      setBusy(false);
      resultStatus.className="nbi-result-status is-warning";
      resultStatus.textContent="STOPPED";
      progressLabel.textContent="Proses dihentikan oleh pengguna";
      progressValue.textContent="—";
      notify("Polling dihentikan dan file sementara dijadwalkan untuk dibersihkan.","is-warning");
    }

    function reset(){
      if(state.busy)stop();
      removeFile();
      urlInput.value="";
      originalImage.removeAttribute("src");
      empty.hidden=false;
      before.hidden=true;
      stage.className="nbi-stage is-empty view-compare";
      progress.hidden=true;
      progressBar.style.width="0%";
      state.progress=0;
      state.taskId="";
      state.jobToken="";
      runButton.querySelector("span").innerHTML="<i class='fa-solid fa-wand-magic-sparkles'></i> UPSCALE IMAGE";
      updateRunAvailability();
    }

    function changeView(view){
      if(view==="after"&&!state.resultUrl){notify("Hasil upscale belum tersedia.","is-warning");return;}
      stage.classList.remove("view-before","view-compare","view-after");
      stage.classList.add("view-"+view);
      root.querySelectorAll("#nbiViewTabs button").forEach(function(button){button.classList.toggle("is-active",button.dataset.view===view);});
      var compare=view==="compare"&&Boolean(state.resultUrl);
      split.hidden=!compare;
      splitLine.hidden=!compare;
    }

    async function checkEngine(){
      try{
        var response=await fetch(ENDPOINT+"?health=1",{cache:"no-store"});
        var data={};
        try{data=await response.json();}catch(_){}
        if(!response.ok||!data.configured){
          var missing=[];
          if(!data.keyConfigured)missing.push("API key");
          if(!data.databaseConfigured||!data.jobsReady)missing.push("migration 015");
          if(!data.storageReady)missing.push("storage");
          throw new Error(missing.length?"Belum siap: "+missing.join(", "):"Engine belum siap");
        }
        engine.className="nbi-engine is-ready";
        engine.innerHTML="<i class='fa-solid fa-cloud'></i><span>BIGJPG READY</span>";
      }catch(error){
        engine.className="nbi-engine is-error";
        engine.innerHTML="<i class='fa-solid fa-triangle-exclamation'></i><span>ENGINE OFFLINE</span>";
        engine.title=error&&error.message?error.message:"Engine offline";
      }
    }

    fileInput.addEventListener("change",function(){if(fileInput.files&&fileInput.files[0])setFile(fileInput.files[0]);});
    root.querySelector("#nbiRemoveFile").addEventListener("click",removeFile);
    urlInput.addEventListener("change",previewUrl);
    urlInput.addEventListener("input",updateRunAvailability);
    runButton.addEventListener("click",run);
    stopButton.addEventListener("click",stop);
    root.querySelector("#nbiReset").addEventListener("click",reset);
    root.querySelector("#nbiStyle").addEventListener("click",function(event){
      var button=event.target.closest("button[data-style]");
      if(!button||state.busy)return;
      state.style=button.dataset.style;
      root.querySelectorAll("#nbiStyle button").forEach(function(item){
        var active=item===button;
        item.classList.toggle("is-active",active);
        item.lastElementChild.className=active?"fa-solid fa-circle-check":"fa-regular fa-circle";
      });
    });
    root.querySelector("#nbiScale").addEventListener("click",function(event){
      var button=event.target.closest("button[data-scale]");
      if(!button||state.busy)return;
      state.scale=button.dataset.scale;
      root.querySelectorAll("#nbiScale button").forEach(function(item){item.classList.toggle("is-active",item===button);});
    });
    root.querySelector("#nbiViewTabs").addEventListener("click",function(event){
      var button=event.target.closest("button[data-view]");
      if(button)changeView(button.dataset.view);
    });
    split.addEventListener("input",function(){
      stage.style.setProperty("--split",split.value+"%");
      splitLine.style.left=split.value+"%";
    });
    ["dragenter","dragover"].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.add("is-dragging");});});
    ["dragleave","drop"].forEach(function(name){drop.addEventListener(name,function(event){event.preventDefault();drop.classList.remove("is-dragging");if(name==="drop"&&event.dataTransfer&&event.dataTransfer.files[0])setFile(event.dataTransfer.files[0]);});});
    function onPaste(event){
      if(state.busy||state.destroyed||!event.clipboardData)return;
      var item=Array.from(event.clipboardData.items||[]).find(function(row){return ACCEPTED.has(row.type);});
      if(item){
        var file=item.getAsFile();
        if(file){event.preventDefault();setFile(new File([file],"clipboard-"+Date.now()+(file.type==="image/jpeg"?".jpg":".png"),{type:file.type}));}
      }
    }
    document.addEventListener("paste",onPaste);
    body.__nxCleanup=function(){
      state.destroyed=true;
      state.cancelled=true;
      if(state.controller)state.controller.abort();
      if(state.busy&&state.taskId&&state.jobToken)api({action:"cleanup",taskId:state.taskId,jobToken:state.jobToken},true).catch(function(){});
      revokeObjectUrl();
      clearTimeout(toast.__timer);
      document.removeEventListener("paste",onPaste);
    };
    checkEngine();
    updateRunAvailability();
  };
})();

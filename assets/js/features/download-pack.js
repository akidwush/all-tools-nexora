/* Terabox, Bank Jago, and Spotify pack — extracted from index.html v3. Classic script; keep execution order. */

/* ===== original script 16: nxTeraboxBankJagoSpotifySearchScript ===== */
(function(){
  "use strict";

  function esc(value){
    return String(value == null ? "" : value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function openUrl(url){
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadUrl(url,filename,meta){
    if(typeof nxDownloadUrl === "function"){
      nxDownloadUrl(url,filename,meta);
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.download = filename || "download";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function setSourceStatus(id,message,type){
    const node = document.getElementById(id);
    if(!node) return;

    node.className =
      "nx-source-status show " +
      (type || "success");
    node.textContent = String(message || "");
  }

  function clearSourceStatus(id){
    const node = document.getElementById(id);
    if(!node) return;
    node.className = "nx-source-status";
    node.textContent = "";
  }

  function normalizeTeraboxFiles(data){
    const pickArray = value =>
      Array.isArray(value) ? value : null;

    let rawList =
      pickArray(data.result && data.result.file) ||
      pickArray(data.result && data.result.files) ||
      pickArray(data.data && data.data.file) ||
      pickArray(data.data && data.data.files) ||
      pickArray(data.file) ||
      pickArray(data.files) ||
      pickArray(data.result && data.result.list) ||
      pickArray(data.data && data.data.list) ||
      pickArray(data.list) ||
      pickArray(data.result) ||
      pickArray(data.data);

    const linkFields = item =>
      item && (
        item.download_url ||
        item.downloadUrl ||
        item.url ||
        item.link ||
        item.dlink ||
        item.fast_download ||
        item.fastlink ||
        item.fast_link ||
        item.direct_link ||
        item.directLink ||
        item.stream_url ||
        item.streamUrl ||
        item.playUrl ||
        item.play_url ||
        item.download
      );

    if(!rawList){
      const single =
        data.result ||
        data.data ||
        data;

      if(linkFields(single)){
        rawList = [single];
      }
    }

    if(!rawList) return [];

    return rawList
      .map(item => ({
        name:
          item.filename ||
          item.name ||
          item.title ||
          item.file_name ||
          "File Terabox",
        sizeFormatted:
          item.size_formatted ||
          item.sizeFormatted ||
          item.size ||
          item.file_size ||
          item.fileSize ||
          "",
        downloadUrl:
          linkFields(item) ||
          "",
        thumb:
          item.thumbnail ||
          item.thumb ||
          item.image ||
          item.cover ||
          "",
        duration:
          item.duration ||
          "",
        quality:
          item.quality ||
          ""
      }))
      .filter(item => item.downloadUrl);
  }

  window.renderTerabox = function(body){
    body.innerHTML = `
      <div class="nx-source-tool"
        style="--nx-accent:#60a5fa;--nx-accent-2:#2563eb;--nx-accent-rgb:96,165,250">
        <section class="nx-source-intro">
          <span class="nx-source-intro-icon">
            <i class="fa-solid fa-box-open"></i>
          </span>
          <div>
            <h2>Terabox Downloader</h2>
            <p>Tempel link share Terabox, ambil daftar file, lalu pilih file yang akan diunduh.</p>
          </div>
        </section>

        <section class="nx-source-card nx-source-form">
          <div class="nx-source-field">
            <label>URL Share Terabox</label>
            <input
              id="nxTbUrl"
              type="url"
              placeholder="https://www.terabox.com/s/..."
            >
          </div>

          <button
            class="nx-source-btn"
            id="nxTbFetch"
            type="button"
          >
            <i class="fa-solid fa-cloud-arrow-down"></i>
            Ambil File
          </button>

          <div
            class="nx-source-loader"
            id="nxTbLoader"
          >
            Menghubungkan ke layanan Terabox
          </div>

          <div
            class="nx-source-status"
            id="nxTbStatus"
          ></div>

          <div
            class="nx-cloud-list"
            id="nxTbFiles"
          ></div>
        </section>
      </div>
    `;

    const input =
      document.getElementById("nxTbUrl");
    const button =
      document.getElementById("nxTbFetch");
    const loader =
      document.getElementById("nxTbLoader");
    const listNode =
      document.getElementById("nxTbFiles");

    async function run(){
      const url = String(input.value || "").trim();

      if(!url){
        setSourceStatus(
          "nxTbStatus",
          "Masukkan URL share Terabox terlebih dahulu.",
          "error"
        );
        return;
      }

      button.disabled = true;
      loader.classList.add("show");
      listNode.innerHTML = "";
      clearSourceStatus("nxTbStatus");

      try{
        const endpoint =
          "https://api.nexray.eu.cc/downloader/terabox?url=" +
          encodeURIComponent(url);

        const response = await window.NexoraFetch(endpoint,{
          method:"GET",
          headers:{
            "Accept":"application/json,text/plain,*/*"
          }
        });

        if(!response.ok){
          throw new Error(
            "Server API bermasalah (HTTP " +
            response.status +
            ")."
          );
        }

        const data = await response.json();

        if(
          data &&
          (
            data.success === false ||
            data.status === false
          )
        ){
          throw new Error(
            data.message ||
            "File tidak ditemukan atau link tidak valid."
          );
        }

        const files =
          normalizeTeraboxFiles(data);

        if(!files.length){
          const raw = esc(
            JSON.stringify(data,null,2)
          );

          listNode.innerHTML = `
            <details class="nx-source-status show error">
              <summary>Format file tidak ditemukan — lihat respons API</summary>
              <pre style="white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;margin-top:8px;">${raw}</pre>
            </details>
          `;

          throw new Error(
            data.message ||
            "File tidak ditemukan pada respons server."
          );
        }

        setSourceStatus(
          "nxTbStatus",
          "Ditemukan " +
          files.length +
          " file dari link Terabox.",
          "success"
        );

        listNode.innerHTML = "";

        files.forEach((file,index) => {
          const item =
            document.createElement("article");

          item.className = "nx-cloud-item";

          const extra = [
            file.sizeFormatted,
            file.duration,
            file.quality
          ].filter(Boolean).join(" · ");

          item.innerHTML = `
            <span class="nx-cloud-thumb">
              ${
                file.thumb
                  ? `<img src="${esc(file.thumb)}" alt="">`
                  : '<i class="fa-solid fa-file"></i>'
              }
            </span>
            <span class="nx-cloud-info">
              <b>${esc(file.name)}</b>
              <span>${esc(extra || "File siap diunduh")}</span>
            </span>
            <button
              class="nx-cloud-download"
              type="button"
              title="Download ${esc(file.name)}"
              aria-label="Download ${esc(file.name)}"
            >
              <i class="fa-solid fa-download"></i>
            </button>
          `;

          item
            .querySelector("button")
            .addEventListener("click",() => {
              const fallbackName =
                "terabox_file_" +
                (index + 1);

              downloadUrl(
                file.downloadUrl,
                file.name || fallbackName,
                {
                  tool:"Terabox",
                  type:"FILE",
                  title:file.name || fallbackName
                }
              );
            });

          listNode.appendChild(item);
        });
      }catch(error){
        setSourceStatus(
          "nxTbStatus",
          "Gagal mengambil file: " +
          error.message,
          "error"
        );
      }finally{
        loader.classList.remove("show");
        button.disabled = false;
      }
    }

    button.addEventListener("click",run);

    input.addEventListener("keydown",event => {
      if(event.key === "Enter") run();
    });
  };

  window.renderFakeBankJago = function(body){
    body.innerHTML = `
      <div class="nx-source-tool"
        style="--nx-accent:#facc15;--nx-accent-2:#f97316;--nx-accent-rgb:250,204,21">
        <section class="nx-source-intro">
          <span class="nx-source-intro-icon">
            <i class="fa-solid fa-building-columns"></i>
          </span>
          <div>
            <h2>Fake Bank Jago</h2>
            <p>Buat visual simulasi saldo menggunakan nama dan nominal yang kamu tentukan.</p>
          </div>
        </section>

        <section class="nx-source-card nx-source-form">
          <div class="nx-source-grid">
            <div class="nx-source-field">
              <label>Nama</label>
              <input
                id="nxBjName"
                type="text"
                placeholder="Nama pemilik"
                maxlength="50"
              >
            </div>

            <div class="nx-source-field">
              <label>Nominal Saldo</label>
              <input
                id="nxBjBalance"
                type="number"
                min="0"
                inputmode="numeric"
                placeholder="1000000"
              >
            </div>
          </div>

          <div class="nx-bank-warning">
            <i class="fa-solid fa-circle-info"></i>
            <span>
              Hanya untuk simulasi atau candaan. Hasil bukan bukti saldo, transaksi, atau dokumen resmi perbankan.
            </span>
          </div>

          <button
            class="nx-source-btn"
            id="nxBjGenerate"
            type="button"
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            Buat Gambar
          </button>

          <div
            class="nx-source-loader"
            id="nxBjLoader"
          >
            Merender gambar simulasi
          </div>

          <div
            class="nx-source-status"
            id="nxBjStatus"
          ></div>

          <div
            class="nx-bank-preview"
            id="nxBjPreview"
          >
            <img
              id="nxBjImage"
              alt="Preview simulasi Bank Jago"
            >

            <div class="nx-bank-actions">
              <button
                class="nx-bank-action primary"
                id="nxBjDownload"
                type="button"
              >
                <i class="fa-solid fa-download"></i>
                Download PNG
              </button>

              <button
                class="nx-bank-action"
                id="nxBjOpen"
                type="button"
              >
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                Buka Gambar
              </button>
            </div>
          </div>
        </section>
      </div>
    `;

    let imageUrl = "";

    const nameInput =
      document.getElementById("nxBjName");
    const balanceInput =
      document.getElementById("nxBjBalance");
    const button =
      document.getElementById("nxBjGenerate");
    const loader =
      document.getElementById("nxBjLoader");
    const preview =
      document.getElementById("nxBjPreview");
    const image =
      document.getElementById("nxBjImage");

    function run(){
      const name =
        String(nameInput.value || "").trim();
      const balance =
        String(balanceInput.value || "").trim();

      if(!name || !balance){
        setSourceStatus(
          "nxBjStatus",
          "Nama dan nominal saldo wajib diisi.",
          "error"
        );
        return;
      }

      button.disabled = true;
      loader.classList.add("show");
      preview.classList.remove("show");
      clearSourceStatus("nxBjStatus");

      const params = new URLSearchParams({
        nama:name,
        saldo:balance
      });

      imageUrl =
        "https://api.nexray.eu.cc/maker/fakebank-jago?" +
        params.toString();

      const probe = new Image();
      let settled = false;

      const timeout = setTimeout(() => {
        if(settled) return;
        settled = true;
        loader.classList.remove("show");
        button.disabled = false;
        setSourceStatus(
          "nxBjStatus",
          "Server terlalu lama merespons. Coba lagi nanti.",
          "error"
        );
      },15000);

      probe.onload = () => {
        if(settled) return;
        settled = true;
        clearTimeout(timeout);

        image.src = imageUrl;
        preview.classList.add("show");
        loader.classList.remove("show");
        button.disabled = false;

        setSourceStatus(
          "nxBjStatus",
          "Gambar simulasi berhasil dibuat.",
          "success"
        );
      };

      probe.onerror = () => {
        if(settled) return;
        settled = true;
        clearTimeout(timeout);

        loader.classList.remove("show");
        button.disabled = false;

        setSourceStatus(
          "nxBjStatus",
          "Gagal membuat gambar. Periksa data atau coba lagi nanti.",
          "error"
        );
      };

      probe.src = imageUrl;
    }

    button.addEventListener("click",run);

    [nameInput,balanceInput].forEach(input => {
      input.addEventListener("keydown",event => {
        if(event.key === "Enter") run();
      });
    });

    document
      .getElementById("nxBjDownload")
      .addEventListener("click",() => {
        if(!imageUrl){
          setSourceStatus(
            "nxBjStatus",
            "Buat gambar terlebih dahulu.",
            "error"
          );
          return;
        }

        downloadUrl(
          imageUrl,
          "fake_bank_jago_" +
          Date.now() +
          ".png",
          {
            tool:"Fake Bank Jago",
            type:"PNG",
            title:"Simulasi Bank Jago"
          }
        );
      });

    document
      .getElementById("nxBjOpen")
      .addEventListener("click",() => {
        if(!imageUrl){
          setSourceStatus(
            "nxBjStatus",
            "Buat gambar terlebih dahulu.",
            "error"
          );
          return;
        }

        openUrl(imageUrl);
      });
  };

  const previousSpotify =
    window.renderSpotify;

  if(typeof previousSpotify === "function"){
    window.renderSpotify = function(body){
      previousSpotify(body);

      const tool =
        body.querySelector(".nx-source-tool");
      const form =
        body.querySelector(".nx-source-card");
      const introText =
        body.querySelector(".nx-source-intro p");

      if(!tool || !form) return;

      if(introText){
        introText.textContent =
          "Cari lagu berdasarkan judul atau artis, pilih hasilnya, lalu preview dan unduh audio MP3.";
      }

      const searchCard =
        document.createElement("section");

      searchCard.className =
        "nx-sp-search-card";

      searchCard.innerHTML = `
        <div class="nx-sp-search-head">
          <span class="nx-sp-search-head-icon">
            <i class="fa-solid fa-magnifying-glass"></i>
          </span>
          <span class="nx-sp-search-head-copy">
            <b>Spotify Search</b>
            <span>Cari lagu lalu kirim hasil langsung ke Spotify Downloader.</span>
          </span>
        </div>

        <div class="nx-sp-search-row">
          <input
            id="nxSpSearchInput"
            type="search"
            placeholder="Judul lagu atau nama artis"
            autocomplete="off"
          >
          <button
            class="nx-sp-search-button"
            id="nxSpSearchButton"
            type="button"
          >
            <i class="fa-solid fa-magnifying-glass"></i>
            Cari Lagu
          </button>
        </div>

        <div
          class="nx-sp-search-status"
          id="nxSpSearchStatus"
        ></div>

        <div
          class="nx-sp-search-list"
          id="nxSpSearchList"
        ></div>
      `;

      tool.insertBefore(searchCard,form);

      const searchInput =
        document.getElementById(
          "nxSpSearchInput"
        );
      const searchButton =
        document.getElementById(
          "nxSpSearchButton"
        );
      const searchStatus =
        document.getElementById(
          "nxSpSearchStatus"
        );
      const searchList =
        document.getElementById(
          "nxSpSearchList"
        );
      const urlInput =
        document.getElementById("nxSpUrl");
      const downloadButton =
        document.getElementById(
          "nxSpGenerate"
        );

      function searchMessage(message,type){
        searchStatus.className =
          "nx-sp-search-status show " +
          (type || "");
        searchStatus.textContent =
          String(message || "");
      }

      async function searchSpotify(){
        const query =
          String(
            searchInput.value ||
            ""
          ).trim();

        if(!query){
          searchMessage(
            "Masukkan judul lagu atau nama artis.",
            "error"
          );
          return;
        }

        searchButton.disabled = true;
        searchButton.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Mencari';
        searchList.innerHTML = "";
        searchMessage(
          "Mencari lagu di Spotify...",
          ""
        );

        try{
          const endpoint =
            "https://api.nexray.eu.cc/search/spotify?q=" +
            encodeURIComponent(query);

          const response = await window.NexoraFetch(
            endpoint,
            {
              method:"GET",
              headers:{
                "Accept":"application/json,text/plain,*/*"
              }
            }
          );

          if(!response.ok){
            throw new Error(
              "Server API bermasalah (HTTP " +
              response.status +
              ")."
            );
          }

          const data =
            await response.json();

          if(
            data.status === false ||
            data.success === false
          ){
            throw new Error(
              data.message ||
              "Gagal mencari lagu."
            );
          }

          const results =
            Array.isArray(data.result)
              ? data.result
              : [];

          if(!results.length){
            throw new Error(
              "Lagu tidak ditemukan."
            );
          }

          searchMessage(
            "Ditemukan " +
            results.length +
            " hasil. Pilih lagu untuk diproses.",
            ""
          );

          results
            .slice(0,15)
            .forEach(track => {
              const title =
                track.title ||
                "Tanpa Judul";
              const artist =
                track.artist ||
                "-";
              const album =
                track.album ||
                "";
              const duration =
                track.duration ||
                "";
              const image =
                track.thumbnail ||
                "";
              const trackUrl =
                track.url ||
                track.link ||
                track.spotify_url ||
                track.external_url ||
                "";

              const item =
                document.createElement(
                  "article"
                );

              item.className =
                "nx-sp-search-item";

              item.innerHTML = `
                <span class="nx-sp-search-cover">
                  ${
                    image
                      ? `<img src="${esc(image)}" alt="">`
                      : '<i class="fa-solid fa-music"></i>'
                  }
                </span>

                <span class="nx-sp-search-info">
                  <b>${esc(title)}</b>
                  <span>
                    ${esc(
                      [
                        artist,
                        album,
                        duration
                      ].filter(Boolean).join(" · ")
                    )}
                  </span>
                </span>

                <button
                  class="nx-sp-search-pick"
                  type="button"
                  ${
                    trackUrl
                      ? ""
                      : "disabled"
                  }
                >
                  <i class="fa-solid fa-download"></i>
                  <span>Pilih</span>
                </button>
              `;

              item
                .querySelector("button")
                .addEventListener(
                  "click",
                  () => {
                    if(!trackUrl) return;

                    urlInput.value =
                      trackUrl;

                    form.scrollIntoView({
                      behavior:"smooth",
                      block:"start"
                    });

                    searchMessage(
                      title +
                      " dipilih. Memproses audio...",
                      ""
                    );

                    downloadButton.click();
                  }
                );

              searchList.appendChild(item);
            });
        }catch(error){
          searchMessage(
            "Gagal mencari lagu: " +
            error.message,
            "error"
          );
        }finally{
          searchButton.disabled = false;
          searchButton.innerHTML =
            '<i class="fa-solid fa-magnifying-glass"></i> Cari Lagu';
        }
      }

      searchButton.addEventListener(
        "click",
        searchSpotify
      );

      searchInput.addEventListener(
        "keydown",
        event => {
          if(event.key === "Enter"){
            searchSpotify();
          }
        }
      );
    };
  }
})();

(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 65 * 1000;
  var MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  var MAX_UPLOAD_BYTES = 2.35 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 1600;
  var sessionState = {
    inputUrl: "",
    originalPreview: "",
    sourceMode: "url",
    fileData: "",
    fileName: "",
    fileBytes: 0,
    result: null,
    loading: false,
    error: ""
  };

  function text(value, maximum) {
    return String(value == null ? "" : value).trim().slice(0, maximum || 500);
  }

  function validUrl(value) {
    try {
      var parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
    } catch (_) {
      return false;
    }
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function readDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("Gambar tidak dapat dibaca.")); };
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("Gambar tidak dapat dibuka.")); };
      image.src = url;
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob && blob.size) resolve(blob);
        else reject(new Error("Gambar gagal disiapkan."));
      }, "image/jpeg", quality);
    });
  }

  async function prepareUpload(file) {
    var mime = String(file && file.type || "").toLowerCase();
    if (!file || !file.size) throw new Error("Pilih gambar terlebih dahulu.");
    if (file.size > MAX_SOURCE_BYTES) throw new Error("Gambar asli terlalu besar. Maksimal 12 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Format harus JPG, PNG, atau WebP.");
    var objectUrl = URL.createObjectURL(file);
    try {
      var image = await loadImage(objectUrl);
      var width = Number(image.naturalWidth || image.width || 0);
      var height = Number(image.naturalHeight || image.height || 0);
      if (!width || !height || width > 12000 || height > 12000) throw new Error("Ukuran dimensi gambar tidak didukung.");
      var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      var context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Browser tidak dapat menyiapkan gambar.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      var blob = await canvasBlob(canvas, .86);
      if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasBlob(canvas, .7);
      canvas.width = 1;
      canvas.height = 1;
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Gambar masih terlalu besar setelah diperkecil.");
      return { data: await readDataUrl(blob), bytes: blob.size };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "absolute";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("COPY_FAILED"));
  }

  function actionLink(label, iconName, url, download) {
    var anchor = element("a", "natr-action");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (download) anchor.setAttribute("download", "anime-to-real-result");
    anchor.append(element("i", iconName), document.createTextNode(label));
    return anchor;
  }

  window.renderAnimeToReal = function renderAnimeToReal(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var requestTimer = 0;
    var toastTimer = 0;
    var hiddenAbort = false;

    body.innerHTML = "" +
      '<main class="natr">' +
        '<section class="natr-hero">' +
          '<span class="natr-hero-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
          '<div><span class="natr-kicker">AI IMAGE TRANSFORM</span><h2>Anime to Real</h2><p>Ubah ilustrasi anime menjadi realistis lewat link langsung atau gambar dari galeri.</p></div>' +
        '</section>' +
        '<section class="natr-card natr-form-card">' +
          '<form id="natrForm" novalidate>' +
            '<label for="natrUrl">Image URL</label>' +
            '<div class="natr-input-row"><input id="natrUrl" type="url" inputmode="url" maxlength="4096" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://example.com/image.jpg"><button id="natrPaste" class="natr-paste" type="button"><i class="fa-regular fa-clipboard"></i><span>Paste</span></button></div>' +
            '<p class="natr-hint">Gunakan link file gambar langsung. Link halaman Google atau Pinterest sering tidak bisa dibaca AI.</p>' +
            '<div class="natr-or"><span>ATAU</span></div>' +
            '<input id="natrFile" class="natr-file-input" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">' +
            '<div id="natrUploadBox" class="natr-upload-box"><button id="natrChoose" class="natr-choose" type="button"><i class="fa-solid fa-image"></i><span>Pilih Gambar</span></button><button id="natrUseFile" class="natr-file-meta" type="button"><strong id="natrFileName">Belum ada gambar dipilih</strong><span id="natrFileSize">JPG, PNG, atau WebP</span></button><button id="natrClearFile" class="natr-clear-file" type="button" aria-label="Hapus gambar pilihan" hidden><i class="fa-solid fa-xmark"></i></button></div>' +
            '<button id="natrConvert" class="natr-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Convert</span></button>' +
          '</form>' +
          '<p id="natrFeedback" class="natr-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section class="natr-card natr-workspace" aria-busy="false">' +
          '<div class="natr-stage"><div class="natr-stage-head"><span>ORIGINAL</span><strong>Anime artwork</strong></div><div id="natrOriginal" class="natr-image-frame"></div></div>' +
          '<div class="natr-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></div>' +
          '<div class="natr-stage"><div class="natr-stage-head"><span>RESULT</span><strong>Realistic image</strong></div><div id="natrResult" class="natr-image-frame"></div><div id="natrActions" class="natr-actions"></div></div>' +
        '</section>' +
        '<p class="natr-note"><i class="fa-solid fa-shield-halved"></i> Nexora tidak menyimpan gambar. File upload dibuat publik sementara maksimal 1 jam agar dapat dibaca AI.</p>' +
        '<div id="natrToast" class="natr-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var form = body.querySelector("#natrForm");
    var input = body.querySelector("#natrUrl");
    var paste = body.querySelector("#natrPaste");
    var fileInput = body.querySelector("#natrFile");
    var choose = body.querySelector("#natrChoose");
    var useFile = body.querySelector("#natrUseFile");
    var clearFile = body.querySelector("#natrClearFile");
    var uploadBox = body.querySelector("#natrUploadBox");
    var fileName = body.querySelector("#natrFileName");
    var fileSize = body.querySelector("#natrFileSize");
    var convert = body.querySelector("#natrConvert");
    var feedback = body.querySelector("#natrFeedback");
    var workspace = body.querySelector(".natr-workspace");
    var original = body.querySelector("#natrOriginal");
    var result = body.querySelector("#natrResult");
    var actions = body.querySelector("#natrActions");
    var toast = body.querySelector("#natrToast");

    input.value = sessionState.inputUrl;
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") paste.hidden = true;

    function showToast(message, isError) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle("is-error", Boolean(isError));
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 1800);
    }

    function setLoading(loading) {
      sessionState.loading = loading;
      input.disabled = loading;
      paste.disabled = loading;
      fileInput.disabled = loading;
      choose.disabled = loading;
      useFile.disabled = loading;
      clearFile.disabled = loading;
      convert.disabled = loading;
      workspace.setAttribute("aria-busy", loading ? "true" : "false");
      convert.querySelector("i").className = loading ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-wand-magic-sparkles";
      convert.querySelector("span").textContent = loading ? "Converting…" : "Convert";
    }

    function emptyFrame(frame, iconName, message) {
      frame.replaceChildren();
      frame.classList.remove("has-image", "is-broken");
      var empty = element("div", "natr-empty");
      empty.append(element("i", iconName), element("span", "", message));
      frame.appendChild(empty);
    }

    function renderImage(frame, url, alt) {
      frame.replaceChildren();
      frame.classList.remove("is-broken");
      frame.classList.add("has-image");
      var image = document.createElement("img");
      image.src = url;
      image.alt = alt;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", function () {
        image.hidden = true;
        frame.classList.remove("has-image");
        frame.classList.add("is-broken");
        emptyFrame(frame, "fa-regular fa-image", "Gambar tidak dapat dimuat.");
        frame.classList.add("is-broken");
      }, { once: true });
      frame.appendChild(image);
    }

    function renderState() {
      feedback.textContent = sessionState.error || (sessionState.loading ? "Gambar sedang diproses. Proses dapat membutuhkan waktu hingga satu menit." : "");
      feedback.classList.toggle("is-error", Boolean(sessionState.error));
      feedback.classList.toggle("is-loading", sessionState.loading);

      var hasFile = Boolean(sessionState.fileData);
      uploadBox.classList.toggle("is-selected", hasFile);
      uploadBox.classList.toggle("is-active", hasFile && sessionState.sourceMode === "file");
      input.classList.toggle("is-active", sessionState.sourceMode === "url");
      fileName.textContent = hasFile ? sessionState.fileName : "Belum ada gambar dipilih";
      fileSize.textContent = hasFile ? Math.max(1, Math.round(sessionState.fileBytes / 1024)) + " KB • siap dikirim" : "JPG, PNG, atau WebP";
      choose.querySelector("span").textContent = hasFile ? "Ganti Gambar" : "Pilih Gambar";
      clearFile.hidden = !hasFile;
      useFile.disabled = sessionState.loading || !hasFile;

      if (sessionState.originalPreview) renderImage(original, sessionState.originalPreview, "Gambar anime asli");
      else emptyFrame(original, "fa-regular fa-image", "Preview gambar asli muncul di sini.");

      actions.replaceChildren();
      if (sessionState.result && sessionState.result.imageUrl) {
        var resultUrl = sessionState.result.imageUrl;
        renderImage(result, resultUrl, "Hasil realistis Anime to Real");
        actions.appendChild(actionLink("Open Image", "fa-solid fa-arrow-up-right-from-square", resultUrl, false));
        actions.appendChild(actionLink("Download Result", "fa-solid fa-download", resultUrl, true));
        var copy = element("button", "natr-action", "Copy Link");
        copy.type = "button";
        copy.addEventListener("click", function () {
          copyText(resultUrl).then(function () { showToast("Link copied"); }).catch(function () { showToast("Gagal menyalin link", true); });
        });
        actions.appendChild(copy);
      } else if (sessionState.loading) {
        emptyFrame(result, "fa-solid fa-circle-notch fa-spin", "Converting…");
      } else {
        emptyFrame(result, "fa-solid fa-user-check", "Hasil realistis muncul di sini.");
      }
    }

    paste.addEventListener("click", function () {
      if (sessionState.loading) return;
      navigator.clipboard.readText().then(function (value) {
        if (!alive) return;
        var pasted = text(value, 4097);
        input.value = pasted;
        sessionState.inputUrl = pasted;
        sessionState.sourceMode = "url";
        if (validUrl(pasted)) {
          sessionState.originalPreview = pasted;
          sessionState.error = "";
          renderState();
        } else {
          sessionState.error = "Clipboard tidak berisi URL gambar yang valid.";
          renderState();
        }
      }).catch(function () { showToast("Clipboard tidak dapat dibaca", true); });
    });

    input.addEventListener("input", function () {
      sessionState.inputUrl = text(input.value, 4097);
      if (!sessionState.fileData) sessionState.sourceMode = "url";
      sessionState.error = "";
      renderState();
    });

    choose.addEventListener("click", function () {
      if (!sessionState.loading) fileInput.click();
    });

    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file || sessionState.loading) return;
      sessionState.error = "";
      choose.disabled = true;
      choose.querySelector("span").textContent = "Menyiapkan…";
      try {
        var prepared = await prepareUpload(file);
        if (!alive) return;
        sessionState.fileData = prepared.data;
        sessionState.fileName = text(file.name || "gambar-anime.jpg", 90);
        sessionState.fileBytes = prepared.bytes;
        sessionState.sourceMode = "file";
        sessionState.originalPreview = prepared.data;
        showToast("Gambar siap diproses");
      } catch (error) {
        sessionState.error = text(error && error.message, 240) || "Gambar tidak dapat disiapkan.";
      } finally {
        if (alive) {
          choose.disabled = false;
          choose.querySelector("span").textContent = sessionState.fileData ? "Ganti Gambar" : "Pilih Gambar";
          renderState();
        }
      }
    });

    clearFile.addEventListener("click", function () {
      if (sessionState.loading) return;
      sessionState.fileData = "";
      sessionState.fileName = "";
      sessionState.fileBytes = 0;
      sessionState.sourceMode = "url";
      sessionState.originalPreview = validUrl(sessionState.inputUrl) ? sessionState.inputUrl : "";
      choose.querySelector("span").textContent = "Pilih Gambar";
      renderState();
    });

    useFile.addEventListener("click", function () {
      if (sessionState.loading || !sessionState.fileData) return;
      sessionState.sourceMode = "file";
      sessionState.originalPreview = sessionState.fileData;
      sessionState.error = "";
      renderState();
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (sessionState.loading) return;
      var value = text(input.value, 4097);
      sessionState.inputUrl = value;
      sessionState.error = "";
      var usingFile = sessionState.sourceMode === "file" && Boolean(sessionState.fileData);
      if (!usingFile && (!value || value.length > 4096 || !validUrl(value))) {
        sessionState.error = value.length > 4096 ? "URL gambar terlalu panjang." : "URL gambar tidak valid.";
        renderState();
        input.focus();
        return;
      }

      sessionState.originalPreview = usingFile ? sessionState.fileData : value;
      setLoading(true);
      renderState();
      controller = new AbortController();
      hiddenAbort = false;
      requestTimer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);
      try {
        var params = usingFile ? "" : "?" + new URLSearchParams({ url: value }).toString();
        var requestOptions = {
          method: usingFile ? "POST" : "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" }
        };
        if (usingFile) {
          requestOptions.headers["Content-Type"] = "application/json";
          requestOptions.body = JSON.stringify({ imageData: sessionState.fileData });
        }
        var response = await fetch("/api/ai/anime-to-real" + params, requestOptions);
        var payload;
        try { payload = await response.json(); }
        catch (_) { throw new Error("Respons Anime to Real tidak dapat dibaca."); }
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(text(payload && payload.message, 240) || "Anime to Real sedang tidak tersedia.");
        }
        var imageUrl = text(payload.data && payload.data.imageUrl, 8192);
        if (!validUrl(imageUrl)) throw new Error("Gambar hasil belum tersedia.");
        sessionState.result = { imageUrl: imageUrl };
        sessionState.error = "";
        showToast("Conversion selesai");
      } catch (error) {
        if (!alive || hiddenAbort) return;
        sessionState.error = error && error.name === "AbortError" ? "Proses terlalu lama. Coba lagi." : text(error && error.message, 240) || "Anime to Real sedang tidak tersedia.";
      } finally {
        clearTimeout(requestTimer);
        requestTimer = 0;
        controller = null;
        if (alive) {
          setLoading(false);
          renderState();
        }
      }
    });

    function onVisibilityChange() {
      if (document.hidden && controller) {
        hiddenAbort = true;
        controller.abort();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    body.__nxCleanup = function () {
      alive = false;
      hiddenAbort = true;
      if (controller) controller.abort();
      clearTimeout(requestTimer);
      clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      body.__nxCleanup = null;
    };

    renderState();
  };
})();

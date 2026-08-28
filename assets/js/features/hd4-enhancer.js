(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 60 * 1000;
  var MAX_URL_LENGTH = 4096;
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
      if (!width || !height || width > 12000 || height > 12000) throw new Error("Dimensi gambar tidak didukung.");
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
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("COPY_FAILED"));
  }

  function actionLink(label, iconName, url, download) {
    var anchor = element("a", "nxhd4-action");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (download) anchor.setAttribute("download", "nexora-hd4-result");
    anchor.append(element("i", iconName), document.createTextNode(label));
    return anchor;
  }

  function publicMessage(status, payload) {
    if (payload && typeof payload.message === "string" && payload.message.trim()) return text(payload.message, 240);
    if (status === 400) return "Gambar tidak dapat diproses.";
    if (status === 404) return "Gambar tidak ditemukan atau tidak dapat diakses.";
    if (status === 408 || status === 504) return "Proses enhancement terlalu lama. Coba lagi.";
    if (status === 429) return "Batas request sementara tercapai.";
    if (status >= 500) return "Server enhancer sedang sibuk. Coba lagi nanti.";
    return "Image HD Enhancer sedang tidak tersedia.";
  }

  window.renderHd4Enhancer = function renderHd4Enhancer(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var timer = 0;
    var toastTimer = 0;
    var localBlobUrl = "";

    body.innerHTML = "" +
      '<main class="nxhd4">' +
        '<section class="nxhd4-hero">' +
          '<span class="nxhd4-hero-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
          '<div><span class="nxhd4-kicker">NEXORA IMAGE LAB</span><h2>Nexora Image HD Enhancer V4</h2><p>Tingkatkan detail gambar melalui link langsung atau gambar dari galeri.</p></div>' +
        '</section>' +
        '<section class="nxhd4-card nxhd4-form-card">' +
          '<form id="nxhd4Form" novalidate>' +
            '<label for="nxhd4Url">Image URL</label>' +
            '<div class="nxhd4-input-row"><input id="nxhd4Url" type="url" inputmode="url" maxlength="4096" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://example.com/image.jpg"><button id="nxhd4Paste" class="nxhd4-paste" type="button"><i class="fa-regular fa-clipboard"></i><span>Paste</span></button></div>' +
            '<p class="nxhd4-hint">Gunakan link file gambar langsung berawalan http:// atau https://.</p>' +
            '<div class="nxhd4-or"><span>ATAU</span></div>' +
            '<input id="nxhd4File" class="nxhd4-file-input" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp">' +
            '<div id="nxhd4UploadBox" class="nxhd4-upload-box"><button id="nxhd4Choose" class="nxhd4-choose" type="button"><i class="fa-solid fa-image"></i><span>Pilih Gambar</span></button><button id="nxhd4UseFile" class="nxhd4-file-meta" type="button"><strong id="nxhd4FileName">Belum ada gambar dipilih</strong><span id="nxhd4FileSize">JPG, PNG, atau WebP</span></button><button id="nxhd4ClearFile" class="nxhd4-clear-file" type="button" aria-label="Hapus gambar pilihan" hidden><i class="fa-solid fa-xmark"></i></button></div>' +
            '<button id="nxhd4Enhance" class="nxhd4-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Enhance Image</span></button>' +
          '</form>' +
          '<p id="nxhd4Feedback" class="nxhd4-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section class="nxhd4-card nxhd4-workspace" aria-busy="false">' +
          '<div class="nxhd4-stage"><div class="nxhd4-stage-head"><span>ORIGINAL</span><strong>Original Image</strong></div><div id="nxhd4Original" class="nxhd4-image-frame"></div></div>' +
          '<div class="nxhd4-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></div>' +
          '<div class="nxhd4-stage"><div class="nxhd4-stage-head"><span>ENHANCED</span><strong>Enhanced Result</strong></div><div id="nxhd4Result" class="nxhd4-image-frame"></div><div id="nxhd4Actions" class="nxhd4-actions"></div></div>' +
        '</section>' +
        '<p class="nxhd4-note"><i class="fa-solid fa-shield-halved"></i> Nexora tidak menyimpan gambar. Upload dibuat publik sementara maksimal satu jam agar dapat diproses enhancer.</p>' +
        '<div id="nxhd4Toast" class="nxhd4-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var form = body.querySelector("#nxhd4Form");
    var input = body.querySelector("#nxhd4Url");
    var paste = body.querySelector("#nxhd4Paste");
    var fileInput = body.querySelector("#nxhd4File");
    var choose = body.querySelector("#nxhd4Choose");
    var useFile = body.querySelector("#nxhd4UseFile");
    var clearFile = body.querySelector("#nxhd4ClearFile");
    var uploadBox = body.querySelector("#nxhd4UploadBox");
    var fileName = body.querySelector("#nxhd4FileName");
    var fileSize = body.querySelector("#nxhd4FileSize");
    var enhance = body.querySelector("#nxhd4Enhance");
    var feedback = body.querySelector("#nxhd4Feedback");
    var workspace = body.querySelector(".nxhd4-workspace");
    var original = body.querySelector("#nxhd4Original");
    var result = body.querySelector("#nxhd4Result");
    var actions = body.querySelector("#nxhd4Actions");
    var toast = body.querySelector("#nxhd4Toast");

    input.value = sessionState.inputUrl;
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") paste.hidden = true;

    function showToast(message, isError) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle("is-error", Boolean(isError));
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 1800);
    }

    function emptyFrame(frame, iconName, message) {
      frame.replaceChildren();
      frame.classList.remove("has-image", "is-broken");
      var empty = element("div", "nxhd4-empty");
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
        emptyFrame(frame, "fa-regular fa-image", "Gambar tidak dapat dimuat.");
        frame.classList.add("is-broken");
      }, { once: true });
      frame.appendChild(image);
    }

    function setLoading(loading) {
      sessionState.loading = loading;
      input.disabled = loading;
      paste.disabled = loading;
      fileInput.disabled = loading;
      choose.disabled = loading;
      useFile.disabled = loading;
      clearFile.disabled = loading;
      enhance.disabled = loading;
      workspace.setAttribute("aria-busy", loading ? "true" : "false");
      enhance.querySelector("i").className = loading ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-wand-magic-sparkles";
      enhance.querySelector("span").textContent = loading ? "Enhancing image…" : "Enhance Image";
    }

    function renderState() {
      feedback.textContent = sessionState.error || (sessionState.loading ? "Enhancing image… Proses dapat membutuhkan waktu hingga satu menit." : "");
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
      if (sessionState.originalPreview) renderImage(original, sessionState.originalPreview, "Gambar asli sebelum enhancement");
      else emptyFrame(original, "fa-regular fa-image", "Preview gambar asli muncul di sini.");

      actions.replaceChildren();
      if (sessionState.result && sessionState.result.imageUrl) {
        var imageUrl = sessionState.result.imageUrl;
        renderImage(result, imageUrl, "Hasil Nexora Image HD Enhancer V4");
        actions.appendChild(actionLink("Download", "fa-solid fa-download", imageUrl, true));
        actions.appendChild(actionLink("Open Image", "fa-solid fa-arrow-up-right-from-square", imageUrl, false));
        var copy = element("button", "nxhd4-action", "Copy Link");
        copy.type = "button";
        copy.disabled = !sessionState.result.shareable;
        copy.title = sessionState.result.shareable ? "Salin link hasil" : "Link sementara hanya tersedia pada tab ini";
        copy.addEventListener("click", function () {
          if (!sessionState.result.shareable) return showToast("Link hasil langsung tidak tersedia untuk respons gambar.", true);
          copyText(imageUrl).then(function () { showToast("Link berhasil disalin"); }).catch(function () { showToast("Link gagal disalin", true); });
        });
        actions.appendChild(copy);
      } else if (sessionState.loading) {
        emptyFrame(result, "fa-solid fa-circle-notch fa-spin", "Enhancing image…");
      } else {
        emptyFrame(result, "fa-solid fa-wand-magic-sparkles", "Hasil enhanced muncul di sini.");
      }
    }

    function setPreview(value) {
      var candidate = text(value, MAX_URL_LENGTH + 1);
      sessionState.inputUrl = candidate;
      if (validUrl(candidate)) {
        sessionState.originalPreview = candidate;
        sessionState.sourceMode = "url";
        sessionState.error = "";
      }
      renderState();
    }

    paste.addEventListener("click", function () {
      if (sessionState.loading) return;
      navigator.clipboard.readText().then(function (value) {
        if (!alive) return;
        input.value = text(value, MAX_URL_LENGTH + 1);
        sessionState.sourceMode = "url";
        if (!validUrl(input.value)) sessionState.error = "Clipboard tidak berisi URL gambar yang valid.";
        setPreview(input.value);
      }).catch(function () { showToast("Clipboard tidak dapat dibaca", true); });
    });

    input.addEventListener("input", function () {
      sessionState.inputUrl = text(input.value, MAX_URL_LENGTH + 1);
      sessionState.sourceMode = "url";
      sessionState.error = "";
      feedback.textContent = "";
    });
    input.addEventListener("change", function () { setPreview(input.value); });
    input.addEventListener("blur", function () { if (input.value.trim()) setPreview(input.value); });

    choose.addEventListener("click", function () {
      if (!sessionState.loading) fileInput.click();
    });

    useFile.addEventListener("click", function () {
      if (!sessionState.loading && sessionState.fileData) {
        sessionState.sourceMode = "file";
        sessionState.originalPreview = sessionState.fileData;
        sessionState.error = "";
        renderState();
      }
    });

    clearFile.addEventListener("click", function () {
      if (sessionState.loading) return;
      sessionState.fileData = "";
      sessionState.fileName = "";
      sessionState.fileBytes = 0;
      sessionState.sourceMode = "url";
      sessionState.originalPreview = validUrl(sessionState.inputUrl) ? sessionState.inputUrl : "";
      renderState();
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
        sessionState.fileName = text(file.name || "gambar.jpg", 120);
        sessionState.fileBytes = prepared.bytes;
        sessionState.sourceMode = "file";
        sessionState.originalPreview = prepared.data;
      } catch (error) {
        sessionState.error = error && error.message ? error.message : "Gambar tidak dapat disiapkan.";
      } finally {
        if (alive) {
          choose.disabled = sessionState.loading;
          renderState();
        }
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (sessionState.loading) return;
      var inputUrl = text(input.value, MAX_URL_LENGTH + 1);
      sessionState.inputUrl = inputUrl;
      var useUpload = sessionState.sourceMode === "file" && Boolean(sessionState.fileData);
      if (!useUpload && !inputUrl) {
        sessionState.error = "Masukkan URL gambar terlebih dahulu.";
        renderState();
        input.focus();
        return;
      }
      if (!useUpload && (inputUrl.length > MAX_URL_LENGTH || !validUrl(inputUrl))) {
        sessionState.error = "URL gambar tidak valid.";
        renderState();
        input.focus();
        return;
      }

      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
        localBlobUrl = "";
      }
      sessionState.originalPreview = useUpload ? sessionState.fileData : inputUrl;
      sessionState.error = "";
      setLoading(true);
      renderState();
      controller = new AbortController();
      timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);

      try {
        var query = useUpload ? "" : "?" + new URLSearchParams({ url: inputUrl }).toString();
        var request = {
          method: useUpload ? "POST" : "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,application/json;q=0.9" },
          signal: controller.signal
        };
        if (useUpload) {
          request.headers["Content-Type"] = "application/json";
          request.body = JSON.stringify({ imageData: sessionState.fileData });
        }
        var response = await fetch("/api/tools/hd4" + query, request);
        var contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (response.ok && contentType.indexOf("image/") === 0) {
          var blob = await response.blob();
          if (!blob.size) throw new Error("EMPTY_IMAGE");
          localBlobUrl = URL.createObjectURL(blob);
          sessionState.result = { imageUrl: localBlobUrl, shareable: false };
        } else {
          var payload;
          try { payload = await response.json(); }
          catch (_) { throw Object.assign(new Error("INVALID_RESPONSE"), { userMessage: "Server enhancer mengirim respons yang tidak dapat dibaca." }); }
          if (!response.ok || !payload || payload.ok !== true || !payload.data || !validUrl(payload.data.imageUrl)) {
            throw Object.assign(new Error("UPSTREAM_ERROR"), { userMessage: publicMessage(response.status, payload) });
          }
          sessionState.result = { imageUrl: payload.data.imageUrl, shareable: true };
        }
        sessionState.error = "";
      } catch (error) {
        if (!alive) return;
        if (error && error.name === "AbortError") sessionState.error = "Proses enhancement terlalu lama. Coba lagi.";
        else sessionState.error = error && error.userMessage ? error.userMessage : "Image HD Enhancer sedang tidak tersedia.";
      } finally {
        clearTimeout(timer);
        timer = 0;
        controller = null;
        if (alive) {
          setLoading(false);
          renderState();
        }
      }
    });

    body.__nxCleanup = function () {
      alive = false;
      clearTimeout(timer);
      clearTimeout(toastTimer);
      if (controller) controller.abort();
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
        if (sessionState.result && sessionState.result.imageUrl === localBlobUrl) sessionState.result = null;
      }
    };

    setLoading(false);
    renderState();
  };
})();

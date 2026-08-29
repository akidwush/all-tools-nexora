(function () {
  "use strict";

  var MAX_PROMPT_LENGTH = 3000;
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var GENERATION_TIMEOUT_MS = 11 * 60 * 1000;
  var IMAGE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
  var videoModels = Object.freeze([
    Object.freeze({
      id: "sora-2",
      label: "Sora 2",
      detail: "Seimbang",
      supportsImageInput: true,
      imageInput: "file",
      costPerSecondUsd: 0.10,
      durations: Object.freeze([4, 8, 12]),
      sizes: Object.freeze({ "9:16": "720x1280", "16:9": "1280x720" })
    }),
    Object.freeze({
      id: "sora-2-pro",
      label: "Sora 2 Pro",
      detail: "Kualitas tinggi",
      supportsImageInput: true,
      imageInput: "file",
      costPerSecondUsd: 0.30,
      durations: Object.freeze([4, 8, 12]),
      sizes: Object.freeze({ "9:16": "720x1280", "16:9": "1280x720" })
    }),
    Object.freeze({
      id: "veo-3.1-fast-generate-preview",
      label: "Veo 3.1 Fast",
      detail: "Lebih cepat",
      supportsImageInput: true,
      imageInput: "data-uri",
      costPerSecondUsd: 0.15,
      durations: Object.freeze([4, 6, 8]),
      sizes: Object.freeze({ "9:16": "720x1280", "16:9": "1280x720" })
    }),
    Object.freeze({
      id: "veo-3.1-generate-preview",
      label: "Veo 3.1",
      detail: "Kualitas tinggi",
      supportsImageInput: true,
      imageInput: "data-uri",
      costPerSecondUsd: 0.40,
      durations: Object.freeze([4, 6, 8]),
      sizes: Object.freeze({ "9:16": "720x1280", "16:9": "1280x720" })
    })
  ]);

  function modelById(id) {
    return videoModels.find(function (model) { return model.id === id; }) || videoModels[0];
  }

  function estimatedVideoCost(model, seconds) {
    var duration = Number(seconds);
    if (!model || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(model.costPerSecondUsd)) return null;
    return model.costPerSecondUsd * duration;
  }

  function formatUsd(value) {
    return "$" + Number(value || 0).toFixed(2);
  }

  function isAllowedVideoUrl(value) {
    return /^(?:https:\/\/|blob:|data:(?:video\/|application\/(?:octet-stream|mp4|x-mp4)|binary\/octet-stream))/i.test(String(value || ""));
  }

  function safeValue(value, key) {
    try { return value && value[key]; } catch (_) { return null; }
  }

  function sourceFromElement(value) {
    if (!value || typeof value !== "object") return "";
    var sourceNode = null;
    try { sourceNode = typeof value.querySelector === "function" ? value.querySelector("source[src]") : null; } catch (_) { sourceNode = null; }
    var direct = [
      safeValue(value, "currentSrc"),
      safeValue(value, "src"),
      typeof value.getAttribute === "function" ? value.getAttribute("data-source") : "",
      typeof value.getAttribute === "function" ? value.getAttribute("src") : "",
      sourceNode && (safeValue(sourceNode, "src") || (typeof sourceNode.getAttribute === "function" ? sourceNode.getAttribute("src") : ""))
    ];
    for (var index = 0; index < direct.length; index += 1) {
      if (isAllowedVideoUrl(direct[index])) return String(direct[index]);
    }
    return "";
  }

  function sourceFromObject(value, depth, seen) {
    if (isAllowedVideoUrl(value)) return String(value);
    if (!value || typeof value !== "object" || depth > 3) return "";
    if (Array.isArray(value)) {
      for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
        var itemSource = sourceFromObject(value[arrayIndex], depth + 1, seen);
        if (itemSource) return itemSource;
      }
      return "";
    }
    if (seen.indexOf(value) !== -1) return "";
    seen.push(value);
    var directKeys = ["videoUrl", "video_url", "asset_url", "output_url", "download_url", "file_url", "url", "href", "src"];
    for (var index = 0; index < directKeys.length; index += 1) {
      var direct = safeValue(value, directKeys[index]);
      if (isAllowedVideoUrl(direct)) return String(direct);
      if (direct && typeof direct === "object" && isAllowedVideoUrl(safeValue(direct, "url"))) return String(safeValue(direct, "url"));
    }
    var nestedKeys = ["result", "data", "output", "video", "media", "response", "asset", "file"];
    for (var nestedIndex = 0; nestedIndex < nestedKeys.length; nestedIndex += 1) {
      var nested = safeValue(value, nestedKeys[nestedIndex]);
      if (Array.isArray(nested)) {
        for (var itemIndex = 0; itemIndex < nested.length; itemIndex += 1) {
          var arraySource = sourceFromObject(nested[itemIndex], depth + 1, seen);
          if (arraySource) return arraySource;
        }
      } else {
        var nestedSource = sourceFromObject(nested, depth + 1, seen);
        if (nestedSource) return nestedSource;
      }
    }
    return "";
  }

  function ownedBlobResult(blob, sourceType) {
    if (!blob || !blob.size) throw new Error("PUTER_VIDEO_EMPTY_RESULT");
    var objectUrl = URL.createObjectURL(blob);
    return { videoUrl: objectUrl, blob: blob, element: null, metadata: { sourceType: sourceType, mimeType: blob.type || "video/mp4", ownsObjectUrl: true } };
  }

  function describeVideoResult(raw) {
    var source = sourceFromElement(raw) || sourceFromObject(raw, 0, []);
    var dataMime = /^data:([^;,]+)/i.exec(source || "");
    var protocol = /^([a-z][a-z0-9+.-]*):/i.exec(source || "");
    var keys = [];
    try { keys = raw && typeof raw === "object" ? Object.keys(raw).slice(0, 20) : []; } catch (_) { keys = []; }
    return {
      rootType: raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw,
      tagName: String(safeValue(raw, "tagName") || "").slice(0, 20),
      keys: keys,
      sourceProtocol: protocol ? protocol[1].toLowerCase() : "none",
      dataMime: dataMime ? dataMime[1].toLowerCase().slice(0, 80) : "none",
      mimeHint: String(safeValue(raw, "type") || (typeof safeValue(raw, "getAttribute") === "function" ? raw.getAttribute("data-mime-type") : "") || "").slice(0, 80)
    };
  }

  async function normalizePuterVideoResult(raw) {
    if (!raw) throw new Error("PUTER_VIDEO_EMPTY_RESULT");
    if (typeof HTMLVideoElement !== "undefined" && raw instanceof HTMLVideoElement) {
      var elementUrl = sourceFromElement(raw);
      if (!isAllowedVideoUrl(elementUrl)) throw new Error("PUTER_VIDEO_INVALID_RESULT");
      return { videoUrl: elementUrl, blob: null, element: raw, metadata: { sourceType: "HTMLVideoElement", ownsObjectUrl: false } };
    }
    if (raw && String(raw.tagName || "").toUpperCase() === "VIDEO") {
      var duckUrl = sourceFromElement(raw);
      if (!isAllowedVideoUrl(duckUrl)) throw new Error("PUTER_VIDEO_INVALID_RESULT");
      return { videoUrl: duckUrl, blob: null, element: raw, metadata: { sourceType: "HTMLVideoElement", ownsObjectUrl: false } };
    }
    if (typeof Blob !== "undefined" && raw instanceof Blob) {
      return ownedBlobResult(raw, "Blob");
    }
    if (typeof ArrayBuffer !== "undefined" && (raw instanceof ArrayBuffer || (typeof ArrayBuffer.isView === "function" && ArrayBuffer.isView(raw)))) {
      var bytes = raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      return ownedBlobResult(new Blob([bytes], { type: "video/mp4" }), "ArrayBuffer");
    }
    if (raw && typeof raw === "object" && typeof raw.arrayBuffer === "function") {
      var responseBytes = await raw.arrayBuffer();
      var headerType = "";
      try { headerType = raw.headers && typeof raw.headers.get === "function" ? raw.headers.get("content-type") : ""; } catch (_) { headerType = ""; }
      return ownedBlobResult(new Blob([responseBytes], { type: headerType || raw.type || "video/mp4" }), "Response");
    }
    if (typeof raw === "string" && isAllowedVideoUrl(raw)) {
      return { videoUrl: raw, blob: null, element: null, metadata: { sourceType: "URL", ownsObjectUrl: false } };
    }
    var objectUrlValue = sourceFromObject(raw, 0, []);
    if (objectUrlValue) {
      return { videoUrl: objectUrlValue, blob: null, element: null, metadata: { sourceType: "Object", ownsObjectUrl: false } };
    }
    console.warn("[puter-video] unsupported result shape", describeVideoResult(raw));
    throw new Error("PUTER_VIDEO_INVALID_RESULT");
  }

  function disposeVideoResult(result) {
    if (!result || !result.metadata || !result.metadata.ownsObjectUrl) return;
    if (result.videoUrl && window.URL && typeof window.URL.revokeObjectURL === "function") window.URL.revokeObjectURL(result.videoUrl);
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("PUTER_VIDEO_IMAGE_READ_FAILED")); };
      reader.readAsDataURL(file);
    });
  }

  async function detectImageType(file) {
    var bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return "";
  }

  async function validateReferenceImage(file) {
    if (!file || typeof file.arrayBuffer !== "function") throw new Error("PUTER_VIDEO_IMAGE_REQUIRED");
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("PUTER_VIDEO_IMAGE_TOO_LARGE");
    var detected = await detectImageType(file);
    if (IMAGE_TYPES.indexOf(detected) === -1 || (file.type && file.type !== detected)) throw new Error("PUTER_VIDEO_IMAGE_INVALID");
    return file;
  }

  function buildVideoOptions(model, duration, aspect, inputReference) {
    var seconds = model.durations.indexOf(Number(duration)) !== -1 ? Number(duration) : model.durations[0];
    var ratio = model.sizes[aspect] ? aspect : "9:16";
    var options = { model: model.id, seconds: seconds, size: model.sizes[ratio] };
    if (inputReference) options.input_reference = inputReference;
    return options;
  }

  function withTimeout(promise, timeoutMs) {
    var timer = 0;
    return Promise.race([
      Promise.resolve(promise).finally(function () { clearTimeout(timer); }),
      new Promise(function (_, reject) {
        timer = setTimeout(function () { reject(new Error("PUTER_VIDEO_TIMEOUT")); }, timeoutMs);
      })
    ]);
  }

  function isUnreadableVideoError(error) {
    return /PUTER_VIDEO_(?:EMPTY|INVALID)_RESULT/.test(String(error && error.message || error || ""));
  }

  function removeTemporaryPuterVideo(sdk, outputPath) {
    if (!sdk || !sdk.fs || typeof sdk.fs.delete !== "function" || !outputPath) return Promise.resolve();
    return Promise.resolve(sdk.fs.delete(outputPath)).catch(function () { return null; });
  }

  function normalizeGeneratedPuterVideo(sdk, raw, outputPath) {
    return normalizePuterVideoResult(raw).catch(function (error) {
      if (!isUnreadableVideoError(error) || !sdk.fs || typeof sdk.fs.read !== "function") throw error;
      return sdk.fs.read(outputPath).then(function (blob) {
        if (typeof Blob === "undefined" || !(blob instanceof Blob) || !blob.size) throw error;
        return ownedBlobResult(blob, "PuterFS");
      });
    });
  }

  function generateVideoWithPuter(params) {
    var sdk = window.puter;
    if (!sdk || !sdk.ai || typeof sdk.ai.txt2vid !== "function") throw new Error("PUTER_SDK_UNAVAILABLE");
    var model = modelById(params.modelId);
    var inputReference = null;
    if (params.mode === "image") {
      if (!model.supportsImageInput) throw new Error("PUTER_VIDEO_IMAGE_UNSUPPORTED");
      if (!params.file) throw new Error("PUTER_VIDEO_IMAGE_REQUIRED");
      inputReference = model.imageInput === "file" ? params.file : params.dataUrl;
      if (!inputReference) throw new Error("PUTER_VIDEO_IMAGE_READ_FAILED");
    }
    var options = buildVideoOptions(model, params.duration, params.aspect, inputReference);
    var outputPath = "nexora-ai-video-" + Date.now() + ".mp4";
    options.puter_output_path = outputPath;
    var request = sdk.ai.txt2vid(params.prompt, options);
    return withTimeout(request, GENERATION_TIMEOUT_MS)
      .then(function (raw) { return normalizeGeneratedPuterVideo(sdk, raw, outputPath); })
      .finally(function () { return removeTemporaryPuterVideo(sdk, outputPath); });
  }

  function videoErrorMessage(error) {
    var runtime = window.NexoraPuterRuntime;
    var details = runtime && runtime.errorDetails ? runtime.errorDetails(error) : { code: "", status: 0, message: String(error || "") };
    var raw = (details.code + " " + details.status + " " + details.message).toLowerCase();
    if (/image_required/.test(raw)) return "Pilih gambar referensi terlebih dahulu.";
    if (/image_too_large/.test(raw)) return "Ukuran gambar maksimal 10 MB.";
    if (/image_invalid|unsupported image|invalid.*image/.test(raw)) return "Gambar referensi harus berupa JPG, PNG, atau WebP yang valid.";
    if (/image_unsupported/.test(raw)) return "Gambar referensi tidak didukung oleh model ini.";
    if (/popup|blocked/.test(raw)) return "Jendela login diblokir browser. Izinkan pop-up lalu coba lagi.";
    if (/email_must_be_confirmed|confirm.*email|email.*confirm/.test(raw)) return "Email akun Puter belum dikonfirmasi.";
    if (details.status === 401 || details.status === 403 || /unauthor|auth|sign.?in|login|cancel|closed|denied/.test(raw)) return "Login Puter diperlukan untuk menggunakan AI Video.";
    if (details.status === 402 || /allowance|credit|quota|insufficient|payment|fund/.test(raw)) return "Allowance atau credit Puter tidak cukup untuk membuat video ini.";
    if (details.status === 429 || /rate|too many|concurren/.test(raw)) return "Permintaan terlalu banyak. Coba lagi nanti.";
    if (/safety|moderation|policy|filtered|rai|disallowed/.test(raw)) return "Prompt atau gambar ditolak oleh aturan keamanan model.";
    if (/timeout|timed out/.test(raw)) return "Pembuatan video melewati batas waktu. Silakan coba lagi.";
    if (/model not found|unknown video model|model.*unavailable|unsupported model|no provider/.test(raw)) return "Model video sedang tidak tersedia.";
    if (/network|fetch|offline|load_failed/.test(raw)) return "Koneksi ke layanan video terputus. Periksa internet lalu coba lagi.";
    if (/empty_result|invalid_result|unexpected.*video/.test(raw)) return "Hasil video tidak dapat dibaca. Coba model lain.";
    if (/cancel|abort/.test(raw)) return "Video generation dibatalkan.";
    return "Video gagal dibuat. Coba lagi.";
  }

  function formatBytes(value) {
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    return Math.max(1, Math.round(value / 1024)) + " KB";
  }

  window.NexoraVideoModels = videoModels;
  window.renderPuterVideo = function renderPuterVideo(body) {
    if (!body) return;
    var alive = true;
    var busy = false;
    var accountVerified = false;
    var mode = "text";
    var referenceFile = null;
    var referenceDataUrl = "";
    var referenceUrl = "";
    var normalizedResult = null;
    var generationToken = 0;
    var statusTimers = [];

    body.innerHTML = "" +
      '<main class="nvg">' +
        '<section class="nvg-note" aria-label="Privasi dan akun Puter"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><div><strong>Diproses melalui akun Puter kamu</strong><p>Nexora tidak meminta API key, tidak menyimpan prompt, gambar referensi, atau video hasil.</p></div></section>' +
        '<section class="nvg-card nvg-account"><div><span class="nvg-kicker">STATUS AKUN</span><strong id="nvgAccount">Menyiapkan Puter…</strong><small id="nvgUsage">Login tidak dilakukan otomatis.</small></div><button class="nvg-secondary" id="nvgConnect" type="button" disabled><i class="fa-solid fa-right-to-bracket"></i><span>Hubungkan Puter</span></button></section>' +
        '<section class="nvg-card nvg-create">' +
          '<div class="nvg-tabs" role="tablist" aria-label="Mode video"><button class="is-active" id="nvgTextMode" type="button" role="tab" aria-selected="true"><i class="fa-solid fa-font"></i>Text to Video</button><button id="nvgImageMode" type="button" role="tab" aria-selected="false"><i class="fa-regular fa-image"></i>Image to Video</button></div>' +
          '<div class="nvg-reference" id="nvgReference" hidden><label class="nvg-field-label">Gambar referensi</label><input id="nvgFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><button class="nvg-file-button" id="nvgChoose" type="button"><i class="fa-solid fa-image"></i><span>Pilih Gambar</span></button><div class="nvg-preview" id="nvgPreview" hidden><img id="nvgPreviewImage" alt="Preview gambar referensi" loading="lazy" decoding="async"><div><strong id="nvgFileName"></strong><small id="nvgFileSize"></small></div><button id="nvgRemoveImage" type="button" aria-label="Hapus gambar referensi"><i class="fa-solid fa-xmark"></i></button></div><p>JPG, PNG, atau WebP · maksimal 10 MB · langsung ke Puter.</p></div>' +
          '<label class="nvg-field-label" for="nvgPrompt">Prompt video <span>Wajib</span></label><textarea id="nvgPrompt" minlength="3" maxlength="3000" rows="6" placeholder="Contoh: Kota futuristik pada malam hari, hujan deras, pantulan neon di jalan basah, gerakan kamera perlahan."></textarea><div class="nvg-count"><span>Jelaskan subjek, gerakan, kamera, dan suasana.</span><span id="nvgCount">0 / 3000</span></div>' +
          '<div class="nvg-control-grid"><label><span>Model</span><select id="nvgModel"></select></label><label><span>Durasi yang diminta</span><select id="nvgDuration"></select></label></div>' +
          '<div class="nvg-cost" id="nvgCost" aria-live="polite"><strong>Perkiraan biaya sedang dihitung…</strong><span>Durasi ini adalah permintaan. Puter dapat memendekkannya jika allowance tidak mencukupi.</span></div>' +
          '<fieldset class="nvg-aspect"><legend>Rasio video</legend><label><input type="radio" name="nvgAspect" value="9:16" checked><span><i class="fa-solid fa-mobile-screen"></i>9:16</span></label><label><input type="radio" name="nvgAspect" value="16:9"><span><i class="fa-solid fa-display"></i>16:9</span></label></fieldset>' +
          '<button class="nvg-primary" id="nvgGenerate" type="button" disabled><i class="fa-solid fa-clapperboard"></i><span>Generate Video</span></button><p class="nvg-message" id="nvgMessage" role="status" aria-live="polite">Hubungkan akun Puter terlebih dahulu.</p><button class="nvg-auth-retry" id="nvgAuthRetry" type="button" hidden><i class="fa-solid fa-right-to-bracket"></i><span>Hubungkan Ulang Puter</span></button>' +
        '</section>' +
        '<section class="nvg-card nvg-result" aria-label="Video hasil"><div class="nvg-result-head"><div><span class="nvg-kicker">HASIL</span><h2>Generated Video</h2></div><span id="nvgResultMeta">Session only</span></div><div class="nvg-placeholder" id="nvgPlaceholder"><i class="fa-solid fa-film"></i><strong>Video akan muncul di sini</strong><span>Proses dapat memerlukan beberapa menit.</span></div><video id="nvgVideo" controls playsinline preload="metadata" hidden></video><div class="nvg-actions" id="nvgActions" hidden><a id="nvgDownload" href="#" download="nexora-ai-video.mp4"><i class="fa-solid fa-download"></i>Download Video</a><a id="nvgOpen" href="#" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open Video</a><button id="nvgAgain" type="button"><i class="fa-solid fa-rotate-right"></i>Generate Again</button></div></section>' +
        '<p class="nvg-help">Video memakai allowance akun Puter pengguna. Pilihan durasi adalah permintaan, sedangkan durasi final mengikuti hasil nyata provider.</p>' +
      '</main>';

    var runtime = window.NexoraPuterRuntime;
    var connect = body.querySelector("#nvgConnect");
    var account = body.querySelector("#nvgAccount");
    var usage = body.querySelector("#nvgUsage");
    var textMode = body.querySelector("#nvgTextMode");
    var imageMode = body.querySelector("#nvgImageMode");
    var reference = body.querySelector("#nvgReference");
    var fileInput = body.querySelector("#nvgFile");
    var choose = body.querySelector("#nvgChoose");
    var preview = body.querySelector("#nvgPreview");
    var previewImage = body.querySelector("#nvgPreviewImage");
    var fileName = body.querySelector("#nvgFileName");
    var fileSize = body.querySelector("#nvgFileSize");
    var removeImage = body.querySelector("#nvgRemoveImage");
    var prompt = body.querySelector("#nvgPrompt");
    var count = body.querySelector("#nvgCount");
    var modelSelect = body.querySelector("#nvgModel");
    var durationSelect = body.querySelector("#nvgDuration");
    var cost = body.querySelector("#nvgCost");
    var generate = body.querySelector("#nvgGenerate");
    var message = body.querySelector("#nvgMessage");
    var authRetry = body.querySelector("#nvgAuthRetry");
    var placeholder = body.querySelector("#nvgPlaceholder");
    var video = body.querySelector("#nvgVideo");
    var actions = body.querySelector("#nvgActions");
    var download = body.querySelector("#nvgDownload");
    var open = body.querySelector("#nvgOpen");
    var again = body.querySelector("#nvgAgain");
    var resultMeta = body.querySelector("#nvgResultMeta");

    videoModels.forEach(function (item, index) {
      var option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label + " — " + item.detail;
      if (index === 0) option.selected = true;
      modelSelect.appendChild(option);
    });

    function setMessage(text, type) {
      if (!alive) return;
      message.textContent = text;
      message.className = "nvg-message" + (type ? " is-" + type : "");
    }

    function clearStatusTimers() {
      statusTimers.forEach(clearTimeout);
      statusTimers = [];
    }

    function signedIn() {
      return Boolean(window.puter && window.puter.auth && window.puter.auth.isSignedIn());
    }

    function setBusy(next) {
      busy = next;
      generate.disabled = next || !accountVerified;
      modelSelect.disabled = next;
      durationSelect.disabled = next;
      textMode.disabled = next;
      imageMode.disabled = next;
      choose.disabled = next;
      generate.querySelector("i").className = next ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-clapperboard";
      generate.querySelector("span").textContent = next ? "Generating your video…" : "Generate Video";
    }

    function updateCostEstimate() {
      var selected = modelById(modelSelect.value);
      var requested = Number(durationSelect.value || selected.durations[0]);
      var estimate = estimatedVideoCost(selected, requested);
      cost.querySelector("strong").textContent = estimate === null
        ? "Perkiraan biaya tidak tersedia"
        : "Perkiraan biaya " + formatUsd(estimate) + " untuk " + requested + " detik";
      cost.querySelector("span").textContent = "Durasi yang dipilih bukan jaminan. Puter dapat menurunkannya sesuai allowance akun.";
    }

    function updateDurations() {
      var selected = modelById(modelSelect.value);
      var previous = Number(durationSelect.value);
      durationSelect.innerHTML = "";
      selected.durations.forEach(function (seconds) {
        var option = document.createElement("option");
        option.value = String(seconds);
        option.textContent = seconds + " detik";
        if (seconds === previous || (!previous && seconds === selected.durations[0])) option.selected = true;
        durationSelect.appendChild(option);
      });
      updateCostEstimate();
      if (mode === "image" && !selected.supportsImageInput) {
        setMessage("Gambar referensi tidak didukung oleh model ini.", "error");
        generate.disabled = true;
      } else if (!busy && signedIn()) {
        generate.disabled = false;
      }
    }

    function setMode(next) {
      if (busy || (next !== "text" && next !== "image")) return;
      mode = next;
      var imageActive = mode === "image";
      textMode.classList.toggle("is-active", !imageActive);
      imageMode.classList.toggle("is-active", imageActive);
      textMode.setAttribute("aria-selected", String(!imageActive));
      imageMode.setAttribute("aria-selected", String(imageActive));
      reference.hidden = !imageActive;
      updateDurations();
      setMessage(imageActive ? "Pilih gambar, tulis gerakannya, lalu generate video." : "Tulis prompt lalu generate video.", "ok");
    }

    function clearReference() {
      referenceFile = null;
      referenceDataUrl = "";
      fileInput.value = "";
      if (referenceUrl && window.URL && typeof window.URL.revokeObjectURL === "function") window.URL.revokeObjectURL(referenceUrl);
      referenceUrl = "";
      previewImage.removeAttribute("src");
      preview.hidden = true;
      choose.querySelector("span").textContent = "Pilih Gambar";
    }

    function clearResult() {
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      disposeVideoResult(normalizedResult);
      normalizedResult = null;
      video.hidden = true;
      actions.hidden = true;
      placeholder.hidden = false;
      download.removeAttribute("href");
      open.removeAttribute("href");
      resultMeta.textContent = "Session only";
    }

    async function refreshAccount() {
      if (!alive || !window.puter || !window.puter.auth) return;
      if (!signedIn()) {
        accountVerified = false;
        account.textContent = "Belum terhubung";
        usage.textContent = "Tekan tombol untuk login ke Puter.";
        connect.disabled = false;
        connect.querySelector("span").textContent = "Hubungkan Puter";
        generate.disabled = true;
        authRetry.hidden = false;
        return;
      }
      var user = null;
      try {
        user = await window.puter.auth.getUser();
      } catch (error) {
        if (!alive) return;
        var authDetails = runtime.errorDetails(error);
        accountVerified = false;
        if ((authDetails.status === 401 || authDetails.status === 403) && typeof window.puter.auth.signOut === "function") window.puter.auth.signOut();
        account.textContent = "Sesi perlu dihubungkan ulang";
        usage.textContent = "Tekan Hubungkan Ulang untuk membuka login Puter.";
        connect.disabled = false;
        connect.querySelector("span").textContent = "Hubungkan Ulang";
        generate.disabled = true;
        authRetry.hidden = false;
        setMessage("Sesi Puter sudah kedaluwarsa. Hubungkan ulang sebelum generate.", "error");
        return;
      }
      accountVerified = true;
      connect.disabled = false;
      connect.querySelector("span").textContent = "Akun Terhubung";
      generate.disabled = busy;
      authRetry.hidden = true;
      account.textContent = runtime.safeName(user);
      try {
        var monthly = await window.puter.auth.getMonthlyUsage();
        if (alive) usage.textContent = runtime.percentRemaining(monthly) || "Allowance mengikuti akun Puter kamu.";
      } catch (_) { usage.textContent = "Allowance mengikuti akun Puter kamu."; }
      setMessage("Puter sudah terhubung. Video siap dibuat.", "ok");
    }

    async function connectPuter() {
      if (busy) return;
      connect.disabled = true;
      authRetry.disabled = true;
      setMessage("Membuka login Puter…", "loading");
      try {
        var puter = window.puter;
        if (!puter || !puter.auth || typeof puter.auth.signIn !== "function") throw new Error("PUTER_SDK_UNAVAILABLE");
        if (!puter.auth.isSignedIn() || !accountVerified) {
          if (puter.auth.isSignedIn() && typeof puter.auth.signOut === "function") puter.auth.signOut();
          await puter.auth.signIn({ request_auth: true });
        }
        if (alive) await refreshAccount();
      } catch (error) {
        if (!alive) return;
        accountVerified = false;
        connect.disabled = false;
        authRetry.disabled = false;
        authRetry.hidden = false;
        connect.querySelector("span").textContent = "Coba Hubungkan Lagi";
        generate.disabled = true;
        setMessage(videoErrorMessage(error), "error");
      }
    }

    connect.addEventListener("click", connectPuter);
    authRetry.addEventListener("click", connectPuter);

    textMode.addEventListener("click", function () { setMode("text"); });
    imageMode.addEventListener("click", function () { setMode("image"); });
    modelSelect.addEventListener("change", updateDurations);
    durationSelect.addEventListener("change", updateCostEstimate);
    prompt.addEventListener("input", function () { count.textContent = prompt.value.length + " / " + MAX_PROMPT_LENGTH; });
    choose.addEventListener("click", function () { if (!busy) fileInput.click(); });
    removeImage.addEventListener("click", clearReference);

    fileInput.addEventListener("change", async function () {
      var selected = fileInput.files && fileInput.files[0];
      if (!selected) return;
      try {
        await validateReferenceImage(selected);
        var preparedDataUrl = await readFileAsDataUrl(selected);
        if (!alive) return;
        clearReference();
        referenceFile = selected;
        referenceDataUrl = preparedDataUrl;
        referenceUrl = URL.createObjectURL(selected);
        previewImage.src = referenceUrl;
        fileName.textContent = selected.name || "Gambar referensi";
        fileSize.textContent = formatBytes(selected.size);
        preview.hidden = false;
        choose.querySelector("span").textContent = "Ganti Gambar";
        setMessage("Gambar siap digunakan sebagai frame referensi.", "ok");
      } catch (error) {
        clearReference();
        setMessage(videoErrorMessage(error), "error");
      }
    });

    generate.addEventListener("click", async function () {
      if (busy) return;
      var promptValue = prompt.value.trim();
      var selectedModel = modelById(modelSelect.value);
      if (!promptValue) {
        setMessage("Masukkan prompt video terlebih dahulu.", "error");
        prompt.focus();
        return;
      }
      if (promptValue.length < 3 || promptValue.length > MAX_PROMPT_LENGTH) {
        setMessage("Prompt video harus berisi 3–3000 karakter.", "error");
        prompt.focus();
        return;
      }
      if (mode === "image" && !referenceFile) {
        setMessage("Pilih gambar referensi terlebih dahulu.", "error");
        return;
      }
      if (mode === "image" && !selectedModel.supportsImageInput) {
        setMessage("Gambar referensi tidak didukung oleh model ini.", "error");
        return;
      }
      if (!signedIn() || !accountVerified) {
        setMessage("Hubungkan ulang akun Puter sebelum menggunakan AI Video.", "error");
        return;
      }

      var token = ++generationToken;
      clearStatusTimers();
      setBusy(true);
      authRetry.hidden = true;
      setMessage("Menyiapkan model video…", "loading");
      statusTimers.push(setTimeout(function () { if (alive && busy && token === generationToken) setMessage("Generating your video…", "loading"); }, 1800));
      statusTimers.push(setTimeout(function () { if (alive && busy && token === generationToken) setMessage("Video AI dapat memerlukan beberapa menit. Jangan tutup halaman ini.", "loading"); }, 30000));

      try {
        var selectedAspect = (body.querySelector('input[name="nvgAspect"]:checked') || {}).value || "9:16";
        var requestedSeconds = Number(durationSelect.value);
        var result = await generateVideoWithPuter({
          prompt: promptValue,
          modelId: selectedModel.id,
          duration: requestedSeconds,
          aspect: selectedAspect,
          mode: mode,
          file: referenceFile,
          dataUrl: referenceDataUrl
        });
        if (!alive || token !== generationToken) {
          disposeVideoResult(result);
          return;
        }
        clearResult();
        normalizedResult = result;
        video.style.aspectRatio = selectedAspect === "16:9" ? "16 / 9" : "9 / 16";
        var durationReported = false;
        var reportActualDuration = function () {
          if (durationReported || !alive || token !== generationToken) return;
          var actualSeconds = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : 0;
          if (!actualSeconds) return;
          durationReported = true;
          resultMeta.textContent = selectedModel.label + " · diminta " + requestedSeconds + "s · hasil " + actualSeconds + "s · " + selectedAspect;
          if (actualSeconds < requestedSeconds) {
            setMessage("Puter menghasilkan " + actualSeconds + " detik dari permintaan " + requestedSeconds + " detik karena penyesuaian allowance.", "warning");
          } else if (actualSeconds !== requestedSeconds) {
            setMessage("Durasi final provider adalah " + actualSeconds + " detik; permintaan awal " + requestedSeconds + " detik.", "warning");
          } else {
            setMessage("Video selesai dengan durasi " + actualSeconds + " detik sesuai permintaan.", "ok");
          }
        };
        video.onloadedmetadata = reportActualDuration;
        video.ondurationchange = reportActualDuration;
        video.src = result.videoUrl;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.hidden = false;
        placeholder.hidden = true;
        download.href = result.videoUrl;
        download.download = "nexora-ai-video-" + Date.now() + ".mp4";
        open.href = result.videoUrl;
        actions.hidden = false;
        resultMeta.textContent = selectedModel.label + " · diminta " + requestedSeconds + "s · membaca hasil…";
        setMessage("Video selesai. Nexora sedang membaca durasi hasil sebenarnya.", "ok");
      } catch (error) {
        if (alive && token === generationToken) {
          var details = runtime.errorDetails(error);
          console.warn("[puter-video] request stopped", { model: selectedModel.id, mode: mode, code: details.code, status: details.status });
          if (details.status === 401 || details.status === 403 || /popup|auth|sign.?in|login/.test((details.code + " " + details.message).toLowerCase())) {
            accountVerified = false;
            generate.disabled = true;
            connect.disabled = false;
            connect.querySelector("span").textContent = "Hubungkan Ulang";
            authRetry.disabled = false;
            authRetry.hidden = false;
            setMessage("Otorisasi Puter perlu diperbarui. Tekan Hubungkan Ulang Puter.", "error");
          } else {
            setMessage(videoErrorMessage(error), "error");
          }
        }
      } finally {
        clearStatusTimers();
        if (alive && token === generationToken) setBusy(false);
      }
    });

    again.addEventListener("click", function () {
      prompt.focus();
      prompt.scrollIntoView({ behavior: "smooth", block: "center" });
      setMessage("Prompt siap diedit untuk generasi berikutnya.", "ok");
    });

    runtime.loadSdk().then(function () {
      if (!alive) return;
      connect.disabled = false;
      refreshAccount();
    }).catch(function (error) {
      if (!alive) return;
      account.textContent = "Puter belum tersedia";
      usage.textContent = "Periksa internet atau pemblokir iklan.";
      connect.disabled = false;
      setMessage(videoErrorMessage(error), "error");
    });

    updateDurations();
    body.__nxCleanup = function () {
      alive = false;
      busy = false;
      generationToken += 1;
      clearStatusTimers();
      clearReference();
      clearResult();
    };
  };

  window.normalizePuterVideoResult = normalizePuterVideoResult;
  window.generateVideoWithPuter = generateVideoWithPuter;
  window.estimatedPuterVideoCost = estimatedVideoCost;
})();

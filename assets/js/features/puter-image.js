(function () {
  "use strict";

  var PUTER_SDK_URL = "https://js.puter.com/v2/";
  var sdkPromise = null;
  var DEFAULT_MODEL = "gpt-image-1-mini";
  var MODEL_IDS = Object.freeze([
    "gpt-image-1-mini",
    "gpt-image-2",
    "google/gemini-2.5-flash-image",
    "google/imagen-4.0-fast",
    "black-forest-labs/flux-schnell",
    "ideogram/ideogram-3.0"
  ]);
  var RATIOS = Object.freeze({
    "1:1": { w: 1, h: 1 },
    "3:4": { w: 3, h: 4 },
    "4:3": { w: 4, h: 3 },
    "9:16": { w: 9, h: 16 },
    "16:9": { w: 16, h: 9 }
  });
  var GPT_MINI_RATIOS = Object.freeze({
    "1:1": { w: 1024, h: 1024 },
    "3:4": { w: 1024, h: 1536 },
    "4:3": { w: 1536, h: 1024 },
    "9:16": { w: 1024, h: 1536 },
    "16:9": { w: 1536, h: 1024 }
  });
  var GPT_2_RATIOS = Object.freeze({
    "1:1": { w: 1024, h: 1024 },
    "3:4": { w: 768, h: 1024 },
    "4:3": { w: 1024, h: 768 },
    "9:16": { w: 576, h: 1024 },
    "16:9": { w: 1024, h: 576 }
  });

  function loadPuterSdk() {
    if (window.puter && window.puter.auth && window.puter.ai) return Promise.resolve(window.puter);
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise(function (resolve, reject) {
      var old = document.querySelector('script[data-nexora-puter-sdk="1"]');
      var script = old || document.createElement("script");
      var timer = setTimeout(function () {
        sdkPromise = null;
        reject(new Error("Puter terlalu lama merespons. Periksa internet lalu coba lagi."));
      }, 15000);

      function ready() {
        clearTimeout(timer);
        if (window.puter && window.puter.auth && window.puter.ai) resolve(window.puter);
        else {
          sdkPromise = null;
          reject(new Error("Puter SDK tidak tersedia. Muat ulang halaman lalu coba lagi."));
        }
      }

      function failed() {
        clearTimeout(timer);
        sdkPromise = null;
        reject(new Error("Gagal memuat Puter. Periksa koneksi internet atau pemblokir iklan."));
      }

      script.addEventListener("load", ready, { once: true });
      script.addEventListener("error", failed, { once: true });
      if (!old) {
        script.src = PUTER_SDK_URL;
        script.async = true;
        script.dataset.nexoraPuterSdk = "1";
        document.head.appendChild(script);
      }
    });
    return sdkPromise;
  }

  function safeName(user) {
    var value = user && (user.username || user.email || user.name);
    return String(value || "Pengguna Puter").replace(/[<>]/g, "").slice(0, 80);
  }

  function errorDetails(error) {
    var root = error && typeof error === "object" ? error : {};
    var nested = root.error && typeof root.error === "object" ? root.error : root;
    var code = String(nested.code || root.code || "").trim().toLowerCase();
    var status = Number(nested.status || root.status || 0) || 0;
    var message = String(nested.message || root.message || (typeof root.error === "string" ? root.error : "") || error || "").trim();
    return { code: code, status: status, message: message.slice(0, 240) };
  }

  function errorMessage(error) {
    var details = errorDetails(error);
    var raw = (details.code + " " + details.status + " " + details.message).toLowerCase();
    if (/popup|blocked/.test(raw)) return "Jendela login diblokir browser. Izinkan pop-up untuk Nexora lalu coba lagi.";
    if (/email_must_be_confirmed|confirm.*email|email.*confirm/.test(raw)) return "Email akun Puter belum dikonfirmasi. Konfirmasi email di Puter, lalu coba lagi.";
    if (/cancel|closed|denied|unauthorized|auth_canceled|authentication/.test(raw)) return "Login Puter belum selesai atau sesi sudah habis. Hubungkan Puter lagi.";
    if (details.status === 402 || /allowance|credit|quota|usage.limit|insufficient|payment|fund/.test(raw)) return "Allowance atau credit Puter tidak cukup. Buka akun Puter dan periksa menu Usage.";
    if (details.status === 429 || /rate|too many|concurren/.test(raw)) return "Permintaan terlalu cepat atau masih ada proses lain. Tunggu sebentar lalu coba lagi.";
    if (/safety|moderation|policy|filtered|rai/.test(raw)) return "Prompt ditolak aturan keamanan Puter. Ubah isi prompt lalu coba lagi.";
    if (/model not found|model.*unavailable|unsupported model|no provider/.test(raw)) return "Model ini sedang tidak tersedia di Puter. Pilih model lain.";
    if (/network|fetch|offline/.test(raw)) return "Koneksi ke Puter terputus. Periksa internet lalu coba lagi.";
    if (details.message && details.message !== "[object Object]") return "Puter menolak permintaan: " + details.message + (details.code ? " (" + details.code + ")" : "");
    return "Puter tidak memberi alasan yang dapat dibaca. Coba lagi beberapa saat.";
  }

  function canFallback(error) {
    var details = errorDetails(error);
    var raw = (details.code + " " + details.message).toLowerCase();
    return /model not found|model.*unavailable|unsupported model|no provider/.test(raw);
  }

  function generationOptions(modelId, ratioKey) {
    var options = { model: modelId };
    if (modelId === "gpt-image-1-mini") {
      options.quality = "low";
      options.ratio = GPT_MINI_RATIOS[ratioKey] || GPT_MINI_RATIOS["1:1"];
      return options;
    }
    if (modelId === "gpt-image-2") {
      options.quality = "low";
      options.ratio = GPT_2_RATIOS[ratioKey] || GPT_2_RATIOS["1:1"];
      return options;
    }
    options.ratio = RATIOS[ratioKey] || RATIOS["1:1"];
    return options;
  }

  function percentRemaining(usage) {
    var info = usage && usage.allowanceInfo;
    var total = Number(info && info.monthUsageAllowance);
    var remaining = Number(info && info.remaining);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) return "";
    return Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) + "% allowance tersisa";
  }

  window.renderPuterImage = function renderPuterImage(body) {
    if (!body) return;
    var alive = true;
    var busy = false;
    var resultUrl = "";

    body.innerHTML = "" +
      '<main class="npi">' +
        '<section class="npi-note" aria-label="Penjelasan akun Puter">' +
          '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
          '<div><strong>Akun Puter milik kamu</strong><p>Nexora tidak melihat password. Pembuatan gambar memakai allowance akun Puter yang kamu hubungkan, bukan akun developer Nexora.</p></div>' +
        '</section>' +
        '<section class="npi-card npi-account">' +
          '<div class="npi-account-copy"><span class="npi-label">STATUS AKUN</span><strong id="npiAccountText">Menyiapkan Puter…</strong><small id="npiUsageText">Login tidak dilakukan otomatis.</small></div>' +
          '<button class="npi-secondary" id="npiConnect" type="button" disabled><i class="fa-solid fa-right-to-bracket"></i><span>Hubungkan Puter</span></button>' +
        '</section>' +
        '<section class="npi-card">' +
          '<label class="npi-field-label" for="npiPrompt">Ceritakan gambar yang kamu mau</label>' +
          '<textarea id="npiPrompt" minlength="3" maxlength="2000" rows="6" placeholder="Contoh: Seekor kucing astronot berdiri di bulan, gaya kartun 3D, warna ungu dan biru, cahaya lembut"></textarea>' +
          '<div class="npi-count"><span>Minimal 3 huruf</span><span id="npiCount">0 / 2000</span></div>' +
          '<label class="npi-field-label" for="npiModel">Model gambar</label>' +
          '<select id="npiModel">' +
            '<option value="gpt-image-1-mini">GPT Image Mini — paling hemat</option>' +
            '<option value="google/gemini-2.5-flash-image">Gemini Flash Image</option>' +
            '<option value="google/imagen-4.0-fast">Imagen 4 Fast</option>' +
            '<option value="black-forest-labs/flux-schnell">FLUX Schnell</option>' +
            '<option value="ideogram/ideogram-3.0">Ideogram 3</option>' +
            '<option value="gpt-image-2">GPT Image 2</option>' +
          '</select>' +
          '<label class="npi-field-label" for="npiRatio">Ukuran gambar</label>' +
          '<select id="npiRatio">' +
            '<option value="1:1">Kotak — 1:1</option>' +
            '<option value="3:4">Potret — 3:4</option>' +
            '<option value="4:3">Lanskap — 4:3</option>' +
            '<option value="9:16">Story HP — 9:16</option>' +
            '<option value="16:9">Layar lebar — 16:9</option>' +
          '</select>' +
          '<button class="npi-primary" id="npiGenerate" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Buat Gambar</span></button>' +
          '<p class="npi-message" id="npiMessage" role="status" aria-live="polite">Hubungkan akun Puter terlebih dahulu.</p>' +
        '</section>' +
        '<section class="npi-card npi-result" aria-label="Hasil gambar">' +
          '<div class="npi-placeholder" id="npiPlaceholder"><i class="fa-regular fa-image"></i><strong>Hasil gambar muncul di sini</strong><span>Gambar tidak disimpan oleh Nexora.</span></div>' +
          '<img id="npiImage" alt="Hasil gambar AI dari Puter" hidden>' +
          '<a class="npi-download" id="npiDownload" href="#" download="nexora-ai-image.png" hidden><i class="fa-solid fa-download"></i><span>Unduh Gambar</span></a>' +
        '</section>' +
        '<p class="npi-help">Butuh bantuan? Baca <a href="https://github.com/akidwush/all-tools-nexora#cara-memakai-nexora-ai-image" target="_blank" rel="noopener noreferrer">panduan sederhana di README</a>. Ketentuan dan allowance mengikuti <a href="https://developer.puter.com/pricing/" target="_blank" rel="noopener noreferrer">Puter</a>.</p>' +
      '</main>';

    var connect = body.querySelector("#npiConnect");
    var generate = body.querySelector("#npiGenerate");
    var accountText = body.querySelector("#npiAccountText");
    var usageText = body.querySelector("#npiUsageText");
    var prompt = body.querySelector("#npiPrompt");
    var model = body.querySelector("#npiModel");
    var ratio = body.querySelector("#npiRatio");
    var count = body.querySelector("#npiCount");
    var message = body.querySelector("#npiMessage");
    var placeholder = body.querySelector("#npiPlaceholder");
    var image = body.querySelector("#npiImage");
    var download = body.querySelector("#npiDownload");

    function setMessage(text, type) {
      if (!alive) return;
      message.textContent = text;
      message.className = "npi-message" + (type ? " is-" + type : "");
    }

    function setBusy(next) {
      busy = next;
      generate.disabled = next || !(window.puter && window.puter.auth && window.puter.auth.isSignedIn());
      generate.querySelector("i").className = next ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-wand-magic-sparkles";
      generate.querySelector("span").textContent = next ? "Sedang membuat…" : "Buat Gambar";
    }

    async function refreshAccount() {
      if (!alive || !window.puter || !window.puter.auth) return;
      var signedIn = Boolean(window.puter.auth.isSignedIn());
      if (!signedIn) {
        accountText.textContent = "Belum terhubung";
        usageText.textContent = "Tekan tombol untuk login ke Puter.";
        connect.disabled = false;
        connect.querySelector("span").textContent = "Hubungkan Puter";
        generate.disabled = true;
        return;
      }

      connect.disabled = false;
      connect.querySelector("span").textContent = "Akun Terhubung";
      generate.disabled = busy;
      try {
        var user = await window.puter.auth.getUser();
        if (!alive) return;
        accountText.textContent = safeName(user);
      } catch (_) {
        accountText.textContent = "Akun Puter terhubung";
      }
      try {
        var usage = await window.puter.auth.getMonthlyUsage();
        if (!alive) return;
        usageText.textContent = percentRemaining(usage) || "Allowance mengikuti akun Puter kamu.";
      } catch (_) {
        usageText.textContent = "Allowance mengikuti akun Puter kamu.";
      }
      setMessage("Puter sudah terhubung. Tulis prompt lalu buat gambar.", "ok");
    }

    connect.addEventListener("click", async function () {
      if (busy) return;
      connect.disabled = true;
      setMessage("Membuka login Puter…", "loading");
      try {
        var puter = await loadPuterSdk();
        if (!puter.auth.isSignedIn()) await puter.auth.signIn();
        if (!alive) return;
        await refreshAccount();
      } catch (error) {
        if (!alive) return;
        connect.disabled = false;
        setMessage(errorMessage(error), "error");
      }
    });

    prompt.addEventListener("input", function () {
      count.textContent = prompt.value.length + " / 2000";
    });

    generate.addEventListener("click", async function () {
      if (busy) return;
      var value = prompt.value.trim();
      var modelId = MODEL_IDS.indexOf(model.value) !== -1 ? model.value : MODEL_IDS[0];
      var ratioKey = RATIOS[ratio.value] ? ratio.value : "1:1";
      if (value.length < 3) {
        setMessage("Tulis prompt sedikitnya 3 huruf.", "error");
        prompt.focus();
        return;
      }
      if (!window.puter || !window.puter.auth.isSignedIn()) {
        setMessage("Hubungkan akun Puter terlebih dahulu.", "error");
        return;
      }

      setBusy(true);
      setMessage("Puter sedang membuat gambar. Jangan tutup halaman ini.", "loading");
      try {
        var usedModel = modelId;
        var generated;
        try {
          generated = await window.puter.ai.txt2img(value, generationOptions(modelId, ratioKey));
        } catch (firstError) {
          var firstDetails = errorDetails(firstError);
          console.warn("[puter-image] generation failed", { model: modelId, code: firstDetails.code, status: firstDetails.status, message: firstDetails.message });
          if (!canFallback(firstError) || modelId === DEFAULT_MODEL) throw firstError;
          usedModel = DEFAULT_MODEL;
          setMessage("Model pilihan tidak tersedia. Mencoba GPT Image Mini…", "loading");
          generated = await window.puter.ai.txt2img(value, generationOptions(DEFAULT_MODEL, ratioKey));
        }
        if (!alive) return;
        var src = generated && generated.src ? String(generated.src) : "";
        if (!/^(data:image\/|blob:|https:\/\/)/i.test(src)) throw new Error("invalid image response");
        if (resultUrl.indexOf("blob:") === 0 && window.URL && typeof window.URL.revokeObjectURL === "function") window.URL.revokeObjectURL(resultUrl);
        resultUrl = src;
        image.src = src;
        image.hidden = false;
        placeholder.hidden = true;
        download.href = src;
        download.download = "nexora-ai-" + Date.now() + ".png";
        download.hidden = false;
        setMessage(usedModel === modelId ? "Gambar selesai. Tekan Unduh Gambar untuk menyimpannya." : "Model pilihan sedang gangguan. Gambar berhasil dibuat dengan GPT Image Mini.", "ok");
      } catch (error) {
        if (alive) {
          var details = errorDetails(error);
          console.warn("[puter-image] request stopped", { model: modelId, code: details.code, status: details.status, message: details.message });
          setMessage(errorMessage(error), "error");
        }
      } finally {
        if (alive) setBusy(false);
      }
    });

    loadPuterSdk().then(function () {
      if (!alive) return;
      connect.disabled = false;
      refreshAccount();
    }).catch(function (error) {
      if (!alive) return;
      accountText.textContent = "Puter belum tersedia";
      usageText.textContent = "Periksa internet atau pemblokir iklan.";
      connect.disabled = false;
      setMessage(errorMessage(error), "error");
    });

    body.__nxCleanup = function () {
      alive = false;
      busy = false;
      image.removeAttribute("src");
      download.removeAttribute("href");
      if (resultUrl.indexOf("blob:") === 0 && window.URL && typeof window.URL.revokeObjectURL === "function") window.URL.revokeObjectURL(resultUrl);
      resultUrl = "";
    };
  };
})();

(function () {
  "use strict";

  var PUTER_SDK_URL = "https://js.puter.com/v2/";
  var sdkPromise = null;
  var MODEL_IDS = Object.freeze([
    "openai/gpt-image-1-mini",
    "openai/gpt-image-2",
    "google/gemini-2.5-flash-image",
    "google/imagen-4.0-fast",
    "black-forest-labs/flux-schnell",
    "ideogram/ideogram-3.0"
  ]);
  var RATIOS = Object.freeze({
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

  function errorMessage(error) {
    var raw = String((error && (error.message || error.error || error.code)) || error || "").toLowerCase();
    if (/popup|blocked/.test(raw)) return "Jendela login diblokir browser. Izinkan pop-up untuk Nexora lalu coba lagi.";
    if (/cancel|closed|denied|auth/.test(raw)) return "Login Puter belum selesai. Tekan Hubungkan Puter bila ingin mencoba lagi.";
    if (/allowance|credit|quota|limit|insufficient|payment/.test(raw)) return "Allowance Puter kamu tidak cukup. Periksa pemakaian akun Puter lalu coba lagi.";
    if (/rate|too many/.test(raw)) return "Permintaan terlalu cepat. Tunggu sebentar lalu coba lagi.";
    if (/safety|moderation|policy/.test(raw)) return "Prompt tidak dapat diproses karena aturan keamanan. Ubah isi prompt lalu coba lagi.";
    if (/network|fetch|offline/.test(raw)) return "Koneksi ke Puter terputus. Periksa internet lalu coba lagi.";
    return "Gambar belum berhasil dibuat. Coba prompt atau model lain.";
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
            '<option value="openai/gpt-image-1-mini">GPT Image Mini — cepat</option>' +
            '<option value="google/gemini-2.5-flash-image">Gemini Flash Image</option>' +
            '<option value="google/imagen-4.0-fast">Imagen 4 Fast</option>' +
            '<option value="black-forest-labs/flux-schnell">FLUX Schnell</option>' +
            '<option value="ideogram/ideogram-3.0">Ideogram 3</option>' +
            '<option value="openai/gpt-image-2">GPT Image 2</option>' +
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
      var size = RATIOS[ratio.value] || RATIOS["1:1"];
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
        var generated = await window.puter.ai.txt2img(value, {
          model: modelId,
          ratio: { w: size.w, h: size.h }
        });
        if (!alive) return;
        var src = generated && generated.src ? String(generated.src) : "";
        if (!/^(data:image\/|blob:|https:\/\/)/i.test(src)) throw new Error("invalid image response");
        resultUrl = src;
        image.src = src;
        image.hidden = false;
        placeholder.hidden = true;
        download.href = src;
        download.download = "nexora-ai-" + Date.now() + ".png";
        download.hidden = false;
        setMessage("Gambar selesai. Tekan Unduh Gambar untuk menyimpannya.", "ok");
      } catch (error) {
        if (alive) setMessage(errorMessage(error), "error");
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
      resultUrl = "";
    };
  };
})();

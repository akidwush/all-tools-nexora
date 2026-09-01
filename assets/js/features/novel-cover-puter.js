(function () {
  "use strict";

  var DEFAULT_MODEL = "google/imagen-4.0-fast";
  var FALLBACK_MODEL = "openai/gpt-image-1-mini";
  var FLASH_IMAGE_MODEL = "google/" + "gem" + "ini-3.1-flash-image-preview";
  var modelLabels = {
    "openai/gpt-image-1-mini": "GPT Image Mini",
    "google/imagen-4.0-fast": "Imagen 4 Fast",
    "black-forest-labs/flux-schnell": "FLUX Schnell",
    "qwen/qwen-image-2.0-pro": "Qwen Image 2 Pro",
    "openai/gpt-image-2": "GPT Image 2"
  };
  modelLabels[FLASH_IMAGE_MODEL] = "Nexora Flash Image";
  var MODELS = Object.freeze(modelLabels);
  var RATIOS = Object.freeze({
    "2:3": { w: 2, h: 3 },
    "3:4": { w: 3, h: 4 },
    "4:5": { w: 4, h: 5 },
    "9:16": { w: 9, h: 16 },
    "1:1": { w: 1, h: 1 }
  });
  var GPT_MINI_RATIOS = Object.freeze({
    "2:3": { w: 1024, h: 1536 },
    "3:4": { w: 1024, h: 1536 },
    "4:5": { w: 1024, h: 1536 },
    "9:16": { w: 1024, h: 1536 },
    "1:1": { w: 1024, h: 1024 }
  });
  var GPT_2_RATIOS = Object.freeze({
    "2:3": { w: 768, h: 1024 },
    "3:4": { w: 768, h: 1024 },
    "4:5": { w: 768, h: 1024 },
    "9:16": { w: 576, h: 1024 },
    "1:1": { w: 1024, h: 1024 }
  });

  function field(root, key) {
    return root.querySelector('[data-nc="' + key + '"]');
  }

  function runtime() {
    if (!window.NexoraPuterRuntime) throw new Error("Puter runtime belum tersedia. Muat ulang halaman lalu coba lagi.");
    return window.NexoraPuterRuntime;
  }

  function director() {
    if (!window.NexoraNovelCoverDirector) throw new Error("AI Cover Director belum tersedia. Muat ulang halaman lalu coba lagi.");
    return window.NexoraNovelCoverDirector;
  }

  function details(error) {
    var root = error && typeof error === "object" ? error : {};
    var nested = root.error && typeof root.error === "object" ? root.error : root;
    return {
      code: String(nested.code || root.code || "").trim().toLowerCase(),
      status: Number(nested.status || root.status || 0) || 0,
      message: String(nested.message || root.message || (typeof root.error === "string" ? root.error : "") || error || "").trim().slice(0, 240)
    };
  }

  function errorMessage(error) {
    var info = details(error);
    var raw = (info.code + " " + info.status + " " + info.message).toLowerCase();
    if (/popup|blocked/.test(raw)) return "Jendela login Puter diblokir. Izinkan pop-up lalu coba lagi.";
    if (/email_must_be_confirmed|confirm.*email|email.*confirm/.test(raw)) return "Email Puter belum dikonfirmasi. Konfirmasi email lalu hubungkan kembali.";
    if (/cancel|closed|denied|unauthorized|auth_canceled|authentication/.test(raw)) return "Login Puter belum selesai atau sesi sudah habis.";
    if (info.status === 402 || /allowance|credit|quota|usage.limit|insufficient|payment|fund/.test(raw)) return "Allowance AI Puter tidak cukup. Periksa menu Usage pada akun Puter.";
    if (info.status === 429 || /rate|too many|concurren/.test(raw)) return "Puter masih memproses permintaan lain. Tunggu sebentar lalu coba lagi.";
    if (/safety|moderation|policy|filtered|rai/.test(raw)) return "Prompt ditolak aturan keamanan Puter. Ubah deskripsi lalu coba lagi.";
    if (/model not found|model.*unavailable|unsupported model|no provider/.test(raw)) return "Model Puter sedang tidak tersedia. Pilih model lain.";
    if (/network|fetch|offline|load_failed|timeout/.test(raw)) return "Koneksi ke Puter gagal. Periksa internet atau pemblokir iklan.";
    if (info.message && info.message !== "[object Object]") return "Puter menolak permintaan: " + info.message;
    return "Puter belum dapat membuat gambar. Coba model lain atau gunakan Upload Artwork.";
  }

  function canFallback(error) {
    var info = details(error);
    var raw = (info.code + " " + info.status + " " + info.message).toLowerCase();
    if ([401, 402, 403, 429].indexOf(info.status) !== -1) return false;
    if (/allowance|credit|quota|payment|safety|moderation|policy|cancel|denied|unauthor|rate|concurren/.test(raw)) return false;
    return /model not found|model.*unavailable|unsupported model|no provider|non-serverless|extract image url/.test(raw);
  }

  function isQueueError(error) {
    var info = details(error);
    var raw = (info.code + " " + info.status + " " + info.message).toLowerCase();
    return info.status === 429 || /concurren|already.*processing|request.*progress|too many requests/.test(raw);
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  async function generateImage(puter, prompt, options, onQueue) {
    try {
      return await puter.ai.txt2img(prompt, options);
    } catch (error) {
      if (!isQueueError(error)) throw error;
      if (typeof onQueue === "function") onQueue();
      await wait(3000);
      return puter.ai.txt2img(prompt, options);
    }
  }

  function generationOptions(model, ratio) {
    var options = { model: model };
    if (model === "openai/gpt-image-1-mini") {
      options.quality = "low";
      options.ratio = GPT_MINI_RATIOS[ratio] || GPT_MINI_RATIOS["2:3"];
    } else if (model === "openai/gpt-image-2") {
      options.quality = "low";
      options.ratio = GPT_2_RATIOS[ratio] || GPT_2_RATIOS["2:3"];
    } else {
      options.ratio = RATIOS[ratio] || RATIOS["2:3"];
      if (model === FLASH_IMAGE_MODEL) options.quality = "1K";
    }
    return options;
  }

  function buildPrompt(input) {
    var plan = input.director || director().createLocalPlan(input);
    return director().buildArtworkPrompt(input, plan);
  }

  async function refreshAccount(root) {
    var account = field(root, "puter-name");
    var usage = field(root, "puter-usage");
    var connect = field(root, "puter-connect");
    try {
      var helper = runtime();
      var puter = await helper.loadSdk();
      if (!puter.auth.isSignedIn()) {
        account.textContent = "Belum terhubung";
        usage.textContent = "Login untuk memakai allowance AI gratis akun Puter.";
        connect.disabled = false;
        connect.querySelector("span").textContent = "Hubungkan Puter";
        return false;
      }
      connect.disabled = false;
      connect.querySelector("span").textContent = "Akun Terhubung";
      try {
        account.textContent = helper.safeName(await puter.auth.getUser());
      } catch (_) {
        account.textContent = "Akun Puter terhubung";
      }
      try {
        usage.textContent = helper.percentRemaining(await puter.auth.getMonthlyUsage()) || "Allowance mengikuti akun Puter Anda.";
      } catch (_) {
        usage.textContent = "Allowance mengikuti akun Puter Anda.";
      }
      return true;
    } catch (error) {
      account.textContent = "Puter belum tersedia";
      usage.textContent = errorMessage(error);
      connect.disabled = false;
      return false;
    }
  }

  async function connect(root) {
    var button = field(root, "puter-connect");
    button.disabled = true;
    button.querySelector("span").textContent = "Membuka login…";
    try {
      var puter = await runtime().loadSdk();
      if (!puter.auth.isSignedIn()) await puter.auth.signIn();
      await refreshAccount(root);
    } catch (error) {
      button.disabled = false;
      button.querySelector("span").textContent = "Hubungkan Puter";
      throw new Error(errorMessage(error));
    }
  }

  function imageSource(generated) {
    if (generated && typeof generated.src === "string") return generated.src;
    if (generated && generated.image && typeof generated.image.src === "string") return generated.image.src;
    if (typeof generated === "string") return generated;
    return "";
  }

  async function generate(root, input) {
    var puter = await runtime().loadSdk();
    if (!puter.auth.isSignedIn()) await puter.auth.signIn();
    await refreshAccount(root);
    var selected = field(root, "puter-model").value;
    if (!MODELS[selected]) selected = DEFAULT_MODEL;
    var model = selected;
    var generated;
    var plan = director().createLocalPlan(input);
    input.director = plan;
    var directorState = field(root, "director-state");
    if (directorState) directorState.textContent = "Creative brief cover siap · membuat 1 artwork…";
    var prompt = buildPrompt(input);
    var queued = function () {
      if (directorState) directorState.textContent = "Antrean Puter sibuk · mencoba ulang sekali…";
    };
    try {
      generated = await generateImage(puter, prompt, generationOptions(model, input.aspectRatio), queued);
    } catch (firstError) {
      if (!canFallback(firstError)) throw new Error(errorMessage(firstError));
      model = selected === DEFAULT_MODEL ? FALLBACK_MODEL : DEFAULT_MODEL;
      generated = await generateImage(puter, prompt, generationOptions(model, input.aspectRatio), queued);
    }
    var source = imageSource(generated);
    if (!/^(data:image\/|blob:|https:\/\/)/i.test(source)) throw new Error("Puter mengembalikan format gambar yang tidak dikenali.");
    return {
      ok: true,
      mode: "puter",
      result: {
        provider: "Puter User-Pays",
        model: MODELS[model] || model,
        images: [{ url: source }],
        director: plan
      },
      attempts: ["puter"],
      diagnostics: []
    };
  }

  function localArtwork(file, input) {
    return new Promise(function (resolve, reject) {
      if (!file || ["image/jpeg", "image/png", "image/webp"].indexOf(file.type) === -1 || file.size > 12000000) {
        reject(new Error("Artwork harus JPG, PNG, atau WebP maksimal 12 MB."));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve({
          ok: true,
          mode: "local",
          result: {
            provider: "Local Artwork",
            model: "Tanpa AI · diproses di perangkat",
            images: [{ base64: reader.result }],
            director: director().createLocalPlan(input || { genre: "Fantasy" })
          }
        });
      };
      reader.onerror = function () { reject(new Error("Artwork gagal dibaca.")); };
      reader.readAsDataURL(file);
    });
  }

  function sync(root, mode) {
    var free = mode === "puter";
    field(root, "puter-account").hidden = !free;
    field(root, "puter-model-field").hidden = !free;
    field(root, "cost").innerHTML = free
      ? "Mode gratis: <b>1 request artwork</b>. AI Cover Director memasukkan arahan genre, hierarchy, palette, dan ruang judul langsung ke prompt gambar."
      : "Mode Pro: <b>1 provider × 1 image</b>. Auto mencoba maksimal 3 provider dengan API credit server.";
    field(root, "generate").querySelector("span").textContent = free ? "Buat Cover Profesional" : "Buat Cover Pro";
  }

  function bind(root, hooks) {
    field(root, "puter-connect").addEventListener("click", async function () {
      hooks.status(root, "Membuka login Puter…", "loading");
      try {
        await connect(root);
        hooks.status(root, "Puter terhubung. Allowance akun siap digunakan.", "success");
      } catch (error) {
        hooks.status(root, error.message, "error");
      }
    });
    field(root, "artwork").addEventListener("change", async function (event) {
      var selected = event.target.files && event.target.files[0];
      if (!selected) return;
      field(root, "artwork-name").textContent = selected.name;
      hooks.status(root, "Membuka artwork di Nexora Composer…", "loading");
      try {
        var input = typeof hooks.input === "function" ? hooks.input(root) : { genre: "Fantasy" };
        var result = await localArtwork(selected, input);
        hooks.show(root, result);
        hooks.status(root, "Artwork siap. Director memasang title dan author secara otomatis.", "success");
      } catch (error) {
        hooks.status(root, error.message, "error");
      }
    });
    refreshAccount(root);
  }

  window.NexoraNovelCoverPuter = Object.freeze({
    bind: bind,
    buildPrompt: buildPrompt,
    errorMessage: errorMessage,
    generate: generate,
    refreshAccount: refreshAccount,
    sync: sync
  });
})();

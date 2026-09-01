(function () {
  "use strict";

  var DEFAULT_MODEL = "gpt-image-2";
  var AUTO_MODELS = Object.freeze(["gpt-image-2", "gpt-image-1-mini", "google/imagen-4.0-fast"]);
  var FLASH_IMAGE_MODEL = "google/" + "gem" + "ini-3.1-flash-image-preview";
  var modelLabels = {
    "gpt-image-1-mini": "GPT Image Mini",
    "google/imagen-4.0-fast": "Imagen 4 Fast",
    "black-forest-labs/flux-schnell": "FLUX Schnell",
    "qwen/qwen-image-2.0-pro": "Qwen Image 2 Pro",
    "gpt-image-2": "GPT Image 2"
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

  function canTryNextModel(error) {
    var info = details(error);
    var raw = (info.code + " " + info.status + " " + info.message).toLowerCase();
    if ([400, 401, 402, 403].indexOf(info.status) !== -1 && !/model not found|model.*unavailable|unsupported model|no provider/.test(raw)) return false;
    if (/allowance|credit|quota|payment|safety|moderation|policy|cancel|denied|unauthor|invalid prompt|bad request/.test(raw)) return false;
    return info.status === 429 || info.status >= 500 || /rate|too many|concurren|already.*processing|request.*progress|timeout|network|fetch|offline|model not found|model.*unavailable|unsupported model|no provider|non-serverless|extract image url/.test(raw);
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  function candidateModels(selected) {
    var candidates = [selected].concat(AUTO_MODELS).filter(function (model, index, values) {
      return MODELS[model] && values.indexOf(model) === index;
    });
    return candidates.slice(0, 3);
  }

  async function generateWithFallback(puter, prompt, ratio, selected, onAttempt) {
    var candidates = candidateModels(selected);
    var failures = [];
    for (var index = 0; index < candidates.length; index += 1) {
      var model = candidates[index];
      if (index > 0) await wait(index * 2000);
      if (typeof onAttempt === "function") onAttempt(model, index + 1, candidates.length);
      try {
        return { generated: await puter.ai.txt2img(prompt, generationOptions(model, ratio)), model: model, failures: failures };
      } catch (error) {
        failures.push({ model: model, error: error });
        if (!canTryNextModel(error) || index === candidates.length - 1) {
          if (failures.length > 1 && canTryNextModel(error)) {
            throw new Error("Semua model Puter sedang sibuk atau dibatasi. Nexora sudah mencoba " + failures.map(function (item) { return MODELS[item.model] || item.model; }).join(", ") + ". Tunggu beberapa menit lalu coba lagi.");
          }
          throw new Error(errorMessage(error));
        }
      }
    }
    throw new Error("Model Puter belum dapat digunakan saat ini.");
  }

  function generationOptions(model, ratio) {
    var options = { model: model, ratio: RATIOS[ratio] || RATIOS["2:3"] };
    if (/^gpt-image-/.test(model)) {
      options.provider = "openai-image-generation";
      options.quality = "low";
    }
    if (model === FLASH_IMAGE_MODEL) options.quality = "1K";
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
    var plan = director().createLocalPlan(input);
    input.director = plan;
    var directorState = field(root, "director-state");
    if (directorState) directorState.textContent = "Creative brief cover siap · menyiapkan model utama…";
    var prompt = buildPrompt(input);
    var outcome = await generateWithFallback(puter, prompt, input.aspectRatio, selected, function (model, attempt, total) {
      if (directorState) directorState.textContent = attempt === 1
        ? "Membuat artwork dengan " + (MODELS[model] || model) + "…"
        : "Model cadangan " + attempt + "/" + total + " · " + (MODELS[model] || model) + "…";
    });
    var source = imageSource(outcome.generated);
    if (!/^(data:image\/|blob:|https:\/\/)/i.test(source)) throw new Error("Puter mengembalikan format gambar yang tidak dikenali.");
    return {
      ok: true,
      mode: "puter",
      result: {
        provider: "Puter User-Pays",
        model: MODELS[outcome.model] || outcome.model,
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
      ? "Mode gratis: <b>1 hasil artwork</b>. Model cadangan hanya dicoba berurutan jika model utama sibuk atau tidak tersedia."
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

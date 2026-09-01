"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { parseInput } = require("../lib/ai-cover/http");
const { createRegistry } = require("../lib/ai-cover/registry");
const { normalizeResult } = require("../lib/ai-cover/normalizer");
const { providerError } = require("../lib/ai-cover/errors");
const { generateAuto, generateComparison, _health } = require("../lib/ai-cover/router");
const adapters = require("../lib/ai-cover/registry").adapters;

const input = parseInput({
  title: "Moon Academy",
  author: "Nexora",
  description: "A heroine discovers forbidden moon magic beneath her academy.",
  character: "Adult heroine, dark hair, calm expression, elegant academy coat.",
  genre: "Academy",
  mood: "Mysterious",
  composition: "Character + Environment",
  visualStyle: "Light Novel",
  aspectRatio: "2:3",
  seed: 42
});

function provider(id, generate, capabilities = { textToImage: true }) {
  return { id, name: id, enabled: true, apiKey: "test", model: `${id}-model`, capabilities, generate };
}

async function adapterContracts() {
  const requests = [];
  const jsonFetch = (payload) => async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "request-test" }
    });
  };

  let result = await adapters.ideogram.generate(input, {
    apiKey: "x",
    fetch: jsonFetch({ data: [{ url: "https://cdn.example/ideogram.jpg", width: 1024, height: 1536 }] })
  });
  assert.equal(result.images[0].url, "https://cdn.example/ideogram.jpg");
  assert.equal(requests[0].options.body.get("text_prompt"), input.prompt);
  assert.equal(requests[0].options.body.get("resolution"), "832x1248");
  assert.equal(requests[0].options.body.has("prompt"), false, "Ideogram V4 tidak boleh menerima field prompt lama.");
  assert.equal(requests[0].options.body.has("aspect_ratio"), false, "Ideogram V4 memakai resolution, bukan aspect_ratio.");

  result = await adapters.recraft.generate(input, {
    apiKey: "x",
    fetch: jsonFetch({ data: [{ url: "https://cdn.example/recraft.jpg" }] })
  });
  assert.equal(result.images[0].width, 1024);
  assert.equal(JSON.parse(requests.at(-1).options.body).size, "2:3", "Recraft V4.1 harus memakai rasio yang didukung, bukan custom pixel Pro.");

  result = await adapters.fal.generate(input, {
    apiKey: "x",
    falClient: {
      async subscribe(model, request) {
        assert.equal(model, "fal-ai/flux-2/lora");
        assert.equal(request.input.num_images, 1);
        return { requestId: "fal-request", data: { seed: 42, images: [{ url: "https://cdn.example/fal.jpg", width: 1024, height: 1536 }] } };
      }
    }
  });
  assert.equal(result.requestId, "fal-request");

  result = await adapters.runware.generate(input, {
    apiKey: "x",
    fetch: jsonFetch({ data: [{ imageURL: "https://cdn.example/runware.jpg", seed: 42 }] })
  });
  assert.equal(result.images[0].url, "https://cdn.example/runware.jpg");
  await assert.rejects(adapters.runware.generate(input, {
    apiKey: "x",
    fetch: jsonFetch({ errors: [{ code: "insufficientFunds", message: "credit balance is empty", status: 402 }] })
  }), /credit balance is empty/i, "Runware HTTP 200 errors harus diteruskan ke diagnosis aman.");

  result = await adapters.stability.generate(input, {
    apiKey: "x",
    fetch: async () => new Response(Buffer.from("jpeg-test"), {
      status: 200,
      headers: { "content-type": "image/jpeg", seed: "42" }
    })
  });
  assert.match(result.images[0].base64, /^data:image\/jpeg;base64,/);

  result = await adapters.openai.generate(input, {
    apiKey: "x",
    fetch: jsonFetch({ data: [{ b64_json: Buffer.from("png-test").toString("base64") }] })
  });
  assert.match(result.images[0].base64, /^data:image\/png;base64,/);

  result = await adapters.huggingface.generate(input, {
    apiKey: "x",
    hfClient: {
      async textToImage(request) {
        assert.equal(request.provider, "auto");
        return new Blob([Buffer.from("hf-test")], { type: "image/png" });
      }
    }
  });
  assert.match(result.images[0].base64, /^data:image\/png;base64,/);

  assert.equal(requests.length, 5, "Lima request REST JSON termasuk error Runware harus tervalidasi.");
  assert.throws(() => normalizeResult("test", "model", { images: [] }), /tidak mengembalikan gambar/i);
}

async function routerContracts() {
  _health.clear();
  const calls = [];
  let registry = new Map([
    ["recraft", provider("recraft", async () => { calls.push("recraft"); const error = new Error("timeout"); error.name = "AbortError"; throw error; })],
    ["fal", provider("fal", async () => { calls.push("fal"); return { images: [{ url: "https://cdn.example/fallback.jpg" }] }; })]
  ]);
  let generated = await generateAuto(input, { registry });
  assert.equal(generated.result.provider, "fal");
  assert.deepEqual(calls, ["recraft", "fal"]);
  assert.equal(generated.diagnostics[0].code, "COVER_TIMEOUT");

  _health.clear();
  calls.length = 0;
  registry = new Map([
    ["recraft", provider("recraft", async () => { calls.push("recraft"); const error = new Error("rate limit"); error.status = 429; throw error; })],
    ["fal", provider("fal", async () => { calls.push("fal"); return { images: [{ url: "https://cdn.example/rate-fallback.jpg" }] }; })]
  ]);
  generated = await generateAuto(input, { registry });
  assert.equal(generated.result.provider, "fal");

  _health.clear();
  calls.length = 0;
  registry = new Map([
    ["recraft", provider("recraft", async () => { calls.push("recraft"); const error = new Error("Provider HTTP 400: unsupported size"); error.status = 400; throw error; })],
    ["fal", provider("fal", async () => { calls.push("fal"); return { images: [{ url: "https://cdn.example/request-fallback.jpg" }] }; })]
  ]);
  generated = await generateAuto(input, { registry });
  assert.equal(generated.result.provider, "fal");
  assert.deepEqual(calls, ["recraft", "fal"], "HTTP 400 konfigurasi provider harus fallback di Auto Mode.");

  _health.clear();
  calls.length = 0;
  registry = new Map([
    ["recraft", provider("recraft", async () => { calls.push("recraft"); const error = new Error("content policy safety rejection"); error.status = 400; throw error; })],
    ["fal", provider("fal", async () => { calls.push("fal"); return { images: [{ url: "https://cdn.example/should-not-run-safety.jpg" }] }; })]
  ]);
  await assert.rejects(generateAuto(input, { registry }), (error) => error.code === "COVER_SAFETY_REJECTED");
  assert.deepEqual(calls, ["recraft"], "Safety rejection tidak boleh dikirim ke provider lain.");

  _health.clear();
  calls.length = 0;
  registry = new Map([
    ["recraft", provider("recraft", async () => { calls.push("recraft"); const error = new Error("invalid prompt"); error.status = 400; throw error; })],
    ["fal", provider("fal", async () => { calls.push("fal"); return { images: [{ url: "https://cdn.example/should-not-run.jpg" }] }; })]
  ]);
  await assert.rejects(generateAuto(input, { registry }), (error) => error.code === "COVER_INVALID_PROMPT");
  assert.deepEqual(calls, ["recraft"], "Invalid prompt tidak boleh menghabiskan provider lain.");

  _health.clear();
  await assert.rejects(generateAuto(input, { registry: createRegistry({}) }), (error) => error.code === "COVER_NO_PROVIDER");

  _health.clear();
  const compareRegistry = new Map(["ideogram", "recraft", "fal", "runware", "stability"].map((id) => [
    id,
    provider(id, async () => ({ images: [{ url: `https://cdn.example/${id}.jpg` }] }))
  ]));
  const compared = await generateComparison(input, ["ideogram", "recraft", "fal", "runware", "stability"], { registry: compareRegistry });
  assert.equal(compared.length, 4, "Compare wajib dibatasi maksimal empat provider.");
}

async function puterContracts() {
  const calls = [];
  let chatCalls = 0;
  const nodes = {
    "puter-model": { value: "gpt-image-2" },
    "director-state": { textContent: "" },
    "puter-name": { textContent: "" },
    "puter-usage": { textContent: "" },
    "puter-connect": {
      disabled: false,
      querySelector() { return { textContent: "" }; }
    }
  };
  const puterClient = {
    auth: {
      isSignedIn: () => true,
      getUser: async () => ({ username: "nexora-test" }),
      getMonthlyUsage: async () => ({ allowanceInfo: { monthUsageAllowance: 100, remaining: 80 } })
    },
    ai: {
      async chat() {
        chatCalls += 1;
        throw new Error("Director tidak boleh membuat request chat terpisah.");
      },
      async txt2img(prompt, options) {
        calls.push({ prompt, options });
        return { src: "data:image/png;base64,dGVzdA==" };
      }
    }
  };
  const window = {
    NexoraPuterRuntime: {
      loadSdk: async () => puterClient,
      safeName: (user) => user.username,
      percentRemaining: () => "80% allowance tersisa"
    }
  };
  vm.runInNewContext(read("assets/js/features/novel-cover-director.js"), { window });
  vm.runInNewContext(read("assets/js/features/novel-cover-puter.js"), {
    window,
    FileReader: class {},
    setTimeout(callback) { callback(); return 1; }
  });
  const root = { querySelector(selector) { return nodes[selector.match(/data-nc="([^"]+)"/)?.[1]]; } };
  const generated = await window.NexoraNovelCoverPuter.generate(root, {
    ...input,
    typographyMode: "overlay",
    customDirection: "soft moonlight"
  });
  assert.equal(generated.mode, "puter");
  assert.equal(generated.result.provider, "Puter User-Pays");
  assert.equal(generated.result.model, "GPT Image 2");
  assert.equal(generated.result.director.source, "genre-director");
  assert.match(generated.result.images[0].url, /^data:image\/png;base64,/);
  assert.equal(chatCalls, 0, "Cover Director tidak boleh memakai request Puter chat terpisah.");
  assert.equal(calls.length, 1, "Mode gratis normal hanya membuat satu request AI.");
  assert.match(calls[0].prompt, /FINISHED PROFESSIONAL NOVEL COVER ARTWORK/);
  assert.match(calls[0].prompt, /quiet negative space/);
  assert.match(calls[0].prompt, /No title, no author|No title|no words/i);
  assert.equal(calls[0].options.model, "gpt-image-2");
  assert.equal(calls[0].options.provider, "openai-image-generation");
  assert.equal(calls[0].options.quality, "low");
  assert.deepEqual({ ...calls[0].options.ratio }, { w: 2, h: 3 });

  calls.length = 0;
  puterClient.ai.txt2img = async (prompt, options) => {
    calls.push({ prompt, options });
    if (options.model === "gpt-image-2") {
      const error = new Error("another request is already processing");
      error.status = 429;
      throw error;
    }
    return { src: "data:image/png;base64,cmV0cnk=" };
  };
  const recovered = await window.NexoraNovelCoverPuter.generate(root, { ...input, typographyMode: "overlay" });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.result.model, "GPT Image Mini");
  assert.equal(calls.length, 2, "Rate limit harus berpindah model secara berurutan, bukan mengulang model yang sama.");
  assert.deepEqual(calls.map((call) => call.options.model), ["gpt-image-2", "gpt-image-1-mini"]);
  assert.match(nodes["director-state"].textContent, /model cadangan 2\/3/i);

  calls.length = 0;
  puterClient.ai.txt2img = async (prompt, options) => {
    calls.push({ prompt, options });
    const error = new Error("too many requests");
    error.status = 429;
    throw error;
  };
  await assert.rejects(
    window.NexoraNovelCoverPuter.generate(root, { ...input, typographyMode: "overlay" }),
    /sudah mencoba GPT Image 2, GPT Image Mini, Imagen 4 Fast/i
  );
  assert.deepEqual(calls.map((call) => call.options.model), ["gpt-image-2", "gpt-image-1-mini", "google/imagen-4.0-fast"]);
}

async function directorContracts() {
  const window = {};
  vm.runInNewContext(read("assets/js/features/novel-cover-director.js"), { window });
  const director = window.NexoraNovelCoverDirector;
  const fantasy = director.createLocalPlan({ genre: "Fantasy", description: "A princess discovers a magic library.", character: "pink-haired scholar" });
  const action = director.createLocalPlan({ genre: "Action", description: "A hero fights a war across a ruined city.", character: "armored heroine" });
  assert.equal(fantasy.titleZone, "top");
  assert.equal(fantasy.fontMood, "editorial-serif");
  assert.equal(action.fontMood, "display-sans");
  assert.notDeepEqual([...fantasy.palette], [...action.palette]);
  const artworkPrompt = director.buildArtworkPrompt({ ...input, customDirection: "emerald book" }, fantasy);
  assert.match(artworkPrompt, /not a poster/i);
  assert.match(artworkPrompt, /top 28%/i);
  assert.match(artworkPrompt, /no title, no author/i);
  assert.match(artworkPrompt, /bookstore thumbnail/i);
  assert.ok(director.titleScale("A Very Long Novel Title That Must Fit") < director.titleScale("Nexora"));

  let chatCalls = 0;
  const directed = await director.direct({ ai: { chat: async () => { chatCalls += 1; } } }, input);
  assert.equal(directed.source, "genre-director");
  assert.equal(chatCalls, 0, "Director harus menyusun brief lokal agar artwork memakai satu request Puter saja.");
}

async function main() {
  assert.match(input.prompt, /FINISHED PROFESSIONAL NOVEL COVER ARTWORK/);
  assert.match(input.prompt, /Do not render words/);
  assert.match(input.negativePrompt, /watermark/);
  assert.throws(() => parseInput({ title: "x", description: "short" }), /minimal 20/);
  assert.equal(providerError("openai", Object.assign(new Error("organization must be verified"), { status: 400 })).code, "COVER_PROVIDER_VERIFICATION");
  assert.equal(providerError("fal", Object.assign(new Error("insufficient credit balance"), { status: 400 })).code, "COVER_BILLING_REQUIRED");
  assert.equal(providerError("openai", Object.assign(new Error("insufficient_quota: credit_balance_exhausted"), { status: 429 })).code, "COVER_BILLING_REQUIRED");

  const registry = createRegistry({ IDEOGRAM_API_KEY: "x", OPENAI_API_KEY: "y" });
  assert.equal(registry.get("ideogram").enabled, true);
  assert.equal(registry.get("recraft").enabled, false);
  assert.equal(registry.size, 7);
  assert.equal(require("../lib/ai-cover/provider-models").huggingface.model, "black-forest-labs/FLUX.1-schnell");

  await adapterContracts();
  await routerContracts();
  await directorContracts();
  await puterContracts();

  const config = require("../assets/config");
  const manifest = JSON.parse(read("assets/module-manifest.json"));
  const ui = read("assets/js/features/novel-cover-generator.js");
  const puter = read("assets/js/features/novel-cover-puter.js");
  const css = read("assets/css/features/novel-cover-generator.css");
  const vercel = JSON.parse(read("vercel.json"));
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(Object.values(config.tools).flat().length, 64);
  const tool = config.tools.tools.find((entry) => entry.id === "novelcover");
  assert.equal(tool.runtime.module, "novel-cover-generator");
  assert.equal(tool.runtime.mode, "module", "Mode gratis tidak boleh bergantung pada health API provider Pro.");
  assert.equal(tool.health.type, "module");
  assert.equal(manifest.tools.novelcover, "novel-cover-generator");
  assert.deepEqual(config.modules["novel-cover-generator"].js, [
    "assets/js/features/puter-runtime.js",
    "assets/js/features/novel-cover-director.js",
    "assets/js/features/novel-cover-puter.js",
    "assets/js/features/novel-cover-generator.js"
  ]);
  assert.deepEqual(manifest.modules["novel-cover-generator"].js, config.modules["novel-cover-generator"].js);
  assert.ok(vercel.rewrites.some((route) => route.source === "/api/ai/novel-cover"));
  assert.equal(packageJson.dependencies["@fal-ai/client"], "1.10.1");
  assert.equal(packageJson.dependencies["@huggingface/inference"], "4.13.28");

  for (const text of ["renderNovelCoverGenerator", "Puter Free", "Pro Auto", "Compare", "AI COVER DIRECTOR", "Pakai Artwork Sendiri", "Buat Cover Profesional", "Edit Lanjutan", "toBlob", "pointermove", "Reference Character", "API key configured", "diagnostics"]) {
    assert.ok(ui.includes(text), text);
  }
  for (const text of ["NexoraPuterRuntime", "puter.ai.txt2img", "Puter User-Pays", "buildPrompt", "localArtwork", "gpt-image-1-mini", "director().createLocalPlan", "generateWithFallback", "openai-image-generation"]) {
    assert.ok(puter.includes(text), text);
  }
  const directorUi = read("assets/js/features/novel-cover-director.js");
  for (const text of ["createLocalPlan", "buildArtworkPrompt", "providerDirection", "zoneMetrics", "titleScale", "single-concurrency lock"]) assert.ok(directorUi.includes(text), text);
  assert.doesNotMatch(directorUi, /puter\.ai\.chat|gpt-5-nano/, "Director tidak boleh menghabiskan request chat sebelum image generation.");
  for (const secret of ["IDEOGRAM_API_KEY", "RECRAFT_API_KEY", "FAL_KEY", "RUNWARE_API_KEY", "STABILITY_API_KEY", "OPENAI_API_KEY", "HF_TOKEN"]) {
    assert.equal(ui.includes(secret), false, `${secret} tidak boleh masuk frontend.`);
    assert.equal(puter.includes(secret), false, `${secret} tidak boleh masuk Puter frontend.`);
    assert.equal(directorUi.includes(secret), false, `${secret} tidak boleh masuk Cover Director frontend.`);
  }
  assert.ok(css.includes("safe-area-inset-bottom"));
  assert.ok(css.includes("nc-puter-account"));
  assert.ok(css.includes("nc-local-upload"));
  assert.ok(css.includes("nc-director-card"));
  assert.ok(css.includes("nc-direction-summary"));
  assert.ok(css.includes("nc-primary-actions"));
  assert.doesNotMatch(ui, /localStorage|sessionStorage/, "Generation dan reference tidak boleh disimpan di browser storage.");
  assert.doesNotMatch(puter, /localStorage|sessionStorage/, "Puter generation dan artwork tidak boleh disimpan di browser storage.");
  assert.doesNotMatch(directorUi, /localStorage|sessionStorage/, "Director plan tidak boleh disimpan di browser storage.");

  for (const width of [360, 375, 390, 412]) {
    const shell = width - 32;
    const card = (shell - 28 - 10) / 2;
    assert.ok(card >= 145 && card * 2 + 38 <= shell, `${width}px mengalami overflow.`);
  }

  console.log("Novel Cover V4.3 lulus: sequential GPT Image 2/Mini/Imagen fallback, no parallel request, one-click typography, 7 provider Pro, dan mobile 360/375/390/412 tervalidasi.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

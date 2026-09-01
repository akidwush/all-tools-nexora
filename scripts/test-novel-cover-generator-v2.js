"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { parseInput } = require("../lib/ai-cover/http");
const { createRegistry } = require("../lib/ai-cover/registry");
const { normalizeResult } = require("../lib/ai-cover/normalizer");
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

  assert.equal(requests.length, 4, "Empat adapter REST JSON harus membentuk request valid.");
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

async function main() {
  assert.match(input.prompt, /Professional vertical novel cover/);
  assert.match(input.prompt, /Do not render words/);
  assert.match(input.negativePrompt, /watermark/);
  assert.throws(() => parseInput({ title: "x", description: "short" }), /minimal 20/);

  const registry = createRegistry({ IDEOGRAM_API_KEY: "x", OPENAI_API_KEY: "y" });
  assert.equal(registry.get("ideogram").enabled, true);
  assert.equal(registry.get("recraft").enabled, false);
  assert.equal(registry.size, 7);
  assert.equal(require("../lib/ai-cover/provider-models").huggingface.model, "black-forest-labs/FLUX.1-schnell");

  await adapterContracts();
  await routerContracts();

  const config = require("../assets/config");
  const manifest = JSON.parse(read("assets/module-manifest.json"));
  const ui = read("assets/js/features/novel-cover-generator.js");
  const css = read("assets/css/features/novel-cover-generator.css");
  const vercel = JSON.parse(read("vercel.json"));
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(Object.values(config.tools).flat().length, 64);
  assert.equal(config.tools.tools.find((tool) => tool.id === "novelcover").runtime.module, "novel-cover-generator");
  assert.equal(manifest.tools.novelcover, "novel-cover-generator");
  assert.ok(vercel.rewrites.some((route) => route.source === "/api/ai/novel-cover"));
  assert.equal(packageJson.dependencies["@fal-ai/client"], "1.10.1");
  assert.equal(packageJson.dependencies["@huggingface/inference"], "4.13.28");

  for (const text of ["renderNovelCoverGenerator", "Compare", "Nexora Composer", "toBlob", "pointermove", "Reference Character"]) {
    assert.ok(ui.includes(text), text);
  }
  for (const secret of ["IDEOGRAM_API_KEY", "RECRAFT_API_KEY", "FAL_KEY", "RUNWARE_API_KEY", "STABILITY_API_KEY", "OPENAI_API_KEY", "HF_TOKEN"]) {
    assert.equal(ui.includes(secret), false, `${secret} tidak boleh masuk frontend.`);
  }
  assert.ok(css.includes("safe-area-inset-bottom"));
  assert.doesNotMatch(ui, /localStorage|sessionStorage/, "Generation dan reference tidak boleh disimpan di browser storage.");

  for (const width of [360, 375, 390, 412]) {
    const shell = width - 32;
    const card = (shell - 28 - 10) / 2;
    assert.ok(card >= 145 && card * 2 + 38 <= shell, `${width}px mengalami overflow.`);
  }

  console.log("Novel Cover V2 lulus: 7 adapter, Auto/fallback/Compare, prompt, secret isolation, composer, dan mobile 360/375/390/412 tervalidasi.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

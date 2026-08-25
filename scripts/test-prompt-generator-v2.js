"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  handlePromptGenerator,
  normalizeOptions,
  parseImage,
  parsePromptResponse,
  resetPromptGeneratorState
} = require("../lib/prompt-generator");
const { GEMINI_API_KEY_ENV_NAMES } = require("../lib/gemini-config");
const { DEFAULT_MODEL } = require("../lib/personal-ai");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function captureResponse() {
  const captured = { headers: {} };
  return {
    captured,
    response: {
      setHeader(name, value) { captured.headers[name] = value; },
      status(value) { captured.status = value; return this; },
      json(value) { captured.payload = value; return value; },
      end() { captured.ended = true; }
    }
  };
}

function request(method, body = {}, ip = "203.0.113.90") {
  return { method, body, headers: { "x-forwarded-for": ip }, socket: {} };
}

async function main() {
  const envNames = [...GEMINI_API_KEY_ENV_NAMES, "GEMINI_MODEL", "PROMPT_GENERATOR_MODEL"];
  const originalEnvironment = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  resetPromptGeneratorState();
  try {
    const parsedImage = parseImage({ fileName: "reference.png", mimeType: "image/png", fileData: `data:image/png;base64,${pngBase64}` });
    assert.equal(parsedImage.mimeType, "image/png");
    assert.ok(parsedImage.bytes > 40);
    assert.throws(() => parseImage({ fileName: "fake.jpg", mimeType: "image/jpeg", fileData: pngBase64 }), /tidak cocok/i);
    assert.throws(() => parseImage({ fileName: "bad.gif", mimeType: "image/gif", fileData: pngBase64 }), /JPG, PNG, atau WebP/i);

    assert.equal(normalizeOptions({ target: "flux", style: "cinematic", language: "en", aspectRatio: "16:9", creativity: 9 }).creativity, 5);
    assert.throws(() => normalizeOptions({ target: "unknown", style: "auto", language: "en", aspectRatio: "auto" }), /Target model/i);

    const normalized = parsePromptResponse(JSON.stringify({
      title: "Cinematic Portrait", summary: "Potret malam dengan cahaya neon.",
      prompt: "A cinematic close-up portrait of a traveler standing under cyan and violet neon rain, precise rim lighting, shallow depth of field, highly detailed skin texture.",
      negativePrompt: "blurry, low resolution, malformed hands",
      details: { subject: "Traveler", environment: "Rainy neon street", composition: "Close-up", lighting: "Cyan rim light", palette: ["cyan", "violet"], camera: "85mm", style: "cinematic" },
      keywords: ["portrait", "neon"], warnings: [], variants: [{ label: "Wide shot", prompt: "A wide cinematic shot of the same traveler crossing a neon street in rain with cyan reflections and atmospheric perspective." }]
    }));
    assert.match(normalized.prompt, /cinematic/i);
    assert.equal(normalized.variants.length, 1);

    envNames.forEach((name) => { delete process.env[name]; });
    const health = captureResponse();
    await handlePromptGenerator(request("GET"), health.response);
    assert.equal(health.captured.status, 200);
    assert.equal(health.captured.payload.configured, false);
    assert.equal(health.captured.payload.privacy, "not-stored");
    const head = captureResponse();
    await handlePromptGenerator(request("HEAD", {}, "203.0.113.91"), head.response);
    assert.equal(head.captured.status, 200);

    process.env.GOOGLE_GENERATIVE_AI_API_KEY = '"gemini_test_server_secret"';
    process.env.PROMPT_GENERATOR_MODEL = "gemini-missing-test-model";
    let requestPayload = null;
    const attemptedModels = [];
    const generated = captureResponse();
    await handlePromptGenerator(request("POST", {
      fileName: "reference.png", mimeType: "image/png", fileData: `data:image/png;base64,${pngBase64}`,
      target: "midjourney", style: "cinematic", language: "en", aspectRatio: "16:9", creativity: 4,
      includeNegative: true, direction: "Keep the subject and create a movie poster"
    }), generated.response, {
      clientFactory: async (key) => {
        assert.equal(key, "gemini_test_server_secret");
        return { models: { generateContent: async (payload) => {
          attemptedModels.push(payload.model);
          if (payload.model === "gemini-missing-test-model") throw { error: { code: "NOT_FOUND", message: "Model not found" } };
          requestPayload = payload;
          return { text: JSON.stringify({
            title: "Neon Movie Poster", summary: "Cinematic visual analysis.",
            prompt: "A cinematic movie poster featuring the original subject under neon rain, dramatic cyan and violet rim lighting, balanced 16:9 composition, realistic texture, controlled depth of field.",
            negativePrompt: "blurry, duplicate subject, distorted anatomy, unreadable text",
            details: { subject: "main subject", environment: "neon rain", composition: "poster framing", lighting: "rim lighting", palette: ["cyan", "violet"], camera: "50mm", style: "cinematic" },
            keywords: ["cinematic", "poster"], warnings: [], variants: []
          }) };
        } } };
      }
    });
    assert.equal(generated.captured.status, 200);
    assert.equal(generated.captured.payload.ok, true);
    assert.equal(generated.captured.payload.meta.privacy, "not-stored");
    assert.deepEqual(attemptedModels, ["gemini-missing-test-model", DEFAULT_MODEL]);
    assert.equal(requestPayload.contents[0].parts[0].inlineData.mimeType, "image/png");
    assert.match(requestPayload.contents[0].parts[1].text, /Midjourney/i);
    assert.ok(!JSON.stringify(generated.captured.payload).includes("gemini_test_server_secret"));

    const client = read("assets/js/features/prompt-generator.js");
    for (const token of ["renderPromptGenerator", "/api/prompt-generator", "Image to Video", "negative prompt", "Gambar tidak disimpan", "createImageBitmap"]) assert.ok(client.includes(token));
    assert.ok(!/GEMINI_API_KEY\s*=/.test(client));
    const css = read("assets/css/features/prompt-generator.css");
    for (const token of [".nx-prompt-layout", ".nx-prompt-details", "@media(max-width:520px)", "min-height:44px"]) assert.ok(css.includes(token));
    assert.match(css, /\.nx-prompt-waiting\[hidden\]\{display:none!important\}/);
    assert.match(read("assets/js/core/lazy-loader.js"), /prompt-v2-state1/);
    const manifest = JSON.parse(read("assets/module-manifest.json"));
    assert.equal(manifest.tools.promptgenerate, "prompt-generator");
    assert.ok(manifest.modules["prompt-generator"].js.includes("assets/js/features/prompt-generator.js"));
    const vercel = JSON.parse(read("vercel.json"));
    assert.ok(vercel.rewrites.some((row) => row.source === "/api/prompt-generator" && row.destination.includes("mode=prompt-generator")));
    assert.match(read("api/health.js"), /authorizeTool\(request, response, "promptgenerate"\)/);
    assert.match(read("database/migrations/025_prompt_generator_vision.sql"), /Tidak mengubah access_level/);

    console.log("Prompt Generator v2 lulus: Gemini Vision server-side, magic-byte image validation, model presets, privacy, Free/VVIP gate, responsive UI, copy/download, dan route aman aktif.");
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetPromptGeneratorState();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

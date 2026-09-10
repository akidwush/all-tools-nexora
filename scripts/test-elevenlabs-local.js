"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const ui = read("assets/js/features/elevenlabs-studio.js");
const worker = read("assets/js/features/elevenlabs-kokoro-worker.js");
const css = read("assets/css/features/elevenlabs-studio.css");
const vercel = JSON.parse(read("vercel.json"));
const csp = vercel.headers
  .flatMap((entry) => entry.headers || [])
  .find((header) => String(header.key).toLowerCase() === "content-security-policy")?.value || "";

// Kokoro is only imported inside its module worker, never from the homepage/studio bootstrap.
assert.match(worker, /KOKORO_VERSION\s*=\s*['"]1\.2\.1['"]/);
assert.match(worker, /kokoro-js@1\.2\.1\/dist\/kokoro\.web\.js/);
assert.match(worker, /onnx-community\/Kokoro-82M-v1\.0-ONNX/);
assert.match(worker, /import\(KOKORO_MODULE\)/);
assert.doesNotMatch(ui, /kokoro-js@1\.2\.1\/dist\/kokoro\.web\.js/);
assert.match(ui, /new Worker\(KOKORO_WORKER_URL,\s*\{\s*type:\s*['"]module['"]/);
assert.match(worker, /request\.type === ['"]init['"]/);

// Backend selection and real Kokoro APIs.
assert.match(worker, /self\.navigator\.gpu/);
assert.match(worker, /activeBackend === ['"]webgpu['"] \? ['"]fp32['"] : ['"]q8['"]/);
assert.match(worker, /KokoroTTS\.from_pretrained\(KOKORO_MODEL/);
assert.match(worker, /instance\.list_voices\(\)/);
assert.match(worker, /instance\.voices/);
assert.match(worker, /tts\.generate\(text, \{ voice, speed \}\)/);
assert.match(worker, /audio\.toBlob\(\)/);
assert.match(ui, /WEBGPU_INIT_FAILED/);
assert.match(ui, /ensureKokoro\(true\)/);
assert.match(ui, /WEBGPU_RUNTIME_FAILED/);
assert.match(ui, /type:\s*message\.mime \|\| ['"]audio\/wav['"]/);
assert.match(ui, /Download WAV/);
assert.match(ui, /URL\.revokeObjectURL/);

// Local privacy contract: no local worker route can post text to Nexora/backend services.
for (const forbidden of ["/api/elevenlabs", "supabase", "/api/analytics", "nexora-tools.my.id"]) {
  assert(!worker.toLowerCase().includes(forbidden.toLowerCase()), `Kokoro worker must not contain ${forbidden}`);
}
assert.match(ui, /Local engine berhenti tanpa mengirim teks ke cloud/);
assert.match(ui, /Use ElevenLabs Cloud/);
assert.match(ui, /Generate hanya akan dikirim setelah Anda menekan tombol cloud/);
assert.doesNotMatch(worker, /fetch\s*\(\s*['"`]\/api\//);

// One Studio, five final modes; mobile tabs may scroll horizontally.
for (const label of ["Text to Speech", "Lip Sync", "Voice Changer", "Speech to Text", "Sound FX"]) assert(ui.includes(label));
assert.match(ui, /<strong>ElevenLabs<\/strong><small>CLOUD<\/small>/);
assert.match(ui, /<strong>Kokoro<\/strong><small>LOCAL • PRIVATE<\/small>/);
assert.match(ui, /<strong>HeadTTS<\/strong><span>LOCAL • ENGLISH<\/span>/);
assert.match(css, /\.nel-tabs[^}]*overflow-x:\s*auto/);
assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);

// HeadTTS 1.3.0 browser-only contract and timestamped model.
assert.match(ui, /HEADTTS_VERSION\s*=\s*['"]1\.3\.0['"]/);
assert.match(ui, /@met4citizen\/headtts@1\.3\.0\/modules\/headtts\.mjs/);
assert.match(ui, /@met4citizen\/headtts@1\.3\.0\/modules\/worker-tts\.mjs/);
assert.match(ui, /@met4citizen\/headtts@1\.3\.0\/dictionaries\//);
assert.match(ui, /onnx-community\/Kokoro-82M-v1\.0-ONNX-timestamped/);
assert.match(ui, /endpoints:\s*\[['"]webgpu['"],\s*['"]wasm['"]\]/);
assert.match(ui, /languages:\s*\[['"]en-us['"]\]/);
assert.match(ui, /dtypeWebgpu:\s*['"]fp32['"]/);
assert.match(ui, /dtypeWasm:\s*['"]q4['"]/);
assert.match(ui, /instance\.connect\(/);
assert.match(ui, /instance\.setup\(\{ voice, language: ['"]en-us['"], speed, audioEncoding: ['"]wav['"] \}\)/);
assert.match(ui, /instance\.synthesize\(\{ input: text \}\)/);

// Output is normalized only from HeadTTS response timing arrays; no guessed timing generator.
for (const key of ["words", "wtimes", "wdurations", "phonemes", "visemes", "vtimes", "vdurations"]) {
  assert(new RegExp(`data\\.${key}`).test(ui), `HeadTTS output ${key} must be consumed`);
}
assert.match(ui, /wordTimings:/);
assert.match(ui, /phonemeTimings:/);
assert.match(ui, /visemeTimings:/);
assert.match(ui, /Words Timeline/);
assert.match(ui, /Phoneme Timeline/);
assert.match(ui, /Viseme Timeline/);
assert.match(ui, /data-nel-start/);
assert.match(ui, /audio\.currentTime/);
assert.match(ui, /Download Lip Sync JSON/);
assert.match(ui, /JSON\.stringify\(output\.rawTiming/);
assert.match(ui, /rawTiming:\s*\{\s*words,\s*wtimes,\s*wdurations,\s*phonemes,\s*visemes,\s*vtimes,\s*vdurations\s*\}/);
assert.doesNotMatch(ui, /fakeTiming|estimatedTiming|guessTiming/i);

// No local server functions were introduced.
for (const file of ["api/kokoro.js", "api/headtts.js", "api/lip-sync.js", "api/lipsync.js"]) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must not exist`);
}

// Existing CSP already has the minimum origins/capabilities needed by pinned ESM, WASM, model downloads and module workers.
assert(csp.includes("script-src") && csp.includes("'wasm-unsafe-eval'"));
assert(csp.includes("https://cdn.jsdelivr.net"));
assert(csp.includes("connect-src") && csp.includes("https://huggingface.co") && csp.includes("https://*.huggingface.co"));
assert(csp.includes("worker-src 'self' blob:"));
assert(!/(?:default|script|connect|worker)-src[^;]*\s\*\s*(?:;|$)/.test(csp), "CSP must not add wildcard source");

console.log("ElevenLabs local regression lulus: Kokoro 1.2.1 lazy worker + HeadTTS 1.3.0 lip-sync timing/privacy/CSP contracts valid.");

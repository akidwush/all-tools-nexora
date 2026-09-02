"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleElevenLabs, normalizeTranscript, parseMultipartBuffer, sniffMedia, constants } = require("../lib/elevenlabs-studio");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function responseMock() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload == null ? null : payload; return this; }
  };
}

function request(url, method, body, headers = {}, ip = "127.0.0.1") {
  return { url, method, body, headers: { host: "localhost", ...headers }, socket: { remoteAddress: ip } };
}

function configurationFetch(options = {}) {
  const voices = { voices: [{ voice_id: "voice-safe-1", name: "Nexora Voice", category: "premade", preview_url: "https://example.com/voice.mp3", secret: "drop-me" }] };
  const models = [{ model_id: "eleven_multilingual_v2", name: "Multilingual v2", can_do_text_to_speech: true, can_do_voice_conversion: true, can_use_style: true, can_use_speaker_boost: true, maximum_text_length_per_request: 5000 }];
  return async function fakeFetch(url, init) {
    options.calls?.push({ url: String(url), init });
    if (String(url).endsWith("/voices")) return new Response(JSON.stringify(voices), { status: options.authStatus || 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/models")) return new Response(JSON.stringify(models), { status: options.authStatus || 200, headers: { "content-type": "application/json" } });
    if (String(url).includes("/text-to-speech/")) return new Response(Buffer.from("ID3-tts"), { status: 200, headers: { "content-type": "audio/mpeg" } });
    if (String(url).includes("/speech-to-speech/")) return new Response(Buffer.from("ID3-converted"), { status: 200, headers: { "content-type": "audio/mpeg" } });
    if (String(url).includes("/sound-generation")) return new Response(Buffer.from("ID3-sfx"), { status: options.soundStatus || 200, headers: { "content-type": options.soundStatus ? "application/json" : "audio/mpeg" } });
    if (String(url).endsWith("/speech-to-text")) return new Response(JSON.stringify(options.transcript || {
      text: "Halo semuanya. Selamat datang.", language_code: "id",
      words: [
        { text: "Halo", start: 0, end: 0.4, speaker_id: "speaker_0", type: "word" },
        { text: "semuanya.", start: 0.4, end: 1, speaker_id: "speaker_0", type: "word" },
        { text: "Selamat", start: 1.1, end: 1.5, speaker_id: "speaker_1", type: "word" },
        { text: "datang.", start: 1.5, end: 2, speaker_id: "speaker_1", type: "word" }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error("Unexpected URL: " + url);
  };
}

function multipart(fields, file) {
  const boundary = "NexoraBoundary7MA4YWxk";
  const chunks = [];
  Object.entries(fields).forEach(([name, value]) => chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)));
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  chunks.push(file.data);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
}

async function main() {
  const previousKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "server-secret-test-key";

  assert.equal(constants.API_BASE, "https://api.elevenlabs.io/v1");
  assert.equal(constants.MAX_UPLOAD_BYTES, 20 * 1024 * 1024);

  const ui = read("assets/js/features/elevenlabs-studio.js");
  const css = read("assets/css/features/elevenlabs-studio.css");
  const backend = read("lib/elevenlabs-studio.js");
  const config = require("../assets/config.js");
  const allTools = Object.values(config.tools).flat();
  const tool = allTools.find((item) => item.id === "elevenlabs");
  assert(tool, "Tool registry ElevenLabs wajib tersedia");
  assert.equal(tool.runtime.module, "elevenlabs-studio");
  assert.equal(tool.health.path, "/assets/js/features/elevenlabs-studio.js");
  assert(config.modules["elevenlabs-studio"].js.includes("assets/js/features/elevenlabs-studio.js"));
  assert.match(read("assets/js/core/app.js"), /case 'elevenlabs': renderElevenLabsStudio\(body\)/);
  assert.match(read("assets/js/core/shell.js"), /elevenlabs:\{renderer:'renderElevenLabsStudio'/);
  assert.match(read("assets/js/core/lazy-loader.js"), /elevenlabs-studio-v1/);
  assert.match(read("vercel.json"), /\/api\/elevenlabs/);
  assert(read("route-manifest.json").includes('"/api/elevenlabs"'));
  assert.match(read("serve-local.js"), /"\/api\/elevenlabs"/);
  assert.equal((read(".env.example").match(/^ELEVENLABS_API_KEY=/gm) || []).length, 1);
  assert(!ui.includes("ELEVENLABS_API_KEY") && !ui.includes("xi-api-key"), "Secret tidak boleh disebut frontend");
  assert(!ui.includes("localStorage") && !ui.includes("sessionStorage") && !ui.includes("alert("));
  assert.match(ui, /URL\.revokeObjectURL/);
  assert.match(ui, /preload="metadata"/);
  assert.match(ui, /FormData/);
  assert(!backend.includes("supabase"));
  assert(!backend.includes("base64"));
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  [360, 375, 390, 412].forEach((viewport) => {
    const pagePadding = Math.max(14, Math.min(viewport * 0.04, 28));
    const contentWidth = viewport - (pagePadding * 2);
    const tabWidth = (contentWidth - 8 - 14) / 2;
    const fieldWidth = (contentWidth - 12) / 2;
    assert(contentWidth <= viewport && tabWidth >= 150, `${viewport}px: tab 2x2 berpotensi overflow.`);
    assert(fieldWidth >= 145, `${viewport}px: field grid terlalu sempit.`);
  });

  const calls = [];
  let res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=config", "GET"), res, { fetch: configurationFetch({ calls }), noCache: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.voices[0].id, "voice-safe-1");
  assert(!Object.hasOwn(res.body.data.voices[0], "secret"));
  assert(calls.every((call) => call.init.headers["xi-api-key"] === "server-secret-test-key"));

  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=tts", "POST", { text: "Halo Indonesia", voiceId: "voice-safe-1", modelId: "eleven_multilingual_v2", stability: 0.5, similarity: 0.75 }), res, { fetch: configurationFetch({ calls }), noCache: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "audio/mpeg");
  assert.match(res.headers["content-disposition"], /nexora-tts\.mp3/);
  assert(Buffer.isBuffer(res.body));
  const ttsCall = calls.find((call) => call.url.includes("/text-to-speech/"));
  assert(ttsCall && ttsCall.url.startsWith(constants.API_BASE));
  assert.equal(JSON.parse(ttsCall.init.body).model_id, "eleven_multilingual_v2");

  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=tts", "POST", { text: "", voiceId: "voice-safe-1" }, {}, "127.0.0.2"), res, { fetch: configurationFetch({}), noCache: true });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Masukkan teks terlebih dahulu.");

  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(80, 1)]);
  const voiceUpload = multipart({ voiceId: "voice-safe-1", modelId: "eleven_multilingual_v2", stability: "0.5", similarity: "0.75" }, { field: "audio", name: "voice.mp3", type: "audio/mpeg", data: mp3 });
  assert.equal(parseMultipartBuffer(voiceUpload.body, voiceUpload.type).file.data.length, mp3.length);
  assert.equal(sniffMedia({ data: mp3, type: "audio/mpeg" }).ext, "mp3");
  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=voice-changer", "POST", voiceUpload.body, { "content-type": voiceUpload.type, "content-length": String(voiceUpload.body.length) }, "127.0.0.3"), res, { fetch: configurationFetch({}), noCache: true });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-disposition"], /nexora-voice-converted\.mp3/);

  const sttUpload = multipart({ language: "id", diarize: "true" }, { field: "file", name: "speech.wav", type: "audio/wav", data: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(80)]) });
  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=speech-to-text", "POST", sttUpload.body, { "content-type": sttUpload.type }, "127.0.0.4"), res, { fetch: configurationFetch({}), noCache: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.speakers, ["speaker_0", "speaker_1"]);
  assert.equal(res.body.data.hasTimestamps, true);
  assert(res.body.data.segments.every((item) => Number.isFinite(item.start) && Number.isFinite(item.end)));
  const plain = normalizeTranscript({ text: "Tanpa label speaker" });
  assert.deepEqual(plain.speakers, []);
  assert.equal(plain.hasTimestamps, false);

  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=sound-effects", "POST", { text: "Massive dragon roar in a cavern", duration: 5, loop: true }, {}, "127.0.0.5"), res, { fetch: configurationFetch({ calls }), noCache: true });
  assert.equal(res.statusCode, 200);
  const soundCall = calls.filter((call) => call.url.includes("/sound-generation")).pop();
  const soundPayload = JSON.parse(soundCall.init.body);
  assert.equal(soundPayload.model_id, "eleven_text_to_sound_v2");
  assert.equal(soundPayload.duration_seconds, 5);
  assert.equal(soundPayload.loop, true);

  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=sound-effects", "POST", { text: "Rain", duration: "auto", loop: false }, {}, "127.0.0.6"), res, { fetch: configurationFetch({ soundStatus: 429 }), noCache: true });
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.message, "Batas penggunaan ElevenLabs tercapai.");
  assert(!JSON.stringify(res.body).includes("server-secret-test-key"));

  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=voice-changer", "POST", multipart({}, { field: "audio", name: "bad.txt", type: "text/plain", data: Buffer.from("not audio") }).body, { "content-type": voiceUpload.type }, "127.0.0.7"), res, { fetch: configurationFetch({}), noCache: true });
  assert.equal(res.statusCode, 415);

  delete process.env.ELEVENLABS_API_KEY;
  res = responseMock();
  await handleElevenLabs(request("/api/elevenlabs?action=config", "GET", null, {}, "127.0.0.8"), res, { fetch: configurationFetch({}), noCache: true });
  assert.equal(res.statusCode, 503);
  assert(!JSON.stringify(res.body).toLowerCase().includes("api key"));

  if (previousKey == null) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = previousKey;
  console.log("Nexora ElevenLabs Studio tests lulus: 4 mode, proxy aman, upload, normalizer, privacy, mobile, dan error sanitization valid.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

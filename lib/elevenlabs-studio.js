"use strict";

const { sendJson } = require("./http-response");
const { takeFixedWindow } = require("./memory-store");

const API_BASE = "https://api.elevenlabs.io/v1";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_JSON_BYTES = 96 * 1024;
const OUTPUT_FORMAT = "mp3_44100_128";
const rateBuckets = new Map();
const configCache = { value: null, expiresAt: 0 };

class StudioError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "StudioError";
    this.code = code;
    this.status = status;
  }
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function numberIn(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function clientKey(request) {
  return String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim().slice(0, 100);
}

function getApiKey() {
  const key = clean(process.env.ELEVENLABS_API_KEY, 500);
  if (!key) throw new StudioError("ElevenLabs belum dikonfigurasi oleh admin.", "ELEVENLABS_NOT_CONFIGURED", 503);
  return key;
}

function timeoutFor(action) {
  const defaults = { tts: 60_000, "voice-changer": 120_000, "speech-to-text": 180_000, "sound-effects": 60_000, config: 30_000 };
  const configured = Number(process.env.ELEVENLABS_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.max(10_000, Math.min(configured, 240_000)) : defaults[action] || 60_000;
}

async function upstream(path, options, action, runtime = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutFor(action));
  try {
    return await (runtime.fetch || fetch)(`${API_BASE}${path}`, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new StudioError("Proses ElevenLabs terlalu lama. Coba lagi.", "ELEVENLABS_TIMEOUT", 504);
    throw new StudioError("Tidak dapat terhubung ke ElevenLabs.", "ELEVENLABS_NETWORK", 502);
  } finally {
    clearTimeout(timer);
  }
}

function mapUpstreamError(status) {
  if (status === 400 || status === 422) return new StudioError("Input audio atau pengaturan tidak dapat diproses.", "ELEVENLABS_INVALID_INPUT", 400);
  if (status === 401 || status === 403) return new StudioError("Konfigurasi ElevenLabs tidak valid atau tidak memiliki izin.", "ELEVENLABS_AUTH", 503);
  if (status === 404) return new StudioError("Voice tidak tersedia.", "ELEVENLABS_VOICE_UNAVAILABLE", 404);
  if (status === 413) return new StudioError("File terlalu besar untuk diproses.", "ELEVENLABS_FILE_TOO_LARGE", 413);
  if (status === 429) return new StudioError("Batas penggunaan ElevenLabs tercapai.", "ELEVENLABS_LIMIT", 429);
  return new StudioError("Proses audio gagal. Coba lagi.", "ELEVENLABS_UPSTREAM", status >= 500 ? 502 : 400);
}

async function requireOk(response) {
  if (!response?.ok) throw mapUpstreamError(Number(response?.status) || 500);
  return response;
}

function safeJsonBody(request) {
  const length = Number(request.headers["content-length"] || 0);
  if (length > MAX_JSON_BYTES) throw new StudioError("Permintaan terlalu besar.", "ELEVENLABS_BODY_TOO_LARGE", 413);
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8") || "{}");
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

async function readBuffer(request, limit = MAX_UPLOAD_BYTES) {
  const length = Number(request.headers["content-length"] || 0);
  if (length > limit) throw new StudioError("File maksimal 20 MB.", "ELEVENLABS_FILE_TOO_LARGE", 413);
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > limit) throw new StudioError("File maksimal 20 MB.", "ELEVENLABS_FILE_TOO_LARGE", 413);
    return request.body;
  }
  if (typeof request.body === "string") return Buffer.from(request.body);
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const part = Buffer.from(chunk);
    total += part.length;
    if (total > limit) throw new StudioError("File maksimal 20 MB.", "ELEVENLABS_FILE_TOO_LARGE", 413);
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

function parseMultipartBuffer(buffer, contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = clean(match?.[1] || match?.[2], 100);
  if (!boundary) throw new StudioError("Upload FormData tidak valid.", "ELEVENLABS_MULTIPART", 400);
  const marker = Buffer.from(`--${boundary}`);
  const fields = Object.create(null);
  let file = null;
  let cursor = buffer.indexOf(marker);
  let count = 0;
  while (cursor >= 0 && count < 20) {
    let start = cursor + marker.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    if (buffer.subarray(start, start + 2).toString() === "\r\n") start += 2;
    const next = buffer.indexOf(marker, start);
    if (next < 0) break;
    let end = next;
    if (buffer.subarray(end - 2, end).toString() === "\r\n") end -= 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd < 0 || headerEnd > end || headerEnd - start > 8192) throw new StudioError("Upload FormData tidak valid.", "ELEVENLABS_MULTIPART", 400);
    const headers = buffer.subarray(start, headerEnd).toString("utf8");
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = clean(disposition.match(/name="([^"]+)"/i)?.[1], 60);
    const filename = clean(disposition.match(/filename="([^"]*)"/i)?.[1], 180);
    const type = clean(headers.match(/content-type:\s*([^\r\n]+)/i)?.[1], 100).toLowerCase();
    const data = buffer.subarray(headerEnd + 4, end);
    if (filename || name === "file" || name === "audio") {
      if (file) throw new StudioError("Pilih satu file saja.", "ELEVENLABS_MULTIPLE_FILES", 400);
      file = { name: filename || "upload", type, data };
    } else if (name && data.length <= 20_000) {
      fields[name] = clean(data.toString("utf8"), 10_000);
    }
    cursor = next;
    count += 1;
  }
  if (!file?.data?.length) throw new StudioError("Pilih file terlebih dahulu.", "ELEVENLABS_FILE_REQUIRED", 400);
  return { fields, file };
}

function sniffMedia(file) {
  const data = file.data;
  const first = data.subarray(0, 16);
  if (first.subarray(0, 3).toString() === "ID3" || (first[0] === 0xff && (first[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3", video: false };
  if (first.subarray(0, 4).toString() === "RIFF" && first.subarray(8, 12).toString() === "WAVE") return { mime: "audio/wav", ext: "wav", video: false };
  if (first.subarray(4, 8).toString() === "ftyp") return { mime: file.type.startsWith("video/") ? "video/mp4" : "audio/mp4", ext: file.type.startsWith("video/") ? "mp4" : "m4a", video: file.type.startsWith("video/") };
  if (first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3) return { mime: file.type.startsWith("video/") ? "video/webm" : "audio/webm", ext: "webm", video: file.type.startsWith("video/") };
  throw new StudioError("Format file tidak didukung. Gunakan MP3, WAV, M4A, WebM, atau MP4 untuk transkripsi.", "ELEVENLABS_FILE_FORMAT", 415);
}

function normalizeVoice(item) {
  return { id: clean(item?.voice_id, 100), name: clean(item?.name, 120), category: clean(item?.category, 60), previewUrl: /^https:\/\//i.test(item?.preview_url || "") ? item.preview_url : "" };
}

function modelLimit(item) {
  const candidates = [item?.maximum_text_length_per_request, item?.max_characters_request_free_user, item?.max_characters_request_subscribed_user].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return candidates.length ? Math.max(...candidates) : 5000;
}

function normalizeModel(item) {
  return {
    id: clean(item?.model_id, 120), name: clean(item?.name, 160),
    tts: item?.can_do_text_to_speech === true, voiceChanger: item?.can_do_voice_conversion === true,
    style: item?.can_use_style === true, speakerBoost: item?.can_use_speaker_boost === true,
    maxCharacters: modelLimit(item)
  };
}

async function getConfiguration(runtime = {}) {
  if (configCache.value && configCache.expiresAt > Date.now() && !runtime.noCache) return configCache.value;
  const headers = { "xi-api-key": getApiKey(), Accept: "application/json" };
  const [voicesResponse, modelsResponse] = await Promise.all([
    upstream("/voices", { headers }, "config", runtime).then(requireOk),
    upstream("/models", { headers }, "config", runtime).then(requireOk)
  ]);
  let voicesRaw;
  let modelsRaw;
  try {
    voicesRaw = await voicesResponse.json();
    modelsRaw = await modelsResponse.json();
  } catch {
    throw new StudioError("Daftar voice/model tidak dapat dibaca.", "ELEVENLABS_CONFIG_RESPONSE", 502);
  }
  const voices = (Array.isArray(voicesRaw?.voices) ? voicesRaw.voices : []).map(normalizeVoice).filter((item) => item.id && item.name);
  const models = (Array.isArray(modelsRaw) ? modelsRaw : modelsRaw?.models || []).map(normalizeModel).filter((item) => item.id && (item.tts || item.voiceChanger));
  const value = { voices, models, limits: { uploadBytes: MAX_UPLOAD_BYTES }, formats: ["MP3", "WAV", "M4A", "WebM", "MP4 (STT)"] };
  if (!runtime.noCache) Object.assign(configCache, { value, expiresAt: Date.now() + 120_000 });
  return value;
}

function chooseVoiceAndModel(body, config, capability) {
  const voiceId = clean(body.voiceId, 100);
  if (!config.voices.some((voice) => voice.id === voiceId)) throw new StudioError("Voice tidak tersedia.", "ELEVENLABS_VOICE_UNAVAILABLE", 404);
  const eligible = config.models.filter((model) => model[capability]);
  const model = eligible.find((item) => item.id === clean(body.modelId, 120)) || eligible.find((item) => item.id === "eleven_multilingual_v2") || eligible[0];
  if (!model) throw new StudioError("Model ElevenLabs yang sesuai tidak tersedia.", "ELEVENLABS_MODEL_UNAVAILABLE", 503);
  return { voiceId, model };
}

function voiceSettings(source, model) {
  const settings = {
    stability: numberIn(source.stability, 0, 1, 0.5),
    similarity_boost: numberIn(source.similarity, 0, 1, 0.75),
    use_speaker_boost: model.speakerBoost !== false
  };
  if (model.style) settings.style = numberIn(source.style, 0, 1, 0);
  const speed = numberIn(source.speed, 0.7, 1.2, null);
  if (speed != null) settings.speed = speed;
  return settings;
}

function sendAudio(response, upstreamResponse, data, filename) {
  const upstreamType = clean(upstreamResponse.headers?.get?.("content-type"), 100);
  const type = upstreamType.startsWith("audio/") ? upstreamType.split(";")[0] : "audio/mpeg";
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", type);
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(200).end(data);
}

async function generateTts(request, response, runtime) {
  const body = safeJsonBody(request);
  const text = clean(body.text, 100_000);
  if (!text) throw new StudioError("Masukkan teks terlebih dahulu.", "ELEVENLABS_TEXT_REQUIRED", 400);
  const config = await getConfiguration(runtime);
  const selected = chooseVoiceAndModel(body, config, "tts");
  if (text.length > selected.model.maxCharacters) throw new StudioError(`Teks maksimal ${selected.model.maxCharacters} karakter untuk model ini.`, "ELEVENLABS_TEXT_TOO_LONG", 400);
  const result = await upstream(`/text-to-speech/${encodeURIComponent(selected.voiceId)}?output_format=${OUTPUT_FORMAT}`, {
    method: "POST", headers: { "xi-api-key": getApiKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: selected.model.id, voice_settings: voiceSettings(body, selected.model) })
  }, "tts", runtime).then(requireOk);
  return sendAudio(response, result, Buffer.from(await result.arrayBuffer()), "nexora-tts.mp3");
}

function appendUpload(form, parsed, media, fieldName = "audio") {
  form.append(fieldName, new Blob([parsed.file.data], { type: media.mime }), `${clean(parsed.file.name, 120) || "audio"}.${media.ext}`);
}

async function convertVoice(request, response, runtime) {
  const parsed = parseMultipartBuffer(await readBuffer(request), request.headers["content-type"]);
  const media = sniffMedia(parsed.file);
  if (media.video) throw new StudioError("Voice Changer menerima file audio, bukan video.", "ELEVENLABS_AUDIO_REQUIRED", 415);
  const config = await getConfiguration(runtime);
  const selected = chooseVoiceAndModel(parsed.fields, config, "voiceChanger");
  const form = new FormData();
  appendUpload(form, parsed, media);
  form.append("model_id", selected.model.id);
  form.append("voice_settings", JSON.stringify(voiceSettings(parsed.fields, selected.model)));
  const result = await upstream(`/speech-to-speech/${encodeURIComponent(selected.voiceId)}?output_format=${OUTPUT_FORMAT}`, {
    method: "POST", headers: { "xi-api-key": getApiKey(), Accept: "audio/mpeg" }, body: form
  }, "voice-changer", runtime).then(requireOk);
  return sendAudio(response, result, Buffer.from(await result.arrayBuffer()), "nexora-voice-converted.mp3");
}

function normalizeTranscript(raw) {
  const words = (Array.isArray(raw?.words) ? raw.words : []).map((word) => ({
    text: clean(word?.text || word?.word, 500), start: Number.isFinite(Number(word?.start)) ? Number(word.start) : null,
    end: Number.isFinite(Number(word?.end)) ? Number(word.end) : null, speakerId: clean(word?.speaker_id, 60) || null,
    type: clean(word?.type, 30) || "word"
  })).filter((word) => word.text);
  const sourceSegments = Array.isArray(raw?.segments) ? raw.segments : [];
  let segments = sourceSegments.map((segment) => ({ text: clean(segment?.text, 5000), start: Number(segment?.start), end: Number(segment?.end), speakerId: clean(segment?.speaker_id, 60) || null })).filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end));
  if (!segments.length && words.some((word) => word.start != null && word.end != null)) {
    let current = null;
    words.forEach((word) => {
      if (word.start == null || word.end == null) return;
      const split = !current || (word.speakerId && current.speakerId && word.speakerId !== current.speakerId) || current.words >= 12 || word.end - current.start > 7;
      if (split) { current = { text: word.text, start: word.start, end: word.end, speakerId: word.speakerId, words: 1 }; segments.push(current); }
      else { current.text += (/^[.,!?;:]/.test(word.text) ? "" : " ") + word.text; current.end = word.end; current.words += 1; }
    });
    segments = segments.map(({ words: _words, ...segment }) => segment);
  }
  const speakerIds = [...new Set(words.map((word) => word.speakerId).filter(Boolean))];
  return { text: clean(raw?.text, 1_000_000), language: clean(raw?.language_code || raw?.language, 30) || null, segments, words, speakers: speakerIds, hasTimestamps: segments.length > 0 };
}

async function transcribe(request, response, runtime) {
  const parsed = parseMultipartBuffer(await readBuffer(request), request.headers["content-type"]);
  const media = sniffMedia(parsed.file);
  const form = new FormData();
  appendUpload(form, parsed, media, "file");
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("diarize", parsed.fields.diarize === "true" ? "true" : "false");
  if (["id", "en"].includes(parsed.fields.language)) form.append("language_code", parsed.fields.language);
  const result = await upstream("/speech-to-text", { method: "POST", headers: { "xi-api-key": getApiKey(), Accept: "application/json" }, body: form }, "speech-to-text", runtime).then(requireOk);
  let raw;
  try { raw = await result.json(); } catch { throw new StudioError("Hasil transkripsi tidak valid.", "ELEVENLABS_TRANSCRIPT_RESPONSE", 502); }
  const data = normalizeTranscript(raw);
  if (!data.text) throw new StudioError("Tidak ada ucapan yang dapat ditranskripsikan.", "ELEVENLABS_EMPTY_TRANSCRIPT", 422);
  return sendJson(response, 200, { ok: true, data });
}

async function generateSound(request, response, runtime) {
  const body = safeJsonBody(request);
  const text = clean(body.text, 1000);
  if (!text) throw new StudioError("Masukkan deskripsi suara terlebih dahulu.", "ELEVENLABS_SOUND_TEXT_REQUIRED", 400);
  const payload = { text, model_id: "eleven_text_to_sound_v2", loop: body.loop === true, prompt_influence: 0.3 };
  if (body.duration !== "" && body.duration != null && body.duration !== "auto") payload.duration_seconds = numberIn(body.duration, 0.5, 30, null);
  if (payload.duration_seconds == null) delete payload.duration_seconds;
  const result = await upstream(`/sound-generation?output_format=${OUTPUT_FORMAT}`, {
    method: "POST", headers: { "xi-api-key": getApiKey(), "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(payload)
  }, "sound-effects", runtime).then(requireOk);
  return sendAudio(response, result, Buffer.from(await result.arrayBuffer()), "nexora-sound-effect.mp3");
}

async function handleElevenLabs(request, response, runtime = {}) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  const requestUrl = new URL(request.url || "/api/elevenlabs", `http://${request.headers.host || "localhost"}`);
  const action = clean(requestUrl.searchParams.get("action"), 40) || "config";
  if (request.method === "HEAD") return response.status(200).end();
  try {
    if (request.method === "GET" && action === "config") return sendJson(response, 200, { ok: true, data: await getConfiguration(runtime) });
    if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Metode tidak didukung." });
    const rate = takeFixedWindow(rateBuckets, clientKey(request), { limit: 12, windowMs: 10 * 60_000, maxEntries: 2000 });
    if (!rate.allowed) throw new StudioError("Terlalu banyak permintaan. Coba lagi nanti.", "ELEVENLABS_RATE_LIMIT", 429);
    if (action === "tts") return await generateTts(request, response, runtime);
    if (action === "voice-changer") return await convertVoice(request, response, runtime);
    if (action === "speech-to-text") return await transcribe(request, response, runtime);
    if (action === "sound-effects") return await generateSound(request, response, runtime);
    throw new StudioError("Mode studio tidak dikenal.", "ELEVENLABS_ACTION_INVALID", 404);
  } catch (error) {
    let safe = error;
    if (error instanceof SyntaxError) safe = new StudioError("Data permintaan tidak valid.", "ELEVENLABS_BAD_JSON", 400);
    if (!(safe instanceof StudioError)) safe = new StudioError("Proses audio gagal. Coba lagi.", "ELEVENLABS_INTERNAL", 500);
    console.warn("[elevenlabs-studio] request failed", { action, code: safe.code, status: safe.status });
    return sendJson(response, safe.status || 500, { ok: false, code: safe.code, message: safe.message });
  }
}

module.exports = { handleElevenLabs, normalizeTranscript, normalizeVoice, normalizeModel, parseMultipartBuffer, sniffMedia, constants: { API_BASE, MAX_UPLOAD_BYTES, OUTPUT_FORMAT } };

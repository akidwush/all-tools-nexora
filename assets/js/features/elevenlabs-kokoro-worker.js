/* Nexora Kokoro local worker — browser-only inference, no Nexora API calls. */
'use strict';

const KOKORO_VERSION = '1.2.1';
const KOKORO_MODULE = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let tts = null;
let activeBackend = null;
let importPromise = null;

function messageOf(error) {
  if (!error) return 'Unknown local inference error.';
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function classifyError(error, phase) {
  const text = messageOf(error).toLowerCase();
  if (/out of memory|oom|memory allocation|failed to allocate/.test(text)) return 'OUT_OF_MEMORY';
  if (/device lost|gpu device|webgpu|adapter|invalid buffer/.test(text) && activeBackend === 'webgpu') return phase === 'init' ? 'WEBGPU_INIT_FAILED' : 'WEBGPU_RUNTIME_FAILED';
  if (/fetch|network|download|failed to load|404|403|cors/.test(text) && phase === 'init') return 'MODEL_LOAD_FAILED';
  return phase === 'init' && activeBackend === 'webgpu' ? 'WEBGPU_INIT_FAILED' : 'LOCAL_INFERENCE_FAILED';
}

function progressLabel(progress) {
  if (!progress || typeof progress !== 'object') return 'Loading local model…';
  const file = progress.file ? String(progress.file).split('/').pop() : '';
  if (progress.status === 'progress' && Number.isFinite(Number(progress.progress))) {
    return 'Downloading ' + (file || 'model asset') + ' · ' + Math.max(0, Math.min(100, Math.round(Number(progress.progress)))) + '%';
  }
  if (progress.status === 'done') return 'Loaded ' + (file || 'model asset');
  if (progress.status === 'initiate') return 'Preparing ' + (file || 'model asset') + '…';
  return 'Loading local model…';
}

async function loadModule() {
  if (!importPromise) importPromise = import(KOKORO_MODULE);
  return importPromise;
}

async function initialize(preference) {
  if (tts) return { backend: activeBackend, voices: voiceRegistry(tts) };
  const module = await loadModule();
  const KokoroTTS = module && module.KokoroTTS;
  if (typeof KokoroTTS !== 'function') throw new Error('KokoroTTS export tidak ditemukan pada kokoro-js@' + KOKORO_VERSION + '.');

  activeBackend = preference === 'wasm' || !self.navigator || !self.navigator.gpu ? 'wasm' : 'webgpu';
  const dtype = activeBackend === 'webgpu' ? 'fp32' : 'q8';

  try {
    tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      device: activeBackend,
      dtype,
      progress_callback: function (progress) {
        self.postMessage({ type: 'progress', backend: activeBackend, message: progressLabel(progress) });
      }
    });
  } catch (error) {
    tts = null;
    const code = classifyError(error, 'init');
    throw Object.assign(new Error(messageOf(error)), { code });
  }

  return { backend: activeBackend, voices: voiceRegistry(tts) };
}

function voiceRegistry(instance) {
  // kokoro-js@1.2.1 exposes list_voices(), but that method currently console.tables
  // the same real registry instead of returning it. Call it for the official API,
  // then serialize the public voices property when the return value is undefined.
  let listed;
  try { listed = instance.list_voices(); } catch (_) { listed = null; }
  const registry = listed && typeof listed === 'object' ? listed : instance.voices;
  if (!registry || typeof registry !== 'object') return [];
  return Object.entries(registry).map(function (entry) {
    const id = entry[0];
    const meta = entry[1] || {};
    return {
      id,
      name: meta.name || id,
      language: meta.language || '',
      gender: meta.gender || '',
      grade: meta.overallGrade || ''
    };
  });
}

async function generate(payload) {
  if (!tts) throw Object.assign(new Error('Kokoro belum diinisialisasi.'), { code: 'NOT_READY' });
  const text = String(payload && payload.text || '').trim();
  const voice = String(payload && payload.voice || 'af_heart');
  const speed = Number(payload && payload.speed || 1);
  if (!text) throw Object.assign(new Error('Masukkan teks terlebih dahulu.'), { code: 'BAD_INPUT' });
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw Object.assign(new Error('Speed Kokoro harus antara 0.5 dan 2.0.'), { code: 'BAD_INPUT' });

  try {
    const audio = await tts.generate(text, { voice, speed });
    if (!audio) throw new Error('Kokoro tidak mengembalikan audio.');
    let blob;
    if (typeof audio.toBlob === 'function') {
      blob = await audio.toBlob();
    } else {
      throw new Error('RawAudio.toBlob() tidak tersedia pada runtime Kokoro.');
    }
    if (!(blob instanceof Blob) || !blob.size) throw new Error('WAV Kokoro kosong.');
    const buffer = await blob.arrayBuffer();
    return { buffer, mime: blob.type || 'audio/wav', backend: activeBackend };
  } catch (error) {
    const code = classifyError(error, 'generate');
    throw Object.assign(new Error(messageOf(error)), { code });
  }
}

self.onmessage = async function (event) {
  const request = event && event.data || {};
  const id = request.id;
  try {
    if (request.type === 'init') {
      const result = await initialize(request.backend === 'wasm' ? 'wasm' : 'auto');
      self.postMessage({ id, type: 'ready', ok: true, backend: result.backend, voices: result.voices, model: KOKORO_MODEL, version: KOKORO_VERSION });
      return;
    }
    if (request.type === 'generate') {
      const result = await generate(request);
      self.postMessage({ id, type: 'result', ok: true, backend: result.backend, mime: result.mime, buffer: result.buffer }, [result.buffer]);
      return;
    }
    if (request.type === 'dispose') {
      tts = null;
      activeBackend = null;
      self.postMessage({ id, type: 'disposed', ok: true });
      return;
    }
    throw Object.assign(new Error('Unknown Kokoro worker request.'), { code: 'BAD_REQUEST' });
  } catch (error) {
    self.postMessage({ id, type: 'error', ok: false, backend: activeBackend, code: error.code || 'LOCAL_INFERENCE_FAILED', error: messageOf(error) });
  }
};

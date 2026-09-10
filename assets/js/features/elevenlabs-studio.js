/* Nexora ElevenLabs Studio — cloud proxy + private browser-side local speech engines. */
(function () {
  'use strict';

  var API = '/api/elevenlabs';
  var KOKORO_WORKER_URL = '/assets/js/features/elevenlabs-kokoro-worker.js';
  var KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  var HEADTTS_VERSION = '1.3.0';
  var HEADTTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped';
  var HEADTTS_MODULE = 'https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3.0/modules/headtts.mjs';
  var HEADTTS_WORKER = 'https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3.0/modules/worker-tts.mjs';
  var HEADTTS_DICTIONARY = 'https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3.0/dictionaries/';
  var HEADTTS_TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0/dist/transformers.min.js';
  var HEADTTS_VOICE_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices';
  var DEFAULT_UPLOAD_BYTES = 20 * 1024 * 1024;
  var HEADTTS_VOICES = [
    ['af_bella', 'Bella'], ['af_heart', 'Heart'], ['af_nicole', 'Nicole'], ['af_nova', 'Nova'], ['af_sarah', 'Sarah'],
    ['af_sky', 'Sky'], ['am_adam', 'Adam'], ['am_fenrir', 'Fenrir'], ['am_michael', 'Michael'], ['am_puck', 'Puck']
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function formatBytes(bytes) {
    return Math.round(Number(bytes || 0) / 1024 / 1024) + ' MB';
  }

  function renderElevenLabsStudio(container) {
    var state = {
      mode: 'tts',
      ttsEngine: 'cloud',
      busy: false,
      config: { voices: [], models: [], limits: { uploadBytes: DEFAULT_UPLOAD_BYTES } },
      cloudError: '',
      urls: new Set(),
      controller: new AbortController(),
      originalUrl: '',
      ttsDraft: '',
      lipDraft: '',
      kokoroVoice: 'af_heart',
      kokoroSpeed: 1,
      kokoro: { worker: null, ready: false, backend: '', voices: [], pending: new Map(), sequence: 0 },
      headttsModulePromise: null,
      headtts: null,
      headttsVoice: 'af_bella',
      headttsSpeed: 1
    };

    container.innerHTML = '<section class="nel-studio" aria-labelledby="nelTitle">' +
      '<header class="nel-hero"><span class="nel-kicker"><i class="fa-solid fa-wave-square"></i> NEXORA AUDIO AI</span>' +
      '<h2 id="nelTitle">ElevenLabs Studio</h2><p>Cloud speech dan local speech/lip-sync dalam satu studio audio.</p></header>' +
      '<nav class="nel-tabs" role="tablist" aria-label="Mode audio">' +
        tab('tts', 'fa-comment-dots', 'Text to Speech', true) + tab('lipsync', 'fa-face-smile', 'Lip Sync') +
        tab('voice', 'fa-microphone-lines', 'Voice Changer') + tab('stt', 'fa-file-waveform', 'Speech to Text') + tab('sound', 'fa-burst', 'Sound FX') +
      '</nav>' +
      '<div class="nel-status" id="nelStatus" role="status" aria-live="polite"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Mengambil voice dan model akun…</span></div>' +
      '<div class="nel-panel" id="nelPanel"></div>' +
    '</section>';

    var panel = container.querySelector('#nelPanel');
    var status = container.querySelector('#nelStatus');
    var tabs = Array.prototype.slice.call(container.querySelectorAll('[data-nel-tab]'));

    function tab(id, icon, label, active) {
      return '<button type="button" role="tab" data-nel-tab="' + id + '" aria-selected="' + (active ? 'true' : 'false') + '" class="' + (active ? 'is-active' : '') + '"><i class="fa-solid ' + icon + '"></i><span>' + label + '</span></button>';
    }

    function setStatus(message, type) {
      status.hidden = !message;
      status.className = 'nel-status ' + (type || 'info');
      var icon = type === 'error' ? 'fa-triangle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-notch fa-spin';
      status.innerHTML = message ? '<i class="fa-solid ' + icon + '"></i><span>' + escapeHtml(message) + '</span>' : '';
    }

    function errorMessage(response, fallback) {
      return response.json().then(function (data) { return (data && data.message) || fallback; }).catch(function () { return fallback; });
    }

    function addUrl(blob) {
      var url = URL.createObjectURL(blob);
      state.urls.add(url);
      return url;
    }

    function dropUrl(url) {
      if (!url) return;
      URL.revokeObjectURL(url);
      state.urls.delete(url);
    }

    function clearUrls() {
      state.urls.forEach(function (url) { URL.revokeObjectURL(url); });
      state.urls.clear();
      state.originalUrl = '';
    }

    function makeAbortError(message) {
      try { return new DOMException(message || 'Cancelled.', 'AbortError'); }
      catch (_) { var error = new Error(message || 'Cancelled.'); error.name = 'AbortError'; return error; }
    }

    function destroyKokoro(reason) {
      var local = state.kokoro;
      if (local.worker) {
        try { local.worker.terminate(); } catch (_) {}
      }
      local.pending.forEach(function (pending) {
        clearTimeout(pending.timer);
        pending.reject(makeAbortError(reason || 'Kokoro worker ditutup.'));
      });
      state.kokoro = { worker: null, ready: false, backend: '', voices: [], pending: new Map(), sequence: local.sequence || 0 };
    }

    function destroyHeadTts() {
      var instance = state.headtts;
      state.headtts = null;
      if (!instance) return;
      try { instance.clear(); } catch (_) {}
      try { if (instance.ww) instance.ww.terminate(); } catch (_) {}
      try { if (instance.ws) instance.ws.close(); } catch (_) {}
      try {
        var audioCtx = instance.settings && instance.settings.audioCtx;
        if (audioCtx && audioCtx.state !== 'closed' && typeof audioCtx.close === 'function') audioCtx.close();
      } catch (_) {}
    }

    function cleanUp() {
      state.controller.abort();
      destroyKokoro('Studio ditutup.');
      destroyHeadTts();
      clearUrls();
    }

    function optionList(items, capability) {
      return (items || []).filter(function (item) { return !capability || item[capability]; }).map(function (item) {
        return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + '</option>';
      }).join('');
    }

    function voiceOptions() {
      return optionList(state.config && state.config.voices || []);
    }

    function modelOptions(capability) {
      return optionList(state.config && state.config.models || [], capability);
    }

    function field(label, control, hint) {
      return '<label class="nel-field"><span>' + label + '</span>' + control + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
    }

    function render() {
      if (state.mode === 'tts') renderTts();
      if (state.mode === 'lipsync') renderLipSync();
      if (state.mode === 'voice') renderVoice();
      if (state.mode === 'stt') renderStt();
      if (state.mode === 'sound') renderSound();
    }

    function commonVoiceFields(capability) {
      return '<div class="nel-grid">' +
        field('Voice', '<select id="nelVoice" required>' + voiceOptions() + '</select>') +
        field('Model', '<select id="nelModel" required>' + modelOptions(capability) + '</select>') +
      '</div>';
    }

    function settings() {
      return '<details class="nel-settings"><summary>Pengaturan suara</summary><div class="nel-slider-grid">' +
        slider('Stability', 'nelStability', 0.5) + slider('Similarity', 'nelSimilarity', 0.75) +
        slider('Style', 'nelStyle', 0) + slider('Speed', 'nelSpeed', 1, 0.7, 1.2, 0.05) +
      '</div></details>';
    }

    function slider(label, id, value, min, max, step) {
      return '<label class="nel-slider"><span>' + label + ' <output for="' + id + '">' + value + '</output></span><input id="' + id + '" type="range" min="' + (min == null ? 0 : min) + '" max="' + (max == null ? 1 : max) + '" step="' + (step || 0.05) + '" value="' + value + '"></label>';
    }

    function bindSliders() {
      panel.querySelectorAll('.nel-slider input').forEach(function (input) {
        input.addEventListener('input', function () { input.parentElement.querySelector('output').value = Number(input.value).toFixed(2); });
      });
    }

    function selectedSettings() {
      return {
        stability: Number(panel.querySelector('#nelStability')?.value || 0.5), similarity: Number(panel.querySelector('#nelSimilarity')?.value || 0.75),
        style: Number(panel.querySelector('#nelStyle')?.value || 0), speed: Number(panel.querySelector('#nelSpeed')?.value || 1)
      };
    }

    function actionButton(id, icon, label) {
      return '<button class="nel-primary" id="' + id + '" type="button"><i class="fa-solid ' + icon + '"></i><span>' + label + '</span></button>';
    }

    function setBusy(button, busy, text) {
      state.busy = busy;
      tabs.forEach(function (item) { item.disabled = busy; });
      panel.querySelectorAll('[data-nel-engine]').forEach(function (item) { item.disabled = busy; });
      if (button) {
        button.disabled = busy;
        if (!button.dataset.label) button.dataset.label = button.querySelector('span').textContent;
        if (!button.dataset.icon) button.dataset.icon = button.querySelector('i').className.replace(/^.*fa-solid\s+/, '').trim();
        button.querySelector('span').textContent = busy ? text : button.dataset.label;
        button.querySelector('i').className = 'fa-solid ' + (busy ? 'fa-circle-notch fa-spin' : button.dataset.icon || 'fa-wand-magic-sparkles');
      }
    }

    function audioResult(title, blob, filename, again) {
      var old = panel.querySelector('[data-result-url]')?.dataset.resultUrl;
      dropUrl(old);
      var url = addUrl(blob);
      var result = panel.querySelector('#nelResult');
      if (!result) return;
      var label = /\.wav$/i.test(filename) ? 'Download WAV' : 'Download MP3';
      result.innerHTML = '<div class="nel-result-card" data-result-url="' + escapeHtml(url) + '"><span class="nel-result-label"><i class="fa-solid fa-wave-square"></i> ' + escapeHtml(title) + '</span>' +
        '<audio controls preload="metadata" src="' + escapeHtml(url) + '"></audio><div class="nel-actions">' +
        '<a class="nel-secondary" download="' + escapeHtml(filename) + '" href="' + escapeHtml(url) + '"><i class="fa-solid fa-download"></i> ' + label + '</a>' +
        '<button class="nel-secondary" type="button" id="nelAgain"><i class="fa-solid fa-rotate"></i> Generate Again</button></div></div>';
      result.querySelector('#nelAgain').addEventListener('click', again);
      result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }

    function postAudio(action, body) {
      return fetch(API + '?action=' + encodeURIComponent(action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: state.controller.signal })
        .then(function (response) { if (!response.ok) return errorMessage(response, 'Proses audio gagal. Coba lagi.').then(function (message) { throw new Error(message); }); return response.blob(); });
    }

    function cloudReady(capability) {
      var voices = state.config && state.config.voices || [];
      var models = state.config && state.config.models || [];
      return !state.cloudError && voices.length > 0 && (!capability || models.some(function (item) { return item[capability]; }));
    }

    function engineSelector() {
      return '<div class="nel-engine-switch" role="group" aria-label="TTS Engine">' +
        '<button type="button" data-nel-engine="cloud" class="nel-engine-card ' + (state.ttsEngine === 'cloud' ? 'is-active' : '') + '" aria-pressed="' + (state.ttsEngine === 'cloud') + '"><span><strong>ElevenLabs</strong><small>CLOUD</small></span><i class="fa-solid fa-cloud"></i></button>' +
        '<button type="button" data-nel-engine="kokoro" class="nel-engine-card ' + (state.ttsEngine === 'kokoro' ? 'is-active' : '') + '" aria-pressed="' + (state.ttsEngine === 'kokoro') + '"><span><strong>Kokoro</strong><small>LOCAL • PRIVATE</small></span><i class="fa-solid fa-mobile-screen"></i></button>' +
      '</div>';
    }

    function bindEngineSelector() {
      panel.querySelectorAll('[data-nel-engine]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (state.busy || state.ttsEngine === button.dataset.nelEngine) return;
          var text = panel.querySelector('#nelText');
          if (text) state.ttsDraft = text.value;
          clearUrls();
          state.ttsEngine = button.dataset.nelEngine;
          if (state.ttsEngine === 'kokoro') destroyHeadTts();
          else destroyKokoro('Kokoro dilepas saat kembali ke ElevenLabs Cloud.');
          renderTts();
          setStatus(state.ttsEngine === 'kokoro' ? 'Kokoro siap dimuat saat diperlukan. Teks tetap berada di perangkat.' : 'ElevenLabs Cloud dipilih.', 'success');
        });
      });
    }

    function renderTts() {
      var firstModel = (state.config.models || []).find(function (model) { return model.tts; });
      var initialMax = state.ttsEngine === 'cloud' ? (firstModel?.maxCharacters || 5000) : 1000;
      panel.innerHTML = '<div class="nel-section-head"><span>01</span><div><h3>Text to Speech</h3><p>Pilih cloud ElevenLabs atau local Kokoro di browser.</p></div></div>' +
        '<div class="nel-engine-label">TTS Engine</div>' + engineSelector() +
        field('Text', '<textarea id="nelText" rows="7" maxlength="' + initialMax + '" placeholder="Tulis narasi, dialog, atau voice-over…">' + escapeHtml(state.ttsDraft) + '</textarea><div class="nel-counter" id="nelCounter">' + state.ttsDraft.length + ' / ' + initialMax + '</div>') +
        (state.ttsEngine === 'cloud' ? cloudTtsBody(initialMax) : kokoroTtsBody()) + '<div id="nelResult"></div>';
      bindEngineSelector();
      var text = panel.querySelector('#nelText');
      text.addEventListener('input', function () {
        state.ttsDraft = text.value;
        panel.querySelector('#nelCounter').textContent = text.value.length + ' / ' + text.maxLength;
      });
      if (state.ttsEngine === 'cloud') bindCloudTts(text); else bindKokoroTts(text);
    }

    function cloudTtsBody() {
      if (!cloudReady('tts')) {
        return '<div class="nel-local-info nel-cloud-unavailable"><i class="fa-solid fa-cloud-arrow-up"></i><div><strong>ElevenLabs Cloud belum tersedia</strong><p>' + escapeHtml(state.cloudError || 'Voice/model cloud belum dapat dimuat.') + '</p></div></div>' +
          '<button type="button" class="nel-secondary nel-wide" id="nelRetryCloud"><i class="fa-solid fa-rotate"></i> Retry ElevenLabs Cloud</button>';
      }
      return commonVoiceFields('tts') + settings() + actionButton('nelGenerate', 'fa-wand-magic-sparkles', 'Generate Voice');
    }

    function bindCloudTts(text) {
      if (!cloudReady('tts')) {
        panel.querySelector('#nelRetryCloud')?.addEventListener('click', function () { renderElevenLabsStudio(container); });
        return;
      }
      var model = panel.querySelector('#nelModel');
      function limit() {
        var selected = state.config.models.find(function (item) { return item.id === model.value; });
        var max = selected?.maxCharacters || 5000;
        text.maxLength = max;
        if (text.value.length > max) text.value = text.value.slice(0, max);
        state.ttsDraft = text.value;
        panel.querySelector('#nelCounter').textContent = text.value.length + ' / ' + max;
      }
      model.addEventListener('change', limit); bindSliders();
      var button = panel.querySelector('#nelGenerate'); button.dataset.icon = 'fa-wand-magic-sparkles';
      function generate() {
        if (state.busy) return;
        if (!text.value.trim()) return setStatus('Masukkan teks terlebih dahulu.', 'error');
        state.ttsDraft = text.value;
        setBusy(button, true, 'Generating voice…'); setStatus('Generating voice melalui ElevenLabs Cloud…', 'info');
        postAudio('tts', Object.assign({ text: text.value, voiceId: panel.querySelector('#nelVoice').value, modelId: model.value }, selectedSettings()))
          .then(function (blob) { audioResult('Generated Voice · ElevenLabs', blob, 'nexora-tts.mp3', generate); setStatus('Suara ElevenLabs berhasil dibuat.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') setStatus(error.message, 'error'); })
          .finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', generate);
    }

    function kokoroVoiceOptions() {
      var voices = state.kokoro.voices || [];
      if (!voices.length) return '<option value="af_heart">Heart (af_heart)</option>';
      return voices.map(function (voice) {
        var label = voice.name + ' (' + voice.id + ')' + (voice.language ? ' · ' + voice.language : '');
        return '<option value="' + escapeHtml(voice.id) + '"' + (voice.id === state.kokoroVoice ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
      }).join('');
    }

    function kokoroTtsBody() {
      var backend = state.kokoro.ready ? ('Loaded · ' + state.kokoro.backend.toUpperCase()) : 'WebGPU preferred · WASM fallback';
      return '<div class="nel-local-banner"><div><strong>Kokoro Local</strong><span>LOCAL • PRIVATE</span></div><small>' + escapeHtml(backend) + '</small></div>' +
        '<div class="nel-grid">' +
          field('Voice', '<select id="nelKokoroVoice">' + kokoroVoiceOptions() + '</select>', state.kokoro.voices.length ? 'Voice registry berasal dari runtime kokoro-js.' : 'Full voice registry dimuat dari kokoro-js saat engine pertama kali diinisialisasi.') +
          field('Speed', '<label class="nel-slider nel-slider-box"><span>Speaking speed <output for="nelKokoroSpeed">' + Number(state.kokoroSpeed).toFixed(2) + '</output></span><input id="nelKokoroSpeed" type="range" min="0.5" max="2" step="0.05" value="' + escapeHtml(state.kokoroSpeed) + '"></label>', 'Parameter speed diteruskan langsung ke tts.generate().') +
        '</div>' +
        '<p class="nel-note"><i class="fa-solid fa-shield-halved"></i> Teks synthesis diproses di browser dan tidak dikirim ke API Nexora, Supabase, Vercel inference, atau analytics. Library/model/voice dapat membutuhkan download jaringan pada pemakaian awal; mode offline tidak dijanjikan sebelum asset tersedia di cache browser.</p>' +
        '<div class="nel-actions nel-local-actions"><button class="nel-secondary" type="button" id="nelLoadKokoro"><i class="fa-solid fa-box-open"></i><span>' + (state.kokoro.ready ? 'Local Voices Loaded' : 'Load Local Voices') + '</span></button></div>' +
        actionButton('nelGenerateLocal', 'fa-microchip', 'Generate Local WAV');
    }

    function bindKokoroTts(text) {
      var voice = panel.querySelector('#nelKokoroVoice');
      var speed = panel.querySelector('#nelKokoroSpeed');
      var load = panel.querySelector('#nelLoadKokoro');
      var button = panel.querySelector('#nelGenerateLocal');
      voice.value = Array.prototype.some.call(voice.options, function (option) { return option.value === state.kokoroVoice; }) ? state.kokoroVoice : voice.value;
      voice.addEventListener('change', function () { state.kokoroVoice = voice.value; });
      speed.addEventListener('input', function () { state.kokoroSpeed = Number(speed.value); speed.parentElement.querySelector('output').value = Number(speed.value).toFixed(2); });
      button.dataset.icon = 'fa-microchip';
      load.disabled = state.kokoro.ready;
      load.addEventListener('click', function () {
        if (state.busy || state.kokoro.ready) return;
        state.ttsDraft = text.value; state.kokoroSpeed = Number(speed.value); state.kokoroVoice = voice.value;
        setBusy(load, true, 'Loading Kokoro…'); setStatus('Memuat Kokoro local. Model hanya diunduh saat dibutuhkan…', 'info');
        ensureKokoro(false).then(function () {
          if (state.mode === 'tts' && state.ttsEngine === 'kokoro') {
            renderTts();
            setStatus('Kokoro local siap · ' + state.kokoro.backend.toUpperCase() + ' · ' + state.kokoro.voices.length + ' voice.', 'success');
          }
        }).catch(function (error) {
          if (error.name !== 'AbortError') showLocalFallback(kokoroFriendlyError(error), state.ttsDraft);
        }).finally(function () {
          if (!document.documentElement.contains(container)) return;
          if (panel.contains(load)) setBusy(load, false);
          else setBusy(null, false);
        });
      });

      function generateLocal() {
        if (state.busy) return;
        var value = text.value.trim();
        if (!value) return setStatus('Masukkan teks terlebih dahulu.', 'error');
        state.ttsDraft = text.value; state.kokoroSpeed = Number(speed.value); state.kokoroVoice = voice.value;
        setBusy(button, true, 'Generating locally…'); setStatus('Menyiapkan Kokoro local…', 'info');
        generateKokoro(value, state.kokoroVoice, state.kokoroSpeed, false)
          .then(function (blob) { audioResult('Generated Voice · Kokoro ' + state.kokoro.backend.toUpperCase(), blob, 'nexora-kokoro.wav', generateLocal); setStatus('Kokoro WAV selesai dibuat sepenuhnya di perangkat.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') showLocalFallback(kokoroFriendlyError(error), state.ttsDraft); })
          .finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', generateLocal);
    }

    function createKokoroWorker(forceWasm) {
      destroyKokoro('Mengganti backend Kokoro.');
      var local = state.kokoro;
      var worker;
      try { worker = new Worker(KOKORO_WORKER_URL, { type: 'module', name: 'nexora-kokoro-local' }); }
      catch (error) { error.code = 'WORKER_FAILURE'; throw error; }
      local.worker = worker;
      worker.onmessage = function (event) {
        var message = event && event.data || {};
        if (message.type === 'progress') {
          setStatus((message.backend ? message.backend.toUpperCase() + ' · ' : '') + (message.message || 'Loading Kokoro…'), 'info');
          return;
        }
        var pending = local.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer); local.pending.delete(message.id);
        if (!message.ok || message.type === 'error') {
          var failure = new Error(message.error || 'Kokoro local gagal.');
          failure.code = message.code || 'LOCAL_INFERENCE_FAILED';
          failure.backend = message.backend || '';
          pending.reject(failure);
          return;
        }
        pending.resolve(message);
      };
      worker.onerror = function (event) {
        var failure = new Error((event && event.message) || 'Kokoro module worker gagal.');
        failure.code = 'WORKER_FAILURE';
        local.pending.forEach(function (pending) { clearTimeout(pending.timer); pending.reject(failure); });
        local.pending.clear();
        try { worker.terminate(); } catch (_) {}
        if (state.kokoro.worker === worker) {
          state.kokoro.worker = null; state.kokoro.ready = false; state.kokoro.backend = ''; state.kokoro.voices = [];
        }
      };
      return requestKokoro('init', { backend: forceWasm ? 'wasm' : 'auto' }, 300000).then(function (message) {
        local.ready = true; local.backend = message.backend || (forceWasm ? 'wasm' : 'webgpu'); local.voices = Array.isArray(message.voices) ? message.voices : [];
        if (local.voices.some(function (item) { return item.id === state.kokoroVoice; }) === false && local.voices[0]) state.kokoroVoice = local.voices[0].id;
        return message;
      });
    }

    function requestKokoro(type, payload, timeoutMs) {
      var local = state.kokoro;
      if (!local.worker) return Promise.reject(Object.assign(new Error('Kokoro worker belum tersedia.'), { code: 'WORKER_FAILURE' }));
      var id = ++local.sequence;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          local.pending.delete(id);
          var error = new Error(type === 'init' ? 'Kokoro model load timeout.' : 'Kokoro generation timeout.');
          error.code = 'LOCAL_TIMEOUT'; reject(error);
        }, timeoutMs || 180000);
        local.pending.set(id, { resolve, reject, timer });
        try { local.worker.postMessage(Object.assign({ id, type }, payload || {})); }
        catch (error) { clearTimeout(timer); local.pending.delete(id); error.code = 'WORKER_FAILURE'; reject(error); }
      });
    }

    function ensureKokoro(forceWasm) {
      if (state.kokoro.ready && state.kokoro.worker && (!forceWasm || state.kokoro.backend === 'wasm')) return Promise.resolve(state.kokoro);
      return createKokoroWorker(!!forceWasm).catch(function (error) {
        if (!forceWasm && error.code === 'WEBGPU_INIT_FAILED') {
          setStatus('WebGPU Kokoro tidak dapat dipakai. Mengalihkan ke WASM local…', 'info');
          return createKokoroWorker(true);
        }
        throw error;
      });
    }

    function generateKokoro(text, voice, speed, alreadyRetried) {
      destroyHeadTts();
      return ensureKokoro(false).then(function () {
        setStatus('Kokoro ' + state.kokoro.backend.toUpperCase() + ' sedang membuat WAV di perangkat…', 'info');
        return requestKokoro('generate', { text, voice, speed }, 240000);
      }).then(function (message) {
        if (!(message.buffer instanceof ArrayBuffer) || !message.buffer.byteLength) throw Object.assign(new Error('Kokoro mengembalikan WAV kosong.'), { code: 'EMPTY_AUDIO' });
        return new Blob([message.buffer], { type: message.mime || 'audio/wav' });
      }).catch(function (error) {
        if (!alreadyRetried && error.code === 'WEBGPU_RUNTIME_FAILED') {
          setStatus('WebGPU terputus/gagal saat inference. Mengulang satu kali dengan WASM local…', 'info');
          destroyKokoro('WebGPU runtime gagal.');
          return ensureKokoro(true).then(function () {
            return requestKokoro('generate', { text, voice, speed }, 240000);
          }).then(function (message) {
            if (!(message.buffer instanceof ArrayBuffer) || !message.buffer.byteLength) throw Object.assign(new Error('Kokoro mengembalikan WAV kosong.'), { code: 'EMPTY_AUDIO' });
            return new Blob([message.buffer], { type: message.mime || 'audio/wav' });
          });
        }
        throw error;
      });
    }

    function kokoroFriendlyError(error) {
      if (!error) return 'Kokoro local gagal.';
      if (error.code === 'OUT_OF_MEMORY') return 'Memori perangkat tidak cukup untuk Kokoro local. Tutup tab berat atau gunakan teks lebih pendek.';
      if (error.code === 'MODEL_LOAD_FAILED') return 'Model Kokoro gagal diunduh. Periksa koneksi lalu coba lagi.';
      if (error.code === 'WORKER_FAILURE') return 'Module Worker Kokoro gagal dijalankan pada browser ini.';
      if (error.code === 'LOCAL_TIMEOUT') return 'Kokoro local melewati batas waktu pada perangkat ini.';
      return error.message || 'Kokoro local gagal.';
    }

    function showLocalFallback(message, text) {
      setStatus(message, 'error');
      var result = panel.querySelector('#nelResult');
      if (!result) return;
      result.innerHTML = '<div class="nel-result-card nel-local-error"><strong>Local engine berhenti tanpa mengirim teks ke cloud.</strong><p>' + escapeHtml(message) + '</p><button type="button" class="nel-secondary" id="nelUseCloud"><i class="fa-solid fa-cloud-arrow-up"></i> Use ElevenLabs Cloud</button></div>';
      result.querySelector('#nelUseCloud').addEventListener('click', function () {
        state.ttsDraft = text || '';
        state.ttsEngine = 'cloud';
        activateMode('tts');
        setStatus('ElevenLabs Cloud dipilih. Generate hanya akan dikirim setelah Anda menekan tombol cloud.', 'success');
      });
    }

    function renderLipSync() {
      destroyKokoro('Lip Sync menggunakan HeadTTS, Kokoro worker dilepas untuk menghemat memori.');
      panel.innerHTML = '<div class="nel-section-head"><span>02</span><div><h3>Lip Sync</h3><p>Speech + timing asli untuk animasi mulut dan subtitle.</p></div></div>' +
        '<div class="nel-local-banner"><div><strong>HeadTTS</strong><span>LOCAL • ENGLISH</span></div><small>WebGPU preferred · WASM fallback</small></div>' +
        field('English Text', '<textarea id="nelLipText" rows="7" maxlength="480" placeholder="Type English dialogue for lip sync…">' + escapeHtml(state.lipDraft) + '</textarea><div class="nel-counter" id="nelCounter">' + state.lipDraft.length + ' / 480</div>', 'HeadTTS 1.3.0 saat ini mendukung English (en-us). Input dibatasi agar satu timestamped synthesis tetap utuh.') +
        '<div class="nel-grid">' +
          field('Voice', '<select id="nelHeadVoice">' + HEADTTS_VOICES.map(function (item) { return '<option value="' + item[0] + '"' + (item[0] === state.headttsVoice ? ' selected' : '') + '>' + item[1] + ' (' + item[0] + ')</option>'; }).join('') + '</select>') +
          field('Speed', '<label class="nel-slider nel-slider-box"><span>Speaking speed <output for="nelHeadSpeed">' + Number(state.headttsSpeed).toFixed(2) + '</output></span><input id="nelHeadSpeed" type="range" min="0.5" max="2" step="0.05" value="' + escapeHtml(state.headttsSpeed) + '"></label>', 'HeadTTS menerima speed 0.25–4; UI dibatasi 0.5–2 untuk kontrol yang nyaman.') +
        '</div>' +
        '<p class="nel-note"><i class="fa-solid fa-shield-halved"></i> HeadTTS berjalan di browser melalui Module Worker. Teks tidak dikirim ke /api/elevenlabs, Supabase, Vercel inference, analytics, atau server Nexora. Library, dictionary, voice, dan model dapat diunduh saat pemakaian awal.</p>' +
        actionButton('nelLipGenerate', 'fa-face-smile', 'Generate Lip Sync') + '<div id="nelResult"></div>';

      var text = panel.querySelector('#nelLipText');
      var voice = panel.querySelector('#nelHeadVoice');
      var speed = panel.querySelector('#nelHeadSpeed');
      var button = panel.querySelector('#nelLipGenerate'); button.dataset.icon = 'fa-face-smile';
      text.addEventListener('input', function () { state.lipDraft = text.value; panel.querySelector('#nelCounter').textContent = text.value.length + ' / 480'; });
      voice.addEventListener('change', function () { state.headttsVoice = voice.value; });
      speed.addEventListener('input', function () { state.headttsSpeed = Number(speed.value); speed.parentElement.querySelector('output').value = Number(speed.value).toFixed(2); });

      function generateLipSync() {
        if (state.busy) return;
        var value = text.value.trim();
        if (!value) return setStatus('Masukkan English text terlebih dahulu.', 'error');
        state.lipDraft = text.value; state.headttsVoice = voice.value; state.headttsSpeed = Number(speed.value);
        setBusy(button, true, 'Generating lip sync…'); setStatus('Memuat HeadTTS local jika diperlukan…', 'info');
        synthesizeHeadTts(value, state.headttsVoice, state.headttsSpeed)
          .then(function (output) { renderHeadTtsResult(output, generateLipSync); setStatus('HeadTTS selesai · word, phoneme, dan Oculus viseme timing berasal dari output engine.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') showLocalFallback(headTtsFriendlyError(error), state.lipDraft); })
          .finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', generateLipSync);
    }

    function importHeadTts() {
      if (!state.headttsModulePromise) state.headttsModulePromise = import(HEADTTS_MODULE);
      return state.headttsModulePromise;
    }

    function headProgress(event) {
      if (!event) return setStatus('Loading HeadTTS local…', 'info');
      var total = Number(event.total || 0); var loaded = Number(event.loaded || 0);
      if (event.lengthComputable && total > 0) setStatus('Loading HeadTTS local · ' + Math.round((loaded / total) * 100) + '%', 'info');
      else setStatus('Loading HeadTTS local assets…', 'info');
    }

    function ensureHeadTts() {
      destroyKokoro('HeadTTS akan dimuat.');
      if (state.headtts && state.headtts.isConnected) return Promise.resolve(state.headtts);
      return importHeadTts().then(function (module) {
        if (!module || typeof module.HeadTTS !== 'function') throw Object.assign(new Error('HeadTTS export tidak ditemukan.'), { code: 'HEADTTS_MODULE' });
        destroyHeadTts();
        var lastSystemError = null;
        var instance = new module.HeadTTS({
          endpoints: ['webgpu', 'wasm'],
          languages: ['en-us'],
          voices: [],
          workerModule: HEADTTS_WORKER,
          transformersModule: HEADTTS_TRANSFORMERS,
          model: HEADTTS_MODEL,
          dtypeWebgpu: 'fp32',
          dtypeWasm: 'q4',
          dictionaryURL: HEADTTS_DICTIONARY,
          voiceURL: HEADTTS_VOICE_URL,
          splitSentences: false,
          splitLength: 500,
          defaultLanguage: 'en-us',
          defaultVoice: state.headttsVoice,
          defaultSpeed: state.headttsSpeed,
          defaultAudioEncoding: 'wav'
        }, function (error) { lastSystemError = error; });
        state.headtts = instance;
        return instance.connect(null, headProgress, function (error) { lastSystemError = error; }).then(function () {
          if (!instance.isConnected) throw lastSystemError || new Error('HeadTTS local tidak terhubung ke WebGPU/WASM worker.');
          return instance;
        });
      });
    }

    function withTimeout(promise, timeoutMs, label) {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { var error = new Error(label || 'Local operation timeout.'); error.code = 'LOCAL_TIMEOUT'; reject(error); }, timeoutMs);
        Promise.resolve(promise).then(function (value) { clearTimeout(timer); resolve(value); }, function (error) { clearTimeout(timer); reject(error); });
      });
    }

    function synthesizeHeadTts(text, voice, speed) {
      return ensureHeadTts().then(function (instance) {
        setStatus('HeadTTS local sedang membuat audio dan timestamp…', 'info');
        return withTimeout(instance.setup({ voice, language: 'en-us', speed, audioEncoding: 'wav' }), 60000, 'HeadTTS setup timeout.').then(function () {
          return withTimeout(instance.synthesize({ input: text }), 240000, 'HeadTTS synthesis timeout.');
        });
      }).then(function (messages) {
        var list = Array.isArray(messages) ? messages : [messages];
        var failure = list.find(function (message) { return message && message.type === 'error'; });
        if (failure) throw new Error(failure.data && failure.data.error || 'HeadTTS synthesis gagal.');
        var audio = list.filter(function (message) { return message && message.type === 'audio' && message.data; });
        if (audio.length !== 1) throw Object.assign(new Error('HeadTTS menghasilkan lebih dari satu chunk; timing tidak akan digabung secara artifisial.'), { code: 'HEADTTS_CHUNKING' });
        return normalizeHeadTts(audio[0].data);
      });
    }

    function finiteArray(value) {
      return Array.isArray(value) && value.every(function (item) { return Number.isFinite(Number(item)); });
    }

    function normalizeHeadTts(data) {
      var words = Array.isArray(data.words) ? data.words.slice() : [];
      var wtimes = Array.isArray(data.wtimes) ? data.wtimes.map(Number) : [];
      var wdurations = Array.isArray(data.wdurations) ? data.wdurations.map(Number) : [];
      var phonemes = Array.isArray(data.phonemes) ? data.phonemes.slice() : [];
      var visemes = Array.isArray(data.visemes) ? data.visemes.slice() : [];
      var vtimes = Array.isArray(data.vtimes) ? data.vtimes.map(Number) : [];
      var vdurations = Array.isArray(data.vdurations) ? data.vdurations.map(Number) : [];
      if (!words.length || words.length !== wtimes.length || words.length !== wdurations.length || !finiteArray(wtimes) || !finiteArray(wdurations)) throw new Error('HeadTTS tidak mengembalikan word timing yang valid.');
      if (!phonemes.length || phonemes.length !== visemes.length || phonemes.length !== vtimes.length || phonemes.length !== vdurations.length || !finiteArray(vtimes) || !finiteArray(vdurations)) throw new Error('HeadTTS tidak mengembalikan phoneme/viseme timing yang valid.');
      if (!data.audio || typeof data.audio.getChannelData !== 'function') throw new Error('HeadTTS tidak mengembalikan AudioBuffer WAV yang valid.');

      return {
        audio: audioBufferToWavBlob(data.audio),
        words,
        wordTimings: words.map(function (word, index) { return { value: word, startMs: wtimes[index], durationMs: wdurations[index], endMs: wtimes[index] + wdurations[index] }; }),
        phonemes,
        phonemeTimings: phonemes.map(function (phoneme, index) { return { value: phoneme, startMs: vtimes[index], durationMs: vdurations[index], endMs: vtimes[index] + vdurations[index] }; }),
        visemes,
        visemeTimings: visemes.map(function (viseme, index) { return { value: viseme, startMs: vtimes[index], durationMs: vdurations[index], endMs: vtimes[index] + vdurations[index] }; }),
        rawTiming: { words, wtimes, wdurations, phonemes, visemes, vtimes, vdurations }
      };
    }

    function audioBufferToWavBlob(audioBuffer) {
      var channels = audioBuffer.numberOfChannels;
      var sampleRate = audioBuffer.sampleRate;
      var frames = audioBuffer.length;
      var bytesPerSample = 2;
      var blockAlign = channels * bytesPerSample;
      var buffer = new ArrayBuffer(44 + frames * blockAlign);
      var view = new DataView(buffer);
      function writeText(offset, text) { for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); }
      writeText(0, 'RIFF'); view.setUint32(4, 36 + frames * blockAlign, true); writeText(8, 'WAVE'); writeText(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true); writeText(36, 'data'); view.setUint32(40, frames * blockAlign, true);
      var channelData = []; for (var c = 0; c < channels; c++) channelData.push(audioBuffer.getChannelData(c));
      var offset = 44;
      for (var frame = 0; frame < frames; frame++) {
        for (var channel = 0; channel < channels; channel++) {
          var sample = Math.max(-1, Math.min(1, channelData[channel][frame] || 0));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2;
        }
      }
      return new Blob([buffer], { type: 'audio/wav' });
    }

    function formatTimelineTime(ms) {
      return (Math.max(0, Number(ms || 0)) / 1000).toFixed(2) + 's';
    }

    function timeline(title, items, kind) {
      return '<section class="nel-timeline" data-timeline="' + kind + '"><div class="nel-timeline-head"><strong>' + escapeHtml(title) + '</strong><small>' + items.length + ' items</small></div><div class="nel-timeline-track">' +
        items.map(function (item) { return '<span class="nel-timeline-item" data-nel-start="' + item.startMs + '" data-nel-end="' + item.endMs + '"><b>' + escapeHtml(String(item.value).trim() || '·') + '</b><small>' + formatTimelineTime(item.startMs) + '</small></span>'; }).join('') + '</div></section>';
    }

    function renderHeadTtsResult(output, again) {
      var old = panel.querySelector('[data-result-url]')?.dataset.resultUrl;
      dropUrl(old);
      var url = addUrl(output.audio);
      var result = panel.querySelector('#nelResult');
      result.innerHTML = '<div class="nel-result-card nel-lipsync-result" data-result-url="' + escapeHtml(url) + '">' +
        '<span class="nel-result-label"><i class="fa-solid fa-wave-square"></i> HeadTTS · Audio Player</span><audio id="nelLipAudio" controls preload="metadata" src="' + escapeHtml(url) + '"></audio>' +
        timeline('Words Timeline', output.wordTimings, 'words') + timeline('Phoneme Timeline', output.phonemeTimings, 'phonemes') + timeline('Viseme Timeline', output.visemeTimings, 'visemes') +
        '<div class="nel-actions"><a class="nel-secondary" download="nexora-headtts.wav" href="' + escapeHtml(url) + '"><i class="fa-solid fa-download"></i> Download WAV</a>' +
        '<button class="nel-secondary" type="button" id="nelLipJson"><i class="fa-solid fa-code"></i> Download Lip Sync JSON</button>' +
        '<button class="nel-secondary" type="button" id="nelAgain"><i class="fa-solid fa-rotate"></i> Generate Again</button></div></div>';
      var audio = result.querySelector('#nelLipAudio');
      bindTimelinePlayback(audio, result);
      result.querySelector('#nelLipJson').addEventListener('click', function () {
        downloadText(JSON.stringify(output.rawTiming, null, 2), 'nexora-headtts-lipsync.json', 'application/json;charset=utf-8');
      });
      result.querySelector('#nelAgain').addEventListener('click', again);
      result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }

    function bindTimelinePlayback(audio, root) {
      var current = [];
      function update() {
        var ms = Number(audio.currentTime || 0) * 1000;
        current.forEach(function (item) { item.classList.remove('is-current'); }); current = [];
        root.querySelectorAll('[data-nel-start]').forEach(function (item) {
          var start = Number(item.dataset.nelStart); var end = Number(item.dataset.nelEnd);
          if (ms >= start && ms < end) { item.classList.add('is-current'); current.push(item); }
        });
      }
      ['timeupdate', 'seeked', 'play', 'pause', 'ended'].forEach(function (name) { audio.addEventListener(name, update); });
    }

    function headTtsFriendlyError(error) {
      var message = error && error.message || 'HeadTTS local gagal.';
      if (error && error.code === 'LOCAL_TIMEOUT') return 'HeadTTS local melewati batas waktu pada perangkat ini.';
      if (/out of memory|oom|memory/i.test(message)) return 'Memori perangkat tidak cukup untuk HeadTTS. Tutup tab berat atau gunakan teks lebih pendek.';
      if (/webgpu|device lost|adapter|gpu/i.test(message)) return 'WebGPU HeadTTS gagal dan fallback WASM tidak berhasil pada browser ini.';
      if (/worker/i.test(message)) return 'Module Worker HeadTTS gagal dijalankan.';
      if (/fetch|network|download|load/i.test(message)) return 'Asset HeadTTS gagal dimuat. Periksa koneksi lalu coba lagi.';
      return message;
    }

    function fileCard(title, inputId, accept) {
      return '<label class="nel-upload"><i class="fa-solid fa-cloud-arrow-up"></i><strong>' + title + '</strong><span>Pilih file dari perangkat</span><small id="nelFileName">Belum ada file</small><input id="' + inputId + '" type="file" accept="' + accept + '"></label><div id="nelOriginal"></div>';
    }

    function bindFile(input, allowVideo) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        var info = panel.querySelector('#nelFileName');
        var original = panel.querySelector('#nelOriginal');
        dropUrl(state.originalUrl); state.originalUrl = '';
        if (!file) { info.textContent = 'Belum ada file'; original.innerHTML = ''; return; }
        if (file.size > state.config.limits.uploadBytes) { input.value = ''; info.textContent = 'File terlalu besar'; return setStatus('File maksimal ' + formatBytes(state.config.limits.uploadBytes) + '.', 'error'); }
        info.textContent = file.name + ' · ' + formatBytes(file.size);
        if (file.type.startsWith('audio/')) {
          state.originalUrl = addUrl(file);
          original.innerHTML = '<div class="nel-original"><span>Original preview</span><audio controls preload="metadata" src="' + escapeHtml(state.originalUrl) + '"></audio></div>';
        } else if (!allowVideo) { input.value = ''; info.textContent = 'Format tidak didukung'; setStatus('Gunakan MP3, WAV, M4A, atau WebM audio.', 'error'); }
      });
    }

    function uploadRequest(action, form) {
      return fetch(API + '?action=' + encodeURIComponent(action), { method: 'POST', body: form, signal: state.controller.signal });
    }

    function cloudUnavailable(title) {
      panel.innerHTML = '<div class="nel-section-head"><span>--</span><div><h3>' + escapeHtml(title) + '</h3><p>Fitur cloud existing tetap memakai backend ElevenLabs Nexora.</p></div></div>' +
        '<div class="nel-empty"><i class="fa-solid fa-plug-circle-xmark"></i><h3>ElevenLabs Cloud belum tersedia</h3><p>' + escapeHtml(state.cloudError || 'Voice/model akun belum dapat dimuat.') + '</p><button type="button" class="nel-secondary" id="nelRetry">Coba Lagi</button></div>';
      panel.querySelector('#nelRetry').addEventListener('click', function () { renderElevenLabsStudio(container); });
    }

    function renderVoice() {
      destroyKokoro(); destroyHeadTts();
      if (!cloudReady('voiceChanger')) return cloudUnavailable('Voice Changer');
      panel.innerHTML = '<div class="nel-section-head"><span>03</span><div><h3>Voice Changer</h3><p>Pertahankan delivery, ubah karakter suara.</p></div></div>' +
        fileCard('Upload Audio', 'nelFile', 'audio/mpeg,audio/wav,audio/mp4,audio/webm,.mp3,.wav,.m4a,.webm') + commonVoiceFields('voiceChanger') + settings() +
        '<p class="nel-note"><i class="fa-solid fa-shield-halved"></i> Audio hanya diteruskan saat proses dan tidak disimpan Nexora.</p>' + actionButton('nelConvert', 'fa-arrows-rotate', 'Convert Voice') + '<div id="nelResult"></div>';
      var input = panel.querySelector('#nelFile'); bindFile(input, false); bindSliders();
      var button = panel.querySelector('#nelConvert'); button.dataset.icon = 'fa-arrows-rotate';
      function convert() {
        if (state.busy) return;
        var file = input.files && input.files[0]; if (!file) return setStatus('Pilih file audio terlebih dahulu.', 'error');
        var form = new FormData(); form.append('audio', file); form.append('voiceId', panel.querySelector('#nelVoice').value); form.append('modelId', panel.querySelector('#nelModel').value);
        var values = selectedSettings(); Object.keys(values).forEach(function (key) { form.append(key, values[key]); });
        setBusy(button, true, 'Converting voice…'); setStatus('Converting voice…', 'info');
        uploadRequest('voice-changer', form).then(function (response) { if (!response.ok) return errorMessage(response, 'Konversi suara gagal.').then(function (message) { throw new Error(message); }); return response.blob(); })
          .then(function (blob) { audioResult('Converted Voice', blob, 'nexora-voice-converted.mp3', convert); setStatus('Voice conversion selesai.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') setStatus(error.message, 'error'); }).finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', convert);
    }

    function seconds(value) {
      var total = Math.max(0, Number(value || 0)); var hours = Math.floor(total / 3600); var minutes = Math.floor((total % 3600) / 60); var secs = Math.floor(total % 60); var ms = Math.floor((total % 1) * 1000);
      return (hours ? String(hours).padStart(2, '0') + ':' : '') + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + ',' + String(ms).padStart(3, '0');
    }

    function transcriptText(data) {
      if (!data.speakers?.length) return data.text;
      return data.segments.map(function (segment) { return (segment.speakerId ? segment.speakerId.replace(/_/g, ' ') + '\n' : '') + segment.text; }).join('\n\n') || data.text;
    }

    function srtText(segments) {
      return segments.map(function (item, index) { return (index + 1) + '\n' + seconds(item.start) + ' --> ' + seconds(item.end) + '\n' + (item.speakerId ? '[' + item.speakerId.replace(/_/g, ' ') + '] ' : '') + item.text; }).join('\n\n');
    }

    function downloadText(text, filename, type) {
      var url = addUrl(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); var link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(function () { dropUrl(url); }, 1000);
    }

    function renderTranscript(data) {
      var text = transcriptText(data); var result = panel.querySelector('#nelResult');
      result.innerHTML = '<div class="nel-result-card"><span class="nel-result-label"><i class="fa-solid fa-align-left"></i> Transcript' + (data.language ? ' · ' + escapeHtml(data.language.toUpperCase()) : '') + '</span>' +
        '<pre class="nel-transcript" tabindex="0">' + escapeHtml(text) + '</pre><div class="nel-actions"><button id="nelCopy" class="nel-secondary" type="button"><i class="fa-regular fa-copy"></i> Copy</button>' +
        '<button id="nelTxt" class="nel-secondary" type="button"><i class="fa-solid fa-file-arrow-down"></i> TXT</button>' +
        (data.hasTimestamps ? '<button id="nelSrt" class="nel-secondary" type="button"><i class="fa-solid fa-closed-captioning"></i> SRT</button>' : '') + '</div></div>';
      result.querySelector('#nelCopy').addEventListener('click', function () { navigator.clipboard.writeText(text).then(function () { setStatus('Transcript copied.', 'success'); }).catch(function () { setStatus('Transcript tidak dapat disalin.', 'error'); }); });
      result.querySelector('#nelTxt').addEventListener('click', function () { downloadText(text, 'nexora-transcript.txt'); });
      result.querySelector('#nelSrt')?.addEventListener('click', function () { downloadText(srtText(data.segments), 'nexora-transcript.srt', 'application/x-subrip'); });
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderStt() {
      destroyKokoro(); destroyHeadTts();
      if (state.cloudError) return cloudUnavailable('Speech to Text');
      panel.innerHTML = '<div class="nel-section-head"><span>04</span><div><h3>Speech to Text</h3><p>Audio atau video menjadi transcript terstruktur.</p></div></div>' +
        fileCard('Upload Audio / Video', 'nelFile', 'audio/mpeg,audio/wav,audio/mp4,audio/webm,video/mp4,video/webm,.mp3,.wav,.m4a,.webm,.mp4') +
        '<div class="nel-grid">' + field('Language', '<select id="nelLanguage"><option value="">Auto Detect</option><option value="id">Bahasa Indonesia</option><option value="en">English</option></select>') +
        field('Speaker Detection', '<label class="nel-toggle"><input id="nelDiarize" type="checkbox"><span></span><b>Detect speakers</b></label>', 'Label speaker hanya muncul jika API mendeteksinya.') + '</div>' +
        '<p class="nel-note"><i class="fa-solid fa-clock"></i> Timestamp nyata dipakai untuk export SRT jika tersedia.</p>' + actionButton('nelTranscribe', 'fa-file-waveform', 'Transcribe') + '<div id="nelResult"></div>';
      var input = panel.querySelector('#nelFile'); bindFile(input, true); var button = panel.querySelector('#nelTranscribe'); button.dataset.icon = 'fa-file-waveform';
      button.addEventListener('click', function () {
        if (state.busy) return; var file = input.files && input.files[0]; if (!file) return setStatus('Pilih file audio atau video terlebih dahulu.', 'error');
        var form = new FormData(); form.append('file', file); form.append('language', panel.querySelector('#nelLanguage').value); form.append('diarize', panel.querySelector('#nelDiarize').checked);
        setBusy(button, true, 'Transcribing…'); setStatus('Transcribing…', 'info');
        uploadRequest('speech-to-text', form).then(function (response) { if (!response.ok) return errorMessage(response, 'Transkripsi gagal.').then(function (message) { throw new Error(message); }); return response.json(); })
          .then(function (payload) { renderTranscript(payload.data); setStatus('Transkripsi selesai.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') setStatus(error.message, 'error'); }).finally(function () { setBusy(button, false); });
      });
    }

    function renderSound() {
      destroyKokoro(); destroyHeadTts();
      if (state.cloudError) return cloudUnavailable('Sound FX');
      panel.innerHTML = '<div class="nel-section-head"><span>05</span><div><h3>Sound FX Generator</h3><p>Deskripsi singkat menjadi efek suara siap pakai.</p></div></div>' +
        field('Describe Sound', '<textarea id="nelSoundText" rows="5" maxlength="1000" placeholder="Heavy fantasy sword impact with metallic resonance"></textarea><div class="nel-counter" id="nelCounter">0 / 1000</div>') +
        '<div class="nel-grid">' + field('Duration', '<select id="nelDuration"><option value="auto">Auto</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option></select>') +
        field('Seamless Loop', '<label class="nel-toggle"><input id="nelLoop" type="checkbox"><span></span><b>Loop sound</b></label>') + '</div>' +
        '<div class="nel-prompts"><button type="button">Rain hitting a wooden roof at night</button><button type="button">Massive dragon roar in a cavern</button><button type="button">Sci-fi energy portal opening</button></div>' +
        actionButton('nelSoundGenerate', 'fa-burst', 'Generate Sound') + '<div id="nelResult"></div>';
      var text = panel.querySelector('#nelSoundText'); text.addEventListener('input', function () { panel.querySelector('#nelCounter').textContent = text.value.length + ' / 1000'; });
      panel.querySelectorAll('.nel-prompts button').forEach(function (item) { item.addEventListener('click', function () { text.value = item.textContent; text.dispatchEvent(new Event('input')); }); });
      var button = panel.querySelector('#nelSoundGenerate'); button.dataset.icon = 'fa-burst';
      function generate() {
        if (state.busy) return; if (!text.value.trim()) return setStatus('Masukkan deskripsi suara terlebih dahulu.', 'error');
        setBusy(button, true, 'Generating sound…'); setStatus('Generating sound…', 'info');
        postAudio('sound-effects', { text: text.value, duration: panel.querySelector('#nelDuration').value, loop: panel.querySelector('#nelLoop').checked })
          .then(function (blob) { audioResult('Generated Sound', blob, 'nexora-sound-effect.mp3', generate); setStatus('Sound effect berhasil dibuat.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') setStatus(error.message, 'error'); }).finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', generate);
    }

    function activateMode(mode) {
      if (state.busy) return;
      if (state.mode === 'tts') {
        var currentText = panel.querySelector('#nelText'); if (currentText) state.ttsDraft = currentText.value;
      }
      if (state.mode === 'lipsync') {
        var lipText = panel.querySelector('#nelLipText'); if (lipText) state.lipDraft = lipText.value;
      }
      if (mode !== 'tts') destroyKokoro('Mode Kokoro ditinggalkan.');
      if (mode !== 'lipsync') destroyHeadTts();
      clearUrls();
      state.mode = mode;
      tabs.forEach(function (item) { var active = item.dataset.nelTab === mode; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', active ? 'true' : 'false'); });
      setStatus('', ''); render();
    }

    tabs.forEach(function (button) {
      button.addEventListener('click', function () {
        if (state.busy || state.mode === button.dataset.nelTab) return;
        activateMode(button.dataset.nelTab);
      });
    });

    fetch(API + '?action=config', { headers: { Accept: 'application/json' }, signal: state.controller.signal })
      .then(function (response) { if (!response.ok) return errorMessage(response, 'ElevenLabs belum siap.').then(function (message) { throw new Error(message); }); return response.json(); })
      .then(function (payload) {
        state.config = payload.data || state.config;
        state.config.limits = state.config.limits || { uploadBytes: DEFAULT_UPLOAD_BYTES };
        if (!state.config.voices?.length) state.cloudError = 'Akun ElevenLabs belum memiliki voice yang dapat digunakan.';
        setStatus(state.cloudError || ('Studio siap · ' + state.config.voices.length + ' voice ElevenLabs tersedia.'), state.cloudError ? 'error' : 'success');
        render();
      })
      .catch(function (error) {
        if (error.name === 'AbortError') return;
        state.cloudError = error.message || 'ElevenLabs Cloud belum tersedia.';
        setStatus(state.cloudError + ' Local Kokoro dan HeadTTS tetap tersedia.', 'error');
        render();
      });

    var observer = new MutationObserver(function () { if (!document.documentElement.contains(container)) { cleanUp(); observer.disconnect(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    container.__nexoraElevenLabsCleanup = cleanUp;
  }

  window.renderElevenLabsStudio = renderElevenLabsStudio;
})();

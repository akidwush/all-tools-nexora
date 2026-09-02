/* Nexora ElevenLabs Studio — private server proxy, transient media only */
(function () {
  'use strict';

  var API = '/api/elevenlabs';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function formatBytes(bytes) {
    return Math.round(Number(bytes || 0) / 1024 / 1024) + ' MB';
  }

  function renderElevenLabsStudio(container) {
    var state = { mode: 'tts', busy: false, config: null, urls: new Set(), controller: new AbortController(), originalUrl: '' };

    container.innerHTML = '<section class="nel-studio" aria-labelledby="nelTitle">' +
      '<header class="nel-hero"><span class="nel-kicker"><i class="fa-solid fa-wave-square"></i> NEXORA AUDIO AI</span>' +
      '<h2 id="nelTitle">ElevenLabs Studio</h2><p>Suara, voice conversion, transkripsi, dan efek audio dalam satu studio.</p></header>' +
      '<nav class="nel-tabs" role="tablist" aria-label="Mode audio">' +
        tab('tts', 'fa-comment-dots', 'Text to Speech', true) + tab('voice', 'fa-microphone-lines', 'Voice Changer') +
        tab('stt', 'fa-file-waveform', 'Speech to Text') + tab('sound', 'fa-burst', 'Sound FX') +
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
      status.innerHTML = message ? '<i class="fa-solid ' + (type === 'error' ? 'fa-triangle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-notch fa-spin') + '"></i><span>' + escapeHtml(message) + '</span>' : '';
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

    function cleanUp() {
      state.controller.abort();
      state.urls.forEach(function (url) { URL.revokeObjectURL(url); });
      state.urls.clear();
    }

    function optionList(items, capability) {
      return items.filter(function (item) { return !capability || item[capability]; }).map(function (item) {
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
      if (!state.config) return;
      if (state.mode === 'tts') renderTts();
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
        input.addEventListener('input', function () { input.parentElement.querySelector('output').value = Number(input.value).toFixed(input.id === 'nelSpeed' ? 2 : 2); });
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
      if (button) {
        button.disabled = busy;
        if (!button.dataset.label) button.dataset.label = button.querySelector('span').textContent;
        button.querySelector('span').textContent = busy ? text : button.dataset.label;
        button.querySelector('i').className = 'fa-solid ' + (busy ? 'fa-circle-notch fa-spin' : button.dataset.icon || 'fa-wand-magic-sparkles');
      }
    }

    function audioResult(title, blob, filename, again) {
      var old = panel.querySelector('[data-result-url]')?.dataset.resultUrl;
      dropUrl(old);
      var url = addUrl(blob);
      var result = panel.querySelector('#nelResult');
      result.innerHTML = '<div class="nel-result-card" data-result-url="' + escapeHtml(url) + '"><span class="nel-result-label"><i class="fa-solid fa-wave-square"></i> ' + escapeHtml(title) + '</span>' +
        '<audio controls preload="metadata" src="' + escapeHtml(url) + '"></audio><div class="nel-actions">' +
        '<a class="nel-secondary" download="' + escapeHtml(filename) + '" href="' + escapeHtml(url) + '"><i class="fa-solid fa-download"></i> Download MP3</a>' +
        '<button class="nel-secondary" type="button" id="nelAgain"><i class="fa-solid fa-rotate"></i> Generate Again</button></div></div>';
      result.querySelector('#nelAgain').addEventListener('click', again);
      result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }

    function postAudio(action, body) {
      return fetch(API + '?action=' + encodeURIComponent(action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: state.controller.signal })
        .then(function (response) { if (!response.ok) return errorMessage(response, 'Proses audio gagal. Coba lagi.').then(function (message) { throw new Error(message); }); return response.blob(); });
    }

    function renderTts() {
      var firstModel = (state.config.models || []).find(function (model) { return model.tts; });
      var initialMax = firstModel?.maxCharacters || 5000;
      panel.innerHTML = '<div class="nel-section-head"><span>01</span><div><h3>Text to Speech</h3><p>Teks Indonesia atau English menjadi suara AI.</p></div></div>' +
        field('Text', '<textarea id="nelText" rows="7" maxlength="' + initialMax + '" placeholder="Tulis narasi, dialog, atau voice-over…"></textarea><div class="nel-counter" id="nelCounter">0 / ' + initialMax + '</div>') +
        commonVoiceFields('tts') + settings() + actionButton('nelGenerate', 'fa-wand-magic-sparkles', 'Generate Voice') + '<div id="nelResult"></div>';
      var text = panel.querySelector('#nelText');
      var model = panel.querySelector('#nelModel');
      function limit() {
        var selected = state.config.models.find(function (item) { return item.id === model.value; });
        var max = selected?.maxCharacters || 5000;
        text.maxLength = max;
        panel.querySelector('#nelCounter').textContent = text.value.length + ' / ' + max;
      }
      text.addEventListener('input', limit); model.addEventListener('change', limit); bindSliders();
      var button = panel.querySelector('#nelGenerate'); button.dataset.icon = 'fa-wand-magic-sparkles';
      function generate() {
        if (state.busy) return;
        if (!text.value.trim()) return setStatus('Masukkan teks terlebih dahulu.', 'error');
        setBusy(button, true, 'Generating voice…'); setStatus('Generating voice…', 'info');
        postAudio('tts', Object.assign({ text: text.value, voiceId: panel.querySelector('#nelVoice').value, modelId: model.value }, selectedSettings()))
          .then(function (blob) { audioResult('Generated Voice', blob, 'nexora-tts.mp3', generate); setStatus('Suara berhasil dibuat.', 'success'); })
          .catch(function (error) { if (error.name !== 'AbortError') setStatus(error.message, 'error'); })
          .finally(function () { setBusy(button, false); });
      }
      button.addEventListener('click', generate);
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

    function renderVoice() {
      panel.innerHTML = '<div class="nel-section-head"><span>02</span><div><h3>Voice Changer</h3><p>Pertahankan delivery, ubah karakter suara.</p></div></div>' +
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
      panel.innerHTML = '<div class="nel-section-head"><span>03</span><div><h3>Speech to Text</h3><p>Audio atau video menjadi transcript terstruktur.</p></div></div>' +
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
      panel.innerHTML = '<div class="nel-section-head"><span>04</span><div><h3>Sound FX Generator</h3><p>Deskripsi singkat menjadi efek suara siap pakai.</p></div></div>' +
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

    tabs.forEach(function (button) {
      button.addEventListener('click', function () {
        if (state.busy || state.mode === button.dataset.nelTab) return;
        dropUrl(state.originalUrl); state.originalUrl = '';
        state.mode = button.dataset.nelTab;
        tabs.forEach(function (item) { var active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', active ? 'true' : 'false'); });
        setStatus('', ''); render();
      });
    });

    fetch(API + '?action=config', { headers: { Accept: 'application/json' }, signal: state.controller.signal })
      .then(function (response) { if (!response.ok) return errorMessage(response, 'ElevenLabs belum siap.').then(function (message) { throw new Error(message); }); return response.json(); })
      .then(function (payload) {
        state.config = payload.data;
        if (!state.config.voices?.length) throw new Error('Akun ElevenLabs belum memiliki voice yang dapat digunakan.');
        setStatus('Studio siap · ' + state.config.voices.length + ' voice tersedia.', 'success'); render();
      })
      .catch(function (error) {
        if (error.name === 'AbortError') return;
        setStatus(error.message, 'error');
        panel.innerHTML = '<div class="nel-empty"><i class="fa-solid fa-plug-circle-xmark"></i><h3>Studio belum tersedia</h3><p>' + escapeHtml(error.message) + '</p><button type="button" class="nel-secondary" id="nelRetry">Coba Lagi</button></div>';
        panel.querySelector('#nelRetry').addEventListener('click', function () { renderElevenLabsStudio(container); });
      });

    var observer = new MutationObserver(function () { if (!document.documentElement.contains(container)) { cleanUp(); observer.disconnect(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    container.__nexoraElevenLabsCleanup = cleanUp;
  }

  window.renderElevenLabsStudio = renderElevenLabsStudio;
})();

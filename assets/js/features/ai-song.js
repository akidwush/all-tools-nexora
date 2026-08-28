(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 118 * 1000;
  var MAX_PROMPT_LENGTH = 1500;
  var MAX_TITLE_LENGTH = 160;
  var MAX_TAGS_LENGTH = 300;
  var sessionState = {
    prompt: "",
    title: "",
    tags: "",
    loading: false,
    result: null,
    submittedTitle: "",
    error: ""
  };

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ""));
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
    } catch (_) {
      return "";
    }
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("COPY_FAILED"));
  }

  function actionLink(label, iconName, url, download) {
    var anchor = element("a", "nx-song-action");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (download) anchor.setAttribute("download", "nexora-ai-song");
    anchor.append(element("i", iconName), document.createTextNode(label));
    return anchor;
  }

  window.renderAiSong = function renderAiSong(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var timer = 0;
    var toastTimer = 0;

    body.innerHTML = "" +
      '<main class="nx-song">' +
        '<section class="nx-song-hero">' +
          '<span class="nx-song-hero-icon"><i class="fa-solid fa-music"></i></span>' +
          '<div><span class="nx-song-kicker">NEXORA MUSIC AI</span><h2>Nexora AI Song Generator</h2><p>Turn your idea into music.</p></div>' +
        '</section>' +
        '<section class="nx-song-card nx-song-form-card">' +
          '<form id="nxSongForm" novalidate>' +
            '<label for="nxSongPrompt">Describe your song <span>Required</span></label>' +
            '<textarea id="nxSongPrompt" maxlength="1500" rows="6" placeholder="Describe the song, mood, story, vocals, and atmosphere..." required></textarea>' +
            '<div class="nx-song-count"><span id="nxSongCount">0</span>/1500</div>' +
            '<div class="nx-song-fields">' +
              '<div><label for="nxSongTitle">Song Title <span>Optional</span></label><input id="nxSongTitle" type="text" maxlength="160" autocomplete="off" placeholder="Optional song title"></div>' +
              '<div><label for="nxSongTags">Style / Genre <span>Optional</span></label><input id="nxSongTags" type="text" maxlength="300" autocomplete="off" placeholder="Pop, Rock, Breakbeat..."></div>' +
            '</div>' +
            '<div class="nx-song-presets" aria-label="Quick genre presets"><button type="button" data-tag="Pop">Pop</button><button type="button" data-tag="Rock">Rock</button><button type="button" data-tag="EDM">EDM</button><button type="button" data-tag="Lo-fi">Lo-fi</button><button type="button" data-tag="Hip Hop">Hip Hop</button><button type="button" data-tag="Emotional">Emotional</button><button type="button" data-tag="Cinematic">Cinematic</button></div>' +
            '<button id="nxSongGenerate" class="nx-song-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate Song</span></button>' +
          '</form>' +
          '<p id="nxSongFeedback" class="nx-song-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section id="nxSongResultCard" class="nx-song-card nx-song-result" hidden aria-busy="false">' +
          '<div class="nx-song-result-heading"><span>YOUR SONG</span><h3 id="nxSongResultTitle"></h3><p id="nxSongStatus"></p></div>' +
          '<div class="nx-song-media">' +
            '<div id="nxSongCover" class="nx-song-cover" hidden></div>' +
            '<audio id="nxSongAudio" controls preload="metadata"></audio>' +
          '</div>' +
          '<div id="nxSongActions" class="nx-song-actions"></div>' +
          '<section id="nxSongLyricsPanel" class="nx-song-lyrics" hidden><h4>Lyrics</h4><pre id="nxSongLyrics"></pre></section>' +
        '</section>' +
        '<p class="nx-song-note"><i class="fa-solid fa-shield-halved"></i> Audio tidak diputar otomatis. Hasil tetap dibuka langsung dari penyedia audio agar Nexora tetap ringan.</p>' +
        '<div id="nxSongToast" class="nx-song-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var form = body.querySelector("#nxSongForm");
    var prompt = body.querySelector("#nxSongPrompt");
    var title = body.querySelector("#nxSongTitle");
    var tags = body.querySelector("#nxSongTags");
    var count = body.querySelector("#nxSongCount");
    var generate = body.querySelector("#nxSongGenerate");
    var feedback = body.querySelector("#nxSongFeedback");
    var resultCard = body.querySelector("#nxSongResultCard");
    var resultTitle = body.querySelector("#nxSongResultTitle");
    var resultStatus = body.querySelector("#nxSongStatus");
    var cover = body.querySelector("#nxSongCover");
    var audio = body.querySelector("#nxSongAudio");
    var actions = body.querySelector("#nxSongActions");
    var lyricsPanel = body.querySelector("#nxSongLyricsPanel");
    var lyrics = body.querySelector("#nxSongLyrics");
    var toast = body.querySelector("#nxSongToast");

    prompt.value = sessionState.prompt;
    title.value = sessionState.title;
    tags.value = sessionState.tags;

    function showToast(message, isError) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle("is-error", Boolean(isError));
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 2200);
    }

    function updateCount() {
      count.textContent = String(prompt.value.length);
    }

    function setLoading(loading) {
      sessionState.loading = loading;
      prompt.disabled = loading;
      title.disabled = loading;
      tags.disabled = loading;
      generate.disabled = loading;
      body.querySelectorAll(".nx-song-presets button").forEach(function (button) { button.disabled = loading; });
      generate.querySelector("i").className = loading ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-wand-magic-sparkles";
      generate.querySelector("span").textContent = loading ? "Generating your song…" : "Generate Song";
      resultCard.setAttribute("aria-busy", loading ? "true" : "false");
    }

    function renderResult() {
      var data = sessionState.result;
      if (!data || !safeUrl(data.audioUrl)) {
        resultCard.hidden = true;
        return;
      }
      var audioUrl = safeUrl(data.audioUrl);
      var coverUrl = safeUrl(data.coverUrl);
      resultCard.hidden = false;
      resultTitle.textContent = String(data.title || sessionState.submittedTitle || "Your generated song").trim();
      resultStatus.textContent = [data.status, data.duration].filter(Boolean).join(" • ");
      audio.src = audioUrl;
      audio.load();
      cover.replaceChildren();
      cover.hidden = !coverUrl;
      if (coverUrl) {
        var image = document.createElement("img");
        image.src = coverUrl;
        image.alt = "Cover lagu hasil Nexora AI Song Generator";
        image.loading = "lazy";
        image.decoding = "async";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", function () { cover.hidden = true; }, { once: true });
        cover.appendChild(image);
      }
      actions.replaceChildren();
      actions.appendChild(actionLink("Download Song", "fa-solid fa-download", audioUrl, true));
      actions.appendChild(actionLink("Open Audio", "fa-solid fa-arrow-up-right-from-square", audioUrl, false));
      var copy = element("button", "nx-song-action");
      copy.type = "button";
      copy.append(element("i", "fa-regular fa-copy"), document.createTextNode("Copy Link"));
      copy.addEventListener("click", function () {
        copyText(audioUrl).then(function () { showToast("Link audio disalin."); }).catch(function () { showToast("Link belum dapat disalin.", true); });
      });
      actions.appendChild(copy);
      var lyricText = String(data.lyrics || "").trim();
      lyricsPanel.hidden = !lyricText;
      lyrics.textContent = lyricText;
    }

    function renderState() {
      updateCount();
      feedback.textContent = sessionState.error || (sessionState.loading ? "Generating your song... Proses ini dapat membutuhkan waktu hingga dua menit." : "");
      feedback.classList.toggle("is-error", Boolean(sessionState.error));
      feedback.classList.toggle("is-loading", sessionState.loading);
      renderResult();
      setLoading(sessionState.loading);
    }

    prompt.addEventListener("input", function () { sessionState.prompt = prompt.value; updateCount(); });
    title.addEventListener("input", function () { sessionState.title = title.value; });
    tags.addEventListener("input", function () { sessionState.tags = tags.value; });
    body.querySelectorAll(".nx-song-presets button").forEach(function (button) {
      button.addEventListener("click", function () {
        var preset = button.dataset.tag;
        var values = tags.value.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        var exists = values.some(function (item) { return item.toLowerCase() === preset.toLowerCase(); });
        if (!exists) values.push(preset);
        tags.value = values.join(", ").slice(0, MAX_TAGS_LENGTH);
        sessionState.tags = tags.value;
        tags.focus();
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (sessionState.loading) return;
      var input = {
        prompt: prompt.value.trim(),
        title: title.value.trim(),
        tags: tags.value.trim()
      };
      if (!input.prompt) {
        sessionState.error = "Tulis deskripsi lagu terlebih dahulu.";
        renderState();
        prompt.focus();
        return;
      }
      if (input.prompt.length > MAX_PROMPT_LENGTH || input.title.length > MAX_TITLE_LENGTH || input.tags.length > MAX_TAGS_LENGTH) {
        sessionState.error = "Input terlalu panjang. Periksa kembali deskripsi, judul, dan genre.";
        renderState();
        return;
      }
      sessionState.prompt = prompt.value;
      sessionState.title = title.value;
      sessionState.tags = tags.value;
      sessionState.error = "";
      setLoading(true);
      renderState();
      controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
      try {
        var query = new URLSearchParams({ prompt: input.prompt, title: input.title, tags: input.tags });
        var response = await fetch("/api/ai/song?" + query.toString(), {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        var payload;
        try { payload = await response.json(); }
        catch (_) { throw new Error("Server AI Song mengirim respons yang tidak dapat dibaca."); }
        if (!response.ok || !payload || payload.ok !== true || !payload.data || !safeUrl(payload.data.audioUrl)) {
          throw new Error(String(payload && payload.message || "Lagu gagal dibuat. Silakan coba lagi."));
        }
        if (!alive) return;
        sessionState.result = payload.data;
        sessionState.submittedTitle = input.title;
        sessionState.error = "";
        showToast("Lagu berhasil dibuat.");
      } catch (error) {
        if (!alive) return;
        sessionState.error = error && error.name === "AbortError" ? "Pembuatan lagu terlalu lama. Silakan coba lagi." : String(error && error.message || "Server AI Song sedang tidak tersedia.");
      } finally {
        clearTimeout(timer);
        controller = null;
        if (alive) {
          setLoading(false);
          renderState();
        }
      }
    });

    body.__nxCleanup = function () {
      alive = false;
      clearTimeout(timer);
      clearTimeout(toastTimer);
      if (controller) controller.abort();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      body.__nxCleanup = null;
    };

    renderState();
  };
})();

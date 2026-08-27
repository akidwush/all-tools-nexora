(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 25 * 1000;
  var CACHE_TTL_MS = 5 * 60 * 1000;
  var MAX_CACHE_ENTRIES = 12;
  var sessionState = {
    query: "",
    mode: "safe",
    results: [],
    selectedImage: null,
    loading: false,
    error: "",
    hasSearched: false,
    cache: new Map()
  };

  function text(value, maximum) {
    return String(value == null ? "" : value).trim().slice(0, maximum || 500);
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "absolute";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("COPY_FAILED"));
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function cacheKey(query, mode) {
    return mode + "\n" + query.trim().toLowerCase();
  }

  function readCache(key) {
    var entry = sessionState.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      sessionState.cache.delete(key);
      return null;
    }
    return entry.items;
  }

  function writeCache(key, items) {
    sessionState.cache.delete(key);
    sessionState.cache.set(key, { savedAt: Date.now(), items: items });
    while (sessionState.cache.size > MAX_CACHE_ENTRIES) {
      sessionState.cache.delete(sessionState.cache.keys().next().value);
    }
  }

  window.renderDanbooruSearch = function renderDanbooruSearch(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var requestTimer = 0;
    var toastTimer = 0;
    var hiddenAbort = false;

    body.innerHTML = "" +
      '<main class="ndb">' +
        '<section class="ndb-hero">' +
          '<span class="ndb-hero-icon"><i class="fa-solid fa-images"></i></span>' +
          '<div><span class="ndb-kicker">ANIME ART SEARCH</span><h2>Danbooru Search</h2><p>Cari ilustrasi berdasarkan tag dengan gallery ringan dan aman sebagai pilihan awal.</p></div>' +
        '</section>' +
        '<section class="ndb-card ndb-search-card">' +
          '<form id="ndbForm" novalidate>' +
            '<label for="ndbQuery">Search tags</label>' +
            '<input id="ndbQuery" type="search" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="hatsune_miku">' +
            '<label for="ndbMode">Mode</label>' +
            '<select id="ndbMode"><option value="safe">Safe</option><option value="nsfw">NSFW</option></select>' +
            '<button id="ndbSubmit" class="ndb-primary" type="submit"><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></button>' +
          '</form>' +
          '<p id="ndbFeedback" class="ndb-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section class="ndb-card ndb-results" aria-live="polite" aria-busy="false">' +
          '<div class="ndb-results-head"><div><span class="ndb-kicker">RESULTS</span><strong id="ndbCount">Belum ada pencarian</strong></div></div>' +
          '<div id="ndbGallery" class="ndb-gallery"><div class="ndb-empty"><i class="fa-regular fa-images"></i><strong>Hasil gambar muncul di sini</strong><span>Masukkan tag, lalu tekan Search.</span></div></div>' +
        '</section>' +
        '<section id="ndbViewer" class="ndb-card ndb-viewer" aria-label="Detail gambar" hidden>' +
          '<div class="ndb-viewer-head"><div><span class="ndb-kicker">IMAGE DETAIL</span><strong>Preview</strong></div><button id="ndbClose" type="button" aria-label="Tutup detail"><i class="fa-solid fa-xmark"></i></button></div>' +
          '<div id="ndbViewerContent"></div>' +
        '</section>' +
        '<p class="ndb-note"><i class="fa-solid fa-gauge-high"></i> Hasil identik disimpan singkat selama sesi agar kuota API tidak terbuang.</p>' +
        '<div id="ndbToast" class="ndb-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var form = body.querySelector("#ndbForm");
    var query = body.querySelector("#ndbQuery");
    var mode = body.querySelector("#ndbMode");
    var submit = body.querySelector("#ndbSubmit");
    var feedback = body.querySelector("#ndbFeedback");
    var results = body.querySelector(".ndb-results");
    var count = body.querySelector("#ndbCount");
    var gallery = body.querySelector("#ndbGallery");
    var viewer = body.querySelector("#ndbViewer");
    var viewerContent = body.querySelector("#ndbViewerContent");
    var closeViewerButton = body.querySelector("#ndbClose");
    var toast = body.querySelector("#ndbToast");

    query.value = sessionState.query;
    mode.value = sessionState.mode;

    function showToast(message) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 1800);
    }

    function setLoading(loading) {
      sessionState.loading = loading;
      submit.disabled = loading;
      query.disabled = loading;
      mode.disabled = loading;
      results.setAttribute("aria-busy", loading ? "true" : "false");
      submit.querySelector("i").className = loading ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-magnifying-glass";
      submit.querySelector("span").textContent = loading ? "Mencari…" : "Search";
    }

    function emptyState(title, description, iconName) {
      gallery.replaceChildren();
      var empty = element("div", "ndb-empty");
      var icon = element("i", iconName || "fa-regular fa-images");
      empty.append(icon, element("strong", "", title), element("span", "", description));
      gallery.appendChild(empty);
    }

    function actionLink(label, iconName, url, download) {
      var anchor = element("a", "ndb-action");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      if (download) anchor.setAttribute("download", "");
      var icon = element("i", iconName);
      anchor.append(icon, document.createTextNode(label));
      return anchor;
    }

    function closeViewer() {
      sessionState.selectedImage = null;
      viewer.hidden = true;
      viewerContent.replaceChildren();
    }

    function openViewer(item) {
      sessionState.selectedImage = item;
      viewerContent.replaceChildren();
      var imageUrl = text(item.imageUrl || item.thumbnail, 8192);
      if (imageUrl) {
        var frame = element("div", "ndb-viewer-frame");
        var image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "Preview hasil Danbooru";
        image.decoding = "async";
        image.addEventListener("error", function () {
          image.hidden = true;
          frame.classList.add("is-broken");
          frame.setAttribute("aria-label", "Gambar tidak dapat dimuat");
        }, { once: true });
        frame.appendChild(image);
        viewerContent.appendChild(frame);
      }
      var metadata = element("dl", "ndb-meta");
      function addMeta(label, value) {
        if (!value) return;
        metadata.append(element("dt", "", label), element("dd", "", value));
      }
      addMeta("Resolusi", item.width && item.height ? item.width + " × " + item.height : "");
      addMeta("Rating", text(item.rating, 40));
      addMeta("Tags", Array.isArray(item.tags) ? item.tags.slice(0, 30).join(" · ") : "");
      if (metadata.childNodes.length) viewerContent.appendChild(metadata);

      var actions = element("div", "ndb-actions");
      if (item.imageUrl) {
        actions.appendChild(actionLink("Open Image", "fa-solid fa-arrow-up-right-from-square", item.imageUrl, false));
        var copy = element("button", "ndb-action", "Copy Image Link");
        copy.type = "button";
        copy.addEventListener("click", function () {
          copyText(item.imageUrl).then(function () { showToast("Link copied"); }).catch(function () { showToast("Gagal menyalin link"); });
        });
        actions.appendChild(copy);
        actions.appendChild(actionLink("Download", "fa-solid fa-download", item.imageUrl, true));
      }
      if (item.sourceUrl) actions.appendChild(actionLink("Buka Sumber", "fa-solid fa-link", item.sourceUrl, false));
      if (actions.childNodes.length) viewerContent.appendChild(actions);
      viewer.hidden = false;
      viewer.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderGallery() {
      feedback.textContent = sessionState.error;
      feedback.classList.toggle("is-error", Boolean(sessionState.error));
      if (sessionState.loading) {
        count.textContent = "Sedang mencari…";
        emptyState("Mencari gambar…", "Tunggu sebentar. Halaman tidak akan meminta ulang otomatis.", "fa-solid fa-circle-notch fa-spin");
        return;
      }
      if (!sessionState.hasSearched) {
        count.textContent = "Belum ada pencarian";
        emptyState("Hasil gambar muncul di sini", "Masukkan tag, lalu tekan Search.");
        return;
      }
      if (!sessionState.results.length) {
        count.textContent = "0 gambar";
        emptyState("Tidak ada gambar yang ditemukan", "Coba tag lain atau periksa penulisan kata kunci.", "fa-regular fa-face-meh");
        return;
      }
      count.textContent = sessionState.results.length + " gambar";
      gallery.replaceChildren();
      sessionState.results.forEach(function (item, index) {
        var tile = element("button", "ndb-tile");
        tile.type = "button";
        tile.setAttribute("aria-label", "Buka gambar " + (index + 1));
        var frame = element("span", "ndb-thumb");
        var image = document.createElement("img");
        image.src = item.thumbnail || item.imageUrl;
        image.alt = "Hasil Danbooru " + (index + 1);
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", function () {
          image.hidden = true;
          frame.classList.add("is-broken");
          frame.setAttribute("aria-label", "Gambar tidak dapat dimuat");
        }, { once: true });
        frame.appendChild(image);
        tile.appendChild(frame);
        if (item.width && item.height) tile.appendChild(element("span", "ndb-resolution", item.width + " × " + item.height));
        tile.addEventListener("click", function () { openViewer(item); });
        gallery.appendChild(tile);
      });
    }

    async function runSearch() {
      if (sessionState.loading) return;
      var value = text(query.value, 201).replace(/\s+/g, " ");
      var selectedMode = mode.value === "nsfw" ? "nsfw" : "safe";
      sessionState.query = value;
      sessionState.mode = selectedMode;
      sessionState.error = "";
      closeViewer();
      if (!value) {
        sessionState.hasSearched = false;
        sessionState.error = "Masukkan tag atau kata kunci terlebih dahulu.";
        renderGallery();
        query.focus();
        return;
      }
      if (value.length > 200) {
        sessionState.error = "Kata kunci terlalu panjang.";
        renderGallery();
        return;
      }
      var key = cacheKey(value, selectedMode);
      var cached = readCache(key);
      if (cached) {
        sessionState.results = cached;
        sessionState.hasSearched = true;
        renderGallery();
        showToast("Hasil sesi digunakan kembali");
        return;
      }

      setLoading(true);
      renderGallery();
      controller = new AbortController();
      hiddenAbort = false;
      requestTimer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);
      try {
        var params = new URLSearchParams({ q: value, mode: selectedMode });
        var response = await fetch("/api/search/danbooru?" + params.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        var payload;
        try { payload = await response.json(); }
        catch (_) { throw new Error("Respons pencarian tidak dapat dibaca."); }
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(text(payload && payload.message, 240) || "Danbooru Search sedang tidak tersedia.");
        }
        var items = payload.data && Array.isArray(payload.data.items) ? payload.data.items : [];
        sessionState.results = items;
        sessionState.hasSearched = true;
        writeCache(key, items);
      } catch (error) {
        if (!alive || hiddenAbort) return;
        sessionState.results = [];
        sessionState.hasSearched = true;
        sessionState.error = error && error.name === "AbortError" ? "Pencarian terlalu lama. Coba lagi." : text(error && error.message, 240) || "Danbooru Search sedang tidak tersedia.";
      } finally {
        clearTimeout(requestTimer);
        requestTimer = 0;
        controller = null;
        if (alive) {
          setLoading(false);
          renderGallery();
        }
      }
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      runSearch();
    });
    closeViewerButton.addEventListener("click", closeViewer);
    function onVisibilityChange() {
      if (document.hidden && controller) {
        hiddenAbort = true;
        controller.abort();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    body.__nxCleanup = function () {
      alive = false;
      hiddenAbort = true;
      if (controller) controller.abort();
      clearTimeout(requestTimer);
      clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      body.__nxCleanup = null;
    };

    renderGallery();
  };
})();
